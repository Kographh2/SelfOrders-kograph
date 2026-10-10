-- Apply AFTER FEATURES, ADVANCED and OPERATIONS migrations. No production seed data.
BEGIN;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS kiosk_session_id UUID,
  ADD COLUMN IF NOT EXISTS kiosk_station_id TEXT,
  ADD COLUMN IF NOT EXISTS kiosk_request_id UUID,
  ADD COLUMN IF NOT EXISTS kiosk_request_hash TEXT,
  ADD COLUMN IF NOT EXISTS kiosk_payment_state TEXT NOT NULL DEFAULT 'idle'
    CHECK (kiosk_payment_state IN ('idle','creating','ready','uncertain'));
CREATE UNIQUE INDEX IF NOT EXISTS orders_kiosk_session_unique ON public.orders(kiosk_session_id) WHERE kiosk_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_kiosk_request_unique ON public.orders(kiosk_request_id) WHERE kiosk_request_id IS NOT NULL;

-- Shared staff endpoints must not cook unpaid KIOSK orders, or switch an
-- issued digital transaction to cash while a customer can still settle it.
CREATE OR REPLACE FUNCTION public.guard_kiosk_order_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.kiosk_session_id IS NOT NULL THEN
      RAISE EXCEPTION 'Riwayat KIOSK harus disimpan untuk idempotensi dan rekonsiliasi. Batalkan pesanan, jangan hapus.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.kiosk_session_id IS NOT NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('confirmed','preparing','ready','completed') AND NEW.payment_status <> 'paid' THEN
      RAISE EXCEPTION 'Bayar pesanan KIOSK sebelum diproses dapur';
    END IF;
    IF OLD.kiosk_payment_state <> 'idle' AND NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
      RAISE EXCEPTION 'Pembayaran digital KIOSK tidak dapat dialihkan';
    END IF;
    IF NEW.status='cancelled' AND OLD.kiosk_payment_state <> 'idle' AND NEW.payment_status='pending' THEN
      RAISE EXCEPTION 'Batalkan transaksi di Midtrans dan sinkronkan status sebelum membatalkan pesanan';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kiosk_order_update_guard ON public.orders;
CREATE TRIGGER kiosk_order_update_guard BEFORE UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_kiosk_order_update();

CREATE OR REPLACE FUNCTION public.create_kiosk_order(
  p_store_id UUID, p_station_id TEXT, p_session_id UUID, p_request_id UUID,
  p_request_hash TEXT, p_table_id UUID, p_mode TEXT, p_items JSONB,
  p_policy_ids UUID[], p_expected_total NUMERIC
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing orders%ROWTYPE;
  v_result JSONB;
  v_order_id UUID;
  v_policy RECORD;
  v_count INTEGER := 0;
  v_menu RECORD;
  v_now TIMESTAMP;
  v_day INTEGER;
  v_previous INTEGER;
  v_timezone TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  SELECT * INTO v_existing FROM orders WHERE kiosk_session_id = p_session_id;
  IF FOUND THEN
    IF v_existing.kiosk_request_id <> p_request_id OR v_existing.kiosk_request_hash <> p_request_hash OR v_existing.store_id <> p_store_id THEN
      RAISE EXCEPTION 'Sesi ini sudah memiliki pesanan. Lanjutkan pembayaran pesanan tersebut.';
    END IF;
    RETURN jsonb_build_object('order_id', v_existing.id);
  END IF;
  IF p_mode NOT IN ('dine_in','takeaway') OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Pesanan tidak valid';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE (x->>'quantity')::numeric NOT BETWEEN 1 AND 20 OR (x->>'quantity')::numeric <> trunc((x->>'quantity')::numeric)) THEN
    RAISE EXCEPTION 'Jumlah item tidak valid';
  END IF;
  SELECT timezone INTO v_timezone FROM stores WHERE id = p_store_id FOR SHARE;
  v_now := now() AT TIME ZONE COALESCE(v_timezone,'Asia/Jakarta');
  v_day := extract(dow FROM v_now)::integer;
  v_previous := (v_day + 6) % 7;
  -- Lock menu rows in stable order; the existing RPC validates options/prices and
  -- reserves both menu and ingredient stock in this SAME transaction.
  FOR v_menu IN SELECT m.* FROM menu_items m WHERE m.id IN
    (SELECT (x->>'menu_item_id')::uuid FROM jsonb_array_elements(p_items) x) ORDER BY m.id FOR UPDATE
  LOOP
    IF v_menu.store_id <> p_store_id OR NOT v_menu.show_on_menu OR NOT v_menu.is_available OR
      NOT EXISTS(SELECT 1 FROM categories c WHERE c.id=v_menu.category_id AND c.store_id=p_store_id AND c.is_active) THEN
      RAISE EXCEPTION 'Menu tidak tersedia di cabang ini';
    END IF;
    IF v_menu.available_from IS NOT NULL OR v_menu.available_until IS NOT NULL THEN
      IF v_menu.available_from IS NULL OR v_menu.available_until IS NULL OR NOT (
        (v_menu.available_from < v_menu.available_until AND v_day=ANY(v_menu.available_days) AND v_now::time >= v_menu.available_from AND v_now::time < v_menu.available_until) OR
        (v_menu.available_from >= v_menu.available_until AND ((v_day=ANY(v_menu.available_days) AND v_now::time >= v_menu.available_from) OR (v_previous=ANY(v_menu.available_days) AND v_now::time < v_menu.available_until)))
      ) THEN RAISE EXCEPTION 'Menu tidak tersedia pada jam ini'; END IF;
    END IF;
  END LOOP;
  IF p_mode = 'dine_in' THEN
    PERFORM 1 FROM tables WHERE id=p_table_id AND store_id=p_store_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Meja tidak aktif di cabang ini'; END IF;
    IF EXISTS(SELECT 1 FROM reservations WHERE table_id=p_table_id AND status IN ('confirmed','arrived','seated') AND reserved_for BETWEEN now()-interval '90 minutes' AND now()+interval '90 minutes') THEN
      RAISE EXCEPTION 'Meja sedang direservasi. Pilih meja lain atau hubungi petugas.';
    END IF;
  ELSIF p_table_id IS NOT NULL THEN RAISE EXCEPTION 'Pesanan dibawa pulang tidak memakai meja'; END IF;

  v_result := create_order_atomic(p_store_id,p_table_id,NULL,NULL,'Pelanggan KIOSK',NULL,NULL,
    CASE WHEN p_mode='takeaway' THEN 'KIOSK · Dibawa pulang' ELSE 'KIOSK · Makan di sini' END,p_items);
  v_order_id := (v_result->>'order_id')::uuid;
  -- Existing kitchen screens and ESC/POS bridge render item notes, not the
  -- options_snapshot JSON. Include authoritative labels for KIOSK orders only.
  UPDATE order_items oi SET notes=concat_ws(E'\n',
    (SELECT string_agg(option_row->>'group_name' || ': ' || (option_row->>'option_name'), ', ')
      FROM jsonb_array_elements(oi.options_snapshot) option_row), nullif(oi.notes,''))
  WHERE oi.order_id=v_order_id AND jsonb_array_length(oi.options_snapshot)>0;
  IF round((v_result->>'total_amount')::numeric) <> p_expected_total THEN
    RAISE EXCEPTION 'Harga berubah. Muat ulang menu dan periksa total sebelum membayar.';
  END IF;
  FOR v_policy IN
    SELECT DISTINCT ON (document_type) id,version FROM store_documents
    WHERE status='published' AND document_type IN ('privacy','terms') AND (store_id=p_store_id OR store_id IS NULL)
    ORDER BY document_type,store_id NULLS LAST
  LOOP
    v_count := v_count+1;
    IF NOT (v_policy.id = ANY(p_policy_ids)) THEN RAISE EXCEPTION 'Kebijakan berubah. Baca dan setujui kembali.'; END IF;
    INSERT INTO policy_acceptances(order_id,anonymous_session_hash,store_id,document_id,document_version)
    VALUES(v_order_id,encode(digest(p_session_id::text,'sha256'),'hex'),p_store_id,v_policy.id,v_policy.version);
  END LOOP;
  IF v_count <> cardinality(p_policy_ids) THEN RAISE EXCEPTION 'Persetujuan kebijakan tidak sesuai'; END IF;
  UPDATE orders SET kiosk_session_id=p_session_id,kiosk_station_id=p_station_id,kiosk_request_id=p_request_id,
    kiosk_request_hash=p_request_hash,order_type=CASE WHEN p_mode='takeaway' THEN 'pickup' ELSE 'dine_in' END,
    pickup_at=NULL, estimated_ready_at=now()+interval '1 minute' * (
      SELECT greatest(5,least(240,sum(COALESCE(m.prep_minutes,5)*oi.quantity))) FROM order_items oi JOIN menu_items m ON m.id=oi.menu_item_id WHERE oi.order_id=v_order_id
    ) WHERE id=v_order_id;
  RETURN jsonb_build_object('order_id',v_order_id);
END;
$$;

-- Atomic, amount-verified settlement shared by webhook and authenticated poll.
CREATE OR REPLACE FUNCTION public.settle_kiosk_payment(p_order_id UUID,p_amount NUMERIC,p_status TEXT,p_transaction_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id=p_order_id AND kiosk_session_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pesanan KIOSK tidak ditemukan'; END IF;
  IF p_amount IS NULL OR p_amount <> round(v_order.total_amount) THEN RAISE EXCEPTION 'Nominal pembayaran tidak cocok'; END IF;
  IF p_status NOT IN ('pending','paid','failed','expired') THEN RAISE EXCEPTION 'Status pembayaran tidak valid'; END IF;
  IF v_order.payment_status IN ('paid','refunded') OR p_status='pending' THEN
    RETURN jsonb_build_object('payment_status',v_order.payment_status);
  END IF;
  -- Never resurrect cancelled orders / stock released by staff. Reconcile late
  -- settlements manually before refunding or fulfilling them.
  IF p_status='paid' AND (v_order.status='cancelled' OR v_order.payment_status IN ('failed','expired')) THEN
    RAISE EXCEPTION 'Pembayaran terlambat membutuhkan rekonsiliasi petugas';
  END IF;
  UPDATE orders SET payment_status=p_status,
    status=CASE WHEN p_status='paid' AND status='pending' THEN 'confirmed' WHEN p_status IN ('failed','expired') THEN 'cancelled' ELSE status END,
    updated_at=now() WHERE id=p_order_id;
  UPDATE payments SET status=p_status,method='snap',transaction_id=p_transaction_id,midtrans_order_id=p_order_id::text,
    paid_at=CASE WHEN p_status='paid' THEN now() ELSE NULL END,updated_at=now() WHERE order_id=p_order_id;
  RETURN jsonb_build_object('payment_status',p_status);
END;
$$;

-- Abandoned orders with NO provider request can safely release reserved stock.
-- Never expire an uncertain / issued Snap transaction based on a UI timer.
CREATE OR REPLACE FUNCTION public.expire_unpaid_kiosk_drafts()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE orders SET status='cancelled',payment_status='expired',updated_at=now()
  WHERE kiosk_session_id IS NOT NULL AND kiosk_payment_state='idle' AND payment_status='pending'
    AND status='pending' AND created_at < now()-interval '30 minutes';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  UPDATE payments p SET status='expired',updated_at=now() FROM orders o
    WHERE p.order_id=o.id AND o.kiosk_session_id IS NOT NULL AND o.payment_status='expired' AND p.status='pending';
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.create_kiosk_order(UUID,TEXT,UUID,UUID,TEXT,UUID,TEXT,JSONB,UUID[],NUMERIC) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.settle_kiosk_payment(UUID,NUMERIC,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expire_unpaid_kiosk_drafts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_kiosk_order(UUID,TEXT,UUID,UUID,TEXT,UUID,TEXT,JSONB,UUID[],NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_kiosk_payment(UUID,NUMERIC,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_kiosk_drafts() TO service_role;
REVOKE ALL ON FUNCTION public.guard_kiosk_order_update() FROM PUBLIC,anon,authenticated;
COMMIT;
