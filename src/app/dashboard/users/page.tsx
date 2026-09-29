"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserX, RefreshCw, Search, X,
  Store, ShieldCheck, ChevronDown, Check, Loader2,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { useAuth, useRole, getAuthHeaders } from "@/contexts/AuthContext";
import { PageTransition, StaggerContainer, StaggerItem, EmptyState } from "@/components/ui/Animations";
import { ConfirmDialog } from "@/components/ui/ModernAlert";
import type { User } from "@/types";
import type { Store as StoreType } from "@/types";

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-yellow-50 text-yellow-800 border-yellow-200",
  admin: "bg-blue-50 text-blue-700 border-blue-200",
  kasir: "bg-green-50 text-green-700 border-green-200",
  user:  "bg-navy-50 text-navy-600 border-navy-200",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  kasir: "Kasir",
  user:  "Customer",
};

// Which roles can be assigned (owner can assign all, admin cannot assign owner)
function getAllowedRoles(currentRole: string | undefined) {
  if (currentRole === "owner") return ["owner", "admin", "kasir", "user"];
  return ["admin", "kasir", "user"];
}

interface EditState {
  userId:  string;
  role:    string;
  storeId: string;
}

export default function UsersPage() {
  const { token, user: currentUser } = useAuth();
  const { isOwnerOrAdmin, canDeleteUsers, isOwner } = useRole();

  const [users,            setUsers]           = useState<User[]>([]);
  const [stores,           setStores]          = useState<StoreType[]>([]);
  const [isLoading,        setIsLoading]        = useState(true);
  const [search,           setSearch]           = useState("");
  const [roleFilter,       setRoleFilter]       = useState("all");
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);
  const [editing,          setEditing]          = useState<EditState | null>(null);
  const [isSaving,         setIsSaving]         = useState(false);

  // ── Fetch users + stores ──────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [usersRes, storesRes] = await Promise.all([
        fetch("/api/users", { headers: getAuthHeaders(token) }),
        fetch("/api/stores", { headers: getAuthHeaders(token) }),
      ]);
      if (usersRes.ok)  setUsers((await usersRes.json()).data   ?? []);
      if (storesRes.ok) setStores((await storesRes.json()).data ?? []);
    } catch {
      toast.error("Gagal memuat data");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Open edit panel for a user ────────────────────────────────
  const openEdit = (u: User) => {
    setEditing({
      userId:  u.id,
      role:    u.role,
      storeId: u.store_id ?? "",
    });
  };

  // ── Save role + store together ────────────────────────────────
  const handleSave = async () => {
    if (!editing) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({
          userId:  editing.userId,
          role:    editing.role,
          storeId: editing.storeId || null,
        }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);

      setUsers(prev => prev.map(u =>
        u.id === editing.userId
          ? { ...u, role: editing.role as User["role"], store_id: editing.storeId || undefined }
          : u
      ));
      toast.success("Pengguna diperbarui!");
      setEditing(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Deactivate user ───────────────────────────────────────────
  const handleDeactivate = async (userId: string) => {
    setDeactivateTarget(null);
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ userId }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: false } : u));
      toast.success("Pengguna dinonaktifkan");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menonaktifkan");
    }
  };

  const filtered = users.filter(u => {
    const matchSearch =
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const getStoreName = (storeId?: string | null) => {
    if (!storeId) return null;
    return stores.find(s => s.id === storeId)?.name ?? "Toko tidak dikenal";
  };

  if (!isOwnerOrAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-navy-500">Akses ditolak</p>
      </div>
    );
  }

  return (
    <PageTransition>
      <Toaster position="top-right" />
      <div className="p-4 md:p-6 lg:p-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-navy-900">Pengguna</h1>
            <p className="text-sm text-navy-500">{users.length} pengguna terdaftar</p>
          </div>
          <button
            onClick={fetchData}
            className="p-2.5 text-navy-500 hover:bg-navy-100 rounded-xl transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Info banner for owner */}
        {isOwner && (
          <div className="bg-navy-50 border border-navy-200 rounded-2xl px-4 py-3 mb-5 text-sm text-navy-600 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-navy-400 flex-shrink-0 mt-0.5" />
            <span>
              Klik <strong>Edit</strong> pada user untuk mengubah role dan assign toko sekaligus.
              User yang jadi <strong>Admin</strong> atau <strong>Kasir</strong> perlu di-assign ke toko agar bisa akses dashboard.
            </span>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama atau email..."
              className="input-field pl-10 w-full"
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="input-field"
          >
            <option value="all">Semua Role</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* User list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-navy-50 rounded-2xl h-20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="Tidak ada pengguna" description="Pengguna terdaftar akan muncul di sini" />
        ) : (
          <StaggerContainer className="space-y-2">
            {filtered.map(u => (
              <StaggerItem key={u.id}>
                <div className={`bg-bone-50 border rounded-2xl overflow-hidden shadow-soft transition-all ${
                  !u.is_active ? "opacity-60 border-navy-200" : "border-navy-100"
                }`}>
                  {/* Main row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 bg-navy-900 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-bone-50 font-bold text-sm">
                        {(u.name || u.email || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-navy-900 text-sm truncate">
                          {u.name || "—"}
                          {u.id === currentUser?.id && (
                            <span className="text-xs text-navy-400 font-normal ml-1">(kamu)</span>
                          )}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${ROLE_COLORS[u.role] ?? "bg-navy-50 text-navy-600 border-navy-200"}`}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                        {!u.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">
                            Nonaktif
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-xs text-navy-400 truncate">{u.email || "—"}</p>
                        {u.store_id && (
                          <p className="text-xs text-navy-500 flex items-center gap-1 flex-shrink-0">
                            <Store className="w-3 h-3" />
                            {getStoreName(u.store_id)}
                          </p>
                        )}
                        {!u.store_id && ["admin", "kasir"].includes(u.role) && (
                          <p className="text-xs text-amber-600 flex items-center gap-1 flex-shrink-0">
                            ⚠️ Belum ada toko
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {u.id !== currentUser?.id && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isOwnerOrAdmin && (
                          <button
                            onClick={() => openEdit(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-navy-700 border border-navy-200 rounded-xl hover:bg-navy-50 transition-colors"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}
                        {u.is_active && canDeleteUsers && (
                          <button
                            onClick={() => setDeactivateTarget(u)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                            title="Nonaktifkan"
                            aria-label="Nonaktifkan"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>

      {/* ── Edit Drawer ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-navy-950/60 backdrop-blur-sm z-50 flex items-end sm:items-center p-0 sm:p-4"
            onClick={e => e.target === e.currentTarget && setEditing(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", duration: 0.24 }}
              className="bg-bone-50 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm mx-auto"
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b border-navy-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-navy-900">Edit Pengguna</h3>
                  <p className="text-xs text-navy-500 mt-0.5">
                    {users.find(u => u.id === editing.userId)?.name ?? "—"} ·{" "}
                    {users.find(u => u.id === editing.userId)?.email ?? "—"}
                  </p>
                </div>
                <button
                  onClick={() => setEditing(null)}
                  className="p-1.5 text-navy-400 hover:text-navy-700 hover:bg-navy-100 rounded-xl"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-5 space-y-5">
                {/* Role */}
                <div>
                  <label className="label-field">Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {getAllowedRoles(currentUser?.role).map(r => (
                      <button
                        key={r}
                        onClick={() => {
                          setEditing(prev => prev ? { ...prev, role: r } : prev);
                          // If changing to user role, clear store
                          if (r === "user") {
                            setEditing(prev => prev ? { ...prev, role: r, storeId: "" } : prev);
                          }
                        }}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                          editing.role === r
                            ? "border-navy-900 bg-navy-900 text-bone-50"
                            : "border-navy-200 text-navy-600 hover:border-navy-300"
                        }`}
                      >
                        <span>{ROLE_LABELS[r]}</span>
                        {editing.role === r && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-navy-400 mt-2">
                    {editing.role === "user"    && "Hanya bisa order menu — tidak ada akses dashboard."}
                    {editing.role === "kasir"   && "Bisa lihat dan update status pesanan di toko yang di-assign."}
                    {editing.role === "admin"   && "Bisa kelola menu, meja, dan pesanan di toko yang di-assign."}
                    {editing.role === "owner"   && "Akses penuh ke semua toko dan pengaturan."}
                  </p>
                </div>

                {/* Toko — hanya untuk admin & kasir */}
                {["admin", "kasir"].includes(editing.role) && (
                  <div>
                    <label className="label-field">
                      Assign ke Toko
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    {stores.length === 0 ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                        Belum ada toko. Buat toko dulu di halaman <strong>Toko</strong>.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* No store option */}
                        <button
                          onClick={() => setEditing(prev => prev ? { ...prev, storeId: "" } : prev)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                            !editing.storeId
                              ? "border-amber-400 bg-amber-50 text-amber-800"
                              : "border-navy-200 text-navy-500 hover:border-navy-300"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            !editing.storeId ? "border-amber-400" : "border-navy-300"
                          }`}>
                            {!editing.storeId && <div className="w-2 h-2 bg-amber-400 rounded-full" />}
                          </div>
                          <span>— Belum di-assign —</span>
                        </button>

                        {/* Store options */}
                        {stores.filter(s => s.is_active).map(store => (
                          <button
                            key={store.id}
                            onClick={() => setEditing(prev => prev ? { ...prev, storeId: store.id } : prev)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                              editing.storeId === store.id
                                ? "border-navy-900 bg-navy-900 text-bone-50"
                                : "border-navy-200 text-navy-700 hover:border-navy-300 bg-bone-50"
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                              editing.storeId === store.id ? "border-bone-50" : "border-navy-400"
                            }`}>
                              {editing.storeId === store.id && (
                                <div className="w-2 h-2 bg-bone-50 rounded-full" />
                              )}
                            </div>
                            <div className="flex-1 text-left">
                              <p className="font-semibold">{store.name}</p>
                              <p className={`text-xs mt-0.5 ${editing.storeId === store.id ? "text-navy-300" : "text-navy-400"}`}>
                                {store.address}
                              </p>
                            </div>
                            {editing.storeId === store.id && <Check className="w-4 h-4 flex-shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}

                    {["admin", "kasir"].includes(editing.role) && !editing.storeId && (
                      <p className="text-xs text-amber-600 mt-2">
                        ⚠️ Staff perlu di-assign ke toko agar bisa login ke dashboard
                      </p>
                    )}
                  </div>
                )}

                {/* Owner note */}
                {editing.role === "owner" && (
                  <div className="bg-navy-50 rounded-xl p-3 text-xs text-navy-600">
                    Owner bisa akses semua toko — tidak perlu di-assign ke toko tertentu.
                  </div>
                )}
              </div>

              {/* Footer buttons */}
              <div className="px-5 pb-5 flex gap-3">
                <button
                  onClick={() => setEditing(null)}
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
                  {isSaving ? "Menyimpan..." : "Simpan"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!deactivateTarget}
        title="Nonaktifkan Pengguna?"
        message={`${deactivateTarget?.name || deactivateTarget?.email} akan dinonaktifkan. Riwayat pesanan tetap tersimpan.`}
        confirmLabel="Nonaktifkan"
        cancelLabel="Batal"
        confirmVariant="danger"
        onConfirm={() => deactivateTarget && handleDeactivate(deactivateTarget.id)}
        onCancel={() => setDeactivateTarget(null)}
      />
    </PageTransition>
  );
}
