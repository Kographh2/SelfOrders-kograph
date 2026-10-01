-- Advanced SelfOrder features. Run after schema.sql,
-- MIGRATION_SELFORDER_2026.sql, and MIGRATION_SELFORDER_FEATURES.sql.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS available_from TIME,
  ADD COLUMN IF NOT EXISTS available_until TIME,
  ADD COLUMN IF NOT EXISTS available_days SMALLINT[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::SMALLINT[],
  ADD COLUMN IF NOT EXISTS prep_minutes INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS is_bundle BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_prep_minutes_check;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_prep_minutes_check CHECK (prep_minutes BETWEEN 1 AND 240);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS supported_languages TEXT[] NOT NULL DEFAULT ARRAY['id','en'];

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS pickup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('dine_in','pickup'));
CREATE INDEX IF NOT EXISTS orders_pickup_store_time_idx ON orders(store_id,pickup_at) WHERE order_type='pickup';

-- Ingredient stock and recipe consumption. Order-item INSERT runs inside the
-- existing atomic create_order_atomic transaction; insufficient stock rolls
-- back the complete order before any payment can start.
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  stock_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
  low_stock_threshold NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(low_stock_threshold >= 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(unit_cost >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id,name)
);
CREATE TABLE IF NOT EXISTS menu_item_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity_per_item NUMERIC(14,3) NOT NULL CHECK(quantity_per_item > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(menu_item_id,ingredient_id)
);
CREATE TABLE IF NOT EXISTS ingredient_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL CHECK(quantity > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','consumed','released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id,ingredient_id)
);
CREATE TABLE IF NOT EXISTS ingredient_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('restock','adjustment','reserve','release')),
  quantity_delta NUMERIC(14,3) NOT NULL,
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ingredient_store_low_stock_idx ON ingredients(store_id,is_active,stock_quantity);
CREATE INDEX IF NOT EXISTS ingredient_movements_ingredient_time_idx ON ingredient_movements(ingredient_id,created_at DESC);

CREATE OR REPLACE FUNCTION reserve_recipe_ingredients_for_item()
RETURNS TRIGGER AS $$
DECLARE v_recipe RECORD; v_needed NUMERIC(14,3); v_stock NUMERIC(14,3);
BEGIN
  FOR v_recipe IN
    SELECT recipe.ingredient_id, recipe.quantity_per_item, ingredient.name
    FROM menu_item_recipes recipe JOIN ingredients ingredient ON ingredient.id=recipe.ingredient_id
    WHERE recipe.menu_item_id=NEW.menu_item_id AND ingredient.is_active=true
    ORDER BY recipe.ingredient_id
  LOOP
    v_needed := v_recipe.quantity_per_item * NEW.quantity;
    SELECT stock_quantity INTO v_stock FROM ingredients WHERE id=v_recipe.ingredient_id FOR UPDATE;
    IF v_stock < v_needed THEN RAISE EXCEPTION 'Bahan baku % tidak mencukupi',v_recipe.name; END IF;
    UPDATE ingredients SET stock_quantity=stock_quantity-v_needed,updated_at=NOW() WHERE id=v_recipe.ingredient_id;
    INSERT INTO ingredient_reservations(order_id,ingredient_id,quantity)
      VALUES(NEW.order_id,v_recipe.ingredient_id,v_needed)
      ON CONFLICT(order_id,ingredient_id) DO UPDATE
      SET quantity=ingredient_reservations.quantity+EXCLUDED.quantity;
    INSERT INTO ingredient_movements(ingredient_id,movement_type,quantity_delta,reference_id,notes)
      VALUES(v_recipe.ingredient_id,'reserve',-v_needed,NEW.order_id,'Reservasi bahan untuk pesanan');
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS order_items_reserve_recipe_ingredients ON order_items;
CREATE TRIGGER order_items_reserve_recipe_ingredients AFTER INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION reserve_recipe_ingredients_for_item();

CREATE OR REPLACE FUNCTION finalize_order_ingredient_reservations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status='paid' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    UPDATE ingredient_reservations SET status='consumed' WHERE order_id=NEW.id AND status='reserved';
  ELSIF ((NEW.payment_status IN ('failed','expired','refunded')) OR
      (NEW.status='cancelled' AND NEW.payment_status<>'paid')) AND
      (OLD.payment_status IS DISTINCT FROM NEW.payment_status OR OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE ingredients ingredient SET stock_quantity=ingredient.stock_quantity+reservation.quantity,updated_at=NOW()
      FROM ingredient_reservations reservation
      WHERE reservation.order_id=NEW.id AND reservation.ingredient_id=ingredient.id AND reservation.status='reserved';
    INSERT INTO ingredient_movements(ingredient_id,movement_type,quantity_delta,reference_id,notes)
      SELECT ingredient_id,'release',quantity,NEW.id,'Pelepasan reservasi pesanan batal'
      FROM ingredient_reservations WHERE order_id=NEW.id AND status='reserved';
    UPDATE ingredient_reservations SET status='released' WHERE order_id=NEW.id AND status='reserved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS orders_finalize_ingredient_reservations ON orders;
CREATE TRIGGER orders_finalize_ingredient_reservations AFTER UPDATE OF status,payment_status ON orders
  FOR EACH ROW EXECUTE FUNCTION finalize_order_ingredient_reservations();

CREATE OR REPLACE FUNCTION release_deleted_order_ingredients()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ingredients ingredient SET stock_quantity=ingredient.stock_quantity+reservation.quantity,updated_at=NOW()
    FROM ingredient_reservations reservation
    WHERE reservation.order_id=OLD.id AND reservation.ingredient_id=ingredient.id AND reservation.status='reserved';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS orders_release_ingredients_before_delete ON orders;
CREATE TRIGGER orders_release_ingredients_before_delete BEFORE DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION release_deleted_order_ingredients();

-- Phone-verified reservations. API verifies Supabase Auth phone_confirmed_at.
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  party_size INTEGER NOT NULL CHECK(party_size BETWEEN 1 AND 30),
  reserved_for TIMESTAMPTZ NOT NULL,
  hold_until TIMESTAMPTZ NOT NULL,
  table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','arrived','seated','cancelled','no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ;
UPDATE reservations SET hold_until=reserved_for+INTERVAL '15 minutes' WHERE hold_until IS NULL;
ALTER TABLE reservations ALTER COLUMN hold_until SET NOT NULL;
CREATE INDEX IF NOT EXISTS reservations_store_time_idx ON reservations(store_id,reserved_for,status);

-- Split bill: an unguessable invite token grants read/payment access only to
  -- pre-created shares; guests cannot add items or alter the parent order.
CREATE TABLE IF NOT EXISTS split_bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  invite_token_hash TEXT NOT NULL UNIQUE,
  total_amount NUMERIC(14,2) NOT NULL CHECK(total_amount > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paid','cancelled','expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '12 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS split_bill_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_bill_id UUID NOT NULL REFERENCES split_bills(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK(amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','expired')),
  midtrans_order_id TEXT UNIQUE,
  snap_token TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS split_bill_parts_bill_idx ON split_bill_parts(split_bill_id,status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_store_time_idx ON audit_logs(store_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_time_idx ON audit_logs(actor_id,created_at DESC);

-- One Telegram bot can serve multiple branches. Bot credentials remain in env vars.
CREATE TABLE IF NOT EXISTS telegram_user_sessions (
  telegram_chat_id BIGINT PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  username TEXT,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'choose_store' CHECK(state IN ('choose_store','choose_topic','awaiting_message','idle')),
  topic TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS telegram_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_chat_id BIGINT NOT NULL,
  telegram_user_id BIGINT NOT NULL,
  username TEXT,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','replied','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS telegram_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES telegram_conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('customer','admin','bot')),
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  telegram_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS telegram_bot_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('system','bot','customer','admin')),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  telegram_chat_id BIGINT,
  telegram_user_id BIGINT,
  username TEXT,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  telegram_update_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS telegram_conversations_store_idx ON telegram_conversations(store_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS telegram_messages_conversation_idx ON telegram_messages(conversation_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_messages_update_dedupe_idx ON telegram_messages(conversation_id,telegram_message_id) WHERE telegram_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS telegram_bot_activity_created_idx ON telegram_bot_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS telegram_bot_activity_store_idx ON telegram_bot_activity(store_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_bot_activity_update_dedupe_idx ON telegram_bot_activity(telegram_update_id) WHERE telegram_update_id IS NOT NULL;
ALTER TABLE telegram_user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_bot_activity ENABLE ROW LEVEL SECURITY;

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(deposit_amount>=0);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_status TEXT NOT NULL DEFAULT 'pending' CHECK(deposit_status IN ('pending','paid','failed','not_required'));
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS midtrans_order_id TEXT UNIQUE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS snap_token TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS private_token_hash TEXT UNIQUE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS reservation_deposit_per_guest NUMERIC(14,2) NOT NULL DEFAULT 20000 CHECK(reservation_deposit_per_guest>=0);

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_bill_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- All access is through authenticated API routes using the Supabase service role.

-- Select and lock the reservation table in one transaction so concurrent
-- requests cannot both claim the same table for overlapping time windows.
CREATE OR REPLACE FUNCTION create_reservation_atomic(
  p_store_id UUID,
  p_requested_table_id UUID,
  p_customer_name TEXT,
  p_phone TEXT,
  p_party_size INTEGER,
  p_reserved_for TIMESTAMPTZ,
  p_hold_until TIMESTAMPTZ,
  p_deposit_amount NUMERIC,
  p_private_token_hash TEXT,
  p_notes TEXT
) RETURNS reservations AS $$
DECLARE
  v_table_id UUID;
  v_candidate RECORD;
  v_reservation reservations;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_phone,0));
  IF (SELECT COUNT(*) FROM reservations WHERE phone=p_phone AND reserved_for>=NOW() AND status NOT IN ('cancelled','no_show'))>=2 THEN
    RAISE EXCEPTION 'Maksimal dua reservasi aktif per nomor HP';
  END IF;

  IF p_requested_table_id IS NOT NULL THEN
    SELECT id INTO v_table_id FROM tables
      WHERE id=p_requested_table_id AND store_id=p_store_id AND is_active=true
      FOR UPDATE;
    IF v_table_id IS NULL THEN RAISE EXCEPTION 'Meja tidak aktif'; END IF;
    IF EXISTS (
      SELECT 1 FROM reservations
      WHERE table_id=v_table_id AND status IN ('confirmed','arrived','seated')
        AND reserved_for BETWEEN p_reserved_for-INTERVAL '90 minutes' AND p_reserved_for+INTERVAL '90 minutes'
    ) THEN RAISE EXCEPTION 'Meja sudah dipesan pada rentang waktu tersebut'; END IF;
  ELSE
    FOR v_candidate IN
      SELECT id FROM tables WHERE store_id=p_store_id AND is_active=true ORDER BY number FOR UPDATE
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM reservations
        WHERE table_id=v_candidate.id AND status IN ('confirmed','arrived','seated')
          AND reserved_for BETWEEN p_reserved_for-INTERVAL '90 minutes' AND p_reserved_for+INTERVAL '90 minutes'
      ) THEN
        v_table_id := v_candidate.id;
        EXIT;
      END IF;
    END LOOP;
    IF v_table_id IS NULL THEN RAISE EXCEPTION 'Tidak ada meja tersedia pada waktu tersebut'; END IF;
  END IF;

  INSERT INTO reservations(store_id,table_id,customer_name,phone,party_size,reserved_for,hold_until,deposit_amount,deposit_status,private_token_hash,notes,status)
  VALUES(p_store_id,v_table_id,p_customer_name,p_phone,p_party_size,p_reserved_for,p_hold_until,p_deposit_amount,
    CASE WHEN p_deposit_amount>0 THEN 'pending' ELSE 'not_required' END,p_private_token_hash,p_notes,'confirmed')
  RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;

REVOKE ALL ON FUNCTION create_reservation_atomic(UUID,UUID,TEXT,TEXT,INTEGER,TIMESTAMPTZ,TIMESTAMPTZ,NUMERIC,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_reservation_atomic(UUID,UUID,TEXT,TEXT,INTEGER,TIMESTAMPTZ,TIMESTAMPTZ,NUMERIC,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION update_reservation_atomic(p_reservation_id UUID,p_status TEXT,p_table_id UUID)
RETURNS reservations AS $$
DECLARE
  v_reservation reservations;
  v_table_id UUID;
BEGIN
  SELECT * INTO v_reservation FROM reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservasi tidak ditemukan'; END IF;
  IF p_table_id IS NOT NULL THEN
    SELECT id INTO v_table_id FROM tables
      WHERE id=p_table_id AND store_id=v_reservation.store_id AND is_active=true
      FOR UPDATE;
    IF v_table_id IS NULL THEN RAISE EXCEPTION 'Meja tidak aktif'; END IF;
    IF p_status IN ('confirmed','arrived','seated') AND EXISTS (
      SELECT 1 FROM reservations
      WHERE id<>p_reservation_id AND table_id=v_table_id AND status IN ('confirmed','arrived','seated')
        AND reserved_for BETWEEN v_reservation.reserved_for-INTERVAL '90 minutes' AND v_reservation.reserved_for+INTERVAL '90 minutes'
    ) THEN RAISE EXCEPTION 'Meja sudah dipakai reservasi lain pada waktu tersebut'; END IF;
  END IF;
  UPDATE reservations SET status=p_status,table_id=p_table_id,updated_at=NOW()
    WHERE id=p_reservation_id RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;

REVOKE ALL ON FUNCTION update_reservation_atomic(UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_reservation_atomic(UUID,TEXT,UUID) TO service_role;
