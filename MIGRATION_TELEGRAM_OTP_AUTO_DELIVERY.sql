-- Telegram Gateway-backed reservation verification.
-- Apply in Supabase SQL Editor after MIGRATION_TELEGRAM_RESERVATION_OTP.sql.

ALTER TABLE telegram_reservation_otps
  ALTER COLUMN telegram_chat_id DROP NOT NULL,
  ALTER COLUMN telegram_user_id DROP NOT NULL;

ALTER TABLE telegram_reservation_otps
  ADD COLUMN IF NOT EXISTS gateway_request_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_consent_at TIMESTAMPTZ;

ALTER TABLE telegram_reservation_otps DROP CONSTRAINT IF EXISTS telegram_reservation_otps_status_check;
ALTER TABLE telegram_reservation_otps ADD CONSTRAINT telegram_reservation_otps_status_check
  CHECK(status IN ('awaiting_confirmation','awaiting_link','awaiting_contact','gateway_pending','sent','verified','cancelled','expired','failed'));

CREATE INDEX IF NOT EXISTS telegram_reservation_otps_delivery_idx
  ON telegram_reservation_otps(status,expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_reservation_otps_gateway_request_uidx
  ON telegram_reservation_otps(gateway_request_id)
  WHERE gateway_request_id IS NOT NULL;
