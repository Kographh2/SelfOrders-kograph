"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadMidtransSnap } from "@/lib/midtrans-client";

type Step = "verify" | "booking";

function NewReservationForm() {
  const search = useSearchParams();
  const storeId = search.get("store") || "";
  const [step, setStep] = useState<Step>("verify");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [sent, setSent] = useState(false);
  const [telegramConsent, setTelegramConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [party, setParty] = useState("2");
  const [date, setDate] = useState("");
  const [reservationId, setReservationId] = useState(search.get("reservation") || "");
  const [privateToken, setPrivateToken] = useState("");
  const [privateUrl, setPrivateUrl] = useState("");
  const [reservationCreated, setReservationCreated] = useState(false);
  const bookingRef = useRef({ id: "", secret: "", auth: "" });

  useEffect(() => {
    const savedPrivateToken = localStorage.getItem("reservation_private_token") || "";
    const savedAccessToken = sessionStorage.getItem("reservation_phone_access_token") || "";
    const savedPhone = sessionStorage.getItem("reservation_phone_number") || "";
    const queryReservationId = search.get("reservation") || "";
    setPrivateToken((queryReservationId && localStorage.getItem(`reservation_private_token:${queryReservationId}`)) || savedPrivateToken);
    setAccessToken(savedAccessToken);
    setPhone(savedPhone);
    setReservationId(queryReservationId);
    setReservationCreated(Boolean(queryReservationId));
    setStep(savedAccessToken ? "booking" : "verify");
    bookingRef.current = { id: queryReservationId, secret: savedPrivateToken, auth: savedAccessToken };
  }, [search]);

  useEffect(() => {
    bookingRef.current = { id: reservationId, secret: privateToken, auth: accessToken };
  }, [reservationId, privateToken, accessToken]);

  const checkPayment = async () => {
    const { id, secret, auth } = bookingRef.current;
    if (!id || !auth || !secret) {
      setMessage("Sesi verifikasi reservasi sudah tidak tersedia. Verifikasi kembali nomor HP Anda.");
      return;
    }
    setBusy(true);
    const query = new URLSearchParams({ reservationId: id, privateToken: secret });
    try {
      const response = await fetch(`/api/reservations?${query}`, { headers: { "x-phone-access-token": auth } });
      const result = await response.json();
      if (!response.ok) return setMessage(result.error || "Gagal mengecek pembayaran");
      if (["paid", "not_required"].includes(result.data.deposit_status)) {
        setPrivateUrl(result.data.privateUrl);
        setMessage("Reservasi terkonfirmasi. Link privat reservasi Anda siap.");
      } else setMessage("DP masih menunggu konfirmasi Midtrans.");
    } catch {
      setMessage("Koneksi terputus. Coba cek pembayaran kembali.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setMessage("");
    setSent(false);
    try {
      const response = await fetch("/api/reservations/telegram-otp", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, consent: telegramConsent }),
      });
      const result = await response.json();
      if (!response.ok) return setMessage(result.error || "Gagal mengirim permintaan OTP.");
      setSent(true);
      setOtp("");
      setMessage(result.message || "Periksa chat Telegram Anda untuk kode OTP.");
    } catch {
      setMessage("Koneksi terputus. Coba kirim permintaan OTP kembali.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/reservations/verify-telegram-otp", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code: otp }),
      });
      const result = await response.json();
      if (!response.ok) return setMessage(result.error || "OTP tidak valid.");
      const verifiedToken = result.data.accessToken;
      setAccessToken(verifiedToken);
      sessionStorage.setItem("reservation_phone_access_token", verifiedToken);
      sessionStorage.setItem("reservation_phone_number", result.data.phone);
      setPhone(result.data.phone);
      setStep("booking");
      setSent(false);
      setOtp("");
      setMessage("Nomor HP berhasil diverifikasi. Silakan lengkapi detail reservasi.");
    } catch {
      setMessage("Koneksi terputus. Coba verifikasi kode kembali.");
    } finally {
      setBusy(false);
    }
  };

  const book = async () => {
    if (!accessToken) {
      setStep("verify");
      setMessage("Verifikasi nomor HP terlebih dahulu.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/reservations", {
        method: "POST", headers: { "Content-Type": "application/json", "x-phone-access-token": accessToken },
        body: JSON.stringify({ storeId, customerName: name, partySize: Number(party), reservedFor: new Date(date).toISOString() }),
      });
      const result = await response.json();
      if (!response.ok) return setMessage(result.error || "Reservasi belum berhasil dibuat.");
      bookingRef.current = { id: result.data.reservation.id, secret: result.data.privateToken, auth: accessToken };
      setReservationId(result.data.reservation.id);
      setReservationCreated(true);
      setPrivateToken(result.data.privateToken);
      localStorage.setItem("reservation_private_token", result.data.privateToken);
      localStorage.setItem(`reservation_private_token:${result.data.reservation.id}`, result.data.privateToken);
      setMessage(`Reservasi dibuat. DP: Rp ${Number(result.data.reservation.deposit_amount).toLocaleString("id-ID")}.`);
      if (result.data.snapToken) {
        const snap = await loadMidtransSnap();
        snap.pay(result.data.snapToken, {
          onSuccess: () => { setMessage("Pembayaran diterima, memastikan status DP…"); void checkPayment(); },
          onPending: () => setMessage("Pembayaran pending. Tekan tombol cek pembayaran setelah selesai."),
          onError: () => setMessage("DP belum berhasil dibayar."),
          onClose: () => setMessage("Halaman pembayaran ditutup. Anda dapat melanjutkan lewat tombol cek pembayaran."),
        });
      } else setPrivateUrl(result.data.privateUrl);
    } catch {
      setMessage("Koneksi terputus. Coba buat reservasi kembali.");
    } finally {
      setBusy(false);
    }
  };

  const resetPhoneVerification = () => {
    setStep("verify");
    setAccessToken("");
    setSent(false);
    setTelegramConsent(false);
    setOtp("");
    setMessage("");
    sessionStorage.removeItem("reservation_phone_access_token");
    sessionStorage.removeItem("reservation_phone_number");
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-xl">
      <a href={`/menu?store=${encodeURIComponent(storeId)}`} className="text-sm font-medium text-blue-700">← Kembali ke menu</a>
      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-navy-950 px-6 py-7 text-white sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">SelfOrder · Reservasi meja</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{step === "verify" ? "Verifikasi nomor HP" : "Lengkapi reservasi"}</h1>
          <p className="mt-2 text-sm text-blue-100">{step === "verify" ? "Pastikan nomor HP milik Anda sebelum melanjutkan." : "Pilih waktu dan isi detail kunjungan Anda."}</p>
          <div className="mt-6 grid grid-cols-2 gap-2 text-xs font-semibold">
            <div className={`rounded-xl px-3 py-2 ${step === "verify" ? "bg-white text-navy-950" : "bg-white/15 text-white"}`}>1 · Verifikasi</div>
            <div className={`rounded-xl px-3 py-2 ${step === "booking" ? "bg-white text-navy-950" : "bg-white/15 text-white"}`}>2 · Reservasi</div>
          </div>
        </div>

        <div className="space-y-5 p-6 sm:p-8">
          {step === "verify" ? <>
            <div className="rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-950">
              Kode dikirim langsung oleh Telegram Gateway ke chat <b>Verification Codes</b> pada akun Telegram yang terdaftar dengan nomor ini. Pastikan nomor benar dan Anda bersedia menerima kode verifikasi Telegram.
            </div>
            <label className="block text-sm font-semibold text-slate-800">Nomor telepon akun Telegram
              <input type="tel" autoComplete="tel" placeholder="Contoh: +6281234567890" value={phone} onChange={event => {
                setPhone(event.target.value);
                setSent(false);
                setTelegramConsent(false);
                setOtp("");
                setAccessToken("");
                sessionStorage.removeItem("reservation_phone_access_token");
                sessionStorage.removeItem("reservation_phone_number");
              }} className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-5 text-slate-700">
              <input type="checkbox" checked={telegramConsent} onChange={event => setTelegramConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-700" />
              <span>Saya setuju nomor ini digunakan untuk meminta kode verifikasi melalui Telegram Gateway.</span>
            </label>
            <button disabled={busy || !phone.trim() || !telegramConsent} onClick={send} className="w-full rounded-xl bg-navy-950 p-3 font-semibold text-white transition hover:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Mengirim..." : sent ? "Kirim ulang OTP" : "Kirim OTP"}
            </button>
            {sent && <div className="space-y-3 border-t border-slate-100 pt-5">
              <label className="block text-sm font-semibold text-slate-800">Masukkan kode OTP 6 digit
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-center text-xl tracking-[0.4em] outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
              </label>
              <button disabled={busy || otp.length !== 6} onClick={verify} className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? "Memeriksa kode…" : "Verifikasi & lanjutkan"}
              </button>
            </div>}
          </> : <>
            <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
              <span><b>Nomor terverifikasi</b><br />{phone}</span>
              <button onClick={resetPhoneVerification} className="font-semibold text-emerald-800 underline">Ubah</button>
            </div>
            {!reservationCreated ? <>
              <label className="block text-sm font-semibold text-slate-800">Nama pemesan
                <input autoComplete="name" placeholder="Nama lengkap" value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-800">Jumlah orang
                  <input type="number" min="1" max="30" value={party} onChange={event => setParty(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                </label>
                <label className="block text-sm font-semibold text-slate-800">Tanggal dan waktu
                  <input type="datetime-local" value={date} onChange={event => setDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                </label>
              </div>
              <button disabled={busy || !date || !name.trim()} onClick={book} className="w-full rounded-xl bg-emerald-700 p-3 font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? "Memproses reservasi…" : "Buat reservasi & bayar DP"}
              </button>
            </> : <>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
                <b>Reservasi sedang diproses</b>
                <p className="mt-1">Selesaikan pembayaran DP, lalu cek status untuk mendapatkan link privat reservasi.</p>
              </div>
              <button disabled={busy} onClick={checkPayment} className="w-full rounded-xl border border-slate-300 p-3 font-semibold text-slate-800 disabled:opacity-50">{busy ? "Memeriksa…" : "Cek pembayaran / kirim link privat"}</button>
            </>}
            {privateUrl && <div className="rounded-2xl bg-emerald-50 p-4 text-sm"><b className="text-emerald-900">Reservasi terkonfirmasi</b><p className="mt-2">Link meja privat: <a className="break-all font-medium text-blue-700 underline" href={privateUrl}>{privateUrl}</a></p></div>}
          </>}
          {message && <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm leading-6 text-slate-700">{message}</p>}
        </div>
      </div>
    </div>
  </main>;
}

export default function NewReservationPage() {
  return <Suspense fallback={<main className="p-6">Memuat reservasi…</main>}><NewReservationForm /></Suspense>;
}
