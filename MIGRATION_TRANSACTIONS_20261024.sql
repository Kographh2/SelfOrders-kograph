-- Apply after MIGRATION_SECURITY_20261024.sql and all earlier feature migrations.
BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_attempt_state TEXT NOT NULL DEFAULT 'idle'
  CHECK(payment_attempt_state IN ('idle','creating','ready','uncertain'));
ALTER TABLE public.split_bill_parts ADD COLUMN IF NOT EXISTS creation_state TEXT NOT NULL DEFAULT 'idle'
  CHECK(creation_state IN ('idle','creating','ready','uncertain'));
CREATE INDEX IF NOT EXISTS orders_store_created_idx ON public.orders(store_id,created_at DESC);

-- One transaction for every verified provider event. Called only with the result
-- of the server-to-server status API, never with an unverified callback body.
CREATE OR REPLACE FUNCTION public.settle_verified_payment(p_reference TEXT,p_amount NUMERIC,p_status TEXT,p_transaction TEXT,p_provider JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders%ROWTYPE; t wallet_topups%ROWTYPE; r reservations%ROWTYPE;
  part split_bill_parts%ROWTYPE; attempt split_bill_payment_attempts%ROWTYPE; bill split_bills%ROWTYPE;
  refund JSONB; matched INTEGER:=0; changed BOOLEAN:=false; total_refund NUMERIC; result JSONB;
BEGIN
  IF p_amount IS NULL OR p_amount<=0 OR p_status NOT IN ('pending','paid','failed','expired','refunded') THEN RAISE EXCEPTION 'Invalid settlement'; END IF;
  IF left(p_reference,6)='TOPUP-' THEN
    SELECT * INTO t FROM wallet_topups WHERE midtrans_order_id=p_reference FOR UPDATE;
    IF NOT FOUND OR round(t.amount)<>p_amount THEN RAISE EXCEPTION 'Topup amount/reference mismatch'; END IF;
    IF p_status='refunded' THEN RAISE EXCEPTION 'Topup refund requires ledger reconciliation'; END IF;
    IF t.status<>'paid' THEN
      IF p_status='paid' THEN PERFORM wallet_add_topup(t.id);
      ELSE UPDATE wallet_topups SET status=p_status,updated_at=now() WHERE id=t.id; END IF;
    END IF;
    RETURN jsonb_build_object('payment_status',CASE WHEN t.status='paid' THEN 'paid' ELSE p_status END);
  ELSIF left(p_reference,4)='RES-' THEN
    SELECT * INTO r FROM reservations WHERE midtrans_order_id=p_reference FOR UPDATE;
    IF NOT FOUND OR round(r.deposit_amount)<>p_amount THEN RAISE EXCEPTION 'Deposit amount/reference mismatch'; END IF;
    IF p_status='refunded' THEN RAISE EXCEPTION 'Deposit refund requires reconciliation'; END IF;
    IF r.deposit_status<>'paid' THEN
      UPDATE reservations SET deposit_status=CASE WHEN p_status='paid' THEN 'paid' WHEN p_status='pending' THEN 'pending' ELSE 'failed' END,
        status=CASE WHEN p_status IN ('failed','expired') AND status='confirmed' THEN 'cancelled' ELSE status END,updated_at=now() WHERE id=r.id;
    END IF;
    RETURN jsonb_build_object('payment_status',CASE WHEN r.deposit_status='paid' THEN 'paid' ELSE p_status END);
  ELSIF left(p_reference,6)='SPLIT-' THEN
    SELECT * INTO attempt FROM split_bill_payment_attempts WHERE midtrans_order_id=p_reference;
    IF FOUND THEN SELECT * INTO part FROM split_bill_parts WHERE id=attempt.split_bill_part_id;
    ELSE SELECT * INTO part FROM split_bill_parts WHERE midtrans_order_id=p_reference; END IF;
    IF part.id IS NULL OR round(COALESCE(attempt.amount,part.amount))<>p_amount THEN RAISE EXCEPTION 'Split amount/reference mismatch'; END IF;
    SELECT * INTO bill FROM split_bills WHERE id=part.split_bill_id;
    SELECT * INTO o FROM orders WHERE id=bill.order_id FOR UPDATE;
    SELECT * INTO part FROM split_bill_parts WHERE id=part.id FOR UPDATE;
    IF p_status='refunded' THEN RAISE EXCEPTION 'Split refund requires reconciliation'; END IF;
    IF p_status='paid' AND (o.status='cancelled' OR bill.status<>'active') AND part.status<>'paid' THEN RAISE EXCEPTION 'Late split payment requires reconciliation'; END IF;
    UPDATE split_bill_payment_attempts SET status=p_status,paid_at=CASE WHEN p_status='paid' THEN now() ELSE NULL END,updated_at=now()
      WHERE id=attempt.id AND status<>'paid';
    IF part.status<>'paid' AND (p_status='paid' OR part.midtrans_order_id=p_reference) THEN
      UPDATE split_bill_parts SET status=p_status,paid_at=CASE WHEN p_status='paid' THEN now() ELSE NULL END WHERE id=part.id;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM split_bill_parts WHERE split_bill_id=bill.id AND status<>'paid') AND o.payment_status='pending' THEN
      IF (SELECT sum(amount) FROM split_bill_parts WHERE split_bill_id=bill.id)<>round(o.total_amount) THEN RAISE EXCEPTION 'Split total mismatch'; END IF;
      UPDATE split_bills SET status='paid' WHERE id=bill.id;
      UPDATE orders SET payment_status='paid',payment_method='split',status=CASE WHEN status='pending' THEN 'confirmed' ELSE status END,updated_at=now() WHERE id=o.id;
      UPDATE payments SET status='paid',method='split',paid_at=now(),updated_at=now() WHERE order_id=o.id;
      changed:=true;
    END IF;
  ELSE
    SELECT * INTO o FROM orders WHERE id=p_reference::uuid FOR UPDATE;
    IF NOT FOUND OR round(o.total_amount)<>p_amount THEN RAISE EXCEPTION 'Order amount/reference mismatch'; END IF;
    IF p_status='refunded' THEN
      FOR refund IN SELECT value FROM jsonb_array_elements(COALESCE(p_provider->'refunds','[]'::jsonb)) LOOP
        UPDATE refund_requests SET status=CASE WHEN status='completed' OR NULLIF(refund->>'bank_confirmed_at','') IS NOT NULL THEN 'completed' ELSE 'processing' END,
          completed_at=CASE WHEN NULLIF(refund->>'bank_confirmed_at','') IS NOT NULL THEN COALESCE(completed_at,now()) ELSE completed_at END,updated_at=now()
          WHERE order_id=o.id AND midtrans_refund_key=refund->>'refund_key' AND amount=(refund->>'refund_amount')::numeric
          AND status IN ('approved','processing','completed');
        IF FOUND THEN matched:=matched+1; END IF;
      END LOOP;
      IF matched=0 THEN RAISE EXCEPTION 'Refund does not match an approved request'; END IF;
      SELECT COALESCE(sum(amount),0) INTO total_refund FROM refund_requests WHERE order_id=o.id AND status='completed';
      IF total_refund>o.total_amount THEN RAISE EXCEPTION 'Refund exceeds order'; END IF;
      IF total_refund=o.total_amount THEN
        UPDATE orders SET payment_status='refunded',updated_at=now() WHERE id=o.id;
        UPDATE payments SET status='refunded',updated_at=now() WHERE order_id=o.id;
      END IF;
      RETURN jsonb_build_object('payment_status',CASE WHEN total_refund=o.total_amount THEN 'refunded' ELSE o.payment_status END);
    END IF;
    IF o.payment_status IN ('paid','refunded') THEN RETURN jsonb_build_object('payment_status',o.payment_status,'changed',false); END IF;
    IF p_status='paid' AND (o.status='cancelled' OR o.payment_status IN ('failed','expired')) THEN RAISE EXCEPTION 'Late payment requires reconciliation'; END IF;
    IF o.payment_method IS DISTINCT FROM 'snap' THEN RAISE EXCEPTION 'Payment method mismatch'; END IF;
    IF o.kiosk_session_id IS NOT NULL THEN result:=settle_kiosk_payment(o.id,p_amount,p_status,p_transaction);
    ELSE
      UPDATE orders SET payment_status=p_status,status=CASE WHEN p_status='paid' AND status='pending' THEN 'confirmed' WHEN p_status IN ('failed','expired') THEN 'cancelled' ELSE status END,updated_at=now() WHERE id=o.id;
      UPDATE payments SET status=p_status,method='snap',transaction_id=p_transaction,midtrans_order_id=p_reference,
        paid_at=CASE WHEN p_status='paid' THEN now() ELSE NULL END,snap_data=NULL,updated_at=now() WHERE order_id=o.id;
    END IF;
    changed:=p_status='paid' AND o.payment_status<>'paid';
  END IF;
  IF o.id IS NOT NULL THEN
    IF changed THEN UPDATE loyalty_redemptions SET status='used',used_at=now() WHERE used_order_id=o.id AND status='reserved';
    ELSIF p_status IN ('failed','expired') THEN UPDATE loyalty_redemptions SET status='available',used_order_id=NULL,used_at=NULL WHERE used_order_id=o.id AND status='reserved'; END IF;
    INSERT INTO audit_logs(store_id,actor_role,action,entity_type,entity_id,after_data)
      VALUES(o.store_id,'system','payment.reconcile','order',o.id::text,jsonb_build_object('status',p_status,'reference',p_reference,'transaction',p_transaction));
  END IF;
  RETURN jsonb_build_object('payment_status',p_status,'order_id',o.id,'changed',changed);
END; $$;
REVOKE ALL ON FUNCTION public.settle_verified_payment(TEXT,NUMERIC,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_verified_payment(TEXT,NUMERIC,TEXT,TEXT,JSONB) TO service_role;

-- Reject late wallet payments and competing digital/split attempts under the
-- same row lock used by settlement, not just a preflight HTTP check.
CREATE OR REPLACE FUNCTION public.guard_payment_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF (OLD.status='cancelled' OR OLD.payment_status IN ('failed','expired')) AND NEW.payment_status='paid' AND OLD.payment_status<>'paid' THEN RAISE EXCEPTION 'Cancelled order cannot be paid'; END IF;
  IF NEW.status IN ('confirmed','preparing','ready','completed') AND NEW.status IS DISTINCT FROM OLD.status AND NEW.payment_status<>'paid' THEN RAISE EXCEPTION 'Unpaid order cannot be processed'; END IF;
  IF OLD.payment_status IN ('paid','refunded') AND NEW.payment_status IN ('pending','failed','expired') THEN RAISE EXCEPTION 'Payment cannot regress'; END IF;
  IF OLD.payment_status='pending' AND NEW.payment_method IS DISTINCT FROM OLD.payment_method
     AND (OLD.snap_token IS NOT NULL OR OLD.payment_attempt_state<>'idle' OR OLD.kiosk_payment_state<>'idle' OR EXISTS(SELECT 1 FROM split_bills WHERE order_id=OLD.id AND status='active')) THEN
    IF NOT (NEW.payment_method='split' AND NEW.payment_status='paid') THEN RAISE EXCEPTION 'Payment method is locked'; END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS orders_payment_guard ON public.orders;
CREATE TRIGGER orders_payment_guard BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_payment_transition();
COMMIT;
