-- ================================================================
-- JALANKAN FILE INI DI SUPABASE SQL EDITOR
-- Fungsi: Auto-sync auth.users → public.users via trigger
-- ================================================================

-- 1. Fungsi trigger: otomatis insert ke public.users saat user baru dibuat di auth.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hanya insert jika belum ada (idempotent)
  INSERT INTO public.users (id, email, name, role, is_active, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'User'),
    'user',   -- default role selalu 'user', TIDAK bisa di-override dari client
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;  -- jika sudah ada, skip

  RETURN NEW;
END;
$$;

-- 2. Drop trigger lama jika ada
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Buat trigger baru
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- 4. Sync semua auth.users yang sudah ada tapi belum ada di public.users
INSERT INTO public.users (id, email, name, role, is_active, created_at, updated_at)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'name', split_part(COALESCE(au.email, ''), '@', 1), 'User'),
  'user',
  true,
  au.created_at,
  NOW()
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 5. Tampilkan hasilnya
SELECT
  au.id,
  au.email,
  au.created_at AS auth_created,
  pu.role,
  pu.is_active
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
ORDER BY au.created_at DESC;
