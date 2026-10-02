"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ClipboardList, RotateCcw } from "lucide-react";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";
import toast, { Toaster } from "react-hot-toast";

type HistoryOrder = {
  id: string; store_id: string; order_number: number; status: string; payment_status: string;
  payment_method?: string; order_type?: string; total_amount: number; created_at: string;
  store?: { name: string } | null; table?: { number: number } | null;
  order_items: Array<{ menu_item_id: string; name_snapshot: string; quantity: number; notes?: string; options_snapshot?: Array<{ option_id: string }> }>;
};

const money = (n: number) => `Rp ${Number(n).toLocaleString("id-ID")}`;

export default function OrderHistoryPage() {
  const { token, user, isLoading } = useAuth();
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const load = useCallback(async (nextPage = 0) => {
    if (!token || user?.role !== "user") { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/orders/history?page=${nextPage}`, { headers: getAuthHeaders(token), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Riwayat pesanan gagal dimuat");
      setOrders(current => nextPage ? [...current, ...(result.data || [])] : result.data || []);
      setHasMore(Boolean(result.hasMore)); setPage(nextPage);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Riwayat pesanan gagal dimuat"); }
    finally { setLoading(false); }
  }, [token, user?.role]);
  useEffect(() => { if (!isLoading) load(0); }, [isLoading, load]);

  const reorder = (order: HistoryOrder) => {
    localStorage.setItem("selforder_reorder_cart", JSON.stringify(order.order_items.map(item => ({ menu_item_id: item.menu_item_id, quantity: item.quantity, notes: item.notes, option_ids: (item.options_snapshot || []).map(option => option.option_id) }))));
    const table = order.order_type === "dine_in" && order.table?.number ? `&table=${order.table.number}` : "";
    window.location.assign(`/menu?store=${encodeURIComponent(order.store_id)}${table}&reorder=1`);
  };

  return <main className="min-h-screen bg-blue-50 px-4 py-6 text-navy-950 md:px-8">
    <Toaster position="top-center" />
    <div className="mx-auto max-w-3xl">
      <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={16}/> Profil</Link>
      <header className="my-6 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-700"><ClipboardList/></div><div><h1 className="text-2xl font-black">Riwayat pesanan</h1><p className="text-sm text-slate-500">Pesanan akun ini saja</p></div></header>
      {user?.role !== "user" ? <section className="rounded-3xl bg-white p-8 text-center shadow"><h2 className="text-lg font-bold">Masuk untuk melihat riwayat</h2><p className="mt-2 text-sm text-slate-500">Riwayat pesanan hanya ditampilkan kepada pemilik akun.</p><Link href="/login" className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Masuk</Link></section> : loading && orders.length === 0 ? <div className="py-12 text-center text-slate-500">Memuat riwayat…</div> : orders.length === 0 ? <section className="rounded-3xl bg-white p-8 text-center shadow"><p className="font-bold">Belum ada pesanan di akun ini.</p><Link href="/menu" className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Lihat menu</Link></section> : <div className="space-y-4">{orders.map(order => <article key={order.id} className="rounded-3xl bg-white p-5 shadow"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Pesanan #{order.order_number}</p><h2 className="mt-1 font-black">{order.store?.name || "Cabang"}</h2><p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString("id-ID")}{order.table?.number ? ` · Meja ${order.table.number}` : " · Pickup"}</p></div><div className="text-right"><p className="font-black">{money(order.total_amount)}</p><p className="mt-1 text-xs capitalize text-slate-500">{order.status} · bayar {order.payment_status}</p></div></div><div className="mt-4 space-y-1 border-t pt-3 text-sm">{order.order_items.map((item,index)=><p key={`${item.menu_item_id}-${index}`} className="text-slate-600">{item.quantity}× {item.name_snapshot}</p>)}</div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/orders/${order.id}/waiting`} className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700">Lihat status</Link><button onClick={() => reorder(order)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"><RotateCcw size={15}/> Pesan lagi</button></div></article>)}{hasMore&&<button onClick={()=>load(page+1)} disabled={loading} className="w-full rounded-xl border bg-white py-3 font-bold disabled:opacity-60">{loading?"Memuat…":"Muat lebih banyak"}</button>}</div>}
    </div>
  </main>;
}
