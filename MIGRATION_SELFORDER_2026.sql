-- Jalankan sekali di Supabase SQL Editor untuk fitur upload gambar menu.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-images', 'menu-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Promo disimpan pada tabel store_settings yang sudah ada:
-- promo_name, promo_description, promo_qr_url, promo_active.
