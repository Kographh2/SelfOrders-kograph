"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Gift, Star } from "lucide-react";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";
import toast, { Toaster } from "react-hot-toast";

type Reward = { id: string; name: string; description?: string; points_cost: number; discount_amount: number; min_purchase: number };
type Redemption = { id: string; code: string; expires_at: string; reward?: { name: string; discount_amount: number } };
const money = (n: number) => `Rp ${Number(n).toLocaleString("id-ID")}`;

export default function RewardsPage() {
  const { token, user } = useAuth();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [points, setPoints] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [busy, setBusy] = useState("");
  const load = useCallback(async (id: string) => {
    if (!token || !id) return;
    const response = await fetch(`/api/loyalty?storeId=${encodeURIComponent(id)}`, { headers: getAuthHeaders(token), cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Reward gagal dimuat");
    setPoints(result.data.points || 0); setRewards(result.data.rewards || []); setRedemptions(result.data.redemptions || []);
  }, [token]);
  useEffect(() => {
    fetch("/api/stores").then(r => r.json()).then(async result => {
      const stores = result.data || [];
      const preferred = localStorage.getItem("selforder_store_id");
      const selected = stores.find((item: {id:string}) => item.id === preferred) || stores[0];
      if (selected) { setStoreId(selected.id); setStoreName(selected.name); await load(selected.id); }
    }).catch(error => toast.error(error instanceof Error ? error.message : "Cabang gagal dimuat"));
  }, [load]);
  const redeem = async (reward: Reward) => {
    if (!token || user?.role !== "user") return toast.error("Masuk sebagai pelanggan untuk menukar poin");
    setBusy(reward.id);
    try {
      const response = await fetch("/api/loyalty", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders(token) }, body: JSON.stringify({ action: "redeem", rewardId: reward.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Penukaran gagal");
      toast.success("Reward berhasil ditukar. Kode berlaku 30 hari.");
      await load(storeId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Penukaran gagal"); }
    finally { setBusy(""); }
  };
  return <main className="min-h-screen bg-blue-50 p-4 text-navy-950 md:p-8"><Toaster position="top-center"/><div className="mx-auto max-w-3xl"><Link href="/profile" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={16}/> Profil</Link><header className="my-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">{storeName || "SelfOrder"}</p><h1 className="text-3xl font-black">Reward poin</h1></div><div className="rounded-2xl bg-navy-950 px-5 py-4 text-white"><p className="text-xs text-blue-200">Poin tersedia</p><p className="flex items-center gap-2 text-2xl font-black"><Star size={20} className="text-yellow-300"/>{points.toLocaleString("id-ID")}</p></div></header>
    {user?.role !== "user" && <p className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Masuk sebagai pelanggan untuk melihat saldo dan menukar poin.</p>}
    <section className="space-y-3"><h2 className="font-black">Reward tersedia</h2>{rewards.length ? rewards.map(reward => <article key={reward.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 shadow"><div><h3 className="font-bold">{reward.name}</h3><p className="text-sm text-slate-500">{reward.description || `Diskon ${money(reward.discount_amount)}${reward.min_purchase ? ` untuk minimum belanja ${money(reward.min_purchase)}` : ""}`}</p><p className="mt-1 text-xs font-bold text-blue-700">{reward.points_cost} poin</p></div><button onClick={() => redeem(reward)} disabled={Boolean(busy) || user?.role !== "user"} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Gift size={16}/>{busy === reward.id ? "Menukar…" : "Tukar poin"}</button></article>) : <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">Belum ada reward aktif untuk cabang ini.</p>}</section>
    <section className="mt-8 space-y-3"><h2 className="font-black">Kode reward kamu</h2>{redemptions.length ? redemptions.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-4 shadow"><div><b>{item.reward?.name || "Reward"}</b><p className="text-xs text-slate-500">Berlaku sampai {new Date(item.expires_at).toLocaleDateString("id-ID")}</p></div><button onClick={() => { void navigator.clipboard?.writeText(item.code); toast.success("Kode disalin"); }} className="rounded-xl border px-4 py-2 font-mono font-bold">{item.code}</button></article>) : <p className="rounded-2xl bg-white p-5 text-sm text-slate-500">Belum ada kode reward yang belum digunakan.</p>}</section>
    <p className="mt-6 text-xs text-slate-500">Poin didapat dari pesanan akun yang sudah lunas dan selesai. Kode ditukar saat checkout dan berlaku untuk cabang reward terkait.</p></div></main>;
}
