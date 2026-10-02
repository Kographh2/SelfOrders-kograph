-- SelfOrder operational feature pack (features 1-12).
-- Apply after schema.sql and all existing MIGRATION_SELFORDER_*.sql files.
-- All new tables intentionally have RLS enabled without client policies: the
-- application accesses them through its authenticated server/service-role API.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Suppliers and purchase orders for recipe ingredients.
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, name)
);
CREATE INDEX IF NOT EXISTS suppliers_store_name_idx ON suppliers(store_id, name);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ordered','received','cancelled')),
  notes TEXT,
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, order_number)
);
CREATE INDEX IF NOT EXISTS purchase_orders_store_created_idx ON purchase_orders(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity_ordered NUMERIC(14,3) NOT NULL CHECK(quantity_ordered > 0),
  quantity_received NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(quantity_received >= 0),
  unit_cost NUMERIC(14,2) NOT NULL CHECK(unit_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(purchase_order_id, ingredient_id)
);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS expires_at DATE;
ALTER TABLE purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_purchase_order_id_ingredient_id_key;

ALTER TABLE ingredient_movements DROP CONSTRAINT IF EXISTS ingredient_movements_movement_type_check;
ALTER TABLE ingredient_movements ADD CONSTRAINT ingredient_movements_movement_type_check
  CHECK(movement_type IN ('restock','adjustment','reserve','release','purchase_receive','waste'));

CREATE OR REPLACE FUNCTION receive_purchase_order(p_order_id UUID, p_actor_id UUID)
RETURNS JSONB AS $$
DECLARE v_po purchase_orders%ROWTYPE; v_item RECORD; v_count INTEGER := 0; v_total NUMERIC(14,2) := 0;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pesanan pembelian tidak ditemukan'; END IF;
  IF v_po.status NOT IN ('ordered','draft') THEN RAISE EXCEPTION 'Pesanan pembelian sudah diproses'; END IF;
  FOR v_item IN
    SELECT poi.*, i.stock_quantity, i.unit_cost AS previous_cost
    FROM purchase_order_items poi JOIN ingredients i ON i.id=poi.ingredient_id
    WHERE poi.purchase_order_id=p_order_id AND i.store_id=v_po.store_id
    FOR UPDATE OF i
  LOOP
    UPDATE ingredients SET
      unit_cost=CASE WHEN stock_quantity + v_item.quantity_ordered > 0
        THEN ROUND(((stock_quantity * unit_cost) + (v_item.quantity_ordered * v_item.unit_cost)) / (stock_quantity + v_item.quantity_ordered), 2)
        ELSE v_item.unit_cost END,
      stock_quantity=stock_quantity + v_item.quantity_ordered,
      updated_at=NOW()
    WHERE id=v_item.ingredient_id;
    UPDATE purchase_order_items SET quantity_received=quantity_ordered WHERE id=v_item.id;
    INSERT INTO ingredient_movements(ingredient_id,actor_id,movement_type,quantity_delta,reference_id,notes)
      VALUES(v_item.ingredient_id,p_actor_id,'purchase_receive',v_item.quantity_ordered,p_order_id,'Penerimaan pembelian '||v_po.order_number);
    v_count := v_count + 1;
    v_total := v_total + (v_item.quantity_ordered * v_item.unit_cost);
  END LOOP;
  IF v_count=0 THEN RAISE EXCEPTION 'Pesanan pembelian tidak memiliki item'; END IF;
  UPDATE purchase_orders SET status='received',received_at=NOW(),received_by=p_actor_id,updated_at=NOW() WHERE id=p_order_id;
  RETURN jsonb_build_object('purchase_order_id',p_order_id,'items_received',v_count,'total_cost',v_total,'received_at',NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION receive_purchase_order(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION receive_purchase_order(UUID,UUID) TO service_role;

CREATE OR REPLACE FUNCTION record_ingredient_waste(p_ingredient_id UUID,p_quantity NUMERIC,p_actor_id UUID,p_notes TEXT)
RETURNS JSONB AS $$
DECLARE v_ingredient ingredients%ROWTYPE;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Jumlah bahan terbuang tidak valid'; END IF;
  SELECT * INTO v_ingredient FROM ingredients WHERE id=p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bahan tidak ditemukan'; END IF;
  IF p_quantity > v_ingredient.stock_quantity THEN RAISE EXCEPTION 'Stok tidak cukup untuk dicatat sebagai terbuang'; END IF;
  UPDATE ingredients SET stock_quantity=stock_quantity-p_quantity,updated_at=NOW() WHERE id=p_ingredient_id;
  INSERT INTO ingredient_movements(ingredient_id,actor_id,movement_type,quantity_delta,notes)
    VALUES(p_ingredient_id,p_actor_id,'waste',-p_quantity,NULLIF(LEFT(TRIM(p_notes),500),''));
  RETURN jsonb_build_object('ingredient_id',p_ingredient_id,'wasted',p_quantity,'remaining',v_ingredient.stock_quantity-p_quantity);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION record_ingredient_waste(UUID,NUMERIC,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_ingredient_waste(UUID,NUMERIC,UUID,TEXT) TO service_role;

-- 2. Loyalty is already earned through completed paid orders. Add redeemable
-- store rewards and single-use reward claims without changing existing points.
CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL CHECK(points_cost > 0),
  discount_amount NUMERIC(14,2) NOT NULL CHECK(discount_amount > 0),
  min_purchase NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(min_purchase >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id UUID NOT NULL REFERENCES loyalty_rewards(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  points_spent INTEGER NOT NULL CHECK(points_spent > 0),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','reserved','used','expired','cancelled')),
  used_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS loyalty_redemptions_user_status_idx ON loyalty_redemptions(user_id,status,expires_at);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_discount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(loyalty_discount >= 0);

CREATE OR REPLACE FUNCTION redeem_loyalty_reward(p_user_id UUID,p_reward_id UUID)
RETURNS JSONB AS $$
DECLARE v_reward loyalty_rewards%ROWTYPE; v_balance INTEGER; v_code TEXT; v_redemption loyalty_redemptions%ROWTYPE;
BEGIN
  SELECT * INTO v_reward FROM loyalty_rewards WHERE id=p_reward_id AND is_active=TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward tidak tersedia'; END IF;
  INSERT INTO loyalty_accounts(user_id,points) VALUES(p_user_id,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT points INTO v_balance FROM loyalty_accounts WHERE user_id=p_user_id FOR UPDATE;
  IF v_balance < v_reward.points_cost THEN RAISE EXCEPTION 'Poin tidak cukup'; END IF;
  v_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT,'-','') FROM 1 FOR 12));
  UPDATE loyalty_accounts SET points=points-v_reward.points_cost,updated_at=NOW() WHERE user_id=p_user_id;
  INSERT INTO loyalty_transactions(user_id,points,description)
    VALUES(p_user_id,-v_reward.points_cost,'Penukaran reward: '||v_reward.name);
  INSERT INTO loyalty_redemptions(reward_id,user_id,code,points_spent,expires_at)
    VALUES(v_reward.id,p_user_id,v_code,v_reward.points_cost,NOW()+INTERVAL '30 days') RETURNING * INTO v_redemption;
  RETURN jsonb_build_object('redemption',to_jsonb(v_redemption),'reward',to_jsonb(v_reward),'remaining_points',v_balance-v_reward.points_cost);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION redeem_loyalty_reward(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_loyalty_reward(UUID,UUID) TO service_role;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_redemptions ENABLE ROW LEVEL SECURITY;

-- 3. Existing cashier_shifts and summary RPC already implement opening,
-- closing, cash expected/difference; no duplicate shift tables are introduced.

-- 4. Refunds require an explicit owner approval before the Midtrans request.
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  requester_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK(amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected','processing','completed','failed')),
  midtrans_refund_key TEXT UNIQUE,
  midtrans_response JSONB,
  reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refund_requests_store_status_idx ON refund_requests(store_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_one_open_per_order_idx ON refund_requests(order_id)
  WHERE status IN ('requested','approved','processing');

-- 5. order_feedback already exists and the customer waiting page already
-- accepts a rating. It will be exposed to staff in the operations dashboard.

-- 6. Service requests from a table QR (waiter, bill, utensils, other).
CREATE TABLE IF NOT EXISTS table_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK(request_type IN ('waiter','bill','utensils','water','other')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','acknowledged','completed','cancelled')),
  handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS table_service_requests_open_idx ON table_service_requests(store_id,status,created_at DESC);

-- 7. Sales forecasting is computed from historical orders at request time.

-- 8/12. Staff schedule plus event-based attendance with private selfie photos
-- and point-in-time location. No continuous/background GPS tracking is stored.
CREATE TABLE IF NOT EXISTS staff_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  role_label TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(ends_at <> starts_at)
);
CREATE INDEX IF NOT EXISTS staff_schedules_store_date_idx ON staff_schedules(store_id,work_date,starts_at);

CREATE TABLE IF NOT EXISTS store_attendance_settings (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  radius_meters INTEGER NOT NULL DEFAULT 200 CHECK(radius_meters BETWEEN 20 AND 5000),
  require_location BOOLEAN NOT NULL DEFAULT TRUE,
  require_selfie BOOLEAN NOT NULL DEFAULT TRUE,
  allow_outside_geofence BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES staff_schedules(id) ON DELETE SET NULL,
  work_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('clock_in','clock_out')),
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_timestamp TIMESTAMPTZ,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  location_accuracy_meters NUMERIC(10,2),
  distance_from_store_meters NUMERIC(10,2),
  geofence_passed BOOLEAN,
  selfie_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id,staff_id,work_date,event_type),
  CHECK((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
CREATE INDEX IF NOT EXISTS staff_attendance_store_date_idx ON staff_attendance(store_id,work_date DESC);
CREATE INDEX IF NOT EXISTS staff_attendance_staff_time_idx ON staff_attendance(staff_id,server_timestamp DESC);

-- 9. Existing order tracking/reorder cart works for guests. Add a secure
-- authenticated order history endpoint without exposing anonymous sessions.

-- 10. Customer-reported order problems, separate from automatic refund actions.
CREATE TABLE IF NOT EXISTS order_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK(category IN ('late','missing_item','wrong_item','payment','quality','other')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_review','resolved','rejected')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_incidents_store_status_idx ON order_incidents(store_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS order_incidents_one_open_category_idx ON order_incidents(order_id,category)
  WHERE status IN ('open','in_review');

-- 11. Store-level legal/help content with immutable revision history.
CREATE TABLE IF NOT EXISTS store_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK(document_type IN ('privacy','terms','refund')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id,document_type,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS store_documents_one_published_idx ON store_documents(COALESCE(store_id,'00000000-0000-0000-0000-000000000000'::uuid),document_type) WHERE status='published';
CREATE TABLE IF NOT EXISTS store_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS store_faqs_public_order_idx ON store_faqs(store_id,is_published,display_order);
CREATE TABLE IF NOT EXISTS policy_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  anonymous_session_hash TEXT,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  document_id UUID NOT NULL REFERENCES store_documents(id) ON DELETE RESTRICT,
  document_version INTEGER NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(user_id IS NOT NULL OR anonymous_session_hash IS NOT NULL)
);
ALTER TABLE policy_acceptances ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS policy_acceptances_user_time_idx ON policy_acceptances(user_id,accepted_at DESC);
-- Consent is recorded per checkout/order and must not be deduplicated.

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_acceptances ENABLE ROW LEVEL SECURITY;

-- Private Supabase Storage bucket for staff attendance selfies.
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    VALUES('attendance-selfies','attendance-selfies',FALSE,5242880,ARRAY['image/jpeg','image/webp'])
    ON CONFLICT(id) DO UPDATE SET public=FALSE,file_size_limit=5242880,allowed_mime_types=ARRAY['image/jpeg','image/webp'];
  END IF;
END $$;
