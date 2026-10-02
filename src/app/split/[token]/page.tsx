"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Check, CheckCircle2, CircleDollarSign, Clock3, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { loadMidtransSnap } from "@/lib/midtrans-client";

type Part = { id: string; label: string; amount: number; status: "pending" | "paid" | "failed" | "expired"; snap_token?: string | null; midtrans_order_id?: string | null };
type Bill = { order_id: string; total_amount: number; status: string; expires_at: string; parts: Part[] };
const money = (value: number) => `Rp ${Number(value).toLocaleString("id-ID")}`;
const statusLabel: Record<Part["status"], string> = { pending: "Menunggu pembayaran", paid: "Sudah dibayar", failed: "Pembayaran gagal", expired: "Pembayaran kedaluwarsa" };

export default function SplitBillPage() {
  const { token } = useParams<{ token: string }>();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loadingPart, setLoadingPart] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState<string[]>([]);
  const autoPreparedFor = useRef(new Map<string, string>());

  const load = useCallback(async (refreshProvider = false) => {
    try {
      const url = `/api/split/${encodeURIComponent(token)}${refreshProvider ? "?refresh=1" : ""}`;
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Undangan split bill tidak dapat dibuka");
      setBill(result.data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Status split bill gagal dimuat");
    }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3500);
    return () => clearInterval(timer);
  }, [load]);

  // When Midtrans reports a failed/expired attempt, prepare a fresh Snap session once.
  // Opening Snap itself remains a deliberate user click because browsers block unsolicited popups.
  useEffect(() => {
    if (!bill || bill.status !== "active") return;
    for (const part of bill.parts) {
      if (!["failed", "expired"].includes(part.status) || !part.midtrans_order_id) continue;
      if (autoPreparedFor.current.get(part.id) === part.midtrans_order_id) continue;
      autoPreparedFor.current.set(part.id, part.midtrans_order_id);
      setPreparing(current => current.includes(part.id) ? current : [...current, part.id]);
      fetch(`/api/split/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partId: part.id }),
      }).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Transaksi ulang belum bisa disiapkan");
        await load();
      }).catch(reason => {
        setError(reason instanceof Error ? reason.message : "Transaksi ulang gagal disiapkan");
      }).finally(() => setPreparing(current => current.filter(id => id !== part.id)));
    }
  }, [bill, load, token]);

  const pay = async (partId: string) => {
    setLoadingPart(partId);
    setError("");
    try {
      const response = await fetch(`/api/split/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal membuat pembayaran");
      const snap = await loadMidtransSnap();
      snap.pay(result.data.token, {
        onSuccess: () => void load(true),
        onPending: () => void load(true),
        onError: () => void load(true),
        onClose: () => void load(true),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal membuka pembayaran");
    } finally {
      setLoadingPart(null);
    }
  };

  const checkPayment = async () => {
    setChecking(true);
    await load(true);
    setChecking(false);
  };

  const paidCount = bill?.parts.filter(part => part.status === "paid").length || 0;
  const allPaid = Boolean(bill && bill.parts.length > 0 && paidCount === bill.parts.length);
  const billExpired = bill?.status === "expired" || (bill?.expires_at && new Date(bill.expires_at) <= new Date());

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center text-white">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/20 text-blue-200 ring-1 ring-blue-200/30"><CircleDollarSign size={28}/></div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-200">Pembayaran bersama</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Split bill</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-300">Bayar bagianmu dengan aman. Status diperbarui otomatis setelah pembayaran terkonfirmasi.</p>
        </header>

        {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><XCircle size={18} className="mt-0.5 shrink-0"/><span>{error}</span></div>}

        {!bill ? (
          <div className="grid min-h-48 place-items-center rounded-3xl bg-white"><Loader2 className="animate-spin text-blue-600"/></div>
        ) : (
          <>
            <section className={`rounded-3xl border p-5 shadow-xl sm:p-7 ${allPaid ? "border-emerald-300 bg-emerald-50" : "border-white/30 bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-slate-500">Total tagihan</p><p className="mt-1 text-3xl font-black text-slate-950">{money(bill.total_amount)}</p></div>
                <div className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${allPaid ? "bg-emerald-600 text-white" : billExpired ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-800"}`}>
                  {allPaid ? "LUNAS" : billExpired ? "UNDANGAN KEDALUWARSA" : `${paidCount}/${bill.parts.length} SUDAH BAYAR`}
                </div>
              </div>
              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all duration-500 ${allPaid ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${bill.parts.length ? paidCount / bill.parts.length * 100 : 0}%` }}/></div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15}/>Link privat khusus peserta undangan</span>
                {!allPaid && !billExpired && <button onClick={checkPayment} disabled={checking} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={14} className={checking ? "animate-spin" : ""}/>{checking ? "Mengecek…" : "Cek pembayaran"}</button>}
              </div>
            </section>

            <section className="mt-5 space-y-3">
              {bill.parts.map((part, index) => {
                const paid = part.status === "paid";
                const isPreparing = preparing.includes(part.id);
                const isPaying = loadingPart === part.id;
                const retry = ["failed", "expired"].includes(part.status);
                const canPay = bill.status === "active" && !billExpired && !paid;
                return (
                  <article key={part.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${paid ? "border-emerald-300 ring-1 ring-emerald-100" : part.status === "failed" ? "border-red-200" : "border-slate-200"}`}>
                    <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
                      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${paid ? "bg-emerald-100 text-emerald-700" : part.status === "failed" ? "bg-red-50 text-red-600" : part.status === "expired" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                        {paid ? <CheckCircle2 size={24}/> : part.status === "failed" ? <XCircle size={23}/> : <span className="font-black">{String(index + 1).padStart(2, "0")}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-extrabold text-slate-950">{part.label}</h2>
                        <p className="mt-0.5 text-lg font-black text-slate-800">{money(part.amount)}</p>
                        <p className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${paid ? "text-emerald-700" : part.status === "failed" ? "text-red-700" : part.status === "expired" ? "text-amber-700" : "text-slate-500"}`}>
                          {paid ? <Check size={14}/> : part.status === "pending" ? <Clock3 size={14}/> : <XCircle size={14}/>}{statusLabel[part.status]}
                        </p>
                      </div>
                      {paid ? <span className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-black text-white">LUNAS</span> : canPay && (
                        <button onClick={() => void pay(part.id)} disabled={Boolean(loadingPart) || isPreparing} className={`min-w-32 rounded-xl px-4 py-3 text-sm font-extrabold text-white shadow-sm transition disabled:cursor-wait disabled:opacity-60 ${retry ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-700 hover:bg-blue-800"}`}>
                          {isPreparing ? <span className="inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin"/>Menyiapkan ulang</span> : isPaying ? "Membuka Snap…" : retry || autoPreparedFor.current.has(part.id) ? "Coba bayar lagi" : part.snap_token ? "Lanjutkan bayar" : "Bayar bagian ini"}
                        </button>
                      )}
                    </div>
                    {paid && <div className="border-t border-emerald-100 bg-emerald-50 px-5 py-2 text-xs font-semibold text-emerald-800">Pembayaran berhasil dikonfirmasi Midtrans.</div>}
                  </article>
                );
              })}
            </section>

            {allPaid && <div className="mt-5 rounded-2xl bg-emerald-600 p-5 text-center text-white shadow-lg"><CheckCircle2 className="mx-auto mb-2" size={32}/><h2 className="text-lg font-black">Semua bagian sudah dibayar</h2><p className="mt-1 text-sm text-emerald-50">Pesanan sudah ditandai lunas. Terima kasih!</p></div>}
            {billExpired && !allPaid && <div className="mt-5 rounded-2xl bg-white p-5 text-center text-sm text-slate-600">Link split bill ini sudah kedaluwarsa. Minta pemilik pesanan membuat undangan baru.</div>}
            <p className="mt-5 text-center text-xs text-slate-500">Halaman mengecek status setiap beberapa detik. Jangan tutup sampai status pembayaran berubah menjadi hijau.</p>
          </>
        )}
      </div>
    </main>
  );
}
