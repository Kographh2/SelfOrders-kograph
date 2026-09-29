-- Jalankan sekali di Supabase SQL Editor untuk fitur upload gambar menu.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-images', 'menu-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Promo disimpan pada tabel store_settings yang sudah ada:
-- promo_name, promo_description, promo_qr_url, promo_active.

-- ============================================================
-- SECURE PROMO & VOUCHER SYSTEM
-- ============================================================
CREATE TABLE IF NOT EXISTS promos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value DECIMAL(12,2) NOT NULL CHECK (discount_value > 0),
  max_discount DECIMAL(12,2),
  min_purchase DECIMAL(12,2) DEFAULT 0,
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all','products')),
  total_quota INTEGER,
  per_user_limit INTEGER NOT NULL DEFAULT 1,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, code)
);

CREATE TABLE IF NOT EXISTS promo_products (
  promo_id UUID NOT NULL REFERENCES promos(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  PRIMARY KEY (promo_id, menu_item_id)
);

CREATE TABLE IF NOT EXISTS promo_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_id UUID NOT NULL REFERENCES promos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  UNIQUE(promo_id, user_id)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_id UUID REFERENCES promos(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_claim_id UUID REFERENCES promo_claims(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_discount DECIMAL(12,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_promos_store_active ON promos(store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_promo_claims_user ON promo_claims(user_id, used_order_id);

ALTER TABLE promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_claims ENABLE ROW LEVEL SECURITY;
