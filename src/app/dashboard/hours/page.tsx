"use client";
import { useCallback, useEffect, useState } from "react";
import { Clock3, Save } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";
import type { DayOpeningHours, StoreOpeningHours } from "@/lib/store-hours";

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DEFAULT_HOURS: StoreOpeningHours = Object.fromEntries(DAYS.map((_, day) => [String(day), { open: "09:00", close: "22:00", closed: false }])) as StoreOpeningHours;
type StoreRow = { id: string; name: string; opening_hours: StoreOpeningHours | null; manual_closed: boolean; timezone: string };

export default function StoreHoursPage() {
  const { token, user } = useAuth();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState(user?.store_id ?? "");
  const [hours, setHours] = useState<StoreOpeningHours>(DEFAULT_HOURS);
  const [manualClosed, setManualClosed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const response = await fetch("/api/stores", { headers: getAuthHeaders(token) });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Gagal memuat cabang");
    const rows: StoreRow[] = result.data ?? [];
    setStores(rows);
    const id = user?.store_id || storeId || rows[0]?.id || "";
    setStoreId(id);
    if (id) {
      const details = await fetch(`/api/stores/${id}`, { headers: getAuthHeaders(token) });
      const detailResult = await details.json();
      if (details.ok) {
        setHours(detailResult.data.opening_hours ?? DEFAULT_HOURS);
        setManualClosed(Boolean(detailResult.data.manual_closed));
      }
    }
  }, [token, user?.store_id, storeId]);

  useEffect(() => { load(); }, [load]);
  const selectStore = async (id: string) => {
    setStoreId(id);
    const response = await fetch(`/api/stores/${id}`, { headers: getAuthHeaders(token) });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Gagal memuat pengaturan cabang");
    setHours(result.data.opening_hours ?? DEFAULT_HOURS);
    setManualClosed(Boolean(result.data.manual_closed));
  };
  const updateDay = (day: number, value: Partial<DayOpeningHours>) => setHours(current => ({
    ...current, [String(day)]: { ...(current[String(day)] ?? { open: "09:00", close: "22:00", closed: false }), ...value },
  }));
  const save = async () => {
    if (!storeId) return toast.error("Pilih cabang terlebih dahulu");
    setSaving(true);
    try {
      const response = await fetch(`/api/stores/${storeId}`, { method: "PUT", headers: { "Content-Type": "application/json", ...getAuthHeaders(token) }, body: JSON.stringify({ openingHours: hours, manualClosed }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menyimpan jam operasional");
      toast.success("Jam operasional berhasil disimpan");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  return <main className="min-h-screen bg-bone-50 p-4 text-navy-950 md:p-8"><Toaster position="top-right"/><div className="mx-auto max-w-3xl">
    <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><Clock3/></span><div><h1 className="text-2xl font-black">Jam operasional</h1><p className="text-sm text-slate-500">Tiap cabang tutup dan buka otomatis sesuai jadwalnya.</p></div></div>
    {stores.length > 1 && <label className="mt-6 block text-sm font-bold">Cabang<select value={storeId} onChange={e => selectStore(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}
    <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm"><label className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4"><input type="checkbox" checked={manualClosed} onChange={e => setManualClosed(e.target.checked)} className="mt-1"/><span><b>Tutup toko sekarang</b><small className="mt-1 block text-amber-800">Menutup order langsung sampai pengaturan ini dimatikan. Jadwal rutin tetap tersimpan.</small></span></label>
      <div className="mt-4 divide-y">{DAYS.map((label, day) => { const row = hours[String(day)] ?? { open: "09:00", close: "22:00", closed: false }; return <div key={label} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-3"><b className="text-sm">{label}</b><label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={Boolean(row.closed)} onChange={e => updateDay(day, { closed: e.target.checked })}/>Tutup</label><input aria-label={`${label} buka`} disabled={row.closed} type="time" value={row.open} onChange={e => updateDay(day, { open: e.target.value })} className="rounded-lg border p-2 disabled:opacity-40"/><input aria-label={`${label} tutup`} disabled={row.closed} type="time" value={row.close} onChange={e => updateDay(day, { close: e.target.value })} className="rounded-lg border p-2 disabled:opacity-40"/></div>; })}</div>
      <p className="mt-3 text-xs text-slate-500">Zona waktu cabang: {stores.find(store => store.id === storeId)?.timezone || "Asia/Jakarta"}. Perubahan jadwal langsung berlaku untuk menu pelanggan dan checkout.</p>
      <button onClick={save} disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{saving ? "Menyimpan..." : "Simpan jadwal"}</button>
    </section>
  </div></main>;
}
