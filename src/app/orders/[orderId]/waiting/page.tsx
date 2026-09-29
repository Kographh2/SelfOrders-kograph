"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { CheckCircle2, ChefHat, Clock3, Download, Home, Loader2, ReceiptText, RefreshCw, WalletCards, XCircle } from "lucide-react";
import { useAuth, getAuthHeaders } from "@/contexts/AuthContext";

type TrackedOrder={id:string;order_number:number;status:string;payment_status:string;payment_method?:string;subtotal:number;tax_amount:number;service_charge:number;total_amount:number;created_at:string;completed_at?:string;cash_code?:string;store?:{name:string;address:string;phone:string};table?:{number:number};order_items:Array<{id:string;name_snapshot:string;price_snapshot:number;quantity:number;subtotal:number;notes?:string}>;promo?:Record<string,string>};
const steps=["confirmed","preparing","ready","completed"];

export default function WaitingPage(){
  const {orderId}=useParams<{orderId:string}>(); const {token}=useAuth();
  const [order,setOrder]=useState<TrackedOrder|null>(null); const [error,setError]=useState("");
  const barcodeRef=useRef<SVGSVGElement>(null); const qrRef=useRef<HTMLCanvasElement>(null); const previousStatus=useRef("");
  const fetchOrder=useCallback(async()=>{
    const session=localStorage.getItem("selforder_session_id")||"";
    const response=await fetch(`/api/orders/track?orderId=${orderId}&sessionId=${encodeURIComponent(session)}`,{headers:getAuthHeaders(token)});
    const result=await response.json(); if(!response.ok){setError(result.error||"Pesanan tidak ditemukan");return;}
    if(result.data.status==="ready"&&previousStatus.current&&previousStatus.current!=="ready") beep();
    previousStatus.current=result.data.status; setOrder(result.data); setError("");
  },[orderId,token]);
  useEffect(()=>{fetchOrder();const timer=setInterval(fetchOrder,4000);return()=>clearInterval(timer);},[fetchOrder]);
  useEffect(()=>{if(order?.cash_code&&barcodeRef.current) JsBarcode(barcodeRef.current,order.cash_code,{format:"CODE128",displayValue:true,height:72,margin:8,fontSize:13});},[order?.cash_code]);
  useEffect(()=>{if(order?.promo?.promo_active==="true"&&order.promo.promo_qr_url&&qrRef.current) QRCode.toCanvas(qrRef.current,order.promo.promo_qr_url,{width:116,margin:1,color:{dark:"#07172f",light:"#ffffff"}});},[order]);
  const beep=()=>{try{const ctx=new AudioContext();[0,.24,.48].forEach(delay=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=880;gain.gain.setValueAtTime(.13,ctx.currentTime+delay);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+delay+.16);osc.connect(gain).connect(ctx.destination);osc.start(ctx.currentTime+delay);osc.stop(ctx.currentTime+delay+.17);});}catch{}}
  const downloadReceipt=()=>window.print();
  if(error)return <main className="grid min-h-screen place-items-center bg-navy-950 p-6 text-center text-white"><div><XCircle className="mx-auto h-14 w-14 text-red-400"/><h1 className="mt-4 text-xl font-bold">Pesanan tidak dapat dibuka</h1><p className="mt-2 text-navy-300">{error}</p><Link href="/menu" className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3">Kembali ke menu</Link></div></main>;
  if(!order)return <main className="grid min-h-screen place-items-center bg-navy-950 text-white"><Loader2 className="h-10 w-10 animate-spin text-blue-400"/></main>;
  const paymentPending=order.payment_status==="pending"; const failed=["failed","expired"].includes(order.payment_status); const done=order.status==="completed"; const active=Math.max(0,steps.indexOf(order.status));
  return <main className={`min-h-screen px-4 py-8 transition-colors duration-700 ${done?"bg-emerald-700":"bg-gradient-to-b from-navy-950 via-navy-900 to-blue-950"}`}>
    <div className="mx-auto max-w-xl">
      <header className="no-print mb-8 flex items-center justify-between text-white"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-blue-300">Live order</p><h1 className="text-xl font-bold">{order.store?.name||"SelfOrder"}</h1></div><button onClick={fetchOrder} className="rounded-full bg-white/10 p-3"><RefreshCw className="h-5 w-5"/></button></header>
      <section className="overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className={`p-7 text-center text-white ${failed?"bg-red-600":done?"bg-emerald-600":"bg-gradient-to-br from-blue-600 to-blue-800"}`}>
          {done?<CheckCircle2 className="mx-auto h-12 w-12"/>:failed?<XCircle className="mx-auto h-12 w-12"/>:<Clock3 className="mx-auto h-11 w-11"/>}
          <p className="mt-3 text-sm opacity-80">Nomor antrean Anda</p><p className="text-7xl font-black tracking-tight">{String(order.order_number).padStart(3,"0")}</p>
          <h2 className="mt-3 text-xl font-bold">{done?"Terima kasih sudah berbelanja di sini":failed?"Pembayaran gagal":paymentPending?order.payment_method==="cash"?"Bayar dan konfirmasi di kasir":"Menunggu pembayaran":"Pesanan sedang kami siapkan"}</h2>
          {order.table&&<p className="mt-1 text-sm opacity-80">Meja {order.table.number}</p>}
        </div>
        <div className="p-6">
          {order.payment_method==="cash"&&paymentPending&&<div className="mb-6 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 p-4 text-center"><WalletCards className="mx-auto mb-2 h-6 w-6 text-blue-700"/><p className="font-bold text-navy-950">Barcode pembayaran tunai</p><p className="mb-3 text-xs text-navy-500">Tunjukkan layar ini kepada kasir</p><svg ref={barcodeRef} className="mx-auto max-w-full"/></div>}
          {!paymentPending&&!failed&&!done&&<div className="no-print mb-7 flex justify-between">{steps.map((step,index)=><div key={step} className="flex flex-1 flex-col items-center"><div className={`grid h-9 w-9 place-items-center rounded-full text-xs font-bold ${index<=active?"bg-blue-600 text-white":"bg-navy-100 text-navy-400"}`}>{index+1}</div><span className="mt-2 text-[10px] capitalize text-navy-500">{step==="confirmed"?"Diterima":step==="preparing"?"Dimasak":step==="ready"?"Dipanggil":"Selesai"}</span></div>)}</div>}
          {order.status==="ready"&&<button onClick={beep} className="no-print mb-6 w-full rounded-2xl bg-amber-400 p-4 font-bold text-navy-950">🔔 Pesanan siap — silakan ambil di kasir</button>}
          {(done||order.payment_status==="paid")&&<Receipt order={order} qrRef={qrRef}/>} 
          <div className="no-print mt-6 grid grid-cols-2 gap-3"><Link href="/menu" className="flex items-center justify-center gap-2 rounded-2xl bg-navy-100 py-3 font-semibold text-navy-800"><Home className="h-4 w-4"/>Menu</Link><button onClick={downloadReceipt} className="flex items-center justify-center gap-2 rounded-2xl bg-navy-950 py-3 font-semibold text-white"><Download className="h-4 w-4"/>Unduh struk</button></div>
        </div>
      </section>
    </div>
  </main>;
}
function Receipt({order,qrRef}:{order:TrackedOrder;qrRef:React.RefObject<HTMLCanvasElement|null>}){return <div id="receipt" className="receipt border-t border-dashed border-navy-200 pt-5 text-sm"><div className="mb-4 flex items-center gap-2"><ReceiptText className="h-5 w-5"/><h3 className="font-bold">Struk Digital #{String(order.order_number).padStart(3,"0")}</h3></div>{order.order_items.map(item=><div key={item.id} className="mb-2 flex justify-between gap-3"><span>{item.quantity}× {item.name_snapshot}</span><span>Rp {Number(item.subtotal).toLocaleString("id-ID")}</span></div>)}<div className="mt-3 space-y-1 border-t border-dashed border-navy-200 pt-3"><div className="flex justify-between"><span>Subtotal</span><span>Rp {Number(order.subtotal).toLocaleString("id-ID")}</span></div><div className="flex justify-between"><span>Pajak</span><span>Rp {Number(order.tax_amount).toLocaleString("id-ID")}</span></div><div className="flex justify-between"><span>Service</span><span>Rp {Number(order.service_charge).toLocaleString("id-ID")}</span></div><div className="flex justify-between pt-2 text-base font-black"><span>Total</span><span>Rp {Number(order.total_amount).toLocaleString("id-ID")}</span></div></div>{order.promo?.promo_active==="true"&&order.promo.promo_qr_url&&<div className="mt-5 rounded-xl bg-blue-50 p-3 text-center"><p className="font-bold">{order.promo.promo_name||"Promo spesial"}</p><p className="text-xs text-navy-500">{order.promo.promo_description}</p><canvas ref={qrRef} className="mx-auto mt-2"/></div>}</div>}
