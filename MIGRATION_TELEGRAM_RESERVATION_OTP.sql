  -- Apply once in Supabase SQL Editor to enable Telegram-based reservation OTP.
  CREATE TABLE IF NOT EXISTS telegram_phone_links (
    phone TEXT PRIMARY KEY,
    telegram_chat_id BIGINT NOT NULL UNIQUE,
    telegram_user_id BIGINT NOT NULL,
    username TEXT,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS telegram_reservation_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    telegram_user_id BIGINT NOT NULL,
    otp_hash TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'awaiting_confirmation' CHECK(status IN ('awaiting_confirmation','sent','verified','cancelled','expired','failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
    access_token_hash TEXT UNIQUE,
    access_token_expires_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS telegram_reservation_otps_phone_created_idx
    ON telegram_reservation_otps(phone,created_at DESC);
  CREATE INDEX IF NOT EXISTS telegram_reservation_otps_chat_status_idx
    ON telegram_reservation_otps(telegram_chat_id,status,created_at DESC);

  ALTER TABLE telegram_phone_links ENABLE ROW LEVEL SECURITY;
  ALTER TABLE telegram_reservation_otps ENABLE ROW LEVEL SECURITY;
