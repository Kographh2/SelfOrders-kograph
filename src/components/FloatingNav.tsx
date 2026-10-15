"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Home, Search, ShoppingBag, UserRound, ScanLine } from "lucide-react";
import { useOrder } from "@/contexts/OrderContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import QRScannerModal from "@/components/QRScannerModal";

const tabs = [
  { href: "/menu", label: "Menu", Icon: Home },
  { href: "/search", label: "Cari", Icon: Search },
  { href: "/cart", label: "Keranjang", Icon: ShoppingBag },
  { href: "/profile", label: "Profil", Icon: UserRound },
];
export default function FloatingNav() {
  const pathname = usePathname(), router = useRouter();
  const { cart } = useOrder();
  const { preferences } = usePreferences();
  const systemReduced = useReducedMotion();
  const reduced = systemReduced || preferences.reduceMotion;
  const [preview, setPreview] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const gesture = useRef<{ start: number; moved: boolean; index: number } | null>(null);
  const suppressClick = useRef(false);
  const track = useRef<HTMLDivElement>(null);
  const active = pathname === "/settings" ? 3 : Math.max(0, tabs.findIndex(tab => tab.href === pathname));
  const visible = ["/menu", "/search", "/cart", "/profile", "/settings"].includes(pathname);
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  const indexAt = (x: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(3, Math.floor((x - rect.left) / (rect.width / 4))));
  };
  if (!visible) return null;
  return <>
    <nav className="consumer-dock" aria-label="Navigasi utama">
      <div ref={track} className={`glass-tabbar liquid-glass ${preview !== null ? "is-dragging" : ""}`}
        onPointerDown={event => {
          if (event.button !== 0) return;
          suppressClick.current = false;
          gesture.current = { start: event.clientX, moved: false, index: indexAt(event.clientX) };
        }}
        onPointerMove={event => {
          const current = gesture.current;
          if (!current) return;
          if (Math.abs(event.clientX - current.start) > 8) {
            if (!current.moved) event.currentTarget.setPointerCapture(event.pointerId);
            current.moved = true; current.index = indexAt(event.clientX);
            const rect = track.current!.getBoundingClientRect();
            setPreview(Math.max(0, Math.min(3, (event.clientX - rect.left) / (rect.width / 4) - .5)));
          }
        }}
        onPointerUp={event => {
          const current = gesture.current;
          if (current?.moved) { suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 100); router.push(tabs[current.index].href); }
          gesture.current = null; setPreview(null);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { gesture.current = null; setPreview(null); }}
        onLostPointerCapture={() => { gesture.current = null; setPreview(null); }}
        onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
        <motion.div className="glass-lens" aria-hidden="true" initial={false}
          animate={{ x: `${(preview ?? active) * 100}%`, scale: preview !== null && !reduced ? 1.045 : 1 }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34, mass: .8 }}/>
        {tabs.map(({ href, label, Icon }, index) => <Link key={href} href={href} aria-current={active === index ? "page" : undefined} aria-label={href === "/cart" ? `Keranjang, ${count} item` : label} className={`glass-tab ${active === index ? "is-active" : ""}`}>
          <span className="tab-icon"><Icon size={22} strokeWidth={active === index ? 2.2 : 1.7}/>{href === "/cart" && count > 0 && <span className="tab-badge">{count > 99 ? "99+" : count}</span>}</span><span>{label}</span>
        </Link>)}
      </div>
      <button className="dock-scan-button liquid-glass" onClick={() => setScanning(true)} aria-label="Scan QR meja"><ScanLine size={23}/></button>
    </nav>
    <QRScannerModal open={scanning} onClose={() => setScanning(false)}/>
  </>;
}
