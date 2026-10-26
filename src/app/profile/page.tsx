"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Settings2, ShoppingBag, WalletCards, Gift, LifeBuoy, ShieldCheck, LogOut, LayoutDashboard, UserRound, ArrowUpRight } from "lucide-react";
import { useAuth, useRole } from "@/contexts/AuthContext";
import { useOrder } from "@/contexts/OrderContext";
export default function ProfilePage() {
  const { user: authUser, isLoading, logout } = useAuth();
  const user = isLoading ? null : authUser;
  const { isStaff } = useRole();
  const { order } = useOrder();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [activeOrders,setActiveOrders]=useState<Array<{id:string;order_number:number;status:string;payment_status:string}>>([]);
  const [activeError,setActiveError]=useState(false);
  useEffect(()=>{let cancelled=false;if(user?.role!=="user"){setActiveOrders([]);return;}fetch("/api/orders/history?active=1",{cache:"no-store"}).then(async response=>{if(!response.ok)throw Error();const result=await response.json();if(!cancelled){setActiveOrders(result.data||[]);setActiveError(false);}}).catch(()=>{if(!cancelled)setActiveError(true);});return()=>{cancelled=true;};},[user?.id,user?.role]);
  const help = `/help?store=${encodeURIComponent(order.storeId)}`;
  return <main className="consumer-page"><div className="consumer-container profile-container">
    <header className="consumer-heading profile-title"><div><h1>Profil</h1></div><Link href="/settings" className="icon-button" aria-label="Pengaturan"><Settings2 size={22}/></Link></header>
    <section className="identity-card"><div className="profile-avatar">{user ? (user.name || user.email || "U")[0].toUpperCase() : <UserRound size={32}/>}</div><div className="identity-copy"><span className="profile-status"><span/>{isLoading ? "Memuat akun" : user ? "Akun terhubung" : "Selamat datang"}</span><h2>{user?.name || "Selamat datang"}</h2><p>{user?.email || "Masuk untuk melihat pesanan, saldo, dan poin Anda."}</p></div>{!user && !isLoading && <Link href="/auth/login?redirect=/profile" className="action-primary">Masuk / daftar <ArrowUpRight size={17}/></Link>}</section>
    {activeOrders.length>0&&<section className="settings-group"><div className="section-heading"><h2>Pesanan aktif</h2></div>{activeOrders.slice(0,3).map(item=><Link className="settings-link" key={item.id} href={`/orders/${item.id}/waiting`}><span className="row-icon"><ShoppingBag/></span><span><strong>Pesanan #{item.order_number}</strong><small>{item.payment_status!=="paid"?"Menunggu pembayaran":item.status==="ready"?"Siap diambil":"Sedang disiapkan"}</small></span><ChevronRight size={18}/></Link>)}</section>}
    {activeError&&<p className="setting-note" role="status">Pesanan aktif belum dapat dimuat. <Link href="/orders" className="underline">Buka riwayat pesanan</Link></p>}
    <div className="profile-shortcuts"><Link href="/orders"><span><ShoppingBag/></span><strong>Pesanan</strong><small>Lihat riwayat</small></Link><Link href={user ? "/wallet" : "/auth/login?redirect=/wallet"}><span><WalletCards/></span><strong>Dompet</strong><small>Saldo & transaksi</small></Link><Link href={user ? "/rewards" : "/auth/login?redirect=/rewards"}><span><Gift/></span><strong>Reward</strong><small>Poin & hadiah</small></Link></div>
    <h2 className="group-label">AKUN & PREFERENSI</h2><section className="settings-group">
      <Link className="settings-link" href="/settings"><span className="row-icon"><Settings2/></span><span><strong>Pengaturan aplikasi</strong><small>Tampilan, aksesibilitas, dan notifikasi</small></span><ChevronRight size={18}/></Link>
      {user && <div className="settings-link"><span className="row-icon"><ShieldCheck/></span><span><strong>Informasi akun</strong><small className="capitalize">{user.role} · {user.email}</small></span></div>}
      {!isLoading && isStaff && <Link className="settings-link" href="/dashboard"><span className="row-icon"><LayoutDashboard/></span><span><strong>Dashboard toko</strong><small>Kelola operasional sesuai akses Anda</small></span><ChevronRight size={18}/></Link>}
    </section>
    <h2 className="group-label">BANTUAN & INFORMASI</h2><section className="settings-group"><Link className="settings-link" href={help}><span className="row-icon"><LifeBuoy/></span><span><strong>Pusat bantuan</strong><small>Pertanyaan, pesanan, dan pembayaran</small></span><ChevronRight size={18}/></Link><Link className="settings-link" href={`${help}#privacy`}><span className="row-icon"><ShieldCheck/></span><span><strong>Privasi & ketentuan</strong><small>Kenali cara data Anda digunakan</small></span><ChevronRight size={18}/></Link></section>
    {user && <section className="logout-section">{confirm ? <div className="settings-group settings-body"><strong>Keluar dari akun ini?</strong><p className="setting-note">Anda tetap dapat melihat menu sebagai tamu.</p><div className="button-row"><button disabled={busy} className="action-secondary" onClick={()=>setConfirm(false)}>Batal</button><button disabled={busy} className="action-danger" onClick={async()=>{setBusy(true);try{await logout();setConfirm(false);router.replace("/profile")}catch{setError("Belum berhasil keluar. Coba lagi.")}finally{setBusy(false)}}}>{busy ? "Memproses..." : "Ya, keluar"}</button></div>{error&&<p role="alert">{error}</p>}</div> : <button className="logout-button" onClick={()=>setConfirm(true)}><LogOut size={18}/>Keluar dari akun</button>}</section>}
    <p className="app-signature">SelfOrder </p>
  </div></main>;
}
