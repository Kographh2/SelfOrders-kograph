-- Apply after SECURITY and TRANSACTIONS migrations dated 20261024.
BEGIN;
ALTER TABLE split_bill_payment_attempts ALTER COLUMN snap_token DROP NOT NULL;
CREATE TABLE IF NOT EXISTS checkout_requests (
  identity TEXT NOT NULL, request_id UUID NOT NULL, request_hash TEXT NOT NULL,
  result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(identity,request_id)
);
ALTER TABLE checkout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_requests FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION checkout_order(p_request UUID,p_identity TEXT,p_hash TEXT,p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cached checkout_requests%ROWTYPE; result JSONB; oid UUID; sid UUID:=(p_data->>'store_id')::uuid;
  uid UUID:=(p_data->>'user_id')::uuid; tid UUID:=(p_data->>'table_id')::uuid; claim promo_claims%ROWTYPE;
  promo promos%ROWTYPE; redemption loyalty_redemptions%ROWTYPE; reward loyalty_rewards%ROWTYPE;
  eligible NUMERIC; discount NUMERIC:=0; total NUMERIC; policy RECORD; kind TEXT;
BEGIN
  IF p_request IS NULL OR p_identity IS NULL OR length(p_hash)<>64 THEN RAISE EXCEPTION 'Invalid checkout identity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_identity,0));
  SELECT * INTO cached FROM checkout_requests WHERE identity=p_identity AND request_id=p_request;
  IF FOUND THEN
    IF cached.request_hash<>p_hash THEN RAISE EXCEPTION 'Checkout key already used for a different cart'; END IF;
    RETURN cached.result;
  END IF;
  IF (SELECT count(*) FROM orders WHERE payment_status='pending' AND status<>'cancelled' AND created_at>now()-interval '30 minutes'
      AND (user_id=uid OR anonymous_session_id=p_data->>'guest'))>=5 THEN RAISE EXCEPTION 'Selesaikan pesanan yang masih menunggu pembayaran'; END IF;
  IF tid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tables WHERE id=tid AND store_id=sid AND is_active) THEN RAISE EXCEPTION 'Meja tidak valid'; END IF;
  IF jsonb_array_length(p_data->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Maximum 50 order lines'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'items') i WHERE (i->>'quantity')::numeric NOT BETWEEN 1 AND 100 OR (i->>'quantity')::numeric<>trunc((i->>'quantity')::numeric)) THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  IF uid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=uid AND is_active) THEN RAISE EXCEPTION 'Inactive customer'; END IF;
  IF p_data->>'promo_claim_id' IS NOT NULL AND p_data->>'loyalty_code' IS NOT NULL THEN RAISE EXCEPTION 'Choose one discount'; END IF;
  -- Lock claims before creating any order or reserving stock; errors roll back everything.
  IF p_data->>'promo_claim_id' IS NOT NULL THEN
    SELECT * INTO claim FROM promo_claims WHERE id=(p_data->>'promo_claim_id')::uuid AND user_id=uid AND used_order_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Promo sudah digunakan atau tidak valid'; END IF;
    SELECT * INTO promo FROM promos WHERE id=claim.promo_id AND store_id=sid AND is_active AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Promo sudah berakhir'; END IF;
  END IF;
  IF p_data->>'loyalty_code' IS NOT NULL THEN
    SELECT * INTO redemption FROM loyalty_redemptions WHERE code=p_data->>'loyalty_code' AND user_id=uid AND status='available' AND expires_at>now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reward tidak tersedia'; END IF;
    SELECT * INTO reward FROM loyalty_rewards WHERE id=redemption.reward_id AND store_id=sid FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reward tidak berlaku di cabang ini'; END IF;
  END IF;
  result:=create_order_atomic(sid,tid,uid,p_data->>'guest',p_data->>'name',p_data->>'phone',p_data->>'email',p_data->>'notes',p_data->'items');
  oid:=(result->>'order_id')::uuid; total:=(result->>'total_amount')::numeric;
  FOREACH kind IN ARRAY ARRAY['privacy','terms'] LOOP
    SELECT * INTO policy FROM store_documents WHERE document_type=kind AND status='published' AND (store_id=sid OR store_id IS NULL)
      ORDER BY store_id NULLS LAST,version DESC LIMIT 1;
    IF FOUND THEN
      IF (p_data->>'policy_accepted')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Persetujuan kebijakan diperlukan'; END IF;
      INSERT INTO policy_acceptances(order_id,user_id,anonymous_session_hash,store_id,document_id,document_version)
        VALUES(oid,uid,CASE WHEN uid IS NULL THEN encode(digest(p_data->>'guest','sha256'),'hex') END,sid,policy.id,policy.version);
    END IF;
  END LOOP;
  IF claim.id IS NOT NULL THEN
    eligible:=(result->>'subtotal')::numeric;
    IF eligible<COALESCE(promo.min_purchase,0) THEN RAISE EXCEPTION 'Minimum pembelian promo belum terpenuhi'; END IF;
    IF promo.applies_to='products' THEN SELECT COALESCE(sum(subtotal),0) INTO eligible FROM order_items WHERE order_id=oid AND menu_item_id IN(SELECT menu_item_id FROM promo_products WHERE promo_id=promo.id); END IF;
    IF eligible<=0 THEN RAISE EXCEPTION 'Produk tidak memenuhi syarat promo'; END IF;
    discount:=CASE WHEN promo.discount_type='percent' THEN eligible*promo.discount_value/100 ELSE promo.discount_value END;
    IF promo.max_discount IS NOT NULL THEN discount:=least(discount,promo.max_discount); END IF;
    discount:=greatest(0,least(round(discount),total-1)); total:=total-discount;
    UPDATE promo_claims SET used_order_id=oid,used_at=now() WHERE id=claim.id;
    UPDATE orders SET promo_id=promo.id,promo_claim_id=claim.id,promo_discount=discount WHERE id=oid;
    result:=result||jsonb_build_object('promo_discount',discount);
  ELSIF redemption.id IS NOT NULL THEN
    IF (result->>'subtotal')::numeric<reward.min_purchase THEN RAISE EXCEPTION 'Minimum pembelian reward belum terpenuhi'; END IF;
    discount:=greatest(0,least(round(reward.discount_amount),total-1)); total:=total-discount;
    UPDATE loyalty_redemptions SET status='reserved',used_order_id=oid WHERE id=redemption.id;
    UPDATE orders SET loyalty_discount=discount WHERE id=oid;
    result:=result||jsonb_build_object('loyalty_discount',discount);
  END IF;
  UPDATE orders SET total_amount=total,order_type=p_data->>'order_type',pickup_at=(p_data->>'pickup_at')::timestamptz,estimated_ready_at=(p_data->>'ready_at')::timestamptz WHERE id=oid;
  UPDATE payments SET amount=total WHERE order_id=oid;
  result:=result||jsonb_build_object('total_amount',total,'order_type',p_data->>'order_type','pickup_at',p_data->>'pickup_at','estimated_ready_at',p_data->>'ready_at');
  INSERT INTO checkout_requests(identity,request_id,request_hash,result) VALUES(p_identity,p_request,p_hash,result);
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION checkout_order(UUID,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION checkout_order(UUID,TEXT,TEXT,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION claim_promo(p_promo UUID,p_user UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p promos%ROWTYPE; c promo_claims%ROWTYPE;
BEGIN
  SELECT * INTO p FROM promos WHERE id=p_promo AND is_active AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promo tidak aktif'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_user AND role='user' AND is_active) THEN RAISE EXCEPTION 'Akun tidak valid'; END IF;
  IF EXISTS(SELECT 1 FROM promo_claims WHERE promo_id=p.id AND user_id=p_user) THEN RAISE EXCEPTION 'Promo sudah ada di dompet Anda'; END IF;
  IF p.total_quota IS NOT NULL AND (SELECT count(*) FROM promo_claims WHERE promo_id=p.id)>=p.total_quota THEN RAISE EXCEPTION 'Kuota promo sudah habis'; END IF;
  INSERT INTO promo_claims(promo_id,user_id) VALUES(p.id,p_user) RETURNING * INTO c;
  RETURN to_jsonb(c)||jsonb_build_object('promo',to_jsonb(p));
END; $$;
REVOKE ALL ON FUNCTION claim_promo(UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_promo(UUID,UUID) TO service_role;

CREATE OR REPLACE FUNCTION cash_payment(p_order UUID,p_actor UUID,p_confirm BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders%ROWTYPE; actor users%ROWTYPE; cash_code TEXT;
BEGIN
  SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND OR o.kiosk_session_id IS NOT NULL OR o.status='cancelled' THEN RAISE EXCEPTION 'Pesanan tidak dapat dibayar tunai'; END IF;
  IF p_confirm THEN
    SELECT * INTO actor FROM users WHERE id=p_actor AND is_active AND role IN ('owner','admin','kasir');
    IF NOT FOUND OR (actor.role<>'owner' AND actor.store_id IS DISTINCT FROM o.store_id) THEN RAISE EXCEPTION 'Akses kasir ditolak'; END IF;
    PERFORM 1 FROM cashier_shifts WHERE store_id=o.store_id AND cashier_id=p_actor AND closed_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Buka shift kasir terlebih dahulu'; END IF;
    IF o.payment_status='paid' AND o.payment_method='cash' THEN RETURN jsonb_build_object('id',o.id,'changed',false); END IF;
  END IF;
  IF o.payment_status<>'pending' OR o.snap_token IS NOT NULL OR o.payment_attempt_state<>'idle' OR EXISTS(SELECT 1 FROM split_bills WHERE order_id=o.id AND status='active') THEN RAISE EXCEPTION 'Metode pembayaran sudah terkunci'; END IF;
  cash_code:='CASH-'||lpad(o.order_number::text,3,'0')||'-'||upper(left(o.id::text,8));
  UPDATE orders SET payment_method='cash',payment_status=CASE WHEN p_confirm THEN 'paid' ELSE 'pending' END,
    status=CASE WHEN p_confirm AND status='pending' THEN 'confirmed' ELSE status END,updated_at=now() WHERE id=o.id;
  UPDATE payments SET method='cash',transaction_id=cash_code,status=CASE WHEN p_confirm THEN 'paid' ELSE 'pending' END,
    paid_by=CASE WHEN p_confirm THEN p_actor ELSE NULL END,paid_at=CASE WHEN p_confirm THEN now() ELSE NULL END,updated_at=now() WHERE order_id=o.id;
  IF p_confirm THEN UPDATE loyalty_redemptions SET status='used',used_at=now() WHERE used_order_id=o.id AND status='reserved'; END IF;
  INSERT INTO audit_logs(store_id,actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
    VALUES(o.store_id,p_actor,COALESCE(actor.role,'customer'),CASE WHEN p_confirm THEN 'payment.cash.confirm' ELSE 'payment.cash.request' END,'order',o.id::text,jsonb_build_object('payment_status',o.payment_status),jsonb_build_object('paid',p_confirm));
  RETURN jsonb_build_object('id',o.id,'cashCode',cash_code,'orderNumber',o.order_number,'total',o.total_amount,'changed',p_confirm);
END; $$;
REVOKE ALL ON FUNCTION cash_payment(UUID,UUID,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cash_payment(UUID,UUID,BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION create_split_bill(p_order UUID,p_user UUID,p_hash TEXT,p_amounts JSONB) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders%ROWTYPE; bid UUID; a NUMERIC; i INTEGER:=0;
BEGIN
  SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND OR o.payment_status<>'pending' OR o.status='cancelled' OR o.kiosk_session_id IS NOT NULL OR o.snap_token IS NOT NULL OR o.payment_attempt_state<>'idle' THEN RAISE EXCEPTION 'Pesanan tidak dapat dibagi'; END IF;
  IF jsonb_array_length(p_amounts) NOT BETWEEN 2 AND 10 OR (SELECT sum(value::text::numeric) FROM jsonb_array_elements(p_amounts))<>round(o.total_amount) THEN RAISE EXCEPTION 'Pembagian nominal tidak valid'; END IF;
  UPDATE orders SET payment_method='split' WHERE id=o.id;
  INSERT INTO split_bills(order_id,created_by,invite_token_hash,total_amount) VALUES(o.id,p_user,p_hash,round(o.total_amount)) RETURNING id INTO bid;
  FOR a IN SELECT value::text::numeric FROM jsonb_array_elements(p_amounts) LOOP
    IF a<=0 OR a<>round(a) THEN RAISE EXCEPTION 'Nominal peserta harus positif'; END IF;
    i:=i+1; INSERT INTO split_bill_parts(split_bill_id,label,amount) VALUES(bid,'Peserta '||i,a);
  END LOOP;
  RETURN bid;
END; $$;
REVOKE ALL ON FUNCTION create_split_bill(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_split_bill(UUID,UUID,TEXT,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION reserve_split_attempt(p_part UUID,p_reference TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p split_bill_parts%ROWTYPE; b split_bills%ROWTYPE; o orders%ROWTYPE;
BEGIN
  SELECT * INTO p FROM split_bill_parts WHERE id=p_part;
  SELECT * INTO b FROM split_bills WHERE id=p.split_bill_id;
  SELECT * INTO o FROM orders WHERE id=b.order_id FOR UPDATE;
  SELECT * INTO p FROM split_bill_parts WHERE id=p_part FOR UPDATE;
  IF o.status='cancelled' OR o.payment_status<>'pending' OR b.status<>'active' OR b.expires_at<=now() OR p.status='paid' OR p.creation_state IN ('creating','uncertain') OR (p.status='pending' AND p.creation_state='ready') THEN RETURN false; END IF;
  INSERT INTO split_bill_payment_attempts(split_bill_id,split_bill_part_id,midtrans_order_id,amount,status) VALUES(b.id,p.id,p_reference,p.amount,'pending');
  UPDATE split_bill_parts SET creation_state='creating',midtrans_order_id=p_reference,status='pending',snap_token=NULL WHERE id=p.id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION reserve_split_attempt(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION reserve_split_attempt(UUID,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION reserve_otp_attempt(p_id UUID) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE telegram_reservation_otps SET attempts=attempts+1 WHERE id=p_id AND status='sent' AND expires_at>now() AND attempts<5 RETURNING attempts INTO n;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION reserve_otp_attempt(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION reserve_otp_attempt(UUID) TO service_role;

ALTER TABLE restaurant_ads ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION revise_restaurant_ad() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.title,NEW.description,NEW.image_url,NEW.link_url,NEW.link_label) IS DISTINCT FROM ROW(OLD.title,OLD.description,OLD.image_url,OLD.link_url,OLD.link_label) THEN NEW.revision:=OLD.revision+1; ELSE NEW.revision:=OLD.revision; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS restaurant_ad_revision ON restaurant_ads;
CREATE TRIGGER restaurant_ad_revision BEFORE UPDATE ON restaurant_ads FOR EACH ROW EXECUTE FUNCTION revise_restaurant_ad();
COMMIT;
