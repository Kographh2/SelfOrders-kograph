"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Plus, Pencil, X, ImagePlus } from "lucide-react";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";
import type { RestaurantAd } from "@/lib/restaurant-ads";
import { useSheet } from "@/hooks/useSheet";

const empty = { title: "", description: "", imageUrl: "", linkUrl: "", linkLabel: "Lihat penawaran", isActive: false, displayOrder: 0 };
export default function AdsPage() {
  const { token, user } = useAuth();
  const allowed = user?.role === "owner" || user?.role === "admin";
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [storeId, setStoreId] = useState("");
  const [ads, setAds] = useState<RestaurantAd[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [open, setOpen] = useState(false), [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty), [saving, setSaving] = useState(false), [uploading, setUploading] = useState(false);
  const sheet = useSheet(open, () => { if (!saving && !uploading) setOpen(false); });
  const load = useCallback(async (id: string, signal?: AbortSignal) => {
    if (!id || !token) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/ads?storeId=${encodeURIComponent(id)}&manage=1`, { headers: getAuthHeaders(token), signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Iklan gagal dimuat");
      if (!signal?.aborted) setAds(result.data);
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "Iklan gagal dimuat"); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [token]);
  useEffect(() => {
    if (!token || !allowed) return;
    const controller = new AbortController();
    void fetch("/api/stores", { headers: getAuthHeaders(token), signal: controller.signal }).then(async response => { if (!response.ok) throw new Error("Cabang gagal dimuat"); return response.json(); }).then(result => { setStores(result.data ?? []); setStoreId(user?.store_id || result.data?.[0]?.id || ""); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [token, allowed, user?.store_id]);
  useEffect(() => { const controller = new AbortController(); setAds([]); void load(storeId, controller.signal); return () => controller.abort(); }, [storeId, load]);
  const start = (ad?: RestaurantAd) => {
    setError(""); setEditId(ad?.id ?? null);
    setForm(ad ? { title: ad.title, description: ad.description, imageUrl: ad.image_url ?? "", linkUrl: ad.link_url ?? "", linkLabel: ad.link_label, isActive: ad.is_active, displayOrder: ad.display_order } : { ...empty });
    setOpen(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/ads", { method: editId ? "PATCH" : "POST", headers: { ...getAuthHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify({ ...form, storeId, ...(editId ? { id: editId } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Iklan gagal disimpan");
      setOpen(false); await load(storeId);
    } catch (error) { setError(error instanceof Error ? error.message : "Gagal menyimpan"); }
    finally { setSaving(false); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Pilih JPG, PNG, atau WebP maksimal 5 MB"); return; }
    setUploading(true); setError("");
    try {
      const data = new FormData(); data.set("file", file); data.set("storeId", storeId);
      const response = await fetch("/api/uploads/menu-image", { method: "POST", headers: getAuthHeaders(token), body: data });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setForm(current => ({ ...current, imageUrl: result.data.url }));
    } catch (error) { setError(error instanceof Error ? error.message : "Upload gagal"); }
    finally { setUploading(false); }
  };
  if (!allowed) return <main className="p-6">Iklan hanya dapat dikelola owner atau admin cabang.</main>;
  return <main className="p-5 lg:p-10"><div className="mx-auto max-w-5xl"><header className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><h1 className="flex items-center gap-3 text-3xl font-bold"><Megaphone/>Iklan & Penawaran</h1><p className="mt-2 text-sm text-navy-500">Satu popup, rotasi 5 detik. Kelola materi untuk setiap cabang.</p></div><button className="btn-primary" disabled={!storeId || loading} onClick={() => start()}><Plus size={18}/>Buat iklan</button></header>
    <label className="label-field">Cabang<select aria-label="Cabang iklan" value={storeId} onChange={event => setStoreId(event.target.value)} className="input-field mt-2 block w-full">{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
    {error && !open && <div role="alert" className="my-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<button className="ml-3 underline" onClick={() => void load(storeId)}>Coba lagi</button></div>}
    <p className="my-5 text-sm text-navy-500">Centang pelanggan berlaku per ID iklan. Mengedit iklan lama tetap menghormati pilihan tersebut; gunakan “Buat iklan” untuk kampanye baru.</p>
    {loading ? <p role="status">Memuat iklan...</p> : ads.length === 0 && !error ? <div className="card py-14 text-center"><Megaphone className="mx-auto mb-4"/><h2 className="text-xl font-bold">Belum ada iklan</h2><p className="mt-2 text-sm text-navy-500">Tambahkan penawaran atau perkenalkan menu unggulan restoran.</p></div> : <div className="grid gap-5 md:grid-cols-2">{ads.map(ad => <article key={ad.id} className="card overflow-hidden p-0">{ad.image_url && <img className="aspect-[16/9] w-full object-cover" src={ad.image_url} alt=""/>}<div className="p-5"><div className="mb-3 flex items-center justify-between"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${ad.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{ad.is_active ? "Aktif" : "Nonaktif"}</span><span className="text-xs text-navy-500">Urutan {ad.display_order}</span></div><h2 className="text-xl font-bold">{ad.title}</h2><p className="mt-2 text-sm text-navy-500">{ad.description}</p><button onClick={() => start(ad)} className="action-secondary mt-5"><Pencil size={16}/>Edit & atur status</button></div></article>)}</div>}
    {open && <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/50 p-3"><section ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-label={editId ? "Edit iklan" : "Buat iklan"} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-bold">{editId ? "Edit iklan" : "Buat iklan"}</h2><button aria-label="Tutup editor iklan" disabled={saving || uploading} onClick={() => setOpen(false)} className="icon-button"><X size={20}/></button></div><form onSubmit={save} className="space-y-4">
      <label className="label-field">Judul<input required maxLength={100} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className="input-field mt-2 w-full"/></label>
      <label className="label-field">Deskripsi<textarea maxLength={500} rows={3} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="input-field mt-2 w-full"/></label>
      <label className="label-field">URL gambar (opsional)<input value={form.imageUrl} onChange={event => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." className="input-field mt-2 w-full"/></label>
      <label className="flex flex-wrap items-center gap-2 text-sm"><ImagePlus size={18}/>{uploading ? "Mengunggah..." : "Atau upload gambar"}<input disabled={uploading || saving} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void upload(event.target.files?.[0])} className="max-w-full text-xs"/></label>
      <p className="text-xs text-navy-500">Rasio gambar 16:9 disarankan. Maksimal 5 MB.</p>
      <label className="label-field">Tautan tujuan (opsional)<input value={form.linkUrl} onChange={event => setForm({ ...form, linkUrl: event.target.value })} placeholder="/search atau https://..." className="input-field mt-2 w-full"/></label>
      <label className="label-field">Teks tombol<input maxLength={40} value={form.linkLabel} onChange={event => setForm({ ...form, linkLabel: event.target.value })} className="input-field mt-2 w-full"/></label>
      <label className="label-field">Urutan tampil<input type="number" min={0} max={9999} required value={form.displayOrder} onChange={event => setForm({ ...form, displayOrder: Number(event.target.value) })} className="input-field mt-2 w-full"/></label>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })}/>Aktifkan iklan di menu pelanggan</label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={saving || uploading} className="btn-primary w-full">{saving ? "Menyimpan..." : "Simpan iklan"}</button>
    </form></section></div>}
  </div></main>;
}
