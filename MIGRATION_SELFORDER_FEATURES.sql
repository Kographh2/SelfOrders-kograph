-- Fitur tambahan SelfOrder: opsi menu, stok, jam operasional, shift, loyalitas.
-- Jalankan setelah schema.sql dan MIGRATION_SELFORDER_2026.sql.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS option_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS show_on_menu BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_stock_quantity_check;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_stock_quantity_check
  CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS options_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS opening_hours JSONB,
  ADD COLUMN IF NOT EXISTS manual_closed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS menu_stock_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','consumed','released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, menu_item_id)
);

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opening_cash DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closing_cash DECIMAL(14,2),
  expected_cash DECIMAL(14,2),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (closing_cash IS NULL OR closing_cash >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS cashier_shifts_one_open_per_cashier
  ON cashier_shifts(store_id, cashier_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS cashier_shifts_store_opened_idx
  ON cashier_shifts(store_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  points INTEGER NOT NULL CHECK (points <> 0),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, order_id)
);
CREATE INDEX IF NOT EXISTS loyalty_transactions_user_created_idx
  ON loyalty_transactions(user_id, created_at DESC);

ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_stock_reservations ENABLE ROW LEVEL SECURITY;

-- Rebuild order creation so option prices and stock are verified atomically.
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_store_id UUID,
  p_table_id UUID,
  p_user_id UUID,
  p_anonymous_session_id TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT,
  p_notes TEXT,
  p_items JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_order_number INTEGER;
  v_order_id UUID;
  v_subtotal DECIMAL(12,2) := 0;
  v_tax_rate DECIMAL(5,4);
  v_service_rate DECIMAL(5,4);
  v_tax DECIMAL(12,2);
  v_service DECIMAL(12,2);
  v_total DECIMAL(12,2);
  v_item JSONB;
  v_group JSONB;
  v_option JSONB;
  v_selected JSONB;
  v_selected_ids TEXT[];
  v_menu_item RECORD;
  v_item_subtotal DECIMAL(12,2);
  v_option_total DECIMAL(12,2);
  v_stock INTEGER;
  v_quantity INTEGER;
  v_selection_count INTEGER;
  v_min_select INTEGER;
  v_max_select INTEGER;
  v_snapshots JSONB;
BEGIN
  SELECT tax_rate, service_charge_rate INTO v_tax_rate, v_service_rate
  FROM stores WHERE id = p_store_id AND is_active = true AND manual_closed = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Toko sedang tutup atau tidak aktif'; END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order harus memiliki minimal satu item';
  END IF;

  -- Validate stock, item options and authoritative prices before reserving stock.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := (v_item->>'quantity')::INTEGER;
    IF v_quantity < 1 THEN RAISE EXCEPTION 'Jumlah item tidak valid'; END IF;

    SELECT id, name, price, is_available, store_id, track_stock, stock_quantity, option_groups
    INTO v_menu_item FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::UUID AND store_id = p_store_id
      AND is_available = true AND show_on_menu = true
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Menu tidak tersedia di cabang ini'; END IF;

    IF v_menu_item.track_stock THEN
      IF v_menu_item.stock_quantity IS NULL OR v_menu_item.stock_quantity < v_quantity THEN
        RAISE EXCEPTION 'Stok % tidak mencukupi', v_menu_item.name;
      END IF;
    END IF;

    v_selected_ids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'option_ids', '[]'::jsonb)));
    v_snapshots := '[]'::jsonb;
    v_option_total := 0;

    FOR v_group IN SELECT value FROM jsonb_array_elements(COALESCE(v_menu_item.option_groups, '[]'::jsonb))
    LOOP
      v_selected := COALESCE((
        SELECT jsonb_agg(option_row.value)
        FROM jsonb_array_elements(COALESCE(v_group->'options', '[]'::jsonb)) option_row(value)
        WHERE option_row.value->>'id' = ANY(v_selected_ids)
      ), '[]'::jsonb);
      v_selection_count := jsonb_array_length(v_selected);
      v_min_select := COALESCE((v_group->>'min_select')::INTEGER, CASE WHEN COALESCE((v_group->>'required')::BOOLEAN, false) THEN 1 ELSE 0 END);
      v_max_select := COALESCE((v_group->>'max_select')::INTEGER, 99);
      IF v_selection_count < v_min_select OR v_selection_count > v_max_select THEN
        RAISE EXCEPTION 'Pilihan untuk % tidak valid', v_group->>'name';
      END IF;

      FOR v_option IN SELECT value FROM jsonb_array_elements(v_selected)
      LOOP
        v_option_total := v_option_total + COALESCE((v_option->>'price_delta')::DECIMAL, 0);
        v_snapshots := v_snapshots || jsonb_build_array(jsonb_build_object(
          'group_id', v_group->>'id', 'group_name', v_group->>'name',
          'option_id', v_option->>'id', 'option_name', v_option->>'name',
          'price_delta', COALESCE((v_option->>'price_delta')::DECIMAL, 0)
        ));
      END LOOP;
      v_selected_ids := ARRAY(SELECT unnest(v_selected_ids)
        EXCEPT SELECT selected_option.value->>'id'
        FROM jsonb_array_elements(v_selected) selected_option(value));
    END LOOP;

    IF cardinality(v_selected_ids) > 0 THEN RAISE EXCEPTION 'Pilihan menu tidak dikenal'; END IF;
    IF v_menu_item.track_stock THEN
      UPDATE menu_items SET stock_quantity = stock_quantity - v_quantity, updated_at = NOW()
      WHERE id = v_menu_item.id AND stock_quantity >= v_quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'Stok % baru saja habis', v_menu_item.name; END IF;
    END IF;
    v_item_subtotal := (v_menu_item.price + v_option_total) * v_quantity;
    v_subtotal := v_subtotal + v_item_subtotal;
  END LOOP;

  IF v_subtotal <= 0 THEN RAISE EXCEPTION 'Order total harus lebih dari nol'; END IF;
  v_tax := ROUND(v_subtotal * COALESCE(v_tax_rate, 0), 2);
  v_service := ROUND(v_subtotal * COALESCE(v_service_rate, 0), 2);
  v_total := v_subtotal + v_tax + v_service;
  v_order_number := get_next_order_number(p_store_id);

  INSERT INTO orders(store_id, table_id, user_id, anonymous_session_id, order_number,
    customer_name, customer_phone, customer_email, subtotal, tax_amount, service_charge,
    total_amount, notes, status, payment_status)
  VALUES(p_store_id, p_table_id, p_user_id, p_anonymous_session_id, v_order_number,
    p_customer_name, p_customer_phone, p_customer_email, v_subtotal, v_tax, v_service,
    v_total, p_notes, 'pending', 'pending') RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := (v_item->>'quantity')::INTEGER;
    SELECT id, name, price, track_stock INTO v_menu_item
    FROM menu_items WHERE id = (v_item->>'menu_item_id')::UUID AND store_id = p_store_id;
    v_selected_ids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'option_ids', '[]'::jsonb)));
    v_snapshots := '[]'::jsonb;
    v_option_total := 0;
    FOR v_group IN SELECT value FROM jsonb_array_elements(COALESCE((SELECT option_groups FROM menu_items WHERE id = v_menu_item.id), '[]'::jsonb))
    LOOP
      v_selected := COALESCE((SELECT jsonb_agg(option_row.value)
        FROM jsonb_array_elements(COALESCE(v_group->'options', '[]'::jsonb)) option_row(value)
        WHERE option_row.value->>'id' = ANY(v_selected_ids)), '[]'::jsonb);
      FOR v_option IN SELECT value FROM jsonb_array_elements(v_selected)
      LOOP
        v_option_total := v_option_total + COALESCE((v_option->>'price_delta')::DECIMAL, 0);
        v_snapshots := v_snapshots || jsonb_build_array(jsonb_build_object(
          'group_id', v_group->>'id', 'group_name', v_group->>'name',
          'option_id', v_option->>'id', 'option_name', v_option->>'name',
          'price_delta', COALESCE((v_option->>'price_delta')::DECIMAL, 0)
        ));
      END LOOP;
    END LOOP;
    v_item_subtotal := (v_menu_item.price + v_option_total) * v_quantity;
    INSERT INTO order_items(order_id, menu_item_id, name_snapshot, price_snapshot,
      quantity, subtotal, notes, options_snapshot)
    VALUES(v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.price,
      v_quantity, v_item_subtotal, v_item->>'notes', v_snapshots);
    IF v_menu_item.track_stock THEN
      INSERT INTO menu_stock_reservations(order_id, menu_item_id, quantity)
      VALUES(v_order_id, v_menu_item.id, v_quantity)
      ON CONFLICT(order_id, menu_item_id) DO UPDATE SET quantity = menu_stock_reservations.quantity + EXCLUDED.quantity;
    END IF;
  END LOOP;

  INSERT INTO payments(order_id, amount, method, status) VALUES(v_order_id, v_total, 'pending', 'pending');
  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
    'subtotal', v_subtotal, 'tax_amount', v_tax, 'service_charge', v_service, 'total_amount', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION release_order_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    UPDATE menu_stock_reservations SET status = 'consumed'
      WHERE order_id = NEW.id AND status = 'reserved';
  ELSIF ((NEW.payment_status IN ('failed','expired')) OR
      (NEW.status = 'cancelled' AND NEW.payment_status <> 'paid')) AND
      (OLD.payment_status IS DISTINCT FROM NEW.payment_status OR OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE menu_items item SET stock_quantity = item.stock_quantity + reservation.quantity, updated_at = NOW()
      FROM menu_stock_reservations reservation
      WHERE reservation.order_id = NEW.id AND reservation.menu_item_id = item.id
        AND reservation.status = 'reserved';
    UPDATE menu_stock_reservations SET status = 'released'
      WHERE order_id = NEW.id AND status = 'reserved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_release_stock ON orders;
CREATE TRIGGER orders_release_stock AFTER UPDATE OF status, payment_status ON orders
  FOR EACH ROW EXECUTE FUNCTION release_order_stock();

CREATE OR REPLACE FUNCTION award_loyalty_points()
RETURNS TRIGGER AS $$
DECLARE v_points INTEGER;
BEGIN
  IF NEW.user_id IS NULL OR NEW.status <> 'completed' OR NEW.payment_status <> 'paid' OR
     (OLD.status = 'completed' AND OLD.payment_status = 'paid') THEN RETURN NEW; END IF;
  v_points := FLOOR(NEW.total_amount / 10000)::INTEGER;
  IF v_points <= 0 THEN RETURN NEW; END IF;
  INSERT INTO loyalty_accounts(user_id, points) VALUES(NEW.user_id, 0)
    ON CONFLICT(user_id) DO NOTHING;
  INSERT INTO loyalty_transactions(user_id, order_id, points, description)
    VALUES(NEW.user_id, NEW.id, v_points, 'Poin dari pesanan #' || NEW.order_number)
    ON CONFLICT(user_id, order_id) DO NOTHING;
  IF FOUND THEN
    UPDATE loyalty_accounts SET points = points + v_points, updated_at = NOW()
      WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS orders_award_loyalty_points ON orders;
CREATE TRIGGER orders_award_loyalty_points AFTER UPDATE OF status, payment_status ON orders
  FOR EACH ROW EXECUTE FUNCTION award_loyalty_points();

CREATE OR REPLACE FUNCTION cashier_shift_summary(p_shift_id UUID, p_cashier_id UUID)
RETURNS JSONB AS $$
DECLARE v_shift RECORD; v_expected DECIMAL(14,2); v_count INTEGER;
BEGIN
  SELECT * INTO v_shift FROM cashier_shifts WHERE id = p_shift_id AND cashier_id = p_cashier_id FOR UPDATE;
  IF NOT FOUND OR v_shift.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Shift tidak aktif'; END IF;
  SELECT COALESCE(SUM(amount),0), COUNT(*) INTO v_expected, v_count
    FROM payments WHERE paid_by = p_cashier_id AND method = 'cash' AND status = 'paid'
      AND paid_at >= v_shift.opened_at AND paid_at <= NOW();
  RETURN jsonb_build_object('shift_id', v_shift.id, 'opening_cash', v_shift.opening_cash,
    'cash_sales', v_expected, 'expected_cash', v_shift.opening_cash + v_expected,
    'cash_transactions', v_count, 'opened_at', v_shift.opened_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION close_cashier_shift(p_shift_id UUID, p_cashier_id UUID, p_closing_cash DECIMAL)
RETURNS JSONB AS $$
DECLARE v_shift RECORD; v_cash_sales DECIMAL(14,2); v_count INTEGER; v_closed_at TIMESTAMPTZ := NOW();
BEGIN
  IF p_closing_cash < 0 THEN RAISE EXCEPTION 'Kas akhir tidak valid'; END IF;
  SELECT * INTO v_shift FROM cashier_shifts WHERE id = p_shift_id AND cashier_id = p_cashier_id FOR UPDATE;
  IF NOT FOUND OR v_shift.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Shift tidak aktif'; END IF;
  SELECT COALESCE(SUM(amount),0), COUNT(*) INTO v_cash_sales, v_count
    FROM payments WHERE paid_by = p_cashier_id AND method = 'cash' AND status = 'paid'
      AND paid_at >= v_shift.opened_at AND paid_at <= v_closed_at;
  UPDATE cashier_shifts SET closing_cash = p_closing_cash,
    expected_cash = v_shift.opening_cash + v_cash_sales, closed_at = v_closed_at
    WHERE id = p_shift_id;
  RETURN jsonb_build_object('shift_id', p_shift_id, 'opening_cash', v_shift.opening_cash,
    'cash_sales', v_cash_sales, 'expected_cash', v_shift.opening_cash + v_cash_sales,
    'closing_cash', p_closing_cash, 'difference', p_closing_cash - (v_shift.opening_cash + v_cash_sales),
    'cash_transactions', v_count, 'opened_at', v_shift.opened_at, 'closed_at', v_closed_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION create_order_atomic(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_order_atomic(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) TO service_role;
REVOKE ALL ON FUNCTION cashier_shift_summary(UUID,UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION close_cashier_shift(UUID,UUID,DECIMAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cashier_shift_summary(UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION close_cashier_shift(UUID,UUID,DECIMAL) TO service_role;
