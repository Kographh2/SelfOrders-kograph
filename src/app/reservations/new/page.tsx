"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadMidtransSnap } from "@/lib/midtrans-client";

function NewReservationForm() {
  const search = useSearchParams();
  const storeId = search.get("store") || "";
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [party, setParty] = useState("2");
  const [date, setDate] = useState("");
  const [reservationId, setReservationId] = useState(search.get("reservation") || "");
  const [privateToken, setPrivateToken] = useState("");
  const [privateUrl, setPrivateUrl] = useState("");
  const bookingRef = useRef({ id: "", secret: "", auth: "" });

  useEffect(() => {
    const saved = localStorage.getItem("reservation_private_token");
    if (saved) setPrivateToken(saved);
    bookingRef.current = { id: search.get("reservation") || "", secret: saved || "", auth: "" };
  }, [search]);
  useEffect(() => {
    bookingRef.current = { id: reservationId, secret: privateToken, auth: accessToken };
  }, [reservationId, privateToken, accessToken]);

  const checkPayment = async () => {
    const { id, secret, auth } = bookingRef.current;
    if (!id || !auth || !secret) return;
    const query = new URLSearchParams({ reservationId: id, privateToken: secret });
    const response = await fetch(`/api/reservations?${query}`, { headers: { "x-phone-access-token": auth } });
    const result = await response.json();
    if (response.ok) {
      if (["paid", "not_required"].includes(result.data.deposit_status)) {
        setPrivateUrl(result.data.privateUrl);
        setMessage("Reservasi terkonfirmasi. Link privat reservasi Anda siap.");
      } else setMessage("DP masih menunggu konfirmasi Midtrans.");
    } else setMessage(result.error || "Gagal mengecek pembayaran");
  };

  const send = async () => {
    setMessage("");
    const response = await fetch("/api/reservations/telegram-otp", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }),
    });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || "Gagal mengirim permintaan OTP.");
    setSent(true);
    setMessage(result.message || "Konfirmasi permintaan di Telegram, lalu masukkan kode 6 digit.");
  };

  const verify = async () => {
    const response = await fetch("/api/reservations/verify-telegram-otp", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code: otp }),
    });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || "OTP tidak valid.");
    setAccessToken(result.data.accessToken);
    setMessage("Nomor HP berhasil diverifikasi lewat Telegram.");
  };

  const book = async () => {
    const response = await fetch("/api/reservations", {
      method: "POST", headers: { "Content-Type": "application/json", "x-phone-access-token": accessToken },
      body: JSON.stringify({ storeId, customerName: name, partySize: Number(party), reservedFor: new Date(date).toISOString() }),
    });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error);
    setReservationId(result.data.reservation.id);
    setPrivateToken(result.data.privateToken);
    localStorage.setItem("reservation_private_token", result.data.privateToken);
    setMessage(`Meja ${result.data.reservation.table_id} ditahan. DP: Rp ${Number(result.data.reservation.deposit_amount).toLocaleString("id-ID")}.`);
    if (result.data.snapToken) {
      const snap = await loadMidtransSnap();
      snap.pay(result.data.snapToken, {
        onSuccess: () => { setMessage("Pembayaran diterima, memastikan status DP…"); void checkPayment(); },
        onPending: () => setMessage("Pembayaran pending. Tekan tombol cek pembayaran setelah selesai."),
        onError: () => setMessage("DP belum berhasil dibayar."),
        onClose: () => setMessage("Halaman pembayaran ditutup. Anda dapat melanjutkan lewat tombol pembayaran di bawah."),
      });
    } else setPrivateUrl(result.data.privateUrl);
  };

  return <main className="mx-auto max-w-lg p-6">
    <a href={`/menu?store=${encodeURIComponent(storeId)}`} className="text-sm text-blue-700">← Kembali ke menu</a>
    <h1 className="mt-5 text-2xl font-bold">Reservasi meja</h1>
    <p className="mt-1 text-sm text-slate-600">Verifikasi nomor HP lewat Telegram, bayar DP lewat Snap, lalu gunakan link privat reservasi Anda.</p>
    <div className="mt-5 space-y-3 rounded-2xl bg-white p-5 shadow">
      <label className="block text-sm font-medium">Nomor HP yang sudah ditautkan ke bot Telegram
        <input placeholder="Contoh: +6281234567890" value={phone} onChange={event => { setPhone(event.target.value); setSent(false); setOtp(""); setAccessToken(""); }} className="mt-1 w-full rounded-xl border p-3" />
      </label>
      <p className="text-xs text-slate-500">Belum ditautkan? Buka bot Telegram yang sama, kirim <b>/link</b>, lalu tekan tombol untuk membagikan kontak Anda sendiri.</p>
      <button onClick={send} className="rounded-xl bg-navy-900 px-4 py-2 text-white">Kirim permintaan OTP ke Telegram</button>
      {sent && <>
        <label className="block text-sm font-medium">Kode OTP 6 digit
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-1 w-full rounded-xl border p-3" />
        </label>
        <button onClick={verify} className="rounded-xl bg-blue-700 px-4 py-2 text-white">Verifikasi nomor</button>
      </>}
      <input placeholder="Nama" value={name} onChange={event => setName(event.target.value)} className="w-full rounded-xl border p-3" />
      <input type="number" min="1" max="30" value={party} onChange={event => setParty(event.target.value)} className="w-full rounded-xl border p-3" />
      <input type="datetime-local" value={date} onChange={event => setDate(event.target.value)} className="w-full rounded-xl border p-3" />
      <button disabled={!accessToken || !date || !name} onClick={book} className="w-full rounded-xl bg-emerald-700 p-3 font-bold text-white disabled:opacity-40">Buat reservasi & bayar DP</button>
      {reservationId && <button onClick={checkPayment} className="w-full rounded-xl border p-3 font-bold">Cek pembayaran / kirim link privat</button>}
      {privateUrl && <div className="rounded-xl bg-emerald-50 p-4"><b>Reservasi terkonfirmasi</b><p className="mt-2">Link meja privat: <a className="break-all text-blue-700 underline" href={privateUrl}>{privateUrl}</a></p></div>}
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  </main>;
}

export default function NewReservationPage() {
  return <Suspense fallback={<main className="p-6">Memuat reservasi…</main>}><NewReservationForm /></Suspense>;
}
