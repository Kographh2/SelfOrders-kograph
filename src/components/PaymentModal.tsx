"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, CheckCircle, CreditCard, Loader2, ShieldCheck, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { CartItem, CheckoutItem } from "@/types";

interface Props { isOpen:boolean; onClose:()=>void; storeId:string; tableNumber?:string; cartItems:CartItem[]; onOrderCreated?:(id:string,no:number,total:number)=>void; onPaymentComplete:(method?:string)=>void; customerName?:string; customerPhone?:string; customerEmail?:string; notes?:string }
const METHODS = [
  { id:"snap", name:"Midtrans Snap", description:"QRIS, e-wallet, transfer bank, atau kartu", Icon:CreditCard },
  { id:"cash", name:"Tunai di Kasir", description:"Tunjukkan barcode konfirmasi ke kasir", Icon:Banknote },
] as const;
type Method = (typeof METHODS)[number]["id"];

export default function PaymentModal(props:Props) {
  const { token, user } = useAuth();
  const [method,setMethod] = useState<Method|null>(null);
  const [processing,setProcessing] = useState(false);
  const snapLoaded = useRef(false);
  const total = props.cartItems.reduce((sum,item)=>sum+Number(item.price)*item.quantity,0);
  useEffect(()=>{
    if(!props.isOpen||snapLoaded.current||typeof window==="undefined") return;
    if(window.snap){ snapLoaded.current=true; return; }
    const script=document.createElement("script");
    script.src=process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION==="true"?"https://app.midtrans.com/snap/snap.js":"https://app.sandbox.midtrans.com/snap/snap.js";
    script.dataset.clientKey=process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY??""; script.async=true;
    script.onload=()=>{snapLoaded.current=true;}; document.head.appendChild(script);
  },[props.isOpen]);
  const createOrder=async()=>{
    const items:CheckoutItem[]=props.cartItems.map(item=>({menu_item_id:item.id,quantity:item.quantity,notes:item.notes}));
    const headers:Record<string,string>={"Content-Type":"application/json"}; if(token) headers.Authorization=`Bearer ${token}`;
    const response=await fetch("/api/orders",{method:"POST",headers,body:JSON.stringify({storeId:props.storeId,tableNumber:props.tableNumber||null,userId:user?.id||null,anonymousSessionId:localStorage.getItem("selforder_session_id"),customerName:props.customerName||null,customerPhone:props.customerPhone||null,customerEmail:props.customerEmail||null,notes:props.notes||null,items})});
    const result=await response.json(); if(!response.ok) throw new Error(result.error||"Gagal membuat pesanan");
    return {id:result.data.order_id as string,number:result.data.order_number as number,total:result.data.total_amount as number};
  };
  const openWaiting=(id:string)=>window.location.assign(`/orders/${id}/waiting`);
  const pay=async()=>{
    if(!method){toast.error("Pilih metode pembayaran");return;}
    setProcessing(true);
    try{
      const order=await createOrder(); props.onOrderCreated?.(order.id,order.number,order.total);
      if(method==="cash"){
        const response=await fetch("/api/payment/cash",{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({orderId:order.id,sessionId:localStorage.getItem("selforder_session_id")})});
        const result=await response.json(); if(!response.ok) throw new Error(result.error||"Gagal membuat pembayaran tunai");
        props.onPaymentComplete("cash"); openWaiting(order.id); return;
      }
      const response=await fetch("/api/payment/midtrans",{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({orderId:order.id,sessionId:localStorage.getItem("selforder_session_id")})});
      const result=await response.json(); if(!response.ok) throw new Error(result.error||"Gagal membuka Midtrans Snap");
      if(!window.snap) throw new Error("Midtrans Snap belum siap. Muat ulang halaman.");
      window.snap.pay(result.data.token,{onSuccess:()=>{props.onPaymentComplete("snap");openWaiting(order.id);},onPending:()=>{props.onPaymentComplete("snap");openWaiting(order.id);},onError:()=>openWaiting(order.id),onClose:()=>openWaiting(order.id)});
    }catch(error){toast.error(error instanceof Error?error.message:"Pembayaran gagal");setProcessing(false);}
  };
  return <AnimatePresence>{props.isOpen&&<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[110] flex items-end bg-navy-950/70 p-0 backdrop-blur-md sm:items-center sm:p-4">
    <motion.div initial={{y:80,opacity:0}} animate={{y:0,opacity:1}} className="mx-auto w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]">
      <div className="flex items-start justify-between bg-gradient-to-br from-navy-900 to-blue-900 p-6 text-white"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-blue-200">Checkout aman</p><h2 className="mt-1 text-2xl font-bold">Pilih pembayaran</h2></div><button onClick={props.onClose} className="rounded-full bg-white/10 p-2"><X className="h-5 w-5"/></button></div>
      <div className="space-y-5 p-5"><div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs text-blue-600">Estimasi total</p><p className="text-3xl font-extrabold text-navy-950">Rp {total.toLocaleString("id-ID")}</p><p className="mt-1 text-xs text-navy-400">Total final termasuk pajak dan service charge dihitung server.</p></div>
        <div className="space-y-3">{METHODS.map(({id,name,description,Icon})=><button key={id} onClick={()=>setMethod(id)} className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition ${method===id?"border-blue-600 bg-blue-50 shadow-md":"border-navy-100 hover:border-blue-300"}`}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-900 text-white"><Icon className="h-6 w-6"/></span><span className="flex-1"><b className="block text-navy-950">{name}</b><small className="text-navy-500">{description}</small></span>{method===id&&<CheckCircle className="h-5 w-5 text-blue-600"/>}</button>)}</div>
        <button disabled={!method||processing} onClick={pay} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 disabled:opacity-40">{processing?<Loader2 className="h-5 w-5 animate-spin"/>:<ShieldCheck className="h-5 w-5"/>}{processing?"Memproses...":"Lanjutkan pembayaran"}</button>
      </div>
    </motion.div>
  </motion.div>}</AnimatePresence>;
}
