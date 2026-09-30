# Supabase Setup Guide

## 1. Konfigurasi Auth (Authentication → Providers)

| Setting | Value |
|---|---|
| Allow new users to sign up | ✅ ON |
| Allow manual linking | ⛔ OFF |
| Allow anonymous sign-ins | ✅ ON |
| Confirm email | ✅ ON (bisa OFF untuk dev) |

## 2. Jalankan Schema SQL

Buka **SQL Editor** di Supabase dashboard, jalankan file SQL dalam urutan berikut:

1. `schema.sql`
2. `MIGRATION_SELFORDER_2026.sql`
3. `MIGRATION_SELFORDER_FEATURES.sql`

Migration fitur menambahkan pilihan/add-on menu, stok, shift kasir, poin loyalitas, dan pengaturan jam operasional/toko tutup. Jalankan migration pada database yang sudah memakai dua schema sebelumnya; jangan jalankan di urutan terbalik.

## 3. Buat Owner User Pertama

Setelah schema dijalankan, buat user owner pertama via SQL:

```sql
-- Setelah user register lewat aplikasi, upgrade role-nya di sini:
UPDATE users
SET role = 'owner'
WHERE email = 'your-email@example.com';
```

Atau langsung insert via Supabase Auth dashboard:
1. Authentication → Users → "Add User"
2. Masukkan email & password
3. Jalankan SQL di atas untuk set role = 'owner'

## 4. Assign Staff ke Store

```sql
-- Setelah store dibuat, assign admin/kasir:
UPDATE users
SET role = 'admin', store_id = 'uuid-store-kamu'
WHERE email = 'admin@example.com';
```

## 5. Environment Variables (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

JWT_SECRET=buat-random-string-panjang-minimal-32-karakter

MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxx
MIDTRANS_IS_PRODUCTION=false

NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@yourdomain.com

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 6. Generate VAPID Keys (untuk push notification)

```bash
npx web-push generate-vapid-keys
```

## 7. Run Development

```bash
npm install
npm run dev
```

## 8. Test Flow

1. Buka `http://localhost:3000/menu?store=STORE_UUID&table=1`
2. Customer langsung lihat menu
3. Untuk staff: buka `http://localhost:3000/dashboard`

## Troubleshooting

### Error 406 di Supabase (users table)
→ Jalankan bagian RLS fix di bawah `schema.sql` (bagian paling bawah)

### Error 404 `/api/auth/login`
→ Pastikan Next.js server sudah running (`npm run dev`)
→ File ada di `src/app/api/auth/login/route.ts`

### Anonymous login gagal
→ Pastikan "Allow anonymous sign-ins" sudah ON di Supabase Auth settings

### Midtrans tidak muncul
→ Pastikan `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` diisi dengan benar
→ Gunakan Sandbox key dulu untuk testing
