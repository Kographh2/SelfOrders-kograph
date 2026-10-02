-- Auto-delivery flow: existing verified Telegram links receive OTP directly;
-- new users can start a one-time contact-verification deep link (no /link command).
-- Apply in Supabase SQL Editor after MIGRATION_TELEGRAM_RESERVATION_OTP.sql.

ALTER TABLE telegram_reservation_otps
  ALTER COLUMN telegram_chat_id DROP NOT NULL,
  ALTER COLUMN telegram_user_id DROP NOT NULL;

ALTER TABLE telegram_reservation_otps DROP CONSTRAINT IF EXISTS telegram_reservation_otps_status_check;
ALTER TABLE telegram_reservation_otps ADD CONSTRAINT telegram_reservation_otps_status_check
  CHECK(status IN ('awaiting_confirmation','awaiting_link','awaiting_contact','sent','verified','cancelled','expired','failed'));

CREATE INDEX IF NOT EXISTS telegram_reservation_otps_delivery_idx
  ON telegram_reservation_otps(status,expires_at);
