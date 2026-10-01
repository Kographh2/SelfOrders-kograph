"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Banknote, Camera, CheckCircle2, Loader2, Play, QrCode, Square } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";

type ShiftSummary = { shift_id: string; opening_cash: number; cash_sales: number; expected_cash: number; cash_transactions: number };

export default function PosPage() {
  const { token, user } = useAuth();
  const [storeId, setStoreId] = useState(user?.store_id ?? "");
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [shift, setShift] = useState<{ id: string; opened_at: string } | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [shiftBusy, setShiftBusy] = useState(false);
  const controls = useRef<{ stop: () => void } | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  const loadShift = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`/api/shifts${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ""}`, { headers: getAuthHeaders(token) });
    const result = await response.json();
    if (!response.ok) return;
    setShift(result.data.shift);
    setSummary(result.data.summary);
    if (result.data.summary) setClosingCash(String(result.data.summary.expected_cash));
  }, [token, storeId]);
  useEffect(() => {
    if (user?.store_id) { setStoreId(user.store_id); return; }
    if (user?.role !== "owner" && user?.role !== "admin") return;
    fetch("/api/stores", { headers: getAuthHeaders(token) }).then(response => response.json()).then(result => {
      const available = (result.data ?? []) as Array<{ id: string; name: string }>;
      setStores(available);
      setStoreId(current => current || available[0]?.id || "");
    }).catch(() => toast.error("Daftar cabang gagal dimuat"));
  }, [token, user?.store_id, user?.role]);
  useEffect(() => { loadShift(); }, [loadShift]);

  const stopScan = () => { controls.current?.stop(); controls.current = null; setScanning(false); };
  const confirm = async (value: string) => {
    const orderId = value.trim(); if (!orderId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/payment/cash", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders(token) }, body: JSON.stringify({ orderId, confirm: true }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      toast.success(`Pembayaran antrean #${result.data.order_number} terkonfirmasi`); setCode(""); stopScan(); await loadShift();
    } catch (error) { toast.error(error instanceof Error ? error.message : "QR pembayaran tidak valid"); }
    finally { setLoading(false); }
  };
  const startScan = async () => {
    try {
      setScanning(true); await new Promise(resolve => setTimeout(resolve, 50));
      if (!video.current) throw new Error("Scanner belum siap");
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      controls.current = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video.current, result => { if (result) { setCode(result.getText()); confirm(result.getText()); } });
    } catch (error) { setScanning(false); toast.error(error instanceof Error ? error.message : "Kamera gagal dibuka"); }
  };
  useEffect(() => stopScan, []);

  const openShift = async () => {
    setShiftBusy(true);
    try {
      const response = await fetch("/api/shifts", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders(token) }, body: JSON.stringify({ action: "open", storeId, openingCash: Number(openingCash) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      toast.success("Shift dibuka"); await loadShift();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal membuka shift"); }
    finally { setShiftBusy(false); }
  };
  const closeShift = async () => {
    if (!shift) return;
    setShiftBusy(true);
    try {
      const response = await fetch("/api/shifts", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders(token) }, body: JSON.stringify({ action: "close", shiftId: shift.id, closingCash: Number(closingCash) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      const report = result.data;
      toast.success(`Shift ditutup · selisih Rp ${Number(report.difference).toLocaleString("id-ID")}`);
      setShift(null); setSummary(report);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal menutup shift"); }
    finally { setShiftBusy(false); }
  };

  return <main className="min-h-screen bg-gradient-to-br from-navy-950 to-blue-950 p-5 text-white lg:p-10"><Toaster/><div className="mx-auto max-w-4xl">
    <p className="text-sm font-bold uppercase tracking-[.25em] text-blue-300">Cashier workspace</p><h1 className="mt-2 text-4xl font-black">POS & Konfirmasi Tunai</h1><p className="mt-2 text-navy-300">Pembayaran tunai masuk ke laporan shift kasir.</p>
    <section className="mt-7 rounded-[2rem] bg-white p-6 text-navy-950 shadow-2xl">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Shift kasir</h2><p className="text-sm text-slate-500">{shift ? `Dibuka ${new Date(shift.opened_at).toLocaleString("id-ID")}` : "Buka shift sebelum menerima pembayaran tunai"}</p></div>{shift?<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">AKTIF</span>:<span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">BELUM DIBUKA</span>}</div>
      {stores.length > 0 && <label className="mt-4 block text-sm font-bold">Cabang<select value={storeId} onChange={event => setStoreId(event.target.value)} className="mt-1 w-full rounded-xl border p-3">{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}
      {shift&&summary?<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Kas awal",summary.opening_cash],["Penjualan tunai",summary.cash_sales],["Transaksi",summary.cash_transactions],["Kas seharusnya",summary.expected_cash]].map(([label,value])=><div key={String(label)} className="rounded-xl bg-blue-50 p-3"><small className="text-slate-500">{label}</small><b className="mt-1 block">{label==="Transaksi"?value:`Rp ${Number(value).toLocaleString("id-ID")}`}</b></div>)}</div>:null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">{!shift?<><input aria-label="Kas awal" type="number" min="0" value={openingCash} onChange={e=>setOpeningCash(e.target.value)} className="min-w-0 flex-1 rounded-xl border p-3" placeholder="Kas awal"/><button onClick={openShift} disabled={shiftBusy} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"><Play className="h-4 w-4"/>Buka shift</button></>:<><input aria-label="Kas fisik saat ini" type="number" min="0" value={closingCash} onChange={e=>setClosingCash(e.target.value)} className="min-w-0 flex-1 rounded-xl border p-3" placeholder="Kas fisik saat ini"/><button onClick={closeShift} disabled={shiftBusy} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-bold text-white"><Square className="h-4 w-4"/>Tutup shift</button></>}</div>
      {!storeId&&<p className="mt-3 text-xs text-amber-700">Pilih cabang untuk membuka shift.</p>}
    </section>
    <div className="mt-5 grid gap-5 md:grid-cols-2"><section className="rounded-[2rem] bg-white p-6 text-navy-950 shadow-2xl"><div className="mb-5 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><Camera/></span><div><h2 className="font-bold">Scanner kamera</h2><p className="text-xs text-navy-500">Scan QR pembayaran tunai pelanggan</p></div></div><video ref={video} muted playsInline className={scanning?"aspect-video w-full rounded-2xl bg-black object-cover":"hidden"}/>{scanning?<button onClick={stopScan} className="mt-4 w-full rounded-xl bg-blue-50 py-3 font-bold text-blue-700">Tutup kamera</button>:<button onClick={startScan} disabled={!shift} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-bold text-white disabled:opacity-40"><QrCode/>Mulai scan QR pembayaran</button>}</section>
      <section className="rounded-[2rem] bg-white p-6 text-navy-950 shadow-2xl"><div className="mb-5 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><Banknote/></span><div><h2 className="font-bold">Input manual</h2><p className="text-xs text-navy-500">Cadangan jika kamera tidak tersedia</p></div></div><form onSubmit={(e:FormEvent)=>{e.preventDefault();confirm(code)}}><input value={code} onChange={e=>setCode(e.target.value)} placeholder="CASH-xxxxxxxx-..." className="w-full rounded-2xl border-2 border-navy-100 p-4 font-mono outline-none focus:border-blue-500"/><button disabled={!shift||loading||!code} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-navy-950 py-4 font-bold text-white disabled:opacity-40">{loading?<Loader2 className="animate-spin"/>:<CheckCircle2/>}Konfirmasi pembayaran</button></form></section></div>
  </div></main>;
}
