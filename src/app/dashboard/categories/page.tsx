"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Tag, GripVertical } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { useAuth, useRole, getAuthHeaders } from "@/contexts/AuthContext";
import { PageTransition, StaggerContainer, StaggerItem, EmptyState } from "@/components/ui/Animations";
import { ConfirmDialog } from "@/components/ui/ModernAlert";
import type { Category } from "@/types";

export default function CategoriesPage() {
  const { token, user } = useAuth();
  const { isOwnerOrAdmin } = useRole();
  const storeId = user?.store_id ?? "";

  const [categories,   setCategories]   = useState<Category[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [editTarget,   setEditTarget]   = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formName,     setFormName]     = useState("");
  const [formDesc,     setFormDesc]     = useState("");
  const [formOrder,    setFormOrder]    = useState("0");
  const [isSaving,     setIsSaving]     = useState(false);
  const [formError,    setFormError]    = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    if (!token || !storeId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/menu/categories?storeId=${storeId}`, {
        headers: getAuthHeaders(token),
      });
      if (res.ok) setCategories((await res.json()).data ?? []);
    } catch {
      toast.error("Gagal memuat kategori");
    } finally {
      setIsLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const openAdd = () => {
    setFormName(""); setFormDesc(""); setFormOrder("0");
    setEditTarget(null); setFormError(null); setShowForm(true);
  };

  const openEdit = (cat: Category) => {
    setFormName(cat.name);
    setFormDesc(cat.description ?? "");
    setFormOrder(String(cat.display_order));
    setEditTarget(cat); setFormError(null); setShowForm(true);
  };

  const handleSave = async () => {
    setFormError(null);
    if (!formName.trim()) { setFormError("Nama kategori wajib diisi"); return; }
    setIsSaving(true);
    try {
      const url    = editTarget ? `/api/menu/categories/${editTarget.id}` : "/api/menu/categories";
      const method = editTarget ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({
          storeId,
          name:         formName.trim(),
          description:  formDesc.trim() || null,
          displayOrder: parseInt(formOrder) || 0,
        }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      toast.success(editTarget ? "Kategori diperbarui" : "Kategori ditambahkan");
      setShowForm(false);
      fetchCategories();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    try {
      const res = await fetch(`/api/menu/categories/${cat.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ isActive: !cat.is_active }),
      });
      if (!res.ok) throw new Error();
      setCategories(prev =>
        prev.map(c => c.id === cat.id ? { ...c, is_active: !c.is_active } : c)
      );
      toast.success(cat.is_active ? "Kategori dinonaktifkan" : "Kategori diaktifkan");
    } catch {
      toast.error("Gagal mengubah status");
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/menu/categories/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      setCategories(prev => prev.filter(c => c.id !== id));
      toast.success("Kategori dihapus");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus");
    }
  };

  return (
    <PageTransition>
      <Toaster position="top-right" />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-navy-900">Kategori Menu</h1>
            <p className="text-sm text-navy-500">{categories.length} kategori · urutan tampil di menu customer</p>
          </div>
          {isOwnerOrAdmin && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={openAdd}
              className="flex items-center gap-2 bg-navy-900 text-bone-50 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-navy-800 shadow-soft transition-all"
            >
              <Plus className="w-4 h-4" /> Tambah Kategori
            </motion.button>
          )}
        </div>

        {!storeId ? (
          <div className="text-center py-16 text-navy-400">
            <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Belum ada toko yang di-assign ke akun kamu.</p>
            <p className="text-sm mt-1">Hubungi Owner untuk assign toko.</p>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-navy-50 rounded-2xl h-28 animate-pulse" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Belum ada kategori"
            description="Tambahkan kategori untuk mengelompokkan menu (contoh: Makanan, Minuman, Dessert)"
            action={
              isOwnerOrAdmin ? (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={openAdd}
                  className="flex items-center gap-2 bg-navy-900 text-bone-50 px-5 py-3 rounded-xl text-sm font-semibold hover:bg-navy-800 shadow-soft"
                >
                  <Plus className="w-4 h-4" /> Tambah Kategori Pertama
                </motion.button>
              ) : undefined
            }
          />
        ) : (
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat, idx) => (
              <StaggerItem key={cat.id}>
                <div className={`bg-bone-50 border rounded-2xl shadow-soft overflow-hidden ${
                  cat.is_active ? "border-navy-100" : "border-navy-200 opacity-70"
                }`}>
                  <div className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-navy-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-navy-600 font-bold text-sm">#{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-navy-900 truncate">{cat.name}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            cat.is_active
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-600"
                          }`}>
                            {cat.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </div>
                        {cat.description && (
                          <p className="text-xs text-navy-500 mt-0.5 line-clamp-2">{cat.description}</p>
                        )}
                        <p className="text-xs text-navy-400 mt-1">Urutan: {cat.display_order}</p>
                      </div>
                    </div>

                    {isOwnerOrAdmin && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => openEdit(cat)}
                          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border border-navy-200 text-navy-600 text-xs font-medium hover:bg-navy-50 transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(cat)}
                          className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border text-xs font-medium transition-colors ${
                            cat.is_active
                              ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                              : "border-green-200 text-green-700 hover:bg-green-50"
                          }`}
                        >
                          {cat.is_active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(cat.id)}
                          className="p-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                          aria-label="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
        <div className="fixed inset-0 bg-navy-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-bone-50 rounded-3xl shadow-2xl w-full max-w-sm p-6"
          >
            <h3 className="text-lg font-bold text-navy-900 mb-5">
              {editTarget ? "Edit Kategori" : "Tambah Kategori"}
            </h3>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label-field">Nama Kategori *</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="input-field w-full"
                  placeholder="Contoh: Makanan, Minuman, Dessert"
                  autoFocus
                />
              </div>
              <div>
                <label className="label-field">Deskripsi</label>
                <input
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  className="input-field w-full"
                  placeholder="Opsional"
                />
              </div>
              <div>
                <label className="label-field">Urutan Tampil</label>
                <input
                  type="number"
                  value={formOrder}
                  onChange={e => setFormOrder(e.target.value)}
                  className="input-field w-full"
                  placeholder="0"
                  min="0"
                />
                <p className="text-xs text-navy-400 mt-1">Angka kecil tampil lebih awal</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-xl border border-navy-200 text-navy-700 text-sm font-medium hover:bg-navy-50 transition-colors"
              >
                Batal
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-3 rounded-xl bg-navy-900 text-bone-50 font-semibold text-sm hover:bg-navy-800 disabled:opacity-50 transition-all"
              >
                {isSaving ? "Menyimpan..." : "Simpan"}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Hapus Kategori?"
        message="Kategori akan dihapus permanen. Pastikan tidak ada menu yang masih menggunakan kategori ini."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        confirmVariant="danger"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageTransition>
  );
}
