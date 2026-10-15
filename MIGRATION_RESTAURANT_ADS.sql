-- Run in Supabase SQL Editor before using Dashboard > Iklan & Penawaran.
-- All access goes through authenticated, store-scoped server routes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.restaurant_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  image_url text,
  link_url text,
  link_label text NOT NULL DEFAULT 'Lihat penawaran' CHECK (char_length(link_label) BETWEEN 1 AND 40),
  is_active boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 9999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_ads_store_order ON public.restaurant_ads(store_id, is_active, display_order, created_at);
ALTER TABLE public.restaurant_ads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_ads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_ads TO service_role;
COMMIT;
