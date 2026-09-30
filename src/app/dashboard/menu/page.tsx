"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, UtensilsCrossed, Search, ToggleLeft, ToggleRight, UploadCloud, Loader2 } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { useAuth, useRole, getAuthHeaders } from "@/contexts/AuthContext";
import { PageTransition, StaggerContainer, StaggerItem, EmptyState } from "@/components/ui/Animations";
import { ConfirmDialog } from "@/components/ui/ModernAlert";
import type { MenuItem, Category, MenuOptionGroup } from "@/types";

interface MenuFormData {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  isAvailable: boolean;
  isFeatured: boolean;
  displayOrder: string;
  image: string;
  optionGroups: MenuOptionGroup[];
  trackStock: boolean;
  stockQuantity: string;
  showOnMenu: boolean;
}

const EMPTY_FORM: MenuFormData = {
  name: "", description: "", price: "", categoryId: "",
  isAvailable: true, isFeatured: false, displayOrder: "0", image: "",
  optionGroups: [], trackStock: false, stockQuantity: "0", showOnMenu: true,
};

export default function MenuDashboardPage() {
  const { token, user } = useAuth();
  const { isOwnerOrAdmin } = useRole();
  const storeId = user?.store_id ?? "";

  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadImage = async (file?: File) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const data = new FormData(); data.append("file", file); data.append("storeId", storeId);
      const res = await fetch("/api/uploads/menu-image", { method: "POST", headers: getAuthHeaders(token), body: data });
      const result = await res.json(); if (!res.ok) throw new Error(result.error);
      setForm(prev => ({ ...prev, image: result.data.url })); toast.success("Gambar berhasil diunggah");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Upload gagal"); }
    finally { setIsUploading(false); }
  };

  const fetchData = useCallback(async () => {
    if (!token || !storeId) return;
    setIsLoading(true);
    try {
      const [itemsRes, catsRes] = await Promise.all([
        fetch(`/api/menu/items?storeId=${storeId}&management=true`, { headers: getAuthHeaders(token) }),
        fetch(`/api/menu/categories?storeId=${storeId}`, { headers: getAuthHeaders(token) }),
      ]);
      if (itemsRes.ok) setItems((await itemsRes.json()).data ?? []);
      if (catsRes.ok) setCategories((await catsRes.json()).data ?? []);
    } catch { toast.error("Gagal memuat data"); }
    finally { setIsLoading(false); }
  }, [token, storeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setShowForm(true); };
  const openEdit = (item: MenuItem) => {
    setForm({
      name: item.name, description: item.description ?? "",
      price: String(item.price), categoryId: item.category_id,
      isAvailable: item.is_available, isFeatured: item.is_featured,
      displayOrder: String(item.display_order), image: item.image ?? "",
      optionGroups: item.option_groups ?? [], trackStock: item.track_stock ?? false,
      stockQuantity: String(item.stock_quantity ?? 0), showOnMenu: item.show_on_menu !== false,
    });
    setEditId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price || !form.categoryId) {
      toast.error("Nama, harga, dan kategori wajib diisi");
      return;
    }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { toast.error("Harga tidak valid"); return; }

    setIsSaving(true);
    try {
      const payload = {
        storeId, name: form.name.trim(), description: form.description.trim(),
        price, categoryId: form.categoryId,
        isAvailable: form.isAvailable, isFeatured: form.isFeatured,
        displayOrder: parseInt(form.displayOrder) || 0,
        image: form.image.trim() || null,
        optionGroups: form.optionGroups, trackStock: form.trackStock,
        stockQuantity: Number(form.stockQuantity), showOnMenu: form.showOnMenu,
      };
      const url = editId ? `/api/menu/items/${editId}` : "/api/menu/items";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error); }
      toast.success(editId ? "Menu diperbarui" : "Menu ditambahkan");
      setShowForm(false);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/menu/items/${id}`, {
        method: "DELETE", headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error();
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success("Menu dihapus");
    } catch { toast.error("Gagal menghapus menu"); }
  };

  const toggleAvailable = async (item: MenuItem) => {
    try {
      const res = await fetch(`/api/menu/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ isAvailable: !item.is_available }),
      });
      if (!res.ok) throw new Error();
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i));
    } catch { toast.error("Gagal mengubah ketersediaan"); }
  };

  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || i.category_id === catFilter;
    return matchSearch && matchCat;
  });

  return (
    <PageTransition>
      <Toaster position="top-right" />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-navy-900">Menu</h1>
            <p className="text-sm text-navy-500">{items.length} item total</p>
          </div>
          {isOwnerOrAdmin && (
            <motion.button whileTap={{ scale: 0.96 }} onClick={openAdd}
              className="flex items-center gap-2 bg-navy-900 text-bone-50 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-navy-800 shadow-soft transition-all">
              <Plus className="w-4 h-4" /> Tambah Menu
            </motion.button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari menu..." className="input-field pl-10 w-full" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input-field">
            <option value="all">Semua Kategori</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-navy-50 rounded-2xl h-36 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="Belum ada menu" description="Tambahkan item menu pertama" />
        ) : (
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(item => (
              <StaggerItem key={item.id}>
                <div className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft overflow-hidden">
                  <div className="aspect-[16/9] bg-navy-50 flex items-center justify-center overflow-hidden">
                    {item.image
                      ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      : <UtensilsCrossed className="w-8 h-8 text-navy-300" />}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-navy-900 truncate">{item.name}</h3>
                        <p className="text-xs text-navy-400 mt-0.5 line-clamp-1">{item.description || "—"}</p>
                        <p className="text-base font-bold text-navy-900 mt-2">
                          Rp {Number(item.price).toLocaleString("id-ID")}
                        </p>
                      </div>
                      {isOwnerOrAdmin && (
                        <button onClick={() => toggleAvailable(item)} className="flex-shrink-0 mt-1" aria-label="Toggle ketersediaan">
                          {item.is_available
                            ? <ToggleRight className="w-6 h-6 text-green-500" />
                            : <ToggleLeft className="w-6 h-6 text-navy-300" />}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.is_available ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                        {item.is_available ? "Tersedia" : "Habis"}
                      </span>
                      {item.is_featured && <span className="text-xs px-2 py-0.5 rounded-full bg-gold/20 text-gold-700 font-medium">★ Favorit</span>}
                    </div>
                    {isOwnerOrAdmin && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => openEdit(item)}
                          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border border-navy-200 text-navy-600 text-xs font-medium hover:bg-navy-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button onClick={() => setDeleteTarget(item.id)}
                          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" /> Hapus
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-navy-950/60 backdrop-blur-sm z-50 flex items-end sm:items-center p-0 sm:p-4">
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.24 }}
            className="bg-bone-50 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-bone-50 px-5 pt-5 pb-4 border-b border-navy-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-navy-900">{editId ? "Edit Menu" : "Tambah Menu"}</h3>
              <button onClick={() => setShowForm(false)} className="text-navy-400 hover:text-navy-700">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label-field">Nama *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-field w-full" placeholder="Nama menu" />
              </div>
              <div>
                <label className="label-field">Deskripsi</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input-field w-full h-20 resize-none" placeholder="Deskripsi singkat" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-field">Harga (Rp) *</label>
                  <input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} className="input-field w-full" placeholder="0" min="0" />
                </div>
                <div>
                  <label className="label-field">Urutan Tampil</label>
                  <input type="number" value={form.displayOrder} onChange={e => setForm(p => ({ ...p, displayOrder: e.target.value }))} className="input-field w-full" />
                </div>
              </div>
              <div>
                <label className="label-field">Kategori *</label>
                <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))} className="input-field w-full">
                  <option value="">Pilih kategori</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-field">Foto menu</label>
                <label onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); uploadImage(e.dataTransfer.files[0]); }} className="flex min-h-36 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 p-4 text-center hover:border-blue-500">
                  {form.image ? <img src={form.image} alt="Preview" className="h-32 w-full rounded-xl object-cover" /> : isUploading ? <Loader2 className="h-8 w-8 animate-spin text-blue-600" /> : <><UploadCloud className="mb-2 h-8 w-8 text-blue-600"/><b className="text-sm text-navy-900">Tarik foto ke sini atau klik</b><span className="text-xs text-navy-500">JPG, PNG, WebP · maks. 5 MB</span></>}
                  <input type="file" accept="image/*" className="hidden" onChange={e => uploadImage(e.target.files?.[0])}/>
                </label>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isAvailable} onChange={e => setForm(p => ({ ...p, isAvailable: e.target.checked }))} className="w-4 h-4 rounded accent-navy-900" />
                  <span className="text-sm text-navy-700">Tersedia</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(p => ({ ...p, isFeatured: e.target.checked }))} className="w-4 h-4 rounded accent-navy-900" />
                  <span className="text-sm text-navy-700">Rekomendasi</span>
                </label>
              </div>
              <section className="space-y-3 rounded-2xl border border-navy-100 bg-white p-4">
                <h4 className="font-bold text-navy-900">Stok cabang & tampilan pelanggan</h4>
                <label className="flex items-center gap-2 text-sm text-navy-700">
                  <input type="checkbox" checked={form.trackStock} onChange={e => setForm(p => ({ ...p, trackStock: e.target.checked }))} />
                  Lacak stok untuk cabang ini
                </label>
                {form.trackStock && <input type="number" min="0" value={form.stockQuantity} onChange={e => setForm(p => ({ ...p, stockQuantity: e.target.value }))} className="input-field w-full" placeholder="Jumlah stok" />}
                <label className="flex items-center gap-2 text-sm text-navy-700">
                  <input type="checkbox" checked={form.showOnMenu} onChange={e => setForm(p => ({ ...p, showOnMenu: e.target.checked }))} />
                  Tampilkan di menu pelanggan cabang ini
                </label>
                <p className="text-xs text-navy-400">Menu yang habis atau disembunyikan tidak akan muncul di halaman pelanggan cabang ini.</p>
              </section>
              <section className="space-y-3 rounded-2xl border border-navy-100 bg-white p-4">
                <div className="flex items-center justify-between"><h4 className="font-bold text-navy-900">Varian & tambahan</h4><button type="button" onClick={() => setForm(p => ({ ...p, optionGroups: [...p.optionGroups, { id: crypto.randomUUID(), name: "", required: false, min_select: 0, max_select: 1, options: [{ id: crypto.randomUUID(), name: "", price_delta: 0 }] }] }))} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Tambah grup</button></div>
                {form.optionGroups.map((group, groupIndex) => <div key={group.id} className="space-y-2 rounded-xl bg-blue-50/60 p-3">
                  <div className="flex gap-2"><input value={group.name} onChange={e => setForm(p => ({ ...p, optionGroups: p.optionGroups.map((g, i) => i === groupIndex ? { ...g, name: e.target.value } : g) }))} className="input-field min-w-0 flex-1" placeholder="Nama grup, mis. Ukuran"/><button type="button" onClick={() => setForm(p => ({ ...p, optionGroups: p.optionGroups.filter((_, i) => i !== groupIndex) }))} className="px-2 text-red-500">Hapus</button></div>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={group.required} onChange={e => setForm(p => ({ ...p, optionGroups: p.optionGroups.map((g, i) => i === groupIndex ? { ...g, required: e.target.checked, min_select: e.target.checked ? 1 : 0 } : g) }))}/>Wajib dipilih</label>
                  {group.options.map((option, optionIndex) => <div key={option.id} className="grid grid-cols-[1fr_7rem_auto] gap-2"><input value={option.name} onChange={e => setForm(p => ({ ...p, optionGroups: p.optionGroups.map((g, i) => i === groupIndex ? { ...g, options: g.options.map((o, j) => j === optionIndex ? { ...o, name: e.target.value } : o) } : g) }))} className="input-field min-w-0" placeholder="Nama pilihan"/><input type="number" min="0" value={option.price_delta} onChange={e => setForm(p => ({ ...p, optionGroups: p.optionGroups.map((g, i) => i === groupIndex ? { ...g, options: g.options.map((o, j) => j === optionIndex ? { ...o, price_delta: Number(e.target.value) } : o) } : g) }))} className="input-field" placeholder="Tambah Rp"/><button type="button" onClick={() => setForm(p => ({ ...p, optionGroups: p.optionGroups.map((g, i) => i === groupIndex ? { ...g, options: g.options.filter((_, j) => j !== optionIndex) } : g) }))} className="px-2 text-red-500">×</button></div>)}
                  <button type="button" onClick={() => setForm(p => ({ ...p, optionGroups: p.optionGroups.map((g, i) => i === groupIndex ? { ...g, options: [...g.options, { id: crypto.randomUUID(), name: "", price_delta: 0 }] } : g) }))} className="text-xs font-bold text-blue-700">+ Tambah pilihan</button>
                </div>)}
                <p className="text-xs text-navy-400">Contoh: grup “Ukuran” berisi Reguler dan Large (+Rp5.000).</p>
              </section>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl border border-navy-200 text-navy-700 font-medium text-sm hover:bg-navy-50 transition-colors">Batal</button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={isSaving}
                  className="flex-1 py-3 rounded-xl bg-navy-900 text-bone-50 font-semibold text-sm hover:bg-navy-800 disabled:opacity-50 transition-all">
                  {isSaving ? "Menyimpan..." : "Simpan"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Hapus Menu?"
        message="Menu ini akan dihapus permanen dan tidak bisa dipulihkan."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        confirmVariant="danger"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageTransition>
  );
}
