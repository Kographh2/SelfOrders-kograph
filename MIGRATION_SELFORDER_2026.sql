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

-- ============================================================
-- ORDER CALLING, WALLET LEDGER, TOP-UP, WITHDRAW, TIP & RATING
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_acknowledged_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('topup','order_payment','tip','refund','withdrawal')),
  direction TEXT NOT NULL CHECK(direction IN ('credit','debit')), amount DECIMAL(14,2) NOT NULL CHECK(amount > 0),
  reference_type TEXT, reference_id TEXT, description TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type, reference_id)
);
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_reference_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_user_type_reference_uidx ON wallet_transactions(user_id,type,reference_id);
CREATE TABLE IF NOT EXISTS wallet_topups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL CHECK(amount >= 10000), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','expired')),
  midtrans_order_id TEXT NOT NULL UNIQUE, snap_token TEXT, redirect_url TEXT, paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL CHECK(amount >= 10000), bank_name TEXT NOT NULL, account_number TEXT NOT NULL,
  account_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','paid')),
  notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, cashier_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), note TEXT, tip_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION wallet_pay_order(p_user_id UUID,p_order_id UUID)
RETURNS JSONB AS $$ DECLARE v_amount DECIMAL(14,2);v_balance DECIMAL(14,2); BEGIN
  SELECT total_amount INTO v_amount FROM orders WHERE id=p_order_id AND user_id=p_user_id AND payment_status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak valid atau sudah dibayar'; END IF;
  INSERT INTO wallets(user_id,balance) VALUES(p_user_id,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM wallets WHERE user_id=p_user_id FOR UPDATE;
  IF v_balance<v_amount THEN RAISE EXCEPTION 'Saldo tidak cukup'; END IF;
  UPDATE wallets SET balance=balance-v_amount,updated_at=NOW() WHERE user_id=p_user_id;
  INSERT INTO wallet_transactions(user_id,type,direction,amount,reference_type,reference_id,description)
  VALUES(p_user_id,'order_payment','debit',v_amount,'order',p_order_id::TEXT,'Pembayaran pesanan');
  UPDATE orders SET payment_status='paid',payment_method='wallet',status='confirmed',updated_at=NOW() WHERE id=p_order_id;
  UPDATE payments SET status='paid',method='wallet',paid_at=NOW(),updated_at=NOW() WHERE order_id=p_order_id;
  RETURN jsonb_build_object('amount',v_amount,'balance',v_balance-v_amount);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION wallet_request_withdrawal(p_user_id UUID,p_amount DECIMAL,p_bank_name TEXT,p_account_number TEXT,p_account_name TEXT)
RETURNS UUID AS $$ DECLARE v_balance DECIMAL;v_id UUID:=uuid_generate_v4(); BEGIN
  IF p_amount<10000 THEN RAISE EXCEPTION 'Minimum penarikan Rp10.000'; END IF;
  SELECT balance INTO v_balance FROM wallets WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_balance<p_amount THEN RAISE EXCEPTION 'Saldo tidak cukup'; END IF;
  UPDATE wallets SET balance=balance-p_amount,updated_at=NOW() WHERE user_id=p_user_id;
  INSERT INTO withdrawal_requests(id,user_id,amount,bank_name,account_number,account_name)
  VALUES(v_id,p_user_id,p_amount,left(p_bank_name,80),left(p_account_number,80),left(p_account_name,120));
  INSERT INTO wallet_transactions(user_id,type,direction,amount,reference_type,reference_id,description)
  VALUES(p_user_id,'withdrawal','debit',p_amount,'withdrawal',v_id::TEXT,'Dana ditahan untuk penarikan');
  RETURN v_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION wallet_add_topup(p_topup_id UUID)
RETURNS VOID AS $$ DECLARE v_topup RECORD; BEGIN
  SELECT * INTO v_topup FROM wallet_topups WHERE id=p_topup_id FOR UPDATE;
  IF v_topup.status='paid' THEN RETURN; END IF;
  UPDATE wallet_topups SET status='paid',paid_at=NOW(),updated_at=NOW() WHERE id=p_topup_id;
  INSERT INTO wallets(user_id,balance) VALUES(v_topup.user_id,v_topup.amount)
    ON CONFLICT(user_id) DO UPDATE SET balance=wallets.balance+EXCLUDED.balance,updated_at=NOW();
  INSERT INTO wallet_transactions(user_id,type,direction,amount,reference_type,reference_id,description)
  VALUES(v_topup.user_id,'topup','credit',v_topup.amount,'topup',p_topup_id::TEXT,'Top up via Midtrans Snap') ON CONFLICT DO NOTHING;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION wallet_submit_feedback(p_user_id UUID,p_order_id UUID,p_rating INTEGER,p_note TEXT,p_tip DECIMAL)
RETURNS VOID AS $$ DECLARE v_cashier UUID;v_balance DECIMAL; BEGIN
  SELECT completed_by INTO v_cashier FROM orders WHERE id=p_order_id AND user_id=p_user_id AND status='completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pesanan belum selesai'; END IF;
  IF p_tip>0 THEN IF v_cashier IS NULL THEN RAISE EXCEPTION 'Kasir penyelesai pesanan tidak tersedia'; END IF; SELECT balance INTO v_balance FROM wallets WHERE user_id=p_user_id FOR UPDATE; IF COALESCE(v_balance,0)<p_tip THEN RAISE EXCEPTION 'Saldo tidak cukup untuk tip'; END IF;
    UPDATE wallets SET balance=balance-p_tip,updated_at=NOW() WHERE user_id=p_user_id;
    INSERT INTO wallet_transactions(user_id,type,direction,amount,reference_type,reference_id,description) VALUES(p_user_id,'tip','debit',p_tip,'order',p_order_id::TEXT,'Tip untuk kasir');
    IF v_cashier IS NOT NULL THEN
      INSERT INTO wallets(user_id,balance) VALUES(v_cashier,p_tip) ON CONFLICT(user_id) DO UPDATE SET balance=wallets.balance+EXCLUDED.balance,updated_at=NOW();
      INSERT INTO wallet_transactions(user_id,type,direction,amount,reference_type,reference_id,description) VALUES(v_cashier,'tip','credit',p_tip,'order',p_order_id::TEXT,'Tip dari pelanggan');
    END IF;
  END IF;
  INSERT INTO order_feedback(order_id,user_id,cashier_id,rating,note,tip_amount) VALUES(p_order_id,p_user_id,v_cashier,p_rating,NULLIF(p_note,''),p_tip);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_claims ENABLE ROW LEVEL SECURITY;

-- RPC keuangan hanya boleh dipanggil backend dengan service-role key.
REVOKE ALL ON FUNCTION wallet_pay_order(UUID,UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wallet_add_topup(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wallet_submit_feedback(UUID,UUID,INTEGER,TEXT,DECIMAL) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wallet_request_withdrawal(UUID,DECIMAL,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet_pay_order(UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION wallet_add_topup(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION wallet_submit_feedback(UUID,UUID,INTEGER,TEXT,DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION wallet_request_withdrawal(UUID,DECIMAL,TEXT,TEXT,TEXT) TO service_role;
