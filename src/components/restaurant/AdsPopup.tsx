"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, Sparkles, X } from "lucide-react";
import { useSheet } from "@/hooks/useSheet";
import { usePreferences } from "@/contexts/PreferencesContext";
import { dismissedAdKey, safeAdUrl, type RestaurantAd } from "@/lib/restaurant-ads";

const STORAGE = "selforder_hidden_ads_v1";
export default function AdsPopup({ storeId, blocked, onDone }: { storeId: string; blocked: boolean; onDone: () => void }) {
  const [ads, setAds] = useState<RestaurantAd[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hiddenTab, setHiddenTab] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [storageError, setStorageError] = useState(false);
  const done = useRef(onDone); done.current = onDone;
  const hiddenRef = useRef(hidden); hiddenRef.current = hidden;
  const { preferences } = usePreferences();
  const systemReduced = useReducedMotion();
  const reduced = preferences.reduceMotion || systemReduced;
  const close = useCallback(() => { setOpen(false); done.current(); }, []);
  const sheet = useSheet(open && !blocked, close);
  const ad = ads[index];

  useEffect(() => {
    const controller = new AbortController();
    let ignored = false;
    let saved = new Set<string>();
    try {
      const values: unknown = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      if (Array.isArray(values)) saved = new Set(values.filter((value): value is string => typeof value === "string"));
    } catch { /* Storage is optional; keep ordering available. */ }
    setHidden(saved); hiddenRef.current = saved;
    const timeout = setTimeout(() => controller.abort(), 7000);
    void fetch(`/api/ads?storeId=${encodeURIComponent(storeId)}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(result => {
        if (ignored) return;
        const rows: RestaurantAd[] = Array.isArray(result.data) ? result.data.filter((row: RestaurantAd) => row?.store_id === storeId && row.is_active && !saved.has(dismissedAdKey(row))) : [];
        // Treat public content as untrusted, even if the API already validated it.
        const safe = rows.filter(row => { try { safeAdUrl(row.link_url); safeAdUrl(row.image_url, true); return typeof row.title === "string"; } catch { return false; } });
        setAds(safe); setIndex(0);
        if (safe.length) setOpen(true); else done.current();
      })
      .catch(() => { if (!ignored) done.current(); })
      .finally(() => clearTimeout(timeout));
    return () => { ignored = true; controller.abort(); clearTimeout(timeout); };
  }, [storeId]);

  const step = useCallback((direction: number) => {
    for (let n = 1; n <= ads.length; n++) {
      const candidate = (index + n * direction + ads.length) % ads.length;
      if (!hiddenRef.current.has(dismissedAdKey(ads[candidate]))) { setIndex(candidate); return; }
    }
    close();
  }, [ads, index, close]);
  useEffect(() => {
    const changed = () => setHiddenTab(document.hidden);
    changed(); document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (!open || blocked || paused || hiddenTab || !ad) return;
    const timer = setInterval(() => step(1), 5000);
    return () => clearInterval(timer);
  }, [open, blocked, paused, hiddenTab, ad, step, hidden]);

  const hide = (checked: boolean) => {
    const next = new Set(hiddenRef.current);
    if (checked) next.add(dismissedAdKey(ad)); else next.delete(dismissedAdKey(ad));
    hiddenRef.current = next; setHidden(next);
    try { localStorage.setItem(STORAGE, JSON.stringify([...next])); setStorageError(false); }
    catch { setStorageError(true); }
  };
  if (!open || blocked || !ad) return null;
  const optedOut = hidden.has(dismissedAdKey(ad));
  return <div className="ads-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Penawaran restoran" className="ads-popup">
      <div className="ads-topline"><span><Sparkles size={15}/> PILIHAN & PENAWARAN</span><button aria-label="Tutup iklan" onClick={close}><X size={21}/></button></div>
      <div className="ads-stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.article key={ad.id} data-ad-id={ad.id} initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : -16 }} transition={{ duration: reduced ? 0 : .25 }}>
            {ad.image_url ? <div className="ads-image"><img src={ad.image_url} alt="" onError={event => { event.currentTarget.style.display = "none"; }}/></div> : <div className="ads-art"><Sparkles size={48}/><span>Something special<br/>for your table.</span></div>}
            <div className="ads-copy"><p className="restaurant-eyebrow">KHUSUS UNTUK ANDA</p><h2>{ad.title}</h2>{ad.description && <p>{ad.description}</p>}{ad.link_url && <Link className="restaurant-button" href={ad.link_url} onClick={close}>{ad.link_label}<ArrowUpRight size={17}/></Link>}</div>
          </motion.article>
        </AnimatePresence>
      </div>
      <div className="ads-controls"><span>{index + 1} / {ads.length}</span><div><button aria-label="Iklan sebelumnya" disabled={ads.length < 2} onClick={() => step(-1)}><ChevronLeft size={19}/></button><button aria-label={paused ? "Lanjutkan iklan" : "Jeda iklan"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label="Iklan berikutnya" disabled={ads.length < 2} onClick={() => step(1)}><ChevronRight size={19}/></button></div><span>{paused ? "Dijeda" : "Ganti tiap 5 dtk"}</span></div>
      <label className="ads-optout"><input type="checkbox" checked={optedOut} onChange={event => hide(event.target.checked)}/><span>Jangan tampilkan iklan ini lagi<small>Berlaku untuk iklan ini di browser Anda.</small></span></label>
      {storageError && <p className="ads-storage-note" role="status">Browser tidak mengizinkan penyimpanan. Pilihan ini berlaku selama halaman terbuka.</p>}
    </section>
  </div>;
}
