"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store, Plus, RefreshCw, Pencil, ToggleLeft,
  ToggleRight, X, Loader2, AlertCircle,
  MapPin, Phone, Mail, Percent,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { useAuth, useRole, getAuthHeaders } from "@/contexts/AuthContext";
import { PageTransition, StaggerContainer, StaggerItem, EmptyState } from "@/components/ui/Animations";
import { ConfirmDialog } from "@/components/ui/ModernAlert";
import type { Store as StoreType } from "@/types";

interface StoreFormData {
  name: string;
  address: string;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
  taxRate: string;
  serviceChargeRate: string;
}

const EMPTY_FORM: StoreFormData = {
  name: "",
  address: "",
  phone: "",
  email: "",
  timezone: "Asia/Jakarta",
  currency: "IDR",
  taxRate: "11",
  serviceChargeRate: "0",
};

export default function StoresPage() {
  const { token } = useAuth();
  const { isOwner, isOwnerOrAdmin } = useRole();

  const [stores,      setStores]      = useState<StoreType[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState<StoreType | null>(null);
  const [form,        setForm]        = useState<StoreFormData>(EMPTY_FORM);
  const [isSaving,    setIsSaving]    = useState(false);
  const [formError,   setFormError]   = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<StoreType | null>(null);

  // ── Fetch stores ──────────────────────────────────────────────────
  const fetchStores = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/stores", { headers: getAuthHeaders(token) });
      if (res.ok) {
        const r = await res.json();
        setStores(r.data ?? []);
      }
    } catch {
      toast.error("Gagal memuat toko");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchStores(); }, [fetchStores]);

  // ── Open form helpers ─────────────────────────────────────────────
  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (store: StoreType) => {
    setForm({
      name:              store.name,
      address:           store.address,
      phone:             store.phone,
      email:             store.email,
      timezone:          store.timezone  ?? "Asia/Jakarta",
      currency:          store.currency  ?? "IDR",
      taxRate:           String(((store.tax_rate           ?? 0.11) * 100).toFixed(0)),
      serviceChargeRate: String(((store.service_charge_rate ?? 0)    * 100).toFixed(0)),
    });
    setEditTarget(store);
    setFormError(null);
    setShowForm(true);
  };

  // ── Save (create or update) ───────────────────────────────────────
  const handleSave = async () => {
    setFormError(null);

    // Validasi wajib
    if (!form.name.trim())    { setFormError("Nama toko wajib diisi");  return; }
    if (!form.address.trim()) { setFormError("Alamat wajib diisi");     return; }
    if (!form.phone.trim())   { setFormError("Nomor telepon wajib diisi"); return; }
    if (!form.email.trim())   { setFormError("Email wajib diisi");      return; }

    const taxNum     = parseFloat(form.taxRate)           || 0;
    const serviceNum = parseFloat(form.serviceChargeRate) || 0;

    setIsSaving(true);
    try {
      const payload = {
        name:              form.name.trim(),
        address:           form.address.trim(),
        phone:             form.phone.trim(),
        email:             form.email.trim(),
        timezone:          form.timezone,
        currency:          form.currency,
        taxRate:           taxNum     / 100,   // simpan desimal: 11% → 0.11
        serviceChargeRate: serviceNum / 100,
        isActive:          true,
      };

      const url    = editTarget ? `/api/stores/${editTarget.id}` : "/api/stores";
      const method = editTarget ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify(payload),
      });

      const r = await res.json();
      if (!res.ok) throw new Error(r.error ?? "Gagal menyimpan toko");

      toast.success(editTarget ? "Toko diperbarui!" : "Toko berhasil dibuat!");
      setShowForm(false);
      fetchStores();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Toggle active ─────────────────────────────────────────────────
  const handleToggleActive = async (store: StoreType) => {
    if (!store.is_active) {
      // Re-aktifkan langsung
      try {
        const res = await fetch(`/api/stores/${store.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
          body: JSON.stringify({ isActive: true }),
        });
        if (!res.ok) throw new Error();
        setStores(prev => prev.map(s => s.id === store.id ? { ...s, is_active: true } : s));
        toast.success("Toko diaktifkan kembali");
      } catch {
        toast.error("Gagal mengaktifkan toko");
      }
    } else {
      // Konfirmasi nonaktifkan
      setDeactivateTarget(store);
    }
  };

  // ── Deactivate confirmed ──────────────────────────────────────────
  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivateTarget(null);
    try {
      const res = await fetch(`/api/stores/${deactivateTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error();
      setStores(prev =>
        prev.map(s => s.id === deactivateTarget.id ? { ...s, is_active: false } : s)
      );
      toast.success("Toko dinonaktifkan");
    } catch {
      toast.error("Gagal menonaktifkan toko");
    }
  };

  // ── Field helper ─────────────────────────────────────────────────
  const F = (field: keyof StoreFormData) => ({
    value: form[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value })),
  });

  return (
    <PageTransition>
      <Toaster position="top-right" />

      <div className="p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-navy-900">Toko</h1>
            <p className="text-sm text-navy-500 mt-0.5">{stores.length} toko terdaftar</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchStores}
              className="p-2.5 text-navy-500 hover:bg-navy-100 rounded-xl transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            {isOwner && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={openAdd}
                className="flex items-center gap-2 bg-navy-900 text-bone-50 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-navy-800 shadow-soft transition-all"
              >
                <Plus className="w-4 h-4" />
                Tambah Toko
              </motion.button>
            )}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-navy-50 rounded-2xl h-32 animate-pulse" />
            ))}
          </div>
        ) : stores.length === 0 ? (
          <EmptyState
            icon={Store}
            title="Belum ada toko"
            description={isOwner ? "Klik 'Tambah Toko' untuk membuat toko pertamamu" : "Belum ada toko yang ditetapkan"}
            action={
              isOwner ? (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={openAdd}
                  className="flex items-center gap-2 bg-navy-900 text-bone-50 px-5 py-3 rounded-xl text-sm font-semibold hover:bg-navy-800 shadow-soft"
                >
                  <Plus className="w-4 h-4" />
                  Buat Toko Pertama
                </motion.button>
              ) : undefined
            }
          />
        ) : (
          <StaggerContainer className="space-y-4">
            {stores.map(store => (
              <StaggerItem key={store.id}>
                <div className={`bg-bone-50 border rounded-2xl shadow-soft overflow-hidden ${
                  store.is_active ? "border-navy-100" : "border-navy-200 opacity-70"
                }`}>
                  {/* Store header */}
                  <div className="bg-navy-900 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gold/20 rounded-xl flex items-center justify-center">
                        <Store className="w-5 h-5 text-gold" />
                      </div>
                      <div>
                        <h3 className="font-bold text-bone-50">{store.name}</h3>
                        {store.slug && (
                          <p className="text-xs text-navy-400">/{store.slug}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        store.is_active
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {store.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                  </div>

                  {/* Store detail */}
                  <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-start gap-2 text-sm text-navy-600">
                      <MapPin className="w-4 h-4 text-navy-400 flex-shrink-0 mt-0.5" />
                      <span>{store.address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-navy-600">
                      <Phone className="w-4 h-4 text-navy-400 flex-shrink-0" />
                      <span>{store.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-navy-600">
                      <Mail className="w-4 h-4 text-navy-400 flex-shrink-0" />
                      <span>{store.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-navy-600">
                      <Percent className="w-4 h-4 text-navy-400 flex-shrink-0" />
                      <span>
                        Pajak {((store.tax_rate ?? 0.11) * 100).toFixed(0)}%
                        {(store.service_charge_rate ?? 0) > 0 && (
                          <> · Service {((store.service_charge_rate ?? 0) * 100).toFixed(0)}%</>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {isOwnerOrAdmin && (
                    <div className="px-5 pb-4 flex items-center gap-2">
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => openEdit(store)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-navy-200 text-navy-700 text-sm font-medium hover:bg-navy-50 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </motion.button>
                      {isOwner && (
                        <motion.button
                          whileTap={{ scale: 0.96 }}
                          onClick={() => handleToggleActive(store)}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                            store.is_active
                              ? "border-red-200 text-red-600 hover:bg-red-50"
                              : "border-green-200 text-green-700 hover:bg-green-50"
                          }`}
                        >
                          {store.is_active
                            ? <><ToggleLeft className="w-3.5 h-3.5" /> Nonaktifkan</>
                            : <><ToggleRight className="w-3.5 h-3.5" /> Aktifkan</>
                          }
                        </motion.button>
                      )}
                    </div>
                  )}
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>

      {/* ── Form Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-navy-950/60 backdrop-blur-sm z-50 flex items-end sm:items-center p-0 sm:p-4"
            onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", duration: 0.25 }}
              className="bg-bone-50 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg mx-auto max-h-[92vh] overflow-y-auto"
            >
              {/* Modal header */}
              <div className="sticky top-0 bg-bone-50 px-5 pt-5 pb-4 border-b border-navy-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-navy-900">
                    {editTarget ? "Edit Toko" : "Buat Toko Baru"}
                  </h3>
                  <p className="text-xs text-navy-500 mt-0.5">
                    {editTarget ? "Perbarui informasi toko" : "Isi detail toko restoran kamu"}
                  </p>
                </div>
                <button
                  onClick={() => setShowForm(false)}
                  className="p-2 text-navy-400 hover:text-navy-700 hover:bg-navy-100 rounded-xl transition-colors"
                  aria-label="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form body */}
              <div className="px-5 py-5 space-y-4">
                {/* Error banner */}
                {formError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Nama Toko */}
                <div>
                  <label className="label-field">Nama Toko *</label>
                  <input
                    {...F("name")}
                    className="input-field w-full"
                    placeholder="Contoh: Warung Makan Bu Tini"
                  />
                </div>

                {/* Alamat */}
                <div>
                  <label className="label-field">Alamat *</label>
                  <input
                    {...F("address")}
                    className="input-field w-full"
                    placeholder="Jl. Contoh No. 1, Jakarta"
                  />
                </div>

                {/* Phone & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-field">Nomor Telepon *</label>
                    <input
                      {...F("phone")}
                      type="tel"
                      className="input-field w-full"
                      placeholder="08xxxxxxxxxx"
                    />
                  </div>
                  <div>
                    <label className="label-field">Email *</label>
                    <input
                      {...F("email")}
                      type="email"
                      className="input-field w-full"
                      placeholder="toko@email.com"
                    />
                  </div>
                </div>

                {/* Timezone & Currency */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-field">Zona Waktu</label>
                    <select {...F("timezone")} className="input-field w-full">
                      <option value="Asia/Jakarta">WIB (Asia/Jakarta)</option>
                      <option value="Asia/Makassar">WITA (Asia/Makassar)</option>
                      <option value="Asia/Jayapura">WIT (Asia/Jayapura)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label-field">Mata Uang</label>
                    <select {...F("currency")} className="input-field w-full">
                      <option value="IDR">IDR (Rupiah)</option>
                      <option value="USD">USD (Dollar)</option>
                    </select>
                  </div>
                </div>

                {/* Tax & Service */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-field">Pajak PPN (%)</label>
                    <div className="relative">
                      <input
                        {...F("taxRate")}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        className="input-field w-full pr-8"
                        placeholder="11"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 text-sm">%</span>
                    </div>
                    <p className="text-xs text-navy-400 mt-1">0 = tidak ada pajak</p>
                  </div>
                  <div>
                    <label className="label-field">Service Charge (%)</label>
                    <div className="relative">
                      <input
                        {...F("serviceChargeRate")}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        className="input-field w-full pr-8"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 text-sm">%</span>
                    </div>
                    <p className="text-xs text-navy-400 mt-1">0 = tidak ada service charge</p>
                  </div>
                </div>

                {/* Preview total */}
                <div className="bg-navy-50 rounded-xl p-4 text-sm">
                  <p className="font-medium text-navy-700 mb-2">Preview perhitungan</p>
                  <div className="space-y-1 text-navy-600">
                    <div className="flex justify-between">
                      <span>Subtotal contoh</span>
                      <span>Rp 100.000</span>
                    </div>
                    {parseFloat(form.taxRate) > 0 && (
                      <div className="flex justify-between">
                        <span>Pajak {form.taxRate}%</span>
                        <span>Rp {(1000 * parseFloat(form.taxRate)).toLocaleString("id-ID")}</span>
                      </div>
                    )}
                    {parseFloat(form.serviceChargeRate) > 0 && (
                      <div className="flex justify-between">
                        <span>Service {form.serviceChargeRate}%</span>
                        <span>Rp {(1000 * parseFloat(form.serviceChargeRate)).toLocaleString("id-ID")}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-navy-900 pt-1 border-t border-navy-200">
                      <span>Total</span>
                      <span>
                        Rp {(
                          100000 +
                          (parseFloat(form.taxRate) || 0) * 1000 +
                          (parseFloat(form.serviceChargeRate) || 0) * 1000
                        ).toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-3 rounded-xl border border-navy-200 text-navy-700 font-medium text-sm hover:bg-navy-50 transition-colors"
                  >
                    Batal
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 py-3 rounded-xl bg-navy-900 text-bone-50 font-semibold text-sm hover:bg-navy-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isSaving ? "Menyimpan..." : editTarget ? "Simpan Perubahan" : "Buat Toko"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deactivate confirm */}
      <ConfirmDialog
        isOpen={!!deactivateTarget}
        title="Nonaktifkan Toko?"
        message={`"${deactivateTarget?.name}" akan dinonaktifkan. Customer tidak bisa mengakses menu toko ini. Kamu bisa mengaktifkannya kembali kapan saja.`}
        confirmLabel="Nonaktifkan"
        cancelLabel="Batal"
        confirmVariant="danger"
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />
    </PageTransition>
  );
}
