-- Apply after MIGRATION_SELFORDER_KIOSK.sql. No customer or payment data is changed.
BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kiosk_tracking_ack_at TIMESTAMPTZ;
COMMENT ON COLUMN public.orders.kiosk_tracking_ack_at IS 'First successful opening of the paid kiosk order waiting page on a customer device.';
COMMIT;
