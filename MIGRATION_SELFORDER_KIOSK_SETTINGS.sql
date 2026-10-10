  -- Apply after MIGRATION_SELFORDER_KIOSK.sql. Owner-managed branch terminals.
  BEGIN;
  CREATE TABLE IF NOT EXISTS public.kiosk_stations (
    store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE RESTRICT,
    is_enabled boolean NOT NULL DEFAULT true,
    is_default boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT is_default OR is_enabled)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS kiosk_one_default ON public.kiosk_stations(is_default) WHERE is_default;
  ALTER TABLE public.kiosk_stations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.kiosk_stations FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE ON public.kiosk_stations TO service_role;

  CREATE OR REPLACE FUNCTION public.save_kiosk_station(p_store_id uuid, p_enabled boolean, p_default boolean)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('kiosk-station-settings'));
    IF p_enabled IS NULL OR p_default IS NULL OR (p_default AND NOT p_enabled) THEN
      RAISE EXCEPTION 'Cabang utama harus aktif';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND (NOT p_enabled OR is_active)) THEN
      RAISE EXCEPTION 'Pilih toko aktif yang tersedia';
    END IF;
    IF p_default THEN
      UPDATE kiosk_stations SET is_default = false, updated_at = now() WHERE is_default;
    END IF;
    INSERT INTO kiosk_stations(store_id, is_enabled, is_default)
      VALUES (p_store_id, p_enabled, p_default)
      ON CONFLICT (store_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled,
        is_default = EXCLUDED.is_default, updated_at = now();
  END;
  $$;
  REVOKE ALL ON FUNCTION public.save_kiosk_station(uuid,boolean,boolean) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.save_kiosk_station(uuid,boolean,boolean) TO service_role;
  COMMIT;
