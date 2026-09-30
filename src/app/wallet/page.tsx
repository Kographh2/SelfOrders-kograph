"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, CreditCard, Loader2, WalletCards } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";
import { loadMidtransSnap } from "@/lib/midtrans-client";

type Tx = { id: string; type: string; direction: "credit" | "debit"; amount: number; description: string; created_at: string };
export default function WalletPage() {
  const { token, user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [points, setPoints] = useState(0);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [amount, setAmount] = useState(50000);
  const [busy, setBusy] = useState(false);
  const [withdraw, setWithdraw] = useState({ amount: "", bankName: "", accountNumber: "", accountName: "" });
  const load = useCallback(async () => {
    if (!token) return;
    const response = await fetch("/api/wallet", { headers: getAuthHeaders(token) });
    const result = await response.json();
    if (response.ok) { setBalance(result.data.balance); setPoints(result.data.points ?? 0); setTransactions(result.data.transactions); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  const topup = async () => {
    setBusy(true);
    try {
      const snap = await loadMidtransSnap();
      const response = await fetch("/api/wallet/topup", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders(token) }, body: JSON.stringify({ amount }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      snap.pay(result.data.token, { onSuccess: () => { toast.success("Pembayaran diterima, saldo segera masuk"); setTimeout(load, 1500); }, onPending: () => toast("Top up menunggu pembayaran"), onError: () => toast.error("Top up gagal"), onClose: () => setBusy(false) });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Top up gagal"); }
    finally { setBusy(false); }
  };
  const requestWithdraw = async () => {
    setBusy(true);
    const response = await fetch("/api/wallet/withdraw", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders(token) }, body: JSON.stringify({ ...withdraw, amount: Number(withdraw.amount) }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return toast.error(result.error || "Penarikan gagal");
    toast.success("Permintaan penarikan dikirim"); setWithdraw({ amount: "", bankName: "", accountNumber: "", accountName: "" }); load();
  };
  if (!user?.email) return <main className="grid min-h-screen place-items-center bg-navy-950 p-6 text-white"><div className="text-center"><WalletCards className="mx-auto h-14 w-14 text-blue-300"/><h1 className="mt-4 text-2xl font-black">Wallet membutuhkan akun</h1><Link href="/login?next=/wallet" className="mt-5 inline-block rounded-xl bg-blue-600 px-6 py-3 font-bold">Masuk</Link></div></main>;
  return <main className="min-h-screen bg-gradient-to-b from-navy-950 to-blue-950 p-4 pb-12 text-white"><Toaster/><div className="mx-auto max-w-xl">
    <Link href="/profile" className="my-4 inline-flex items-center gap-2 text-sm font-bold text-blue-200"><ArrowLeft className="h-4 w-4"/>Profil</Link>
    <section className="rounded-[2rem] bg-gradient-to-br from-blue-600 to-blue-800 p-7 shadow-2xl"><p className="text-sm text-blue-100">Saldo tersedia</p><h1 className="mt-1 text-4xl font-black">Rp {balance.toLocaleString("id-ID")}</h1><p className="mt-3 text-xs text-blue-100">Pembayaran pesanan dan tip tercatat dalam ledger aman.</p></section>
    <section className="mt-4 flex items-center justify-between rounded-2xl border border-amber-200/20 bg-amber-300/10 p-4"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-100">Poin loyalitas</p><p className="mt-1 text-sm text-blue-100">Poin dari pesanan yang selesai</p></div><b className="text-2xl font-black text-amber-200">{points.toLocaleString("id-ID")}</b></section>
    <section className="mt-5 rounded-[2rem] bg-white p-5 text-navy-950"><h2 className="font-black">Top up via Midtrans Snap</h2><div className="mt-3 grid grid-cols-3 gap-2">{[50000, 100000, 200000].map(value => <button key={value} onClick={() => setAmount(value)} className={`rounded-xl py-3 text-sm font-bold ${amount === value ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-800"}`}>{value / 1000}rb</button>)}</div><input type="number" min={10000} max={10000000} value={amount} onChange={event => setAmount(Number(event.target.value))} className="mt-3 w-full rounded-xl border-2 border-blue-100 p-3 font-bold outline-none focus:border-blue-500"/><button disabled={busy} onClick={topup} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-950 py-3 font-bold text-white"><CreditCard className="h-5 w-5"/>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Top up sekarang"}</button></section>
    <section className="mt-5 rounded-[2rem] bg-white p-5 text-navy-950"><h2 className="font-black">Tarik saldo</h2><p className="mt-1 text-xs text-slate-500">Dana langsung ditahan agar tidak dapat dipakai dua kali selama pemeriksaan.</p><div className="mt-3 grid gap-2">{([['amount', 'Nominal minimal Rp10.000'], ['bankName', 'Bank / e-wallet'], ['accountNumber', 'Nomor rekening'], ['accountName', 'Nama pemilik']] as const).map(([key, label]) => <input key={key} type={key === "amount" ? "number" : "text"} value={withdraw[key]} onChange={event => setWithdraw(value => ({ ...value, [key]: event.target.value }))} placeholder={label} className="rounded-xl border border-navy-100 p-3 text-sm outline-none focus:border-blue-500" />)}</div><button disabled={busy} onClick={requestWithdraw} className="mt-3 w-full rounded-xl bg-blue-50 py-3 font-bold text-blue-800">Ajukan penarikan</button></section>
    <section className="mt-5 rounded-[2rem] bg-white p-5 text-navy-950"><h2 className="font-black">Riwayat saldo</h2><div className="mt-3 divide-y divide-navy-100">{transactions.length ? transactions.map(tx => <div key={tx.id} className="flex items-center gap-3 py-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tx.direction === "credit" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-700"}`}>{tx.direction === "credit" ? <ArrowDownLeft/> : <ArrowUpRight/>}</span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{tx.description}</b><small className="text-slate-400">{new Date(tx.created_at).toLocaleString("id-ID")}</small></div><b className={tx.direction === "credit" ? "text-emerald-600" : "text-navy-900"}>{tx.direction === "credit" ? "+" : "-"}Rp {Number(tx.amount).toLocaleString("id-ID")}</b></div>) : <p className="py-5 text-center text-sm text-slate-400">Belum ada transaksi</p>}</div></section>
  </div></main>;
}
