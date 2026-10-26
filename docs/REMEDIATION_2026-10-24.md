# Perbaikan audit dan UI — 24 Oktober 2026

Validasi akhir diselesaikan 25 Oktober 2026.

Perubahan ini melanjutkan codebase SelfOrder yang ada. Laporan audit 23 Oktober adalah catatan kondisi sebelum perbaikan; tes audit kini mengharapkan akses ilegal ditolak. Tidak ada migrasi, transaksi, pengiriman push, atau deployment ke layanan produksi yang dijalankan dalam pekerjaan ini.

## Temuan utama

| Temuan | Perubahan yang disiapkan |
| --- | --- |
| A01 — wallet/feedback tanpa proteksi database memadai | RLS dan pencabutan grant browser pada tabel finansial, feedback, payment dan push. Operasi aplikasi melalui API terverifikasi. |
| A02 — INSERT pesanan publik | Akses langsung `orders`/`order_items` dicabut. Checkout memakai RPC server yang menghitung harga dan menyimpan transaksi secara atomik. |
| A03 — perubahan akun lintas cabang/owner | Admin tidak dapat mengubah role, cabang, status, atau akun orang lain. Perubahan administratif oleh owner; daftar admin dibatasi cabangnya. UI mengikuti pembatasan ini. |
| A04 — JWT tetap berlaku setelah hak dicabut | Setiap request memeriksa profil aktif, versi identitas, dan sesi database. Perubahan role/cabang/status mencabut sesi. Cookie HttpOnly menggantikan JWT aplikasi di localStorage. Sesi terikat pada `session_id` Supabase, sehingga menghapus cookie tidak menghidupkan sesi yang telah dicabut. |
| A05 — inventori lintas cabang | Pembaruan harus menemukan ID dalam cabang berwenang; tidak lagi melakukan upsert ID asing. |
| A06 — impersonasi push dan endpoint arbitrer | Pemilik berasal dari akun terverifikasi atau cookie guest bertanda tangan. Allowlist HTTPS provider, validasi key, batas request dan maksimum 10 subscription per identitas. Subscription lama harus diverifikasi ulang. |
| A07 — callback/signature pembayaran | Payload pelanggan tidak memuat `snap_data`; signature historis dibersihkan. Webhook hanya menjadi pemicu: server meminta status Midtrans, memeriksa reference/amount, lalu menjalankan settlement atomik. Callback sukses browser tidak menandai lunas. |
| A08 — RLS users rekursif/eskalasi profil | Policy rekursif dan INSERT/UPDATE profil langsung dihapus. Read profil sendiri hanya pada kolom yang diizinkan; mutasi lewat API. |
| A09 — GPS/selfie rekan kerja | Kasir hanya mendapat data absensinya sendiri. Script retensi foto/lokasi disediakan dengan mode preview sebagai default. |
| A10 — katalog pengelolaan terlalu luas | Mode management wajib cabang berwenang. Detail publik menyaring menu tersembunyi/tidak tersedia dan memakai proyeksi kolom publik. Draft promo dibatasi manager cabang. Akses browser langsung ke tabel katalog/pengelolaan toko dicabut agar tidak melewati pemeriksaan API/sesi. |

## Integritas transaksi dan operasional

- Checkout menggunakan request UUID dan hash keranjang: retry identik mengembalikan pesanan yang sama; perubahan payload dengan key yang sama ditolak. Order, stok, diskon, reward, total pembayaran, dan versi persetujuan kebijakan berada dalam satu transaksi.
- Klaim promo memakai lock kuota. OTP memakai reservasi percobaan atomik maksimum lima, batas per nomor, dan budget pengiriman per jam.
- Snap dan split bill menyimpan reservasi attempt sebelum menghubungi provider. Kegagalan yang statusnya belum pasti ditahan untuk pemeriksaan, bukan otomatis membuat transaksi kedua.
- Pembayaran cash dan refund manual menyimpan seluruh perubahan lokal dan audit dalam satu transaksi. Wallet tidak dapat mendebit order yang sudah dibatalkan. Pesanan belum lunas tidak dapat masuk proses dapur.
- Refund digital memakai key tetap per request dan status `processing` sebelum pengiriman. Timeout tidak memicu refund baru. Status selesai memerlukan kecocokan refund key, nominal, dan konfirmasi provider.
- Owner/admin memiliki aksi **Periksa pembayaran** pada detail pesanan dan **Periksa status Midtrans** untuk refund processing. Aksi ini mengambil status provider; tidak memaksa pesanan menjadi lunas. Pembayaran terlambat pada order batal dan refund top-up/deposit/split memerlukan rekonsiliasi manual petugas.
- Orders memakai pagination 50 baris (maksimum 100 per request). Laporan membaca halaman data berurutan; lebih dari 20.000 baris meminta rentang tanggal dipersempit, bukan mengembalikan laporan terpotong. Statistik operasional dihitung melalui agregasi database.
- Kitchen mengambil pesanan aktif melalui API berwenang setiap 15 detik saat layar terlihat. Akses realtime langsung ke tabel order tidak lagi diperlukan.
- Unggahan dibatasi ukuran byte, diverifikasi dari konten, didekode, dibatasi dimensi/piksel, dan diubah ke WebP tanpa metadata. File SVG/HTML tersamar ditolak.
- Printer bridge dibatasi localhost, exact origin, pairing token, ukuran payload/jumlah item, satu pekerjaan aktif, dan timeout koneksi.
- Jalur register/anonymous API alternatif yang memakai admin identity creation ditutup. UI memakai Supabase Auth. Konfigurasi konfirmasi email, CAPTCHA dan limit Supabase tetap harus diverifikasi di hosting.
- Header mencakup `no-referrer`, `nosniff`, pembatasan framing, dan CSP dasar untuk aplikasi/Midtrans. CSP masih mengizinkan inline script yang diperlukan build saat ini; ini bukan klaim proteksi XSS lengkap. SDK Supabase tetap mengelola sesi browsernya sendiri.

## UI

- Menu memakai navy–white dengan bidang abu terang lembut, satu keluarga sans, header ringkas, kartu lebih tenang, harga jelas, dan fallback tanpa foto yang kecil.
- Baris **Makan di tempat / Ambil sendiri / Waktu pengambilan dipilih di keranjang / nama cabang** dihapus dari header menu. Pemilihan mode, waktu pickup, dan cabang yang dibutuhkan transaksi tetap tersedia di keranjang.
- Produk pertama terlihat sebelum 450 px pada fixture ponsel. Tidak ada overflow horizontal pada 320, 390, 768, dan 1440 px.
- Navbar Liquid Glass tetap menuju Menu, Cari, Keranjang, dan Profil secara langsung. Interaksi tekan/geser, pembatalan drag, keyboard, safe area, reduced motion dan reduced transparency dipertahankan.
- Checkout menampilkan rincian final server (subtotal, pajak, layanan, diskon, total) dan meminta konfirmasi kedua sebelum memanggil pembayaran. Menutup ringkasan pesanan yang sudah tersimpan membawa pelanggan ke waiting page.
- Profil memiliki pesanan aktif; settings memiliki daftar sesi dan pencabutan sesi dengan backend nyata.
- Ads tetap satu popup dengan rotasi lima detik, pause, dan pilihan sembunyikan per iklan. Perubahan isi kampanye meningkatkan revision sehingga kampanye baru pada ID yang sama dapat tampil lagi.
- Keyboard catatan kiosk, paid-only QR, acknowledgement dari ponsel, dan reset sepuluh detik dipertahankan. Judul tab cabang dijaga dari penimpaan metadata halaman yang datang belakangan.
- Foto makanan asli tetap perlu diunggah pengelola. Tidak ada foto/label penjualan palsu yang ditambahkan.

## Penerapan database

Terapkan pada staging terlebih dahulu dengan backup dan jendela rilis yang mencakup aplikasi serta database. Migrasi ini mencabut grant lama; aplikasi versi sebelumnya dan integrasi yang langsung memakai Data API tidak kompatibel.

Prasyarat schema/fitur yang digunakan fixture pengujian: `schema.sql`, `MIGRATION_SELFORDER_2026.sql`, `MIGRATION_SELFORDER_FEATURES.sql`, `MIGRATION_SELFORDER_ADVANCED.sql`, `MIGRATION_SELFORDER_OPERATIONS.sql`, `MIGRATION_SELFORDER_KIOSK.sql`, `MIGRATION_SELFORDER_KIOSK_SETTINGS.sql`, `MIGRATION_KIOSK_HANDOFF.sql`, `MIGRATION_RESTAURANT_ADS.sql`, `MIGRATION_TELEGRAM_RESERVATION_OTP.sql`, dan `MIGRATION_TELEGRAM_OTP_AUTO_DELIVERY.sql`. Periksa riwayat hosting; jangan menjalankan ulang schema lama sembarangan pada database berisi data.

Setelah seluruh prasyarat tersedia, urutannya:

1. [MIGRATION_SECURITY_20261024.sql](../MIGRATION_SECURITY_20261024.sql)
2. [MIGRATION_TRANSACTIONS_20261024.sql](../MIGRATION_TRANSACTIONS_20261024.sql)
3. [MIGRATION_CHECKOUT_20261024.sql](../MIGRATION_CHECKOUT_20261024.sql)
4. [MIGRATION_OPERATIONS_20261024.sql](../MIGRATION_OPERATIONS_20261024.sql)

Jangan menjalankan migrasi legacy setelah empat migrasi ini: fungsi atau grant lama dapat dipasang kembali. Verifikasi ACL aktual untuk `anon`, `authenticated`, `service_role`, custom role, dan RPC; tes lokal tidak menginventarisasi role/grant tambahan milik hosting.

Sesudah rilis:

- Login ulang akun; JWT aplikasi lama tidak diterima. Pastikan secret JWT server tersedia dan tidak diekspos ke client. Cookie produksi memerlukan HTTPS.
- Daftarkan ulang push dari Settings. Subscription lama dengan `verified_at` kosong tidak dipakai untuk pengiriman.
- Sesi guest baru ditandatangani server. Order guest lama tidak dipindahkan otomatis; pertahankan credential/order reference lama untuk bantuan petugas. Pengajuan refund guest sekarang memerlukan cookie guest yang sesuai, bukan identitas dari body.
- Pada Vercel limiter menggunakan header platform. Di luar Vercel, `TRUST_PROXY_IP=true` hanya bila reverse proxy tepercaya menimpa `X-Forwarded-For`; tanpa itu bucket IP bersama dipakai. Atur WAF/rate limit hosting sesuai volume restoran.
- `OTP_HOURLY_BUDGET` default 50 pengiriman per jam. Sesuaikan dengan budget operasional dan limit Gateway; jangan menaruh kredensial di source.
- Untuk printer: set `SELFORDER_ORIGIN`, `ESC_POS_PRINTER_HOST`, dan `ESC_POS_PAIRING_TOKEN` acak minimal 32 karakter pada mesin bridge. Pengguna memasangkan token ketika pertama mencetak pada sesi browser. Uji printer fisik dan izin local-network browser.
- Retensi absensi: `node --env-file=.env.local scripts/prune-attendance.mjs` hanya preview. Setelah kebijakan retensi ditetapkan pemilik, jalankan dengan `--apply` melalui scheduler privat. `ATTENDANCE_RETENTION_DAYS` default 90, minimum 30. Script menghapus selfie lama beserta koordinat terkait, bukan bukti bahwa anti-spoof GPS/face verification tersedia. Scheduler belum dipasang.
- Untuk status provider yang belum pasti, gunakan pemeriksaan status lalu cocokkan transaksi di dashboard Midtrans. Jangan mereset attempt atau membuat refund pengganti tanpa memastikan hasil transaksi terdahulu.

## Validasi lokal

Build fixture produksi berhasil, termasuk TypeScript dan pembuatan 75 halaman statis. Masih ada warning lint terkait gambar/font dan dependency hook; tidak ada error build. Build ini memakai URL/kunci Supabase dummy lokal dan **bukan artefak yang siap diunggah ke produksi**.

Perintah yang digunakan:

```powershell
node --test --test-concurrency=1 tests/security/*.test.mjs tests/kiosk/*.test.mjs tests/ads/*.test.mjs tests/offline/*.test.mjs
node scripts/build-kiosk-test.mjs
$env:SELFORDER_BUILD_DIR='.next-kiosk-test'
node node_modules/@playwright/test/cli.js test --config=playwright.ui.config.ts
node node_modules/@playwright/test/cli.js test --config=playwright.kiosk.config.ts
git diff --check
```

- Regresi Node/API/PGlite/upload: **79/79 lolos**, termasuk pemeriksaan ACL katalog dan pengelolaan toko terakhir.
- Browser pelanggan: **15/15 lolos**, termasuk konfirmasi biaya sebelum request pembayaran, empat ukuran layar, dark mode, drag navbar, iklan dan game offline.
- Browser kiosk: **12/12 lolos** setelah perbaikan judul cabang. QR bertoken dibaca decoder, dibuka pada konteks browser ponsel terpisah, acknowledgement gagal dicoba ulang, lalu kiosk reset sepuluh detik setelah konfirmasi. Ini pengujian browser lokal, bukan kamera perangkat fisik.
- `git diff --check`: lolos; perbedaan normalisasi LF/CRLF dilaporkan Git sebagai warning.
- Dependency diperbarui ke Next/eslint-config-next 15.5.28 dan sharp 0.35.5, serta override transitive terkait. Audit registry saat instalasi terbaru melaporkan **0 advisory**; itu tidak menilai kerentanan logika aplikasi. Referensi primer: [advisory Next/sharp](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [advisory selector parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
- Acuan rekonsiliasi: [Midtrans transaction status](https://docs.midtrans.com/reference/get-transaction-status), [Midtrans notification handling](https://docs.midtrans.com/docs/https-notification-webhooks).

Belum diverifikasi: migrasi dan ACL Supabase hosting, login dengan akun hosting setelah migrasi, pembayaran/refund Midtrans nyata, Telegram/push asli, scan kamera dua perangkat fisik, PWA terpasang iOS/Android, printer/touchscreen fisik, domain QR/HTTPS, serta deployment. Fixture browser memalsukan respons provider; fixture SQL menjalankan migrasi/RPC asli pada database sementara. Tidak ada klaim seluruh kombinasi fitur telah diuji end-to-end.
