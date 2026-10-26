-- Apply after the other 20261024 migrations.
BEGIN;
-- Bootstrap the summary dependency when TRANSACTIONS has not been applied yet.
-- Keep this definition identical to MIGRATION_TRANSACTIONS_20261024.sql.
-- This does not replace that migration's payment settlement functions/guards.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_attempt_state TEXT NOT NULL DEFAULT 'idle'
  CHECK(payment_attempt_state IN ('idle','creating','ready','uncertain'));

CREATE OR REPLACE FUNCTION operations_summary(p_store UUID) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH scoped AS (
  SELECT o.*, (o.created_at AT TIME ZONE COALESCE(s.timezone,'Asia/Jakarta'))::date=(now() AT TIME ZONE COALESCE(s.timezone,'Asia/Jakarta'))::date today
  FROM orders o JOIN stores s ON s.id=o.store_id WHERE p_store IS NULL OR o.store_id=p_store
 ) SELECT jsonb_build_object(
  'total',count(*),'pending',count(*) FILTER(WHERE status='pending'),
  'completed',count(*) FILTER(WHERE today AND status='completed'),
  'cancelled',count(*) FILTER(WHERE today AND status='cancelled'),
  'revenue',COALESCE(sum(total_amount) FILTER(WHERE today AND payment_status='paid'),0),
  'preparing',count(*) FILTER(WHERE payment_status='paid' AND status IN ('confirmed','preparing')),
  'ready',count(*) FILTER(WHERE payment_status='paid' AND status='ready'),
  'uncertain',count(*) FILTER(WHERE payment_status='pending' AND payment_attempt_state IN ('creating','uncertain')),
  'lowStock',(SELECT count(*) FROM ingredients WHERE is_active AND stock_quantity<=low_stock_threshold AND (p_store IS NULL OR store_id=p_store)),
  'shiftDifferences',(SELECT count(*) FROM cashier_shifts WHERE closed_at>=now()-interval '7 days' AND closing_cash<>expected_cash AND (p_store IS NULL OR store_id=p_store))
 ) FROM scoped;
$$;
REVOKE ALL ON FUNCTION operations_summary(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION operations_summary(UUID) TO service_role;

-- Reward finalization shares the payment transaction, including the wallet RPC.
CREATE OR REPLACE FUNCTION finalize_payment_reward() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.payment_status='paid' AND OLD.payment_status<>'paid' THEN
  UPDATE loyalty_redemptions SET status='used',used_at=now() WHERE used_order_id=NEW.id AND status='reserved';
 ELSIF NEW.payment_status IN ('failed','expired') OR (NEW.status='cancelled' AND NEW.payment_status='pending') THEN
  UPDATE loyalty_redemptions SET status='available',used_order_id=NULL,used_at=NULL WHERE used_order_id=NEW.id AND status='reserved';
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS payment_reward_atomic ON orders;
CREATE TRIGGER payment_reward_atomic AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION finalize_payment_reward();
REVOKE ALL ON FUNCTION finalize_payment_reward() FROM PUBLIC,anon,authenticated;

-- Record a manual transfer only with an active owner's confirmation. All local
-- financial records and the audit entry commit together; no money is sent here.
CREATE OR REPLACE FUNCTION complete_manual_refund(p_refund UUID,p_actor UUID,p_note TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r refund_requests%ROWTYPE; o orders%ROWTYPE; total_refunded NUMERIC;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role='owner' AND is_active) THEN RAISE EXCEPTION 'Owner required'; END IF;
 IF length(trim(COALESCE(p_note,'')))=0 OR length(p_note)>1000 THEN RAISE EXCEPTION 'Refund evidence required'; END IF;
 SELECT * INTO r FROM refund_requests WHERE id=p_refund;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refund not found'; END IF;
 SELECT * INTO o FROM orders WHERE id=r.order_id FOR UPDATE;
 SELECT * INTO r FROM refund_requests WHERE id=p_refund FOR UPDATE;
 IF r.status<>'requested' OR o.payment_status<>'paid' OR o.payment_method='snap' THEN RAISE EXCEPTION 'Refund state changed'; END IF;
 SELECT COALESCE(sum(amount),0) INTO total_refunded FROM refund_requests WHERE order_id=o.id AND status='completed';
 IF total_refunded+r.amount>o.total_amount THEN RAISE EXCEPTION 'Refund exceeds paid amount'; END IF;
 UPDATE refund_requests SET status='completed',reviewer_id=p_actor,reviewer_note=p_note,reviewed_at=now(),completed_at=now(),updated_at=now() WHERE id=r.id;
 IF total_refunded+r.amount=o.total_amount THEN
  UPDATE orders SET payment_status='refunded',updated_at=now() WHERE id=o.id;
  UPDATE payments SET status='refunded',updated_at=now() WHERE order_id=o.id;
 END IF;
 INSERT INTO audit_logs(store_id,actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(o.store_id,p_actor,'owner','refund.manual_complete','refund_request',r.id,to_jsonb(r),jsonb_build_object('status','completed','amount',r.amount,'note',p_note));
 RETURN jsonb_build_object('id',r.id,'status','completed');
END; $$;
REVOKE ALL ON FUNCTION complete_manual_refund(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION complete_manual_refund(UUID,UUID,TEXT) TO service_role;
COMMIT;
