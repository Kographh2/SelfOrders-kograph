"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { BellOff, BellRing, CheckCircle2, Clock3, CreditCard, Download, Home, Loader2, ReceiptText, RefreshCw, Star, WalletCards, XCircle } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { useAuth, getAuthHeaders } from "@/contexts/AuthContext";
import { loadMidtransSnap } from "@/lib/midtrans-client";

type TrackedOrder={id:string;store_id:string;order_number:number;status:string;payment_status:string;payment_method?:string;order_type?:"dine_in"|"pickup";pickup_at?:string|null;estimated_ready_at?:string|null;snap_token?:string|null;call_active?:boolean;subtotal:number;tax_amount:number;service_charge:number;total_amount:number;created_at:string;completed_at?:string;cash_code?:string;store?:{name:string;address:string;phone:string};table?:{number:number};order_items:Array<{id:string;menu_item_id:string;name_snapshot:string;price_snapshot:number;quantity:number;subtotal:number;notes?:string;options_snapshot?:Array<{group_name:string;option_id:string;option_name:string;price_delta:number}>}>;order_feedback?:Array<{id:string;rating:number;note?:string;tip_amount:number}>;promo_discount?:number;promo?:{id:string;name:string;description?:string;code:string;claim_url:string}|null};
const steps=["confirmed","preparing","ready","completed"];

export default function WaitingPage(){
  const {orderId}=useParams<{orderId:string}>(); const {token}=useAuth();
  const [order,setOrder]=useState<TrackedOrder|null>(null); const [error,setError]=useState("");
  const [checkingPayment,setCheckingPayment]=useState(false); const [openingSnap,setOpeningSnap]=useState(false);
  const [splitCount,setSplitCount]=useState(2); const [splitUrl,setSplitUrl]=useState(""); const [creatingSplit,setCreatingSplit]=useState(false);
  const [soundEnabled,setSoundEnabled]=useState(true); const [audioUnlocked,setAudioUnlocked]=useState(false);
  const [rating,setRating]=useState(5); const [tip,setTip]=useState(0); const [feedback,setFeedback]=useState(""); const [sending,setSending]=useState(false);
  const cashQrRef=useRef<HTMLCanvasElement>(null); const qrRef=useRef<HTMLCanvasElement>(null);
  const fetchOrder=useCallback(async()=>{
    const session=localStorage.getItem("selforder_session_id")||"";
    const response=await fetch(`/api/orders/track?orderId=${orderId}&sessionId=${encodeURIComponent(session)}`,{headers:getAuthHeaders(token)});
    const result=await response.json(); if(!response.ok){setError(result.error||"Pesanan tidak ditemukan");return;}
    setOrder(result.data); setError("");
  },[orderId,token]);
  const checkPayment=async()=>{
    setCheckingPayment(true);
    try{
      const response=await fetch("/api/payment/midtrans/status",{method:"POST",headers:{"Content-Type":"application/json",...getAuthHeaders(token)},body:JSON.stringify({orderId,sessionId:localStorage.getItem("selforder_session_id")||""})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Status pembayaran belum berhasil diperiksa");
      await fetchOrder();
      if(result.data?.payment_status==="paid")toast.success("Pembayaran sudah berhasil");
      else toast("Pembayaran masih menunggu konfirmasi");
    }catch(error){toast.error(error instanceof Error?error.message:"Status pembayaran belum berhasil diperiksa")}
    finally{setCheckingPayment(false)}
  };
  const continueSnapPayment=async()=>{
    if(!order)return;
    setOpeningSnap(true);
    let snapOpened=false;
    const refreshAfterSnap=()=>{setOpeningSnap(false);void fetchOrder()};
    try{
      let snapToken=order.snap_token;
      if(!snapToken){
        const response=await fetch("/api/payment/midtrans",{method:"POST",headers:{"Content-Type":"application/json",...getAuthHeaders(token)},body:JSON.stringify({orderId:order.id,sessionId:localStorage.getItem("selforder_session_id")||""})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||"Link pembayaran tidak berhasil dimuat");
        const returnedToken=result.data?.token;
        if(typeof returnedToken!=="string"||!returnedToken)throw new Error("Token pembayaran Snap tidak tersedia");
        snapToken=returnedToken;
      }
      if(typeof snapToken!=="string"||!snapToken)throw new Error("Token pembayaran Snap tidak tersedia");
      const snap=await loadMidtransSnap();
      snap.pay(snapToken,{onSuccess:()=>{toast.success("Pembayaran diterima, status sedang diperbarui");refreshAfterSnap()},onPending:()=>{toast("Pembayaran masih menunggu konfirmasi");refreshAfterSnap()},onError:()=>{toast.error("Pembayaran belum berhasil");refreshAfterSnap()},onClose:refreshAfterSnap});
      snapOpened=true;
    }catch(error){toast.error(error instanceof Error?error.message:"Snap belum dapat dibuka")}
    finally{if(!snapOpened)setOpeningSnap(false)}
  };
  const createSplit=async()=>{if(!order)return;setCreatingSplit(true);try{const response=await fetch(`/api/orders/${order.id}/split`,{method:"POST",headers:{"Content-Type":"application/json",...getAuthHeaders(token)},body:JSON.stringify({count:splitCount,mode:"equal",sessionId:localStorage.getItem("selforder_session_id")||""})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Gagal membuat split bill");setSplitUrl(result.data.url);await navigator.clipboard?.writeText(result.data.url);toast.success("Undangan split bill disalin")}catch(error){toast.error(error instanceof Error?error.message:"Gagal membuat split bill")}finally{setCreatingSplit(false)}};
  useEffect(()=>{if(sessionStorage.getItem("selforder_pending_snap_order")===orderId)sessionStorage.removeItem("selforder_pending_snap_order")},[orderId]);
  useEffect(()=>{setSplitUrl(localStorage.getItem("selforder_split_invite_url")||"")},[]);
  useEffect(()=>{fetchOrder();const timer=setInterval(fetchOrder,4000);return()=>clearInterval(timer);},[fetchOrder]);
  useEffect(()=>{setSoundEnabled(localStorage.getItem("selforder_call_sound")!=="off");setAudioUnlocked(localStorage.getItem("selforder_audio_unlocked")==="yes");},[]);
  useEffect(()=>{if(order?.cash_code&&cashQrRef.current) QRCode.toCanvas(cashQrRef.current,order.cash_code,{width:220,margin:2,color:{dark:"#07172f",light:"#ffffff"}});},[order?.cash_code]);
  useEffect(()=>{if(order?.promo?.claim_url&&qrRef.current) QRCode.toCanvas(qrRef.current,order.promo.claim_url,{width:116,margin:1,color:{dark:"#07172f",light:"#ffffff"}});},[order]);
  const queueNumber=order?.order_number;
  const announce=useCallback(()=>{if(!queueNumber)return;try{const ctx=new AudioContext();[0,.24,.48].forEach(delay=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=880;gain.gain.setValueAtTime(.15,ctx.currentTime+delay);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+delay+.16);osc.connect(gain).connect(ctx.destination);osc.start(ctx.currentTime+delay);osc.stop(ctx.currentTime+delay+.17);});setTimeout(()=>ctx.close(),1400);}catch{}navigator.vibrate?.([250,120,250,120,400]);if("speechSynthesis" in window){window.speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(`Pesanan nomor antrean ${queueNumber}, sudah siap. Silakan ambil pesanan Anda.`);voice.lang="id-ID";voice.rate=.88;window.speechSynthesis.speak(voice);}},[queueNumber]);
  useEffect(()=>{if(order?.status!=="ready"||!order.call_active||!soundEnabled||!audioUnlocked)return;announce();const timer=setInterval(announce,8000);return()=>{clearInterval(timer);window.speechSynthesis?.cancel();navigator.vibrate?.(0);};},[order?.status,order?.call_active,soundEnabled,audioUnlocked,announce]);
  const unlock=()=>{setAudioUnlocked(true);localStorage.setItem("selforder_audio_unlocked","yes");announce();};
  const muteLocal=()=>{setSoundEnabled(false);localStorage.setItem("selforder_call_sound","off");window.speechSynthesis?.cancel();navigator.vibrate?.(0);};
  const stopCall=async()=>{const sessionId=localStorage.getItem("selforder_session_id")||"";const response=await fetch(`/api/orders/${orderId}/call`,{method:"PUT",headers:{"Content-Type":"application/json",...getAuthHeaders(token)},body:JSON.stringify({sessionId})});if(response.ok){muteLocal();setOrder(current=>current?{...current,call_active:false}:current);toast.success("Panggilan dihentikan");}else toast.error("Tidak dapat menghentikan panggilan");};
  const submitFeedback=async()=>{setSending(true);const response=await fetch(`/api/orders/${orderId}/feedback`,{method:"POST",headers:{"Content-Type":"application/json",...getAuthHeaders(token)},body:JSON.stringify({rating,note:feedback,tip})});const result=await response.json();setSending(false);if(!response.ok)return toast.error(result.error||"Gagal mengirim ulasan");toast.success("Terima kasih atas ulasan Anda");fetchOrder();};
  const downloadReceipt=()=>window.print();
  const orderAgain=()=>{if(!order)return;localStorage.setItem("selforder_reorder_cart",JSON.stringify(order.order_items.map(item=>({menu_item_id:item.menu_item_id,quantity:item.quantity,notes:item.notes,option_ids:(item.options_snapshot??[]).map(option=>option.option_id)}))));const table=order.table?.number?`&table=${order.table.number}`:"";window.location.assign(`/menu?store=${encodeURIComponent(order.store_id)}${table}&reorder=1`)};
  if(error)return <main className="grid min-h-screen place-items-center bg-navy-950 p-6 text-center text-white"><div><XCircle className="mx-auto h-14 w-14 text-red-400"/><h1 className="mt-4 text-xl font-bold">Pesanan tidak dapat dibuka</h1><p className="mt-2 text-navy-300">{error}</p><Link href="/menu" className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3">Kembali ke menu</Link></div></main>;
  if(!order)return <main className="grid min-h-screen place-items-center bg-navy-950 text-white"><Loader2 className="h-10 w-10 animate-spin text-blue-400"/></main>;
  const paymentPending=order.payment_status==="pending"; const failed=["failed","expired"].includes(order.payment_status); const done=order.status==="completed"; const active=Math.max(0,steps.indexOf(order.status));
  return <main className={`min-h-screen px-4 py-8 transition-colors duration-700 ${done?"bg-emerald-700":"bg-gradient-to-b from-navy-950 via-navy-900 to-blue-950"}`}><Toaster position="top-center"/>
    <div className="mx-auto max-w-xl">
      <header className="no-print mb-8 flex items-center justify-between text-white"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-blue-300">Live order</p><h1 className="text-xl font-bold">{order.store?.name||"SelfOrder"}</h1></div><button onClick={fetchOrder} className="rounded-full bg-white/10 p-3"><RefreshCw className="h-5 w-5"/></button></header>
      <section className="overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className={`p-7 text-center text-white ${failed?"bg-red-600":done?"bg-emerald-600":"bg-gradient-to-br from-blue-600 to-blue-800"}`}>
          {done?<CheckCircle2 className="mx-auto h-12 w-12"/>:failed?<XCircle className="mx-auto h-12 w-12"/>:<Clock3 className="mx-auto h-11 w-11"/>}
          <p className="mt-3 text-sm opacity-80">Nomor antrean Anda</p><p className="text-7xl font-black tracking-tight">{String(order.order_number).padStart(3,"0")}</p>
          <h2 className="mt-3 text-xl font-bold">{done?"Terima kasih sudah berbelanja di sini":failed?"Pembayaran gagal":paymentPending?order.payment_method==="cash"?"Bayar dan konfirmasi di kasir":"Menunggu pembayaran":"Pesanan sedang kami siapkan"}</h2>
          {order.table&&<p className="mt-1 text-sm opacity-80">Meja {order.table.number}</p>}
          {order.order_type==="pickup"&&<p className="mt-1 text-sm opacity-80">Ambil sendiri · {order.pickup_at?new Date(order.pickup_at).toLocaleString("id-ID"):""}</p>}
        </div>
        <div className="p-6">
          {order.estimated_ready_at&&<p className="mb-5 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-900"><Clock3 className="mr-2 inline h-4 w-4"/>Estimasi pesanan siap: {new Date(order.estimated_ready_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</p>}
          {paymentPending&&order.payment_method!=="cash"&&order.payment_method!=="split"&&<div className="no-print mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-navy-950"><b className="text-sm">Split bill aman</b><p className="mt-1 text-xs">Hanya pemilik pesanan yang membuat dan membagikan undangan peserta.</p><div className="mt-3 flex gap-2"><select value={splitCount} onChange={e=>setSplitCount(Number(e.target.value))} className="rounded-lg border bg-white p-2">{[2,3,4,5,6,7,8,9,10].map(n=><option key={n}>{n}</option>)}</select><button disabled={creatingSplit} onClick={createSplit} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">{creatingSplit?"Membuat…":"Bagi rata & buat undangan"}</button></div>{splitUrl&&<div className="mt-3 break-all rounded-lg bg-white p-3 text-xs">{splitUrl}</div>}</div>}
          {paymentPending&&order.payment_method==="split"&&<div className="no-print mb-5 rounded-2xl bg-blue-50 p-4 text-sm text-blue-950"><b>Menunggu pembayaran peserta split bill</b>{splitUrl&&<p className="mt-2 break-all rounded-lg bg-white p-3 text-xs">Tautan undangan: {splitUrl}</p>}</div>}
          {paymentPending&&order.payment_method!=="cash"&&order.payment_method!=="split"&&<div className="no-print mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-navy-950"><p className="text-sm">Pembayaran belum terkonfirmasi. Setelah menyelesaikan pembayaran di Snap, tekan <b>Cek pembayaran</b>.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><button onClick={checkPayment} disabled={checkingPayment} className="flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-navy-900 ring-1 ring-amber-200 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${checkingPayment?"animate-spin":""}`}/>{checkingPayment?"Memeriksa...":"Cek pembayaran"}</button><button onClick={continueSnapPayment} disabled={openingSnap} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"><CreditCard className="h-4 w-4"/>{openingSnap?"Membuka Snap...":"Lanjutkan pembayaran Snap"}</button></div></div>}
          {order.payment_method==="cash"&&paymentPending&&<div className="mb-6 rounded-2xl border-2 border-blue-200 bg-white p-4 text-center shadow-lg"><WalletCards className="mx-auto mb-2 h-6 w-6 text-blue-700"/><p className="font-bold text-navy-950">QR pembayaran tunai</p><p className="mb-3 text-xs text-navy-500">Naikkan brightness layar lalu tunjukkan QR ini ke kasir</p><canvas ref={cashQrRef} className="mx-auto block rounded-xl bg-white p-2"/></div>}
          {!paymentPending&&!failed&&!done&&<div className="no-print mb-7 flex justify-between">{steps.map((step,index)=><div key={step} className="flex flex-1 flex-col items-center"><div className={`grid h-9 w-9 place-items-center rounded-full text-xs font-bold ${index<=active?"bg-blue-600 text-white":"bg-navy-100 text-navy-400"}`}>{index+1}</div><span className="mt-2 text-[10px] capitalize text-navy-500">{step==="confirmed"?"Diterima":step==="preparing"?"Dimasak":step==="ready"?"Dipanggil":"Selesai"}</span></div>)}</div>}
          {!audioUnlocked&&!done&&<button onClick={unlock} className="no-print mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 p-4 font-bold text-white"><BellRing className="h-5 w-5"/>Aktifkan suara panggilan</button>}
          {order.status==="ready"&&<div className="no-print mb-6 rounded-2xl bg-amber-100 p-4 text-center text-navy-950"><b>Pesanan siap — silakan ambil di kasir</b><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={soundEnabled?muteLocal:()=>{setSoundEnabled(true);localStorage.setItem("selforder_call_sound","on");}} className="flex items-center justify-center gap-2 rounded-xl bg-white py-2 text-sm font-bold">{soundEnabled?<BellOff className="h-4 w-4"/>:<BellRing className="h-4 w-4"/>}{soundEnabled?"Bisukan":"Nyalakan"}</button><button onClick={stopCall} className="rounded-xl bg-navy-950 py-2 text-sm font-bold text-white">Saya sudah dengar</button></div></div>}
          {(done||order.payment_status==="paid")&&<Receipt order={order} qrRef={qrRef}/>} 
          {done&&!(order.order_feedback?.length)&&<div className="no-print mt-6 rounded-2xl bg-blue-50 p-4"><h3 className="font-black text-navy-950">Nilai pengalaman Anda</h3><div className="my-3 flex gap-2">{[1,2,3,4,5].map(value=><button key={value} onClick={()=>setRating(value)} aria-label={`${value} bintang`}><Star className={`h-8 w-8 ${value<=rating?"fill-amber-400 text-amber-400":"text-navy-200"}`}/></button>)}</div><textarea value={feedback} onChange={e=>setFeedback(e.target.value)} maxLength={500} placeholder="Catatan untuk pelayanan (opsional)" className="w-full rounded-xl border border-blue-100 p-3 text-sm outline-none focus:border-blue-500"/><p className="mt-3 text-xs font-bold text-navy-600">Tip dari saldo</p><div className="mt-2 grid grid-cols-4 gap-2">{[0,5000,10000,20000].map(value=><button key={value} onClick={()=>setTip(value)} className={`rounded-xl py-2 text-xs font-bold ${tip===value?"bg-blue-600 text-white":"bg-white text-navy-700"}`}>{value?`${value/1000}rb`:"Tanpa"}</button>)}</div><button disabled={sending||!token} onClick={submitFeedback} className="mt-3 w-full rounded-xl bg-navy-950 py-3 font-bold text-white disabled:opacity-40">{!token?"Login untuk kirim ulasan & tip":sending?"Mengirim...":"Kirim ulasan"}</button>{!token&&<Link href="/login" className="mt-2 block text-center text-xs font-bold text-blue-700">Masuk ke akun</Link>}</div>}
          <div className="no-print mt-6 grid grid-cols-2 gap-3"><Link href="/menu" className="flex items-center justify-center gap-2 rounded-2xl bg-navy-100 py-3 font-semibold text-navy-800"><Home className="h-4 w-4"/>Menu</Link><button onClick={downloadReceipt} className="flex items-center justify-center gap-2 rounded-2xl bg-navy-950 py-3 font-semibold text-white"><Download className="h-4 w-4"/>Unduh struk</button></div>
          {(done||failed)&&<button onClick={orderAgain} className="no-print mt-3 w-full rounded-2xl bg-blue-600 py-3 font-bold text-white">Pesan lagi dari pesanan ini</button>}
        </div>
      </section>
    </div>
  </main>;
}
function Receipt({order,qrRef}:{order:TrackedOrder;qrRef:React.RefObject<HTMLCanvasElement|null>}){return <div id="receipt" className="receipt border-t border-dashed border-navy-200 pt-5 text-sm"><div className="mb-4 flex items-center gap-2"><ReceiptText className="h-5 w-5"/><h3 className="font-bold">Struk Digital #{String(order.order_number).padStart(3,"0")}</h3></div>{order.order_items.map(item=><div key={item.id} className="mb-2 flex justify-between gap-3"><span>{item.quantity}× {item.name_snapshot}{item.options_snapshot?.length?<small className="block text-xs text-slate-500">{item.options_snapshot.map(option=>option.option_name).join(", ")}</small>:null}</span><span>Rp {Number(item.subtotal).toLocaleString("id-ID")}</span></div>)}<div className="mt-3 space-y-1 border-t border-dashed border-navy-200 pt-3"><div className="flex justify-between"><span>Subtotal</span><span>Rp {Number(order.subtotal).toLocaleString("id-ID")}</span></div>{Number(order.promo_discount)>0&&<div className="flex justify-between font-bold text-blue-700"><span>Diskon promo</span><span>-Rp {Number(order.promo_discount).toLocaleString("id-ID")}</span></div>}<div className="flex justify-between"><span>Pajak</span><span>Rp {Number(order.tax_amount).toLocaleString("id-ID")}</span></div><div className="flex justify-between"><span>Service</span><span>Rp {Number(order.service_charge).toLocaleString("id-ID")}</span></div><div className="flex justify-between pt-2 text-base font-black"><span>Total</span><span>Rp {Number(order.total_amount).toLocaleString("id-ID")}</span></div></div>{order.promo?.claim_url&&<div className="mt-5 rounded-xl bg-blue-50 p-3 text-center"><p className="font-bold">{order.promo.name||"Promo spesial"}</p><p className="text-xs text-navy-500">{order.promo.description}</p><canvas ref={qrRef} className="mx-auto mt-2"/></div>}</div>}
