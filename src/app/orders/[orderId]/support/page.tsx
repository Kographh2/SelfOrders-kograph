"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, MessageCircleWarning } from "lucide-react";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";
import toast, { Toaster } from "react-hot-toast";

type OrderData = { id:string; store_id:string; order_number:number; total_amount:number; payment_status:string; status:string; store?:{name:string} };
const categories = [
  ["late", "Pesanan terlambat"], ["missing_item", "Item kurang"], ["wrong_item", "Item salah"],
  ["payment", "Masalah pembayaran"], ["quality", "Kualitas produk"], ["other", "Lainnya"],
];

export default function OrderSupportPage() {
  const params = useParams<{orderId:string}>();
  const { token } = useAuth();
  const orderId = String(params.orderId || "");
  const [order,setOrder] = useState<OrderData|null>(null);
  const [category,setCategory] = useState("late");
  const [description,setDescription] = useState("");
  const [refundReason,setRefundReason] = useState("");
  const [busy,setBusy] = useState(false);
  const load = useCallback(async()=>{
    if(!orderId)return;
    const sessionId=localStorage.getItem("selforder_session_id")||"";
    const response=await fetch(`/api/orders/track?orderId=${encodeURIComponent(orderId)}&sessionId=${encodeURIComponent(sessionId)}`,{headers:getAuthHeaders(token),cache:"no-store"});
    const result=await response.json(); if(!response.ok)throw new Error(result.error||"Pesanan tidak ditemukan"); setOrder(result.data);
  },[orderId,token]);
  useEffect(()=>{load().catch(error=>toast.error(error instanceof Error?error.message:"Gagal memuat pesanan"))},[load]);
  const sendIncident=async(event:FormEvent)=>{event.preventDefault();setBusy(true);try{const response=await fetch("/api/order-incidents",{method:"POST",headers:{"Content-Type":"application/json",...getAuthHeaders(token)},body:JSON.stringify({orderId,sessionId:localStorage.getItem("selforder_session_id")||"",category,description})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Laporan gagal dikirim");setDescription("");toast.success("Laporan terkirim ke cabang")}catch(error){toast.error(error instanceof Error?error.message:"Laporan gagal dikirim")}finally{setBusy(false)}};
  const sendRefund=async()=>{if(!refundReason.trim())return toast.error("Jelaskan alasan permintaan refund");setBusy(true);try{const response=await fetch("/api/refund-requests",{method:"POST",headers:{"Content-Type":"application/json",...getAuthHeaders(token)},body:JSON.stringify({action:"request",orderId,sessionId:localStorage.getItem("selforder_session_id")||"",amount:order?.total_amount,reason:refundReason})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Permintaan refund gagal");setRefundReason("");toast.success("Permintaan refund dikirim untuk ditinjau admin cabang")}catch(error){toast.error(error instanceof Error?error.message:"Refund gagal diajukan")}finally{setBusy(false)}};
  return <main className="min-h-screen bg-blue-50 p-4 text-navy-950 md:p-8"><Toaster position="top-center"/><div className="mx-auto max-w-2xl"><Link href={`/orders/${orderId}/waiting`} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={16}/> Kembali ke pesanan</Link><header className="my-6 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-700"><MessageCircleWarning/></div><div><h1 className="text-2xl font-black">Bantuan pesanan</h1><p className="text-sm text-slate-500">#{order?.order_number || "…"} · {order?.store?.name || "Cabang"}</p></div></header>
  {!order?<div className="rounded-2xl bg-white p-5 text-sm text-slate-500">Memverifikasi akses ke pesanan…</div>:<>
    <form onSubmit={sendIncident} className="space-y-4 rounded-3xl bg-white p-5 shadow"><h2 className="font-black">Laporkan masalah</h2><label className="block text-sm font-semibold">Jenis masalah<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-1 w-full rounded-xl border p-3">{categories.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="block text-sm font-semibold">Keterangan<textarea required minLength={5} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} className="mt-1 min-h-28 w-full rounded-xl border p-3" placeholder="Ceritakan masalahnya agar cabang bisa membantu"/></label><button disabled={busy} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50">{busy?"Mengirim…":"Kirim laporan"}</button></form>
    {order.payment_status==="paid"&&<section className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-black">Ajukan refund</h2><p className="mt-1 text-sm text-amber-900">Pengajuan akan ditinjau tim cabang. Jika disetujui, refund Midtrans memerlukan dukungan dari metode pembayaran terkait. Nilai yang diajukan: Rp {Number(order.total_amount).toLocaleString("id-ID")}.</p><textarea value={refundReason} onChange={e=>setRefundReason(e.target.value)} maxLength={1000} className="mt-3 min-h-20 w-full rounded-xl border border-amber-200 bg-white p-3" placeholder="Alasan refund"/><button onClick={sendRefund} disabled={busy} className="mt-3 w-full rounded-xl bg-amber-700 py-3 font-bold text-white disabled:opacity-50">Ajukan refund penuh</button></section>}
  </>}</div></main>;
}
