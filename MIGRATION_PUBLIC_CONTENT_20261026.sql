-- Run after the existing feature/security migrations, including
-- MIGRATION_SELFORDER_OPERATIONS.sql (store_documents and store_faqs).
-- Seeds editable public content once; reruns never overwrite owner edits.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.store_documents') IS NULL OR to_regclass('public.store_faqs') IS NULL THEN
  RAISE EXCEPTION 'Run MIGRATION_SELFORDER_OPERATIONS.sql before MIGRATION_PUBLIC_CONTENT_20261026.sql';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.public_site_settings (
 id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id),
 settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(settings)='object'),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS public.public_content_seed_log (
 key TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.public_site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_content_seed_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_site_settings,public.public_content_seed_log FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.public_site_settings,public.public_content_seed_log TO service_role;

INSERT INTO public.public_site_settings(id,settings) VALUES(TRUE,jsonb_build_object(
 'title','Luujaaa.id — Pesan menu dengan mudah',
 'description','Lihat menu, pilih pesanan, dan ikuti status pesanan Anda melalui Luujaaa.id.',
 'businessName','Luujaaa.id','publicUrl','','indexingEnabled',false,'googleVerification','',
 'supportEmail','','supportPhone','','address','',
 'helpTitle','Bantuan & ketentuan',
 'helpIntro','Informasi pemesanan, pembayaran, privasi, dan bantuan untuk pesanan Anda.',
 'supportText','Buka bantuan dari halaman status pesanan atau hubungi petugas cabang. Sertakan nomor pesanan dan jelaskan kendalanya; jangan mengirim kata sandi, PIN, atau OTP.'
)) ON CONFLICT(id) DO NOTHING;

DO $$ BEGIN
 INSERT INTO public.public_content_seed_log(key) VALUES('luujaaa-public-content-20261026') ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO public.store_documents(store_id,document_type,version,title,content,status,published_at)
 SELECT NULL,v.kind,1,v.title,v.content,'published',now()
 FROM (VALUES
 ('terms','Ketentuan pemesanan', $terms$
Luujaaa.id membantu pelanggan memesan dari cabang yang dipilih. Menu, jam operasional, stok, harga, dan pilihan layanan mengikuti informasi cabang.

1. Sebelum memesan
Periksa cabang, nomor meja atau pilihan ambil sendiri, waktu pengambilan, jumlah item, varian, dan catatan. Untuk alergi atau kebutuhan khusus, konfirmasikan kepada petugas sebelum membayar; catatan pesanan tidak menjamin permintaan khusus dapat dipenuhi.

2. Harga dan konfirmasi
Rincian akhir, termasuk pajak, biaya layanan, dan diskon yang berlaku, ditampilkan sebelum konfirmasi pembayaran. Pesanan yang tersimpan belum berarti sudah dibayar. Status pembayaran mengikuti konfirmasi sistem dan penyedia pembayaran, bukan hanya tampilan aplikasi pembayaran atau unggahan bukti.

3. Pembayaran dan pengambilan
Gunakan metode yang tersedia pada cabang. Jika koneksi terputus setelah membayar, periksa status pesanan sebelum mencoba kembali. Ikuti status pesanan dan petunjuk petugas saat mengambil makanan. Perkiraan waktu penyelesaian dapat berubah sesuai antrean dan kondisi cabang.

4. Kiosk
Setelah pembayaran terkonfirmasi, pindai QR pelacakan menggunakan ponsel agar dapat mengikuti pesanan setelah layar kiosk dipakai pelanggan berikutnya. Simpan tautan tersebut untuk penggunaan sendiri.

5. Perubahan dan bantuan
Hubungi petugas cabang untuk mengubah atau membatalkan pesanan. Permintaan ditinjau berdasarkan status pesanan dan apakah makanan sudah diproses. Ketentuan pembatalan dan pengembalian dana dijelaskan pada bagian terkait.

6. Penggunaan layanan
Berikan informasi yang benar dan jangan menyalahgunakan akun, promosi, atau layanan. Jangan membagikan kata sandi, PIN, OTP, atau tautan pribadi pesanan. Versi ketentuan yang disetujui dicatat bersama proses pemesanan.
$terms$),
 ('privacy','Kebijakan privasi', $privacy$
Informasi yang digunakan
Luujaaa.id menggunakan rincian pesanan, pilihan cabang/meja, catatan, status pembayaran, serta informasi akun atau kontak yang Anda berikan untuk menjalankan pemesanan dan bantuan. Fitur tertentu dapat membutuhkan data tambahan yang dijelaskan saat digunakan, seperti nomor kontak untuk reservasi.

Tujuan penggunaan
Informasi digunakan untuk memproses pesanan, memeriksa pembayaran, menangani pertanyaan atau pengembalian dana, mengelola akun dan pilihan pelanggan, serta menjaga keamanan layanan. Hindari menulis data sensitif yang tidak diperlukan pada catatan pesanan.

Pihak yang terlibat
Petugas cabang yang berwenang dapat menggunakan informasi yang diperlukan untuk melayani pesanan. Pemrosesan pembayaran melibatkan penyedia pembayaran yang dipilih. Data yang diminta pada halaman pembayaran mengikuti proses dan kebijakan penyedia tersebut.

Penyimpanan pada perangkat
Browser dapat menyimpan preferensi, sesi, dan draf keranjang agar halaman tetap dapat digunakan saat berpindah atau koneksi terputus. Draf lokal bukan bukti pembayaran. Menghapus data browser dapat menghapus draf dan mengeluarkan Anda dari akun. Gunakan logout saat memakai perangkat bersama.

Notifikasi dan izin
Izin notifikasi atau kamera diminta untuk fitur yang membutuhkannya. Anda dapat mengelolanya melalui pengaturan browser atau perangkat. Menolak izin dapat membatasi fitur terkait tanpa menjadi persetujuan untuk penggunaan data lainnya.

Permintaan terkait data
Untuk pertanyaan, koreksi, atau permintaan penghapusan data akun, hubungi pengelola melalui kontak publik atau bantuan cabang. Pengelola akan memeriksa identitas dan menjelaskan data yang dapat diproses serta catatan transaksi yang perlu dipertahankan. Jangan kirim kata sandi atau OTP sebagai bukti identitas.
$privacy$),
 ('refund','Pembatalan & pengembalian dana', $refund$
Mengajukan permintaan
Buka bantuan pada halaman status pesanan atau hubungi petugas cabang. Sertakan nomor pesanan, masalah yang terjadi, dan informasi pendukung yang relevan. Jangan mengirim PIN, OTP, atau nomor kartu lengkap.

Pembatalan sebelum pembayaran
Pesanan yang belum dibayar dapat diperiksa atau dibatalkan melalui petugas sesuai statusnya. Jika pembayaran sudah dimulai atau hasilnya belum jelas, pastikan statusnya terlebih dahulu agar tidak terjadi pembayaran ganda.

Pesanan yang sudah dibayar
Permintaan perubahan, pembatalan, item tidak tersedia, atau ketidaksesuaian pesanan akan ditinjau oleh cabang. Persetujuan dan jumlah pengembalian mengikuti hasil pemeriksaan atas item yang terdampak, status persiapan, serta pembayaran yang benar-benar diterima.

Proses pengembalian dana
Permintaan terkirim tidak berarti langsung disetujui atau dana sudah masuk. Status permintaan dan pembayaran diperbarui setelah tindakan yang relevan dikonfirmasi. Metode dan waktu penyelesaian mengikuti kanal pembayaran atau proses pengembalian yang disepakati dengan pengelola; petugas akan menjelaskan rincian untuk kasus Anda.

Pembayaran belum jelas atau ganda
Jangan membayar ulang hanya karena halaman belum berubah. Periksa riwayat transaksi, simpan referensi pembayaran, dan hubungi petugas untuk pencocokan. Bila ada lebih dari satu pembayaran, masing-masing transaksi perlu diverifikasi.
$refund$)
 ) AS v(kind,title,content)
 WHERE NOT EXISTS(SELECT 1 FROM public.store_documents d WHERE d.store_id IS NULL AND d.document_type=v.kind);

 INSERT INTO public.store_faqs(id,store_id,question,answer,display_order,is_published) VALUES
 ('e0261026-0000-4000-8000-000000000001',NULL,'Bagaimana cara memesan?','Pilih cabang dan menu, tentukan varian serta jumlah, lalu periksa keranjang. Lengkapi meja atau waktu pengambilan bila diminta. Periksa rincian akhir sebelum mengonfirmasi pembayaran.',10,true),
 ('e0261026-0000-4000-8000-000000000002',NULL,'Haruskah saya membuat akun?','Anda dapat melihat menu tanpa login. Beberapa fitur, seperti saldo akun, reward, dan klaim tertentu, membutuhkan akun. Ikuti informasi yang ditampilkan pada fitur tersebut.',20,true),
 ('e0261026-0000-4000-8000-000000000003',NULL,'Saya sudah membayar, tetapi status belum berubah. Apa yang harus dilakukan?','Tunggu koneksi pulih dan periksa status pesanan. Jangan langsung membayar ulang. Jika status tetap belum jelas, hubungi petugas dengan nomor pesanan dan referensi transaksi untuk diperiksa.',30,true),
 ('e0261026-0000-4000-8000-000000000004',NULL,'Bagaimana mengikuti pesanan dari kiosk?','Setelah pembayaran terkonfirmasi, pindai QR pada kiosk menggunakan ponsel. Halaman pelacakan akan terbuka di ponsel agar Anda tetap mendapat informasi pesanan setelah kiosk direset untuk pelanggan berikutnya.',40,true),
 ('e0261026-0000-4000-8000-000000000005',NULL,'Bisakah saya mengubah atau membatalkan pesanan?','Hubungi petugas cabang sesegera mungkin. Petugas akan memeriksa status pembayaran dan persiapan makanan. Permintaan yang dikirim belum berarti perubahan atau pembatalan sudah disetujui.',50,true),
 ('e0261026-0000-4000-8000-000000000006',NULL,'Bagaimana jika saya memiliki alergi makanan?','Konfirmasikan alergi dan kebutuhan khusus kepada petugas sebelum membayar. Informasi menu dan catatan dapat membantu, tetapi kemampuan cabang memenuhi permintaan perlu dikonfirmasi langsung.',60,true),
 ('e0261026-0000-4000-8000-000000000007',NULL,'Apa yang tersedia saat internet terputus?','Halaman pemulihan dapat menampilkan draf keranjang yang benar-benar tersimpan pada perangkat. Pemesanan, pemeriksaan stok, dan konfirmasi pembayaran tetap membutuhkan layanan online. Game kecil tersedia sambil menunggu koneksi.',70,true),
 ('e0261026-0000-4000-8000-000000000008',NULL,'Mengapa menu belum bisa dipesan saat toko tutup?','Cabang hanya menerima pesanan saat layanan tersedia. Perhatikan informasi jam buka yang ditampilkan atau hubungi petugas untuk memastikan jadwal cabang.',80,true)
 ON CONFLICT(id) DO NOTHING;
END $$;
COMMIT;
