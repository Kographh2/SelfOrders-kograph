-- SelfOrder Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- 1. Stores table
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  logo TEXT,
  timezone TEXT DEFAULT 'Asia/Jakarta',
  currency TEXT DEFAULT 'IDR',
  tax_rate DECIMAL(5,4) DEFAULT 0.11,
  service_charge_rate DECIMAL(5,4) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Menu items table
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(12,2) NOT NULL CHECK (price >= 0),
  image TEXT,
  is_available BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tables table
CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  qr_code TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, number)
);

-- 5. Per-store order number sequence via table
CREATE TABLE order_sequences (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  last_number INTEGER DEFAULT 0
);

-- 6. Orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
  user_id UUID,  -- nullable: supports anonymous
  anonymous_session_id TEXT,  -- for anonymous tracking
  order_number INTEGER NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','completed','cancelled')),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','expired','refunded')),
  payment_method TEXT,
  snap_token TEXT,
  redirect_url TEXT,
  subtotal DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
  tax_amount DECIMAL(12,2) DEFAULT 0 CHECK (tax_amount >= 0),
  service_charge DECIMAL(12,2) DEFAULT 0 CHECK (service_charge >= 0),
  total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(store_id, order_number)
);

-- 7. Order items table — REMOVED bad UNIQUE(order_id, menu_item_id)
-- Customer can order same item with different notes
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  name_snapshot TEXT NOT NULL,   -- snapshot: nama saat order dibuat
  price_snapshot DECIMAL(12,2) NOT NULL CHECK (price_snapshot >= 0), -- snapshot: harga saat order
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','expired','refunded')),
  transaction_id TEXT,
  midtrans_order_id TEXT UNIQUE,  -- untuk idempotency webhook
  snap_data JSONB,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Users table (managed via Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'owner', 'kasir', 'user')),
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Push subscriptions
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  anonymous_session_id TEXT,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(endpoint)
);

-- 11. Store settings table
CREATE TABLE store_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, key)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_stores_is_active ON stores(is_active);
CREATE INDEX idx_stores_slug ON stores(slug);
CREATE INDEX idx_categories_store_id ON categories(store_id);
CREATE INDEX idx_categories_is_active ON categories(is_active);
CREATE INDEX idx_menu_items_store_id ON menu_items(store_id);
CREATE INDEX idx_menu_items_category_id ON menu_items(category_id);
CREATE INDEX idx_menu_items_is_available ON menu_items(is_available);
CREATE INDEX idx_tables_store_id ON tables(store_id);
CREATE INDEX idx_tables_is_active ON tables(is_active);
CREATE INDEX idx_orders_store_id ON orders(store_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_table_id ON orders(table_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_anon_session ON orders(anonymous_session_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_midtrans_order_id ON payments(midtrans_order_id);
CREATE INDEX idx_users_store_id ON users(store_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_push_subs_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_push_subs_anon ON push_subscriptions(anonymous_session_id);

-- ============================================================
-- ATOMIC ORDER NUMBER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION get_next_order_number(p_store_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO order_sequences(store_id, last_number)
    VALUES (p_store_id, 1)
  ON CONFLICT (store_id) DO UPDATE
    SET last_number = order_sequences.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- CREATE ORDER ATOMICALLY (validates price server-side via Postgres)
-- ============================================================
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_store_id UUID,
  p_table_id UUID,
  p_user_id UUID,
  p_anonymous_session_id TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT,
  p_notes TEXT,
  p_items JSONB  -- [{menu_item_id, quantity, notes}]
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
  v_menu_item RECORD;
  v_item_subtotal DECIMAL(12,2);
BEGIN
  -- Get store tax/service rates
  SELECT tax_rate, service_charge_rate INTO v_tax_rate, v_service_rate
  FROM stores WHERE id = p_store_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found or inactive';
  END IF;

  -- Validate all items first, calculate subtotal using DB price
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT id, name, price, is_available, store_id
    INTO v_menu_item
    FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::UUID
      AND store_id = p_store_id
      AND is_available = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found, unavailable, or from wrong store', v_item->>'menu_item_id';
    END IF;

    v_item_subtotal := v_menu_item.price * (v_item->>'quantity')::INTEGER;
    v_subtotal := v_subtotal + v_item_subtotal;
  END LOOP;

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Order total must be greater than 0';
  END IF;

  v_tax := ROUND(v_subtotal * v_tax_rate, 2);
  v_service := ROUND(v_subtotal * v_service_rate, 2);
  v_total := v_subtotal + v_tax + v_service;

  -- Get atomic order number
  v_order_number := get_next_order_number(p_store_id);

  -- Insert order
  INSERT INTO orders(
    store_id, table_id, user_id, anonymous_session_id,
    order_number, customer_name, customer_phone, customer_email,
    subtotal, tax_amount, service_charge, total_amount,
    notes, status, payment_status
  ) VALUES (
    p_store_id, p_table_id, p_user_id, p_anonymous_session_id,
    v_order_number, p_customer_name, p_customer_phone, p_customer_email,
    v_subtotal, v_tax, v_service, v_total,
    p_notes, 'pending', 'pending'
  ) RETURNING id INTO v_order_id;

  -- Insert items with DB price snapshots
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT id, name, price INTO v_menu_item
    FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::UUID;

    v_item_subtotal := v_menu_item.price * (v_item->>'quantity')::INTEGER;

    INSERT INTO order_items(
      order_id, menu_item_id, name_snapshot, price_snapshot,
      quantity, subtotal, notes
    ) VALUES (
      v_order_id,
      v_menu_item.id,
      v_menu_item.name,
      v_menu_item.price,
      (v_item->>'quantity')::INTEGER,
      v_item_subtotal,
      v_item->>'notes'
    );
  END LOOP;

  -- Initialize payment record
  INSERT INTO payments(order_id, amount, method, status)
  VALUES (v_order_id, v_total, 'pending', 'pending');

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'tax_amount', v_tax,
    'service_charge', v_service,
    'total_amount', v_total
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM users WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin','kasir') AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_owner_or_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin') AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_store_access(p_store_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND is_active = true
      AND (
        role = 'owner'
        OR (role IN ('admin','kasir') AND store_id = p_store_id)
      )
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

-- STORES
CREATE POLICY "Public can view active stores" ON stores
  FOR SELECT USING (is_active = true);
CREATE POLICY "Staff can view their store" ON stores
  FOR SELECT USING (is_staff() AND has_store_access(id));
CREATE POLICY "Owners can manage stores" ON stores
  FOR ALL USING (get_user_role() = 'owner');

-- CATEGORIES (public read for menu browsing)
CREATE POLICY "Anyone can view active categories" ON categories
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admin/owner can manage categories" ON categories
  FOR ALL USING (is_owner_or_admin() AND has_store_access(store_id));

-- MENU ITEMS (public read for menu browsing)
CREATE POLICY "Anyone can view available menu items" ON menu_items
  FOR SELECT USING (is_available = true);
CREATE POLICY "Admin/owner can manage menu items" ON menu_items
  FOR ALL USING (is_owner_or_admin() AND has_store_access(store_id));

-- TABLES (public read for QR validation)
CREATE POLICY "Anyone can view active tables" ON tables
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admin/owner can manage tables" ON tables
  FOR ALL USING (is_owner_or_admin() AND has_store_access(store_id));

-- ORDERS
-- Anonymous/customer can see their own order by session or user_id
CREATE POLICY "Customer can view own orders by user_id" ON orders
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Staff can view orders in their store" ON orders
  FOR SELECT USING (is_staff() AND has_store_access(store_id));
CREATE POLICY "Customer can create orders" ON orders
  FOR INSERT WITH CHECK (true);  -- creation validated server-side via RPC
CREATE POLICY "Staff can update orders" ON orders
  FOR UPDATE USING (is_staff() AND has_store_access(store_id));

-- ORDER ITEMS
CREATE POLICY "Customer can view own order items" ON order_items
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );
CREATE POLICY "Staff can view order items in their store" ON order_items
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND is_staff() AND has_store_access(orders.store_id))
  );

-- PAYMENTS
CREATE POLICY "Customer can view own payments" ON payments
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM orders WHERE orders.id = payments.order_id AND orders.user_id = auth.uid())
  );
CREATE POLICY "Staff can view payments in their store" ON payments
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM orders WHERE orders.id = payments.order_id AND is_staff() AND has_store_access(orders.store_id))
  );

-- USERS
CREATE POLICY "User can view own profile" ON users
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "User can update own profile" ON users
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND role = (SELECT role FROM users WHERE id = auth.uid()));
CREATE POLICY "Owner/admin can view all users" ON users
  FOR SELECT USING (is_owner_or_admin());
CREATE POLICY "Owner can manage users" ON users
  FOR ALL USING (get_user_role() = 'owner' AND id != auth.uid());
CREATE POLICY "System can insert users" ON users
  FOR INSERT WITH CHECK (id = auth.uid());

-- PUSH SUBSCRIPTIONS
CREATE POLICY "User can manage own push subscription" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid() OR user_id IS NULL);

-- STORE SETTINGS
CREATE POLICY "Staff can view store settings" ON store_settings
  FOR SELECT USING (is_staff() AND has_store_access(store_id));
CREATE POLICY "Admin/owner can manage store settings" ON store_settings
  FOR ALL USING (is_owner_or_admin() AND has_store_access(store_id));

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Public bucket for direct menu image upload from the authenticated dashboard API.
-- Safe to re-run on an existing project.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-images', 'menu-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;


-- ============================================================
-- PERBAIKAN RLS: users table agar client bisa baca profil sendiri
-- Jalankan bagian ini di Supabase SQL Editor jika schema sudah ada
-- ============================================================

-- Drop dulu policy lama yang mungkin bentrok
DROP POLICY IF EXISTS "User can view own profile" ON users;
DROP POLICY IF EXISTS "User can update own profile" ON users;
DROP POLICY IF EXISTS "Owner/admin can view all users" ON users;
DROP POLICY IF EXISTS "Owner can manage users" ON users;
DROP POLICY IF EXISTS "System can insert users" ON users;

-- SELECT: user bisa baca profil sendiri
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (id = auth.uid());

-- SELECT: owner dan admin bisa baca semua user
CREATE POLICY "users_select_staff" ON users
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM users u2
      WHERE u2.id = auth.uid()
        AND u2.role IN ('owner', 'admin')
        AND u2.is_active = true
    )
  );

-- INSERT: user hanya bisa insert profil dirinya sendiri
CREATE POLICY "users_insert_self" ON users
  FOR INSERT WITH CHECK (id = auth.uid());

-- UPDATE: user update profil diri sendiri, TIDAK bisa ubah role
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM users WHERE id = auth.uid())
  );

-- UPDATE/DELETE: owner bisa kelola semua (via service role di API)
-- Note: operasi sensitif (ubah role, deactivate) HARUS lewat API route
-- yang menggunakan supabaseAdmin (service role) — bukan dari client langsung
