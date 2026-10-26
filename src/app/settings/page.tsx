"use client";
import { useEffect, useState } from "react";
import AccountSessions from "@/components/AccountSessions";
import Link from "next/link";
import { ArrowLeft, Bell, Sun, Moon, Monitor, ChevronRight, ShieldCheck, LifeBuoy } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useOrder } from "@/contexts/OrderContext";
import { useAuth } from "@/contexts/AuthContext";
import { enablePush, disablePush, showTestNotification } from "@/lib/push-client";
function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: () => void }) {
  return <div className="settings-row"><span><strong>{label}</strong><small>{description}</small></span><button type="button" className="preference-switch" role="switch" aria-label={label} aria-checked={checked} onClick={onChange}><span/></button></div>;
}
export default function SettingsPage() {
  const { preferences, update } = usePreferences();
  const { order } = useOrder();
  const { user } = useAuth();
  const [supported, setSupported] = useState(false), [permission, setPermission] = useState<NotificationPermission>("default"), [subscribed, setSubscribed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    const available = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(available);
    if (!available) return;
    const refresh = () => { setPermission(Notification.permission); void navigator.serviceWorker.getRegistration().then(async registration => setSubscribed(Boolean(await registration?.pushManager.getSubscription()))).catch(()=>{}); };
    refresh(); window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh);
  }, []);
  const notificationAction = async (action: "enable" | "disable" | "test") => {
    setBusy(true); setMessage("");
    try {
      if (action === "enable") await enablePush({ userId: user?.id, storeId: order.storeId });
      else if (action === "disable") await disablePush();
      else await showTestNotification();
      const registration = await navigator.serviceWorker.getRegistration();
      const active = Boolean(await registration?.pushManager.getSubscription());
      setSubscribed(active); setPermission(Notification.permission);
      setMessage(action === "disable" ? "Notifikasi pesanan dinonaktifkan untuk perangkat ini." : action === "test" ? "Notifikasi tes dikirim." : active ? "Notifikasi pesanan aktif." : "Izin diberikan, tetapi layanan notifikasi pesanan belum tersedia.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pengaturan belum berhasil diubah."); }
    finally { setBusy(false); if ("Notification" in window) setPermission(Notification.permission); }
  };
  const help=`/help?store=${encodeURIComponent(order.storeId)}`;
  return <main className="consumer-page"><div className="consumer-container profile-container"><Link href="/profile" className="subtle-link"><ArrowLeft size={18}/>Profil</Link><header className="consumer-heading"><h1>Pengaturan</h1><p>Preferensi tersimpan di browser perangkat ini.</p></header>
    <h2 className="group-label">TAMPILAN</h2><section className="settings-group settings-body"><h3 className="setting-title">Tema aplikasi</h3><div className="theme-options">{([{ value:"light", label:"Terang", Icon:Sun },{ value:"dark", label:"Gelap", Icon:Moon },{ value:"system", label:"Sistem", Icon:Monitor }] as const).map(({ value,label,Icon })=><button key={value} aria-pressed={preferences.theme===value} onClick={()=>update({theme:value})}><Icon size={22}/><span>{label}</span></button>)}</div></section>
    <section className="settings-group"><Toggle label="Kurangi animasi" description="Perpindahan lebih tenang tanpa gerakan pegas." checked={preferences.reduceMotion} onChange={()=>update({reduceMotion:!preferences.reduceMotion})}/><Toggle label="Kurangi transparansi" description="Navbar lebih solid agar mudah dibaca." checked={preferences.solidGlass} onChange={()=>update({solidGlass:!preferences.solidGlass})}/></section>
    <h2 className="group-label">MENU & BAHASA</h2><section className="settings-group"><label className="settings-row"><span><strong>Bahasa konten menu</strong><small>Nama dan deskripsi mengikuti terjemahan toko.</small></span><select aria-label="Bahasa konten menu" value={preferences.menuLanguage} onChange={event=>update({menuLanguage:event.target.value as "id"|"en"})}><option value="id">Indonesia</option><option value="en">English</option></select></label></section>
    <h2 className="group-label">NOTIFIKASI</h2><section className="settings-group settings-body"><div className="notification-heading"><span className="row-icon"><Bell/></span><div><h3 className="setting-title">Update pesanan</h3><p className="setting-note">{!supported ? "Browser ini belum mendukung push notification." : permission==="denied" ? "Izin diblokir. Aktifkan melalui pengaturan situs di browser." : subscribed ? "Aktif pada perangkat ini." : "Terima kabar saat pesanan Anda siap."}</p></div></div><div className="button-row"><button disabled={busy||!supported||permission==="denied"} className="action-primary" onClick={()=>void notificationAction(subscribed?"disable":"enable")}>{busy ? "Memproses..." : subscribed ? "Nonaktifkan" : "Aktifkan notifikasi"}</button>{permission==="granted"&&<button disabled={busy} className="action-secondary" onClick={()=>void notificationAction("test")}>Kirim tes</button>}</div>{message&&<p role="status" className="setting-note">{message}</p>}</section>
    <AccountSessions/>
    <h2 className="group-label">TENTANG SELFORDER</h2><section className="settings-group"><Link href={help} className="settings-link"><span className="row-icon"><LifeBuoy/></span><span><strong>Bantuan & FAQ</strong></span><ChevronRight size={18}/></Link><Link href={`${help}#privacy`} className="settings-link"><span className="row-icon"><ShieldCheck/></span><span><strong>Kebijakan privasi</strong></span><ChevronRight size={18}/></Link><Link href={`${help}#terms`} className="settings-link"><span className="row-icon"><ShieldCheck/></span><span><strong>Syarat penggunaan</strong></span><ChevronRight size={18}/></Link></section>
  </div></main>;
}
