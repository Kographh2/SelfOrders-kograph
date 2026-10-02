"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { BadgePercent, Banknote, CheckCircle, CreditCard, Loader2, ShieldCheck, WalletCards, UsersRound, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { loadMidtransSnap } from "@/lib/midtrans-client";
import type { CartItem, CheckoutItem, PromoClaim } from "@/types";

interface Props { isOpen:boolean; onClose:()=>void; storeId:string; tableNumber?:string; reservationToken?:string; orderType?:"dine_in"|"pickup"; pickupAt?:string; cartItems:CartItem[]; onOrderCreated?:(id:string,no:number,total:number)=>void; onPaymentComplete:(method?:string)=>void; customerName?:string; customerPhone?:string; customerEmail?:string; notes?:string }
const METHODS = [
  { id:"snap", name:"Midtrans Snap", description:"QRIS, e-wallet, transfer bank, atau kartu", Icon:CreditCard },
  { id:"wallet", name:"Saldo SelfOrder", description:"Bayar instan dari saldo akun", Icon:WalletCards },
  { id:"cash", name:"Tunai di Kasir", description:"Tunjukkan QR konfirmasi ke kasir", Icon:Banknote },
  { id:"split", name:"Split bill", description:"Bagi rata tagihan dan undang peserta membayar", Icon:UsersRound },
] as const;
type Method = (typeof METHODS)[number]["id"];

export default function PaymentModal(props:Props) {
  const { token, user } = useAuth();
  const [method,setMethod] = useState<Method|null>(null);
  const [processing,setProcessing] = useState(false);
  const [claims,setClaims] = useState<PromoClaim[]>([]);
  const [promoClaimId,setPromoClaimId] = useState("");
  const [promoCode,setPromoCode] = useState("");
  const [loyaltyCode,setLoyaltyCode] = useState("");
  const [loyaltyRedemptions,setLoyaltyRedemptions] = useState<Array<{id:string;code:string;reward?:{name:string;discount_amount:number}}>>([]);
  const [policyDocs,setPolicyDocs] = useState<Array<{document_type:string;title:string}>>([]);
  const [policyAccepted,setPolicyAccepted] = useState(false);
  const [splitCount,setSplitCount] = useState(2);
  const total = props.cartItems.reduce((sum,item)=>sum+(Number(item.price)+(item.selected_options??[]).reduce((n,option)=>n+option.price_delta,0))*item.quantity,0);
  useEffect(()=>{if(!props.isOpen)return;setPolicyAccepted(false);fetch(`/api/policies?storeId=${props.storeId}`,{cache:"no-store"}).then(r=>r.json()).then(r=>setPolicyDocs((r.data?.documents||[]).filter((doc:{document_type:string})=>["privacy","terms"].includes(doc.document_type)))).catch(()=>setPolicyDocs([]));if(!token){setClaims([]);setLoyaltyRedemptions([]);return}fetch(`/api/promos/wallet?storeId=${props.storeId}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json()).then(r=>setClaims(r.data||[])).catch(()=>{});fetch(`/api/loyalty?storeId=${props.storeId}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json()).then(r=>setLoyaltyRedemptions(r.data?.redemptions||[])).catch(()=>{})},[props.isOpen,props.storeId,token]);
  const redeemCode=async()=>{if(!token)return toast.error("Login terlebih dahulu untuk menukar kode");const response=await fetch('/api/promos/claim-code',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({storeId:props.storeId,code:promoCode})});const result=await response.json();if(!response.ok)return toast.error(result.error||'Kode tidak valid');const claim={...result.data,promo:result.data.promo} as PromoClaim;setClaims(prev=>[claim,...prev]);setPromoClaimId(claim.id);setPromoCode('');toast.success('Promo berhasil ditambahkan dan dipilih')};
  const createOrder=async()=>{
    if(policyDocs.length&&!policyAccepted)throw new Error("Setujui Kebijakan Privasi dan Syarat Penggunaan terlebih dahulu");
    const items:CheckoutItem[]=props.cartItems.map(item=>({menu_item_id:item.id,quantity:item.quantity,notes:item.notes,option_ids:item.option_ids??[]}));
    const headers:Record<string,string>={"Content-Type":"application/json"}; if(token) headers.Authorization=`Bearer ${token}`;
    const response=await fetch("/api/orders",{method:"POST",headers,body:JSON.stringify({storeId:props.storeId,tableNumber:props.tableNumber||null,reservationToken:props.reservationToken||null,orderType:props.orderType||"dine_in",pickupAt:props.pickupAt||null,userId:user?.id||null,anonymousSessionId:localStorage.getItem("selforder_session_id"),customerName:props.customerName||null,customerPhone:props.customerPhone||null,customerEmail:props.customerEmail||null,notes:props.notes||null,promoClaimId:loyaltyCode?null:(promoClaimId||null),loyaltyRedemptionCode:loyaltyCode||null,policyAccepted,items})});
    const result=await response.json(); if(!response.ok) throw new Error(result.error||"Gagal membuat pesanan");
    return {id:result.data.order_id as string,number:result.data.order_number as number,total:result.data.total_amount as number};
  };
  const openWaiting=(id:string)=>window.location.assign(`/orders/${id}/waiting`);
  const pay=async()=>{
    if(!method){toast.error("Pilih metode pembayaran");return;}
    if(method==="wallet"&&(!token||!user?.email)){toast.error("Login akun diperlukan untuk menggunakan saldo");return;}
    let snapOrderId: string | null = null;
    setProcessing(true);
    try{
      // Load Snap before creating an order so a slow SDK cannot leave behind
      // an unpaid order when the customer taps checkout immediately.
      const snapClient=method==="snap"?await loadMidtransSnap():null;
      const order=await createOrder(); snapOrderId=order.id; props.onOrderCreated?.(order.id,order.number,order.total);
      if(method==="split"){
        const response=await fetch(`/api/orders/${order.id}/split`,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({count:splitCount,mode:"equal",sessionId:localStorage.getItem("selforder_session_id")||""})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||"Gagal membuat split bill");
        localStorage.setItem("selforder_split_invite_url",result.data.url);await navigator.clipboard?.writeText(result.data.url).catch(()=>{});props.onPaymentComplete("split");openWaiting(order.id);return;
      }
      if(method==="cash"){
        const response=await fetch("/api/payment/cash",{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({orderId:order.id,sessionId:localStorage.getItem("selforder_session_id")})});
        const result=await response.json(); if(!response.ok) throw new Error(result.error||"Gagal membuat pembayaran tunai");
        props.onPaymentComplete("cash"); openWaiting(order.id); return;
      }
      if(method==="wallet"){
        if(!token) throw new Error("Login diperlukan untuk menggunakan saldo");
        const response=await fetch("/api/payment/wallet",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({orderId:order.id})});
        const result=await response.json(); if(!response.ok) throw new Error(result.error||"Pembayaran saldo gagal");
        props.onPaymentComplete("wallet"); openWaiting(order.id); return;
      }
      const response=await fetch("/api/payment/midtrans",{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({orderId:order.id,sessionId:localStorage.getItem("selforder_session_id")})});
      const result=await response.json(); if(!response.ok) throw new Error(result.error||"Gagal membuka Midtrans Snap");
      if(!snapClient) throw new Error("Midtrans Snap belum siap");
      const finishUrl = `/payment/finish?orderId=${encodeURIComponent(order.id)}`;
      sessionStorage.setItem("selforder_pending_snap_order", order.id);
      let returned = false;
      const returnToWaiting = () => {
        if (returned) return;
        returned = true;
        sessionStorage.removeItem("selforder_pending_snap_order");
        props.onPaymentComplete("snap");
        window.location.assign(finishUrl);
      };
      snapClient.pay(result.data.token,{onSuccess:returnToWaiting,onPending:returnToWaiting,onError:returnToWaiting,onClose:returnToWaiting});
    }catch(error){
      if (method === "snap" && snapOrderId) {
        sessionStorage.setItem("selforder_pending_snap_order", snapOrderId);
        openWaiting(snapOrderId);
        return;
      }
      toast.error(error instanceof Error?error.message:"Pembayaran gagal");setProcessing(false);
    }
  };
  return <AnimatePresence>{props.isOpen&&<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[110] flex items-end bg-navy-950/70 p-0 backdrop-blur-md sm:items-center sm:p-4">
    <motion.div initial={{y:80,opacity:0}} animate={{y:0,opacity:1}} className="mx-auto w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]">
      <div className="flex items-start justify-between bg-gradient-to-br from-navy-900 to-blue-900 p-6 text-white"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-blue-200">Checkout aman</p><h2 className="mt-1 text-2xl font-bold">Pilih pembayaran</h2></div><button onClick={props.onClose} className="rounded-full bg-white/10 p-2"><X className="h-5 w-5"/></button></div>
      <div className="space-y-5 p-5"><div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs text-blue-600">Estimasi total</p><p className="text-3xl font-extrabold text-navy-950">Rp {total.toLocaleString("id-ID")}</p><p className="mt-1 text-xs text-navy-400">Total final termasuk pajak dan service charge dihitung server.</p></div>
        <div><p className="mb-2 flex items-center gap-2 text-sm font-bold text-navy-900"><BadgePercent className="h-4 w-4 text-blue-600"/>Promo</p><div className="mb-2 flex gap-2"><input value={promoCode} onChange={e=>setPromoCode(e.target.value.toUpperCase())} placeholder="Masukkan kode promo" className="min-w-0 flex-1 rounded-xl border-2 border-blue-100 px-3 py-2 text-sm font-bold uppercase text-navy-900 outline-none focus:border-blue-500"/><button type="button" onClick={redeemCode} className="rounded-xl bg-navy-950 px-4 text-xs font-bold text-white">Tukar</button></div>{claims.length>0&&<select value={promoClaimId} onChange={e=>{setPromoClaimId(e.target.value);if(e.target.value)setLoyaltyCode("")}} className="w-full rounded-2xl border-2 border-blue-100 bg-white p-3 text-sm font-semibold text-navy-900 outline-none focus:border-blue-500"><option value="">Tanpa promo</option>{claims.map(claim=><option key={claim.id} value={claim.id}>{claim.promo.code} — {claim.promo.name} ({claim.promo.discount_type==='percent'?`${claim.promo.discount_value}%`:`Rp ${Number(claim.promo.discount_value).toLocaleString('id-ID')}`})</option>)}</select>}<p className="mt-1 text-[11px] text-slate-400">Claim membutuhkan login. Diskon final diverifikasi otomatis oleh server.</p></div>
        {token&&<div><p className="mb-2 text-sm font-bold text-navy-900">Reward poin</p><input value={loyaltyCode} onChange={e=>{setLoyaltyCode(e.target.value.toUpperCase());if(e.target.value)setPromoClaimId("")}} list="loyalty-voucher-codes" placeholder="Masukkan kode reward" className="w-full rounded-xl border-2 border-blue-100 px-3 py-2 text-sm font-bold uppercase text-navy-900 outline-none focus:border-blue-500"/><datalist id="loyalty-voucher-codes">{loyaltyRedemptions.map(item=><option key={item.id} value={item.code}>{item.reward?.name}</option>)}</datalist><p className="mt-1 text-[11px] text-slate-400">Reward poin tidak dapat digabung dengan kode promo.</p></div>}
        <div className="space-y-3">{METHODS.map(({id,name,description,Icon})=><button key={id} onClick={()=>setMethod(id)} className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition ${method===id?"border-blue-600 bg-blue-50 shadow-md":"border-navy-100 hover:border-blue-300"}`}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-900 text-white"><Icon className="h-6 w-6"/></span><span className="flex-1"><b className="block text-navy-950">{name}</b><small className="text-navy-500">{description}</small></span>{method===id&&<CheckCircle className="h-5 w-5 text-blue-600"/>}</button>)}</div>
        {method==="split"&&<label className="block text-sm font-semibold">Jumlah peserta<select value={splitCount} onChange={event=>setSplitCount(Number(event.target.value))} className="mt-1 w-full rounded-xl border p-3">{[2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n} orang</option>)}</select></label>}
        {policyDocs.length>0&&<label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><input type="checkbox" checked={policyAccepted} onChange={e=>setPolicyAccepted(e.target.checked)} className="mt-0.5"/><span>Saya menyetujui {policyDocs.map((doc,index)=><span key={doc.document_type}>{index>0?" dan ":""}<Link href={`/help?store=${encodeURIComponent(props.storeId)}#${doc.document_type}`} target="_blank" className="font-bold text-blue-700 underline">{doc.document_type==="privacy"?"Kebijakan Privasi":"Syarat Penggunaan"}</Link></span>)}. Persetujuan dan versi dokumen dicatat saat pesanan dibuat.</span></label>}
        <button disabled={!method||processing||(policyDocs.length>0&&!policyAccepted)} onClick={pay} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 disabled:opacity-40">{processing?<Loader2 className="h-5 w-5 animate-spin"/>:<ShieldCheck className="h-5 w-5"/>}{processing?"Memproses...":"Lanjutkan pembayaran"}</button>
      </div>
    </motion.div>
  </motion.div>}</AnimatePresence>;
}
