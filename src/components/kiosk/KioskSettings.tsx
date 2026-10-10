"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, MapPin, Monitor, RefreshCw, Save, Store } from "lucide-react";
import { getAuthHeaders } from "@/contexts/AuthContext";
import styles from "./settings.module.css";

type Branch = { id: string; name: string; address: string; logo: string | null; is_active: boolean };
type Station = { store_id: string; is_enabled: boolean; is_default: boolean };
type Settings = { stores: Branch[]; stations: Station[]; baseUrl: string };

export default function KioskSettings({ token }: { token: string | null }) {
  const [data, setData] = useState<Settings | null>(null);
  const [selected, setSelected] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [isDefault, setDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/kiosk/settings", { headers: getAuthHeaders(token), cache: "no-store", signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result.data);
      return result.data as Settings;
    } catch (e) { setError(e instanceof Error ? e.message : "Pengaturan belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  function choose(id: string, settings = data) {
    const station = settings?.stations.find(s => s.store_id === id);
    setSelected(id); setEnabled(station?.is_enabled ?? true);
    setDefault(station?.is_default ?? !settings?.stations.some(s => s.is_default));
    setMessage(""); setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/kiosk/settings", { method: "PUT", headers: { ...getAuthHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify({ storeId: selected, enabled, isDefault }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const refreshed = await load();
      if (refreshed) { choose(selected, refreshed); setMessage("Tersimpan. Muat ulang layar KIOSK untuk menggunakan pengaturan terbaru."); }
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal menyimpan. Coba kembali."); }
    finally { setSaving(false); }
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(url); }
    catch { setError("Tautan belum dapat disalin. Gunakan tautan Buka KIOSK."); }
  }
  const branch = data?.stores.find(s => s.id === selected);
  const defaultStation = data?.stations.find(s => s.is_default);
  const defaultBranch = data?.stores.find(s => s.id === defaultStation?.store_id);
  const url = (id: string) => `${data!.baseUrl}?station=${encodeURIComponent(id)}`;

  return <section className={styles.settings} aria-label="Pengaturan KIOSK">
    <div className={styles.hero}><div className={styles.heroIcon}><Monitor size={30} /></div><div><span className={styles.eyebrow}>PENGALAMAN DI TOKO</span><h2>Konter mandiri, siap melayani.</h2><p>Hubungkan KIOSK ke cabang Anda. Menu, harga, logo, dan nama toko mengikuti data cabang secara otomatis.</p></div></div>
    {error && <div className={styles.error} role="alert">{error}<button type="button" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={16} />Muat ulang</button></div>}
    {message && <div className={styles.success} role="status"><Check size={18} />{message}</div>}
    {loading && !data ? <div className={styles.skeleton} aria-busy="true" aria-label="Memuat pengaturan KIOSK"><Loader2 className="animate-spin" />Memuat cabang Anda…</div> : data && <>
      <div className={styles.summary}><span className={styles.statusDot} /><div><strong>{defaultBranch ? `Cabang utama: ${defaultBranch.name}` : "Belum ada cabang utama"}</strong><p>{defaultBranch ? "Pengunjung tanpa tautan cabang akan diarahkan ke toko ini." : "Pilih cabang utama agar halaman depan KIOSK dapat menerima pelanggan."}</p></div></div>
      {!data.stores.length ? <div className={styles.card}><Store size={32} /><h3>Tambahkan toko terlebih dahulu</h3><p>Setelah toko dibuat, Anda bisa mengaktifkan KIOSK di sini.</p><a href="/dashboard/stores">Kelola toko <ExternalLink size={16} /></a></div> : <div className={styles.grid}>
        <form className={styles.card} onSubmit={save}><span className={styles.eyebrow}>01 / KONFIGURASI</span><h3>Pilih cabang KIOSK</h3><label htmlFor="kiosk-branch">Toko / cabang</label><select id="kiosk-branch" value={selected} disabled={saving || loading} required onChange={e => choose(e.target.value)}><option value="">Pilih toko Anda</option>{data.stores.map(store => <option key={store.id} value={store.id}>{store.name}{store.is_active ? "" : " (toko nonaktif)"}</option>)}</select>
          {branch && <p className={styles.address}><MapPin size={16} />{branch.address || branch.name}</p>}
          <label className={styles.toggle}><span><strong>Terima pesanan KIOSK</strong><small>Aktifkan untuk pelanggan di cabang ini.</small></span><input type="checkbox" checked={enabled} disabled={!selected || saving || !branch?.is_active} onChange={e => { setEnabled(e.target.checked); if (!e.target.checked) setDefault(false); }} /></label>
          <label className={styles.toggle}><span><strong>Jadikan cabang utama</strong><small>Digunakan saat URL dibuka tanpa pilihan cabang.</small></span><input type="checkbox" checked={isDefault} disabled={!selected || !enabled || saving || !branch?.is_active} onChange={e => setDefault(e.target.checked)} /></label>
          {selected && !branch?.is_active && <p className={styles.note}>Toko ini nonaktif. Aktifkan toko di manajemen cabang sebelum menerima pesanan.</p>}
          <button className={styles.primary} disabled={!selected || saving || loading || (enabled && !branch?.is_active)}>{saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}{saving ? "Menyimpan…" : "Simpan pengaturan"}</button><p className={styles.note}>Perubahan langsung tersimpan. Pembayaran pesanan yang sudah dibuat tetap dapat diselesaikan saat KIOSK dinonaktifkan.</p>
        </form>
        <div className={styles.card}><span className={styles.eyebrow}>02 / TAMPILAN PELANGGAN</span><div className={styles.preview}><span className={styles.monogram}>{(branch?.name || "T").slice(0, 1).toUpperCase()}</span><span>SELF-ORDER KIOSK</span><h3>{branch?.name || "Nama toko Anda"}</h3><p>Menu favorit, disiapkan untuk Anda.</p><div><span>Makan di sini</span><span>Bawa pulang</span></div></div><p className={styles.note}>Nama dan logo asli mengikuti manajemen toko. Tidak perlu mengisi merek KIOSK secara terpisah.</p></div>
      </div>}
      <div className={styles.stationHeader}><div><span className={styles.eyebrow}>PERANGKAT RESTORAN</span><h3>KIOSK cabang Anda</h3></div><span>{data.stations.filter(s => s.is_enabled).length} aktif</span></div>
      {!data.stations.length ? <div className={styles.empty}><Monitor size={28} /><p>Belum ada KIOSK tersimpan. Pilih cabang dan simpan pengaturan pertama Anda.</p></div> : <div className={styles.stationList}>{data.stations.map(station => {
        const store = data.stores.find(s => s.id === station.store_id);
        const href = url(station.store_id);
        return <article className={styles.station} key={station.store_id}><div className={styles.stationInfo}><Monitor size={22} /><div><h4>{store?.name || "Cabang tidak tersedia"}</h4><p>{station.is_enabled && store?.is_active ? "Aktif" : "Nonaktif"}{station.is_default ? " · Cabang utama" : ""}</p></div></div><div className={styles.actions}><button disabled={saving || loading} onClick={() => choose(station.store_id)}>Atur</button>{station.is_enabled && store?.is_active && <><button aria-label={`Salin tautan ${store.name}`} onClick={() => void copy(href)}>{copied === href ? <Check size={17} /> : <Copy size={17} />}{copied === href ? "Tersalin" : "Salin"}</button><a href={href} target="_blank" rel="noopener noreferrer">Buka KIOSK <ExternalLink size={16} /></a></>}</div></article>;
      })}</div>}
    </>}
  </section>;
}
