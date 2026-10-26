# Audit fitur, keamanan, dan UI SelfOrder

Tanggal: 23 Oktober 2026. Target: checkout lokal `selforder-fixed`.

**Catatan 25 Oktober 2026:** dokumen ini merekam kondisi sebelum perbaikan. Implementasi, hasil regresi terbaru, batas validasi, dan urutan empat migrasi tersedia di [catatan remediasi](REMEDIATION_2026-10-24.md). Test audit sekarang mengharapkan penolakan eksploit, bukan lagi mereproduksi keberhasilan akses ilegal.

## Kesimpulan dan batas pemeriksaan

Ada masalah yang perlu ditangani sebelum menambah fitur, terutama otorisasi pembayaran, akses database langsung, dan pemisahan hak antar-cabang. Enam masalah API berhasil direproduksi melalui handler aplikasi asli dengan adapter database/data sintetis. Ini membuktikan perilaku kode, bukan bukti bahwa server produksi sudah diserang.

Inventaris mencakup **71 file API route dan 53 file halaman**. Pemeriksaan memetakan seluruh kelompok fitur di bawah, dengan pemeriksaan lebih mendalam pada auth, database, pembayaran, pengguna, inventori, absensi, push, dan kiosk. Ini **bukan** pernyataan bahwa seluruh 53 halaman atau setiap kombinasi fitur sudah diuji end-to-end.

Tidak ada perubahan pada kode aplikasi, migrasi produksi, saldo, akun, pembayaran, atau layanan eksternal. Tambahan audit hanya laporan ini dan dua file uji di `tests/security/`. Database Supabase terpasang, ACL/grant aktual, secrets hosting, WAF, webhook asli, Safari/iOS, perangkat kiosk, printer, dan kamera QR fisik belum diuji. Rekomendasi visual didasarkan pada source saat ini serta screenshot lokal menu tanggal 16 Oktober, bukan sesi browser baru.

## Prioritas temuan

| ID | Prioritas / tingkat | Temuan | Kekuatan bukti |
| --- | --- | --- | --- |
| A07 | P0 / Kritis | Payload callback pembayaran bocor; signature dapat dipakai ulang dengan status yang diubah | Reproduksi handler lokal berhasil |
| A01 | P0 / Kritis jika grant publik tersedia | Lima tabel saldo/keuangan/feedback tidak mengaktifkan RLS | Source migrasi; ACL hosting belum diperiksa; uji SQL terhambat memori |
| A02 | P0 / Kritis jika grant INSERT tersedia | Policy pesanan mengizinkan insert langsung dengan status/nominal dari pemanggil | Source SQL; uji SQL terhambat memori |
| A03 | P1 / Tinggi | Admin cabang dapat mengubah pengguna cabang lain dan menurunkan role owner | Reproduksi handler lokal berhasil |
| A04 | P1 / Tinggi | Token staf tetap berwenang setelah akun dinonaktifkan | Reproduksi handler lokal berhasil |
| A05 | P1 / Tinggi | Upsert inventori dapat mengambil alih bahan cabang lain | Reproduksi handler lokal berhasil |
| A06 | P1 / Tinggi | Langganan push dapat diikat ke identitas orang lain tanpa login | Reproduksi handler dan pengirim push lokal berhasil |
| A09 | P1 / Tinggi, privasi | Kasir memperoleh absensi, koordinat, dan tautan selfie rekan kerja | Reproduksi handler lokal berhasil |
| A08 | P2 / Sedang, keandalan | Policy profil akhir mereferensikan tabelnya sendiri | Analisis SQL; eksekusi SQL belum selesai |
| A10 | P2 / Sedang | Mode pengelolaan katalog tidak membatasi cabang; detail publik membuka menu tersembunyi | Analisis source |

P0 berarti didahulukan sebelum rilis yang melibatkan transaksi. P1 menyusul sebelum akses banyak staf/cabang. Tingkat ini penilaian dampak audit, bukan skor CVSS formal.

## Detail dan cara perbaikan

### A07 — Kebocoran callback dan pemalsuan transisi pembayaran

Lokasi: `src/app/api/orders/[orderId]/route.ts:26`, `src/app/api/payment/notification/route.ts:43`, `:183`, `:204`, dan `src/lib/midtrans.ts:100`.

Endpoint detail pesanan mengembalikan `payments(*)` kepada pelanggan pemilik pesanan. Handler notification menyimpan seluruh body ke `payments.snap_data`, termasuk `signature_key`. Verifikasi signature menghitung hash dari order ID, status code, gross amount, dan server key; **transaction_status tidak termasuk dalam input hash**. Handler lalu mempercayai transaction_status dari body tanpa meminta status terbaru ke Midtrans.

Prasyarat: pelanggan memiliki pesanan akun biasa dan callback bertanda tangan, misalnya status pending, sudah tersimpan di payment pesanan tersebut. Tidak memerlukan akses ke server key. Pembuktian menggunakan server key fixture untuk menghasilkan callback awal yang sah; setelah itu pelanggan fixture hanya membaca callback melalui endpoint detail miliknya dan mengubah statusnya.

Bukti: test A07 menjalankan detail-order GET dengan token pelanggan, membaca event tersimpan, mengganti hanya transaction_status, lalu menjalankan notification POST tanpa login. Signature asli tetap diterima, order berubah menjadi paid, dan jumlah panggilan status provider adalah **0**. Semua objek sintetis; tidak ada uang atau pembayaran sungguhan.

Dampak: pesanan dapat terlihat lunas tanpa settlement provider. Jalur refund biasa juga perlu diperketat: refund tanpa request cocok dapat jatuh ke update payment umum. Jalur normal belum membandingkan gross amount dengan total order, dan update order/payment dilakukan terpisah. Tidak semua variasi ini direproduksi di audit ini.

Perbaikan:

- Gunakan daftar kolom eksplisit pada respons pelanggan; jangan kembalikan raw provider payload/signature. Terapkan juga pada akses langsung tabel payments melalui Supabase.
- Jadikan webhook pemicu rekonsiliasi. Backend meminta status Midtrans, memverifikasi order ID, nominal, transaksi yang diharapkan, dan status/fraud authoritative sebelum settlement.
- Satukan perubahan payment, order, ledger/reward terkait dalam transaksi/RPC idempotent. Jangan mengembalikan pesanan completed menjadi confirmed akibat callback ulang.
- Wajibkan signature pada semua environment yang menerima callback; pengujian memakai signature fixture. Refund harus cocok dengan request, order, nominal dan hasil provider.
- Sanitasi data callback historis yang dapat diakses pelanggan, lalu rekonsiliasi transaksi yang mencurigakan setelah perbaikan.

Kriteria selesai: callback dengan signature valid tetapi status diubah tidak dapat melunasi order; nominal/order salah ditolak; callback duplikat tidak menghasilkan efek berulang; provider error tidak membuat paid; pelanggan tidak menerima signature. Rekomendasi status authoritative mengikuti [dokumentasi webhook Midtrans](https://docs.midtrans.com/docs/https-notification-webhooks).

### A01 — RLS tabel saldo dan data keuangan belum diaktifkan

Lokasi: `MIGRATION_SELFORDER_2026.sql:67–98` dan `:154–166`.

Tabel `wallets`, `wallet_transactions`, `wallet_topups`, `withdrawal_requests`, dan `order_feedback` dibuat, tetapi tidak ada ENABLE ROW LEVEL SECURITY untuk kelimanya dalam SQL repository yang diperiksa. REVOKE pada function wallet tidak mencabut hak akses langsung tabel. RLS hanya diaktifkan untuk tiga tabel promo pada bagian tersebut.

Prasyarat eksploitasi: tabel berada di schema yang diekspos Data API dan anon/authenticated mempunyai grant yang relevan. Kondisi itu **belum diverifikasi pada hosting**. Jangan menyamakan anon key publik dengan service-role secret; masalahnya adalah ACL/RLS, bukan keberadaan anon key di browser.

Dampak jika grant tersedia: baca data rekening/riwayat/snap token, modifikasi saldo atau topup, serta pemalsuan data feedback. Risiko saldo palsu dapat menjalar ke pembayaran wallet yang membaca saldo tersebut.

Perbaikan: migrasi baru mengaktifkan RLS, mencabut seluruh akses langsung anon/authenticated pada tabel yang hanya digunakan backend, dan memberi hak minimum kepada service_role. Jika membutuhkan read langsung, gunakan policy pemilik dan view/proyeksi kolom aman; tidak ada izin update balance dari browser. Periksa pula default privileges untuk tabel baru. Panduan ini sesuai hubungan grant dan RLS dalam [dokumentasi Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

Kriteria selesai: akun A/anon tidak bisa membaca data B atau mengubah balance/topup/withdrawal langsung; RPC service-role yang sah tetap bekerja; query katalog database membuktikan RLS aktif dan grant sesuai.

### A02 — Pembuatan pesanan langsung melewati checkout

Lokasi: `schema.sql:414–415` (`FOR INSERT WITH CHECK (true)`).

Komentar menyebut validasi RPC server, tetapi policy ini tidak memaksa penggunaan RPC. Jika ada grant INSERT untuk Data API, pemanggil bisa mengisi kolom status, payment_status, user_id, subtotal dan total_amount sendiri selama lolos constraint tabel. Trigger kiosk hanya menjaga UPDATE/DELETE, sehingga tidak menutup insert pesanan biasa.

Dampak: pesanan palsu sudah-paid, atribusi pesanan ke pengguna lain, serta lewati perhitungan harga/stock/jam buka/persetujuan. Uji SQL untuk contoh ini disiapkan tetapi belum dapat dieksekusi karena batas memori.

Perbaikan: hapus policy insert publik dan revoke INSERT/UPDATE/DELETE langsung dari customer role pada orders serta tabel turunannya. Semua pembuatan dan perubahan finansial harus melalui backend/RPC dengan hak minimum. Pertahankan read-only policy pelanggan yang memang diperlukan.

Kriteria selesai: insert langsung dengan payment_status paid ditolak untuk anon dan authenticated, sedangkan checkout resmi tetap menghasilkan harga/stock berdasarkan database.

### A03 — Admin dapat mengubah owner dan pengguna lintas cabang

Lokasi: `src/app/api/users/route.ts:107–132`.

PATCH memeriksa caller owner/admin dan hanya melarang assignment role owner oleh admin. Tidak membaca role/cabang target sebelum update, tidak menjaga target yang sudah owner, dan tidak membatasi storeId baru. Sebaliknya DELETE sudah melindungi target owner, sehingga kedua jalur tidak konsisten.

Bukti: admin fixture cabang A menurunkan owner B menjadi user dan memindahkannya ke cabang A; handler mengembalikan 200. ID target perlu diketahui; UUID tidak menggantikan otorisasi objek. GET users juga perlu menolak admin tanpa storeId, bukan membiarkan query tanpa scope.

Perbaikan: ambil target terlebih dahulu; ubah role/cabang/status hanya oleh owner, atau definisikan matriks izin admin yang sangat terbatas. Admin tidak boleh mengubah owner/admin lain, cabang target wajib cocok, dan cabang tujuan harus diotorisasi. Validasi enum role, audit perubahan, lindungi owner terakhir, lalu cabut sesi target.

Kriteria selesai: admin A mendapat 403/404 untuk target B/owner dan perpindahan cabang; update nama sendiri tetap berfungsi; seluruh role memiliki negative tests.

### A04 — Penonaktifan akun tidak membatalkan JWT aplikasi

Lokasi: `src/lib/auth.ts:21–33`, `:52`, `src/app/api/users/route.ts:65`, `src/contexts/AuthContext.tsx`.

getAuthUser hanya memverifikasi signature/expiry JWT, lalu memakai role/store yang tersimpan di token selama 7 hari. Pemeriksaan is_active dilakukan saat login, bukan saat memakai token lama.

Bukti: test menonaktifkan admin melalui DELETE users yang sah memakai token owner, kemudian GET users menggunakan JWT admin lama tetap 200. Helper masih menganggapnya admin cabang lama.

Perbaikan: resolusi identitas server harus memeriksa profil aktif dan role/cabang terkini; tambahkan session/token version yang naik saat revoke, ubah role, atau pindah cabang. Gunakan masa access token lebih pendek dengan refresh yang memeriksa status akun. Logout perlu mencabut sesi aplikasi, bukan hanya menghapus localStorage. Pisahkan verifikasi token kiosk/tracking dan akun secara tegas.

Kriteria selesai: token yang diterbitkan sebelum deactivation/demotion/store transfer tidak bisa melakukan tindakan lama segera setelah perubahan. JWT palsu tetap ditolak, dan gangguan lookup profil gagal tertutup.

### A05 — Inventory upsert melewati batas kepemilikan objek

Lokasi: `src/app/api/inventory/route.ts:29–30`.

Lookup `before` sudah difilter id dan store_id, tetapi hasil null tidak ditolak. Kode tetap upsert berdasarkan id yang dikirim; service-role dapat menimpa record cabang lain dan mengganti store_id ke cabang caller.

Bukti: lookup fixture cabang A menghasilkan null untuk bahan B; handler tetap melakukan upsert, mengubah bahan B menjadi cabang A dan stock 0, status 200.

Perbaikan: pisahkan create dari update. Create menggunakan ID yang dibuat server. Update harus menemukan objek di cabang yang diizinkan dan memakai `.eq('id', id).eq('store_id', storeId)`; jangan menerima perubahan store_id lewat jalur ini. Terapkan juga pada relasi resep dan audit stock.

Kriteria selesai: ID bahan cabang B tidak dapat diubah/dipindah oleh admin A; stock dan resep B tidak berubah; update cabang sendiri tetap berhasil.

### A06 — Identitas push dipercaya dari request tanpa autentikasi

Lokasi: `src/app/api/push/subscribe/route.ts:6–33`, `:42–48`, `src/lib/push-notifications.ts:6`.

POST menerima userId, anonymousSessionId dan endpoint tanpa auth. Sender memilih subscription berdasarkan identitas tersebut. DELETE juga hanya membutuhkan endpoint.

Bukti: request tanpa token mengikat endpoint fixture penyerang ke user korban. Saat notifyOrderStatus dipanggil untuk korban, adapter web-push mengirim order ID dan status ke endpoint tersebut. Ini tidak otomatis memberikan akses penuh ke halaman pesanan yang masih memeriksa kepemilikan.

Perbaikan: ambil user ID dari sesi terverifikasi; guest memakai credential sesi yang ditandatangani server. Pembaruan/penghapusan subscription harus memeriksa pemilik. Validasi format key, HTTPS endpoint/provider yang didukung, limit jumlah subscription dan rate limit. Endpoint outbound arbitrer juga menimbulkan risiko SSRF/blind requests; dampak jaringan internal belum diuji dan tidak dinyatakan terbukti di sini.

Kriteria selesai: userId dari body tidak bisa mengganti identitas sesi; guest tidak bisa mendaftarkan atau menghapus subscription akun lain; push hanya terkirim ke pemilik yang benar.

### A09 — Jadwal staf membuka data absensi pribadi rekan kerja

Lokasi: `src/app/api/staff-schedules/route.ts:15–29`; bandingkan pembatasan `staff_id` di `src/app/api/attendance/route.ts:28`.

GET jadwal menerima semua staf. Query attendance hanya dibatasi cabang/tanggal, dan setiap selfie mendapat signed URL 15 menit. Flag manager=false hanya membatasi daftar users/settings, bukan attendance.

Bukti: token kasir menerima row staf lain termasuk lokasi dan signed selfie URL. Akses foto pribadi lebih luas dari endpoint attendance yang membatasi kasir ke datanya sendiri.

Perbaikan: pisahkan jadwal tim yang memang boleh dibaca dari data absensi sensitif. Kasir hanya memperoleh absensinya sendiri; manager berwenang baru dapat membaca absensi cabang dan meminta signed URL. Return kolom minimal dan tetapkan retensi foto.

Kriteria selesai: kasir A tidak menerima lokasi/foto absensi B, termasuk melalui endpoint alternatif; manager cabang lain tetap ditolak.

### A08 — Policy users mereferensikan users kembali

Lokasi: `schema.sql:504–512`, `:519–524`.

Policy SELECT meng-query users, sementara query users itu sendiri harus melewati policy yang sama. UPDATE menggunakan subquery serupa. Struktur ini berisiko menghasilkan `infinite recursion detected in policy`. Script menimpa policy awal dengan definisi akhir ini; auth API service-role bisa menyamarkan masalah karena melewati RLS.

Perbaikan: gunakan helper SECURITY DEFINER yang kecil, search_path tetap, owner terkontrol, dan tidak mengizinkan mutasi; atau arahkan read profil lewat backend dan tutup akses direct yang tak diperlukan. Revoke INSERT profil langsung jika trigger/server sudah membuat profil, serta batasi kolom yang dapat diubah. Policy self-insert sekarang hanya memeriksa id, bukan role/is_active/store_id; jangan meninggalkan jalur eskalasi ketika memperbaiki rekursi.

Kriteria selesai: read profil dengan role authenticated asli tidak error; self-update hanya mengubah kolom yang diizinkan; role/store/is_active tidak bisa diubah melalui Data API. Uji PGlite disiapkan, belum berhasil dijalankan pada mesin ini.

### A10 — Scope baca katalog terlalu luas

Lokasi: `src/app/api/menu/items/route.ts:18–43`, `src/app/api/menu/items/[itemId]/route.ts:11–20`, `src/app/api/promos/route.ts:5`.

management=true mengaktifkan view staf tanpa hasStoreAccess pada storeId yang diminta; storeId juga dapat kosong. Detail menu publik memakai select semua kolom tanpa filter is_available/show_on_menu. Promo admin juga memakai role saja saat membuka draft/nonaktif lintas cabang.

Dampak: bocor daftar menu tersembunyi, konfigurasi/stock dan promo yang belum diumumkan. Ini temuan baca, bukan bukti perubahan harga tanpa izin.

Perbaikan: management wajib storeId dan hasStoreAccess; detail publik harus mengikuti filter visibility yang sama dengan daftar dan memproyeksikan kolom publik saja. Draft/nonaktif hanya tersedia untuk manager cabang yang berwenang.

Kriteria selesai: kasir/admin A tidak bisa membaca management B; pengunjung tidak bisa memperoleh menu tersembunyi lewat URL detail; pelanggan tetap dapat melihat menu publik yang benar.

## Masalah tambahan dan risiko yang perlu pengujian lanjut

| Area | Observasi source | Tindakan yang disarankan |
| --- | --- | --- |
| Checkout normal | Order dibuat dalam RPC, tetapi policy acceptance, promo/reward reservation dan pembaruan jumlah dilakukan setelahnya; beberapa hasil update diabaikan | Satukan transaksi atau buat kompensasi yang idempotent; uji gangguan tepat setelah reservasi promo dan sebelum pembaruan total |
| Pembayaran cash/wallet | Cash update payment/order terpisah; wallet RPC mengecek payment pending tetapi tidak mengecek order cancelled | Uji cancelled/expired, pembayaran paralel dan transisi antar-metode; normalisasi settlement atomik |
| Split bill | Dua POST bersamaan dapat membuat dua transaksi provider sebelum token tersimpan; kondisi update pending ke pending bukan lock | Reservasi attempt sebelum panggilan provider, state creating/uncertain dan idempotency; cek amount/order pada refresh provider |
| Promo quota | Hitung jumlah claim lalu INSERT; unique hanya promo+user | Gunakan lock/atomic quota agar dua pengguna terakhir tidak melewati kuota |
| OTP | Ada batas per nomor dan lima percobaan; counter read-then-write belum atomik, tidak terlihat budget/IP global | Tambahkan counter atomik, pembatasan biaya Gateway, backoff dan challenge anti-abuse saat diperlukan |
| Register | Endpoint alternatif memakai admin.createUser(email_confirm=true), sedangkan UI memakai Supabase signUp | Satukan jalur; jangan menganggap email terverifikasi tanpa bukti; batasi abuse. Ini tidak membuktikan takeover akun yang sudah ada |
| Endpoint publik | Belum terlihat limiter aplikasi pada register/order/push; table-service hanya deduplikasi per meja | Batasi request/ukuran payload, jumlah item, dan pending order; verifikasi WAF hosting sebelum menyimpulkan tidak ada proteksi sama sekali |
| Orders/reporting | Daftar orders tidak menggunakan pagination; beberapa laporan mengambil keseluruhan rentang dalam satu request | Pagination server, indeks sesuai filter, agregasi database dan pengujian data di atas limit response Supabase |
| Audit trail | PATCH user, cash confirmation dan route status alternatif tidak konsisten menulis writeAudit | Wajibkan actor, cabang, before/after dan correlation ID untuk semua mutasi sensitif |
| Absensi | GPS dan file selfie berasal dari client | Jangan menjanjikan anti-spoof/face verification; gunakan supervisi/review sesuai kebutuhan operasional |
| Session/header | JWT aplikasi di localStorage; belum ada konfigurasi CSP/header khusus di next.config | Pertimbangkan HttpOnly cookie + proteksi CSRF, CSP teruji untuk Midtrans, Referrer-Policy untuk tautan capability, dan minimisasi data sensitif. Tidak ditemukan bukti XSS aktif dari pemeriksaan ini |
| Upload | API mempercayai MIME; bucket menu membatasi JPEG/PNG/WebP/GIF, sehingga SVG tidak otomatis lolos | Validasi magic bytes, decode/re-encode, dimensi maksimum; jangan menyebut SVG-XSS sudah terbukti |
| Printer bridge | Bind localhost dan origin exact sudah ada; body tidak dibatasi dan socket tanpa timeout | Tambah byte/item limit, timeout koneksi, pairing lokal. Origin bukan autentikasi terhadap program lokal |
| Recovery | /api/connection hanya memeriksa keterjangkauan aplikasi | Teks UI jangan menyatakan database/payment pulih hanya karena endpoint ini 200 |

## Cakupan fitur dan status pemeriksaan

S = source review pada kelompok fitur; L = tes lokal relevan berhasil; I = inventaris/UI source; P = perlu validasi integrasi atau perangkat. Label L tidak berarti seluruh fitur aman.

| Kelompok fitur | Pemeriksaan dan hasil | Pengujian lanjutan |
| --- | --- | --- |
| Login, register, anonymous, profil | S/L: exchange Supabase menolak UID-only; A03/A04/A08 | Revoke, reset password, konfirmasi email, profil direct RLS |
| Menu, pencarian, opsi, stok, diet/alergen | S/I/L kontrak kiosk; harga dari DB; A10 | Jadwal, stock paralel, opsi wajib, cabang/menu tersembunyi |
| Keranjang, dine-in/pickup, scan meja | S/I: context persisten dan validasi checkout tersedia | Pergantian cabang, storage gagal, 320 px, scanner fisik |
| Snap, cash, wallet, split bill | S/L audit A07; A01/A02 dan risiko atomicity | Sandbox provider, duplicate/out-of-order webhook, rekonsiliasi, saldo |
| Waiting page, riwayat, panggilan antrean | S/I/L capability tracking | Push asli, audio permission, device sleep, jaringan putus |
| Promo, voucher, loyalty, tip/feedback | S: ownership/RPC tersedia; race quota dan RLS feedback | Klaim paralel, cancel/retry reward, ledger idempotent |
| Refund dan laporan masalah | S: ownership/cabang, approval owner | Partial/full refund provider, timeout, audit dan total kumulatif |
| Reservasi, DP, OTP Telegram, QR privat | S: token privat/hash, OTP, RPC reservasi | Gateway asli, biaya, overlap, DP gagal/terlambat, token expiry |
| Toko, jam operasional, meja, QR | S/I: pemeriksaan role/cabang pada mutasi inti | Timezone, hari tutup, meja nonaktif, relasi lintas cabang |
| POS, kitchen, status, shift kasir | S/I: role/cabang dan transisi tersedia | Dua kasir bersamaan, cancelled/unpaid, tutup shift, printer |
| Inventori, resep, pembelian, waste, food cost | S/L audit A05 | Atomic receive/waste, stock paralel, biaya bahan dan otorisasi |
| Dashboard, laporan, forecast | S/I: scope cabang, forecast rata-rata historis | Data besar, pagination, batas tanggal, zero-data, akurasi agregat |
| Staff schedule dan attendance | S/L audit A09 | Privacy role matrix, GPS/perizinan kamera, storage privat |
| User management, audit log, kebijakan/FAQ | S/L audit A03/A04 | Global versus cabang, audit lengkap, publish dokumen atomik |
| Telegram bot dan admin chat | S: webhook secret dan scope percakapan | Retry update, delivery asli, kontrol konfigurasi bot global |
| Push notification | S/L audit A06 | Kepemilikan subscription, push provider dan iOS installed PWA |
| Ads popup dan pengelolaan | S/I/L: 7 kontrak API/validator lolos; opt-out per ad+store, interval 5 detik | SQL constraints terhambat memori; browser focus/pause/opt-out lintas sesi |
| Navbar, profil, settings, tema | I: halaman khusus dan preferensi sudah ada | Browser responsif, kontras, keyboard/screen reader, reduced motion |
| Offline/error dan game | S/I/L: 3 worker cases lolos; API tidak di-cache/replay | PWA terpasang, upgrade SW, deep-link offline, retry tanpa kehilangan order |
| Kiosk dan keyboard virtual | S/I/L kontrak, signed session/settings | Layout touchscreen, input fisik/virtual, idle/reset, real terminal |
| QR kiosk ke ponsel, ack, timer 10 detik | S/I/L: paid-only, token scope/expiry, GET tidak ack, POST idempotent | Kamera fisik, hostname/SSL, dua perangkat, migrasi handoff |
| Upload, receipt/print, deployment | S/I: bucket dan bridge diperiksa; source dikompilasi TS | File berbahaya/dimensi besar, printer, build/deploy, hosting headers |

## Rekomendasi UI yang sesuai arah produk

Pertahankan navy `#142b45`, putih, dan teks navy pada mode terang; mode gelap gunakan navy sebagai bidang dan teks putih. Gunakan satu keluarga sans yang sudah ada, maksimal tiga bobot utama. Warna status boleh berbeda secara fungsional, tetapi jangan mengganti identitas menjadi orange atau memperbanyak warna dekoratif.

1. **Menu menjadi layar produk.** Source RestaurantHeader + featured + action links + kategori membuat katalog utama terdorong jauh ke bawah. Screenshot fixture 390 px tanggal 16 Oktober juga memperlihatkan masalah ini. Padatkan header menjadi nama restoran, meja/cabang, dan pencarian; targetkan produk pertama terlihat sekitar 300–450 px dari atas pada ponsel. Tidak perlu sapaan besar berulang. Jadikan reservasi/bantuan aksi sekunder.
2. **Foto makanan nyata dan fallback ringkas.** Prioritaskan foto menu dengan rasio konsisten, nama maksimal dua baris, deskripsi singkat, harga jelas, tombol tambah yang stabil. Menu tanpa foto sebaiknya memakai baris ringkas; jangan menghabiskan ruang dengan kotak placeholder besar. Hindari label bestseller yang tidak didukung data.
3. **Navigasi glass tetap sederhana.** Pertahankan empat tujuan langsung Menu/Cari/Keranjang/Profil. Gunakan highlight/liquid saat ditekan atau digeser, lalu tenang saat idle. Batasi efek kaca ke navigasi dan overlay. Pertahankan reduce motion/transparency, keyboard focus, safe area, dan target sentuh minimal 44–48 px. Usulan ini bukan klaim kesetaraan atau sertifikasi Apple/iOS.
4. **Kurangi lapisan aksi bawah layar.** Saat cart-summary tampil di atas navbar, kurangi tingginya dan pastikan produk terakhir tetap bisa digulir sampai bebas overlay. Hindari tiga CTA utama sekaligus. QR meja tetap mudah ditemukan ketika pengguna belum memilih meja.
5. **Keranjang dan checkout lebih mudah dipercaya.** Kelompokkan item/opsi/catatan, lalu subtotal, diskon, pajak dan total. Satu CTA utama: lanjut bayar. Status provider pending harus berbeda dari pembayaran berhasil; retry menampilkan pesanan yang sama. Gunakan angka sejajar dan nama metode yang konsisten.
6. **Profil/settings melanjutkan struktur yang sudah ada.** Tampilkan identitas kecil, pesanan aktif, riwayat, saldo/reward, pengaturan dan bantuan dalam kelompok yang jelas. Tambahkan pengelolaan sesi aktif setelah A04 diperbaiki; jangan menampilkan tombol keamanan yang belum memiliki backend. Pertahankan navigasi langsung, bukan popup menu tambahan.
7. **Kiosk berfokus pada sentuhan.** Pada layar lebar: kategori, grid menu, dan ringkasan pesanan yang tetap terlihat. Pada portrait: ringkasan bawah yang ringkas. Target kontrol 56 px atau lebih; isi catatan langsung membuka keyboard internal, tombol selesai jelas, teks yang sedang diedit tidak tertutup. Jangan menumpuk efek blur pada seluruh kartu.
8. **Handoff pembayaran memiliki tiga keadaan jelas.** “Pembayaran diterima” → “Pindai untuk pantau pesanan” → “Berhasil dipindai, kembali dalam 10 detik”. Tampilkan nomor pesanan, QR dengan ruang putih cukup, indikator menunggu, dan bantuan petugas jika ponsel tidak bisa scan. Sebut berhasil setelah acknowledgement ponsel, sesuai kontrak sekarang. Jangan menutup terlalu cepat ketika QR belum berhasil dipindai.
9. **Ads terasa seperti penawaran restoran.** Pertahankan satu popup, pergantian 5 detik, pause dan opt-out per iklan. Jaga judul pendek, foto yang relevan, satu CTA, tombol tutup jelas; tunda saat checkout/keyboard terbuka. Jika admin mengganti kampanye pada ID yang sama, tentukan versi campaign agar pilihan “jangan tampilkan lagi” punya perilaku yang jelas.
10. **Dashboard untuk pekerjaan nyata.** Utamakan pesanan perlu tindakan, stok rendah, selisih shift dan pembayaran perlu rekonsiliasi. Gunakan tabel ringkas dengan filter cabang/tanggal yang terlihat, detail di panel, dan konfirmasi untuk tindakan sensitif. Kurangi kartu statistik dekoratif yang tidak mengarahkan tindakan.

Kriteria penerimaan UI: tidak ada overflow horizontal pada 320/390/768/1440 px; layout portrait kiosk diuji; keyboard tidak menutupi input/CTA; konten tetap terbaca dengan transparansi/animasi dimatikan; loading/empty/error/retry jelas; perubahan cabang dan pemulihan koneksi tidak diam-diam menghilangkan pesanan.

## Bukti validasi lokal

| Pemeriksaan | Hasil tanggal audit |
| --- | --- |
| Inventaris file | 71 API route, 53 halaman |
| TypeScript standar | Dua percobaan berhenti karena Node Zone Allocation / out of memory |
| TypeScript hemat memori | **Lolos**, exit 0: `node --jitless --max-old-space-size=768 --max-semi-space-size=4 node_modules/typescript/bin/tsc --noEmit` |
| Tes fungsional terpilih | **31 lolos**: auth/kiosk contracts/session/settings/tracking, 7 ads API/validator, 3 offline worker |
| Pembuktian API keamanan | **6/6 berhasil mereproduksi masalah** di `tests/security/audit-api.test.mjs`; ini bukan hasil “aplikasi aman” |
| Tes SQL ads | Gagal inisialisasi PGlite: `Array buffer allocation failed`; bukan kegagalan assertion policy |
| Tes SQL audit baru | 4 skenario disiapkan di `tests/security/audit-database.test.mjs`; belum terverifikasi karena inisialisasi PGlite kehabisan memori, termasuk retry hemat WebAssembly |
| npm audit | Produksi dan semua dependency: **0 advisory** saat dijalankan. Tidak menilai kerentanan logika aplikasi |
| Whitespace | `git diff --check` lolos |
| Build/browser/live | Tidak ada production build atau browser run baru; tidak ada pengujian layanan produksi |

Perintah pembuktian API: `node --test tests/security/audit-api.test.mjs`.

Perintah database ketika memori memadai: `node --test tests/security/audit-database.test.mjs`. Adapter SQL mendefinisikan namespace Supabase lokal dan **secara eksplisit memberi grant tabel legacy** untuk menguji syarat A01/A02. Grant fixture itu bukan bukti ACL hosting. Fixture ini hanya boleh menggunakan data sementara.

Test audit sengaja mengharapkan perilaku bermasalah untuk mencatat bukti. Setelah perbaikan, ubah assertion menjadi penolakan/isolasi yang benar dan jadikan regression suite. Jangan memasukkan keberhasilan test audit sebagai indikator keamanan lulus di CI.

## Urutan pekerjaan perbaikan

1. **Tutup jalur finansial P0:** proyeksi data pelanggan, rekonsiliasi provider, ACL/RLS wallet/order/payment; siapkan migration baru dan periksa grant hosting secara read-only terlebih dahulu.
2. **Perbaiki batas identitas:** user management, revocation, inventory scope, push ownership, dan privasi absensi.
3. **Uji invariants bisnis:** pembayaran paralel/duplikat, cancelled order, split attempts, saldo/promo/stock, refund dan audit log. Lakukan dengan sandbox provider dan database staging, bukan transaksi pelanggan.
4. **Rapikan UI pada alur utama:** menu → cart → bayar → waiting; berikutnya kiosk dan dashboard. Gunakan fixture visual yang sama agar perbandingan sebelum/sesudah dapat dinilai.
5. **Validasi deployment:** grants/policies aktual, migrasi, Supabase/Midtrans sandbox, domain QR, PWA iOS/Android, touchscreen dan printer. Klaim siap produksi hanya setelah bukti ini tersedia.
