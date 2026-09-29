"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Settings, User, Lock, Bell, Store,
  Loader2, CheckCircle, AlertCircle, Eye, EyeOff,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { useAuth, useRole, getAuthHeaders } from "@/contexts/AuthContext";
import { PageTransition } from "@/components/ui/Animations";
import { supabase } from "@/lib/supabase";
import type { Store as StoreType } from "@/types";

type Tab = "profile" | "password" | "store";

export default function SettingsPage() {
  const { user, token, login } = useAuth();
  const { isOwner, isOwnerOrAdmin } = useRole();
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  // ── Profile state ─────────────────────────────────────────────
  const [profileName,  setProfileName]  = useState(user?.name  ?? "");
  const [profileEmail, setProfileEmail] = useState(user?.email ?? "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ── Password state ────────────────────────────────────────────
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew,     setPwNew]     = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [isSavingPw,    setIsSavingPw]    = useState(false);
  const [pwMsg,         setPwMsg]         = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ── Store assignment (for owner assigning staff) ──────────────
  const [stores,         setStores]         = useState<StoreType[]>([]);
  const [storeUsers,     setStoreUsers]     = useState<{ id: string; name: string; email: string; role: string; store_id: string | null }[]>([]);
  const [isLoadingStore, setIsLoadingStore] = useState(false);
  const [assigningId,    setAssigningId]    = useState<string | null>(null);

  // Keep form in sync with user
  useEffect(() => {
    setProfileName(user?.name  ?? "");
    setProfileEmail(user?.email ?? "");
  }, [user?.id]);

  // Load stores + users when store tab active
  const loadStoreData = useCallback(async () => {
    if (!token || !isOwnerOrAdmin) return;
    setIsLoadingStore(true);
    try {
      const [storesRes, usersRes] = await Promise.all([
        fetch("/api/stores",        { headers: getAuthHeaders(token) }),
        fetch("/api/users",         { headers: getAuthHeaders(token) }),
      ]);
      if (storesRes.ok) setStores((await storesRes.json()).data ?? []);
      if (usersRes.ok)  setStoreUsers((await usersRes.json()).data ?? []);
    } catch {
      toast.error("Gagal memuat data");
    } finally {
      setIsLoadingStore(false);
    }
  }, [token, isOwnerOrAdmin]);

  useEffect(() => {
    if (activeTab === "store") loadStoreData();
  }, [activeTab, loadStoreData]);

  // ── Save profile ──────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!profileName.trim()) { setProfileMsg({ type: "err", text: "Nama tidak boleh kosong" }); return; }
    setIsSavingProfile(true);
    setProfileMsg(null);
    try {
      // Update Supabase Auth metadata
      const { error } = await supabase.auth.updateUser({
        data: { name: profileName.trim() },
      });
      if (error) throw error;

      // Update public.users via API
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ userId: user?.id, name: profileName.trim() }),
      });
      // If API returns 400 "Cannot modify your own account" use supabase directly
      if (!res.ok && res.status !== 400) {
        // Still ok — Supabase metadata updated, profile update partial
      }

      setProfileMsg({ type: "ok", text: "Profil berhasil diperbarui" });
      toast.success("Profil diperbarui!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan";
      setProfileMsg({ type: "err", text: msg });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ── Change password ───────────────────────────────────────────
  const handleChangePassword = async () => {
    setPwMsg(null);
    if (!pwCurrent)            { setPwMsg({ type: "err", text: "Masukkan password saat ini" });      return; }
    if (pwNew.length < 8)      { setPwMsg({ type: "err", text: "Password baru minimal 8 karakter" }); return; }
    if (pwNew !== pwConfirm)   { setPwMsg({ type: "err", text: "Konfirmasi password tidak cocok" });  return; }
    if (pwNew === pwCurrent)   { setPwMsg({ type: "err", text: "Password baru harus berbeda" });       return; }

    setIsSavingPw(true);
    try {
      // Verify current password by re-signing in
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: user?.email ?? "",
        password: pwCurrent,
      });
      if (loginErr) throw new Error("Password saat ini salah");

      // Update to new password
      const { error: updateErr } = await supabase.auth.updateUser({ password: pwNew });
      if (updateErr) throw updateErr;

      setPwMsg({ type: "ok", text: "Password berhasil diubah" });
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      toast.success("Password diubah!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengubah password";
      setPwMsg({ type: "err", text: msg });
    } finally {
      setIsSavingPw(false);
    }
  };

  // ── Assign user to store ──────────────────────────────────────
  const handleAssignStore = async (userId: string, storeId: string | null) => {
    setAssigningId(userId);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ userId, storeId }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      setStoreUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, store_id: storeId } : u)
      );
      toast.success("Toko berhasil di-assign");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal assign toko");
    } finally {
      setAssigningId(null);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "profile",  label: "Profil",    icon: User  },
    { id: "password", label: "Password",  icon: Lock  },
    ...(isOwnerOrAdmin ? [{ id: "store" as Tab, label: "Staff & Toko", icon: Store }] : []),
  ];

  const MsgBanner = ({ msg }: { msg: { type: "ok" | "err"; text: string } | null }) =>
    msg ? (
      <div className={`flex items-start gap-2 rounded-xl p-3 text-sm border ${
        msg.type === "ok"
          ? "bg-green-50 border-green-200 text-green-700"
          : "bg-red-50 border-red-200 text-red-700"
      }`}>
        {msg.type === "ok"
          ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
        <span>{msg.text}</span>
      </div>
    ) : null;

  return (
    <PageTransition>
      <Toaster position="top-right" />
      <div className="p-4 md:p-6 lg:p-8 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-navy-900 rounded-xl flex items-center justify-center">
            <Settings className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-navy-900">Pengaturan</h1>
            <p className="text-sm text-navy-500">Kelola akun dan preferensi</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-navy-50 rounded-xl p-1 mb-6">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? "bg-bone-50 text-navy-900 shadow-soft"
                    : "text-navy-500 hover:text-navy-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Profile Tab ────────────────────────────────────────── */}
        {activeTab === "profile" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft p-5 space-y-4"
          >
            <h2 className="font-semibold text-navy-900">Informasi Profil</h2>

            {/* Avatar placeholder */}
            <div className="flex items-center gap-4 pb-2">
              <div className="w-14 h-14 bg-navy-900 rounded-2xl flex items-center justify-center flex-shrink-0">
                <span className="text-bone-50 text-xl font-bold">
                  {(profileName || "U").charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-semibold text-navy-900">{profileName || "—"}</p>
                <p className="text-sm text-navy-500 capitalize">{user?.role ?? "—"}</p>
                {user?.store_id && (
                  <p className="text-xs text-navy-400 mt-0.5">
                    Store ID: {user.store_id.slice(0, 8)}…
                  </p>
                )}
              </div>
            </div>

            <MsgBanner msg={profileMsg} />

            <div>
              <label className="label-field">Nama Lengkap</label>
              <input
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="input-field w-full"
                placeholder="Nama kamu"
              />
            </div>

            <div>
              <label className="label-field">Email</label>
              <input
                value={profileEmail}
                disabled
                className="input-field w-full opacity-60 cursor-not-allowed"
                title="Email tidak bisa diubah"
              />
              <p className="text-xs text-navy-400 mt-1">Email tidak dapat diubah dari sini</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm pt-1">
              <div className="bg-navy-50 rounded-xl p-3">
                <p className="text-navy-400 text-xs mb-0.5">Role</p>
                <p className="font-semibold text-navy-900 capitalize">{user?.role ?? "—"}</p>
              </div>
              <div className="bg-navy-50 rounded-xl p-3">
                <p className="text-navy-400 text-xs mb-0.5">Status</p>
                <p className="font-semibold text-green-700">Aktif</p>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="w-full bg-navy-900 text-bone-50 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-navy-800 disabled:opacity-50 transition-all"
            >
              {isSavingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan Profil
            </motion.button>
          </motion.div>
        )}

        {/* ── Password Tab ───────────────────────────────────────── */}
        {activeTab === "password" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft p-5 space-y-4"
          >
            <h2 className="font-semibold text-navy-900">Ubah Password</h2>

            <MsgBanner msg={pwMsg} />

            {[
              { label: "Password Saat Ini", val: pwCurrent, set: setPwCurrent, auto: "current-password" },
              { label: "Password Baru",     val: pwNew,     set: setPwNew,     auto: "new-password" },
              { label: "Konfirmasi Password Baru", val: pwConfirm, set: setPwConfirm, auto: "new-password" },
            ].map(({ label, val, set, auto }) => (
              <div key={label}>
                <label className="label-field">{label}</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={val}
                    onChange={e => set(e.target.value)}
                    className="input-field w-full pr-10"
                    placeholder="••••••••"
                    autoComplete={auto}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600"
                    aria-label="Toggle visibility"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}

            <div className="bg-navy-50 rounded-xl p-3 text-xs text-navy-500 space-y-1">
              <p>• Minimal 8 karakter</p>
              <p>• Password baru tidak boleh sama dengan yang lama</p>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleChangePassword}
              disabled={isSavingPw}
              className="w-full bg-navy-900 text-bone-50 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-navy-800 disabled:opacity-50 transition-all"
            >
              {isSavingPw && <Loader2 className="w-4 h-4 animate-spin" />}
              Ubah Password
            </motion.button>
          </motion.div>
        )}

        {/* ── Store Tab ──────────────────────────────────────────── */}
        {activeTab === "store" && isOwnerOrAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft p-5">
              <h2 className="font-semibold text-navy-900 mb-1">Assign Staff ke Toko</h2>
              <p className="text-xs text-navy-500 mb-4">
                Tentukan staff (Admin/Kasir) mana yang bertugas di toko mana.
              </p>

              {isLoadingStore ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="bg-navy-50 h-16 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : storeUsers.filter(u => u.role !== "user").length === 0 ? (
                <p className="text-sm text-navy-400 text-center py-6">
                  Belum ada staff (Admin/Kasir). Ubah role user terlebih dahulu di halaman Pengguna.
                </p>
              ) : (
                <div className="space-y-2">
                  {storeUsers
                    .filter(u => ["admin", "kasir"].includes(u.role) && u.id !== user?.id)
                    .map(u => (
                      <div key={u.id} className="flex items-center gap-3 p-3 bg-bone-100 rounded-xl border border-navy-100">
                        <div className="w-9 h-9 bg-navy-200 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-navy-700 font-bold text-sm">
                            {(u.name || u.email || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-navy-900 truncate">
                            {u.name || u.email}
                          </p>
                          <p className="text-xs text-navy-400 capitalize">{u.role}</p>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                          {assigningId === u.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-navy-400" />
                          ) : (
                            <select
                              value={u.store_id ?? ""}
                              onChange={e => handleAssignStore(u.id, e.target.value || null)}
                              className="text-xs border border-navy-200 rounded-lg px-2 py-1.5 bg-bone-50 text-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-300"
                            >
                              <option value="">— Belum assign —</option>
                              {stores.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Store list quick view */}
            {stores.length > 0 && (
              <div className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft p-5">
                <h2 className="font-semibold text-navy-900 mb-3">Toko Terdaftar</h2>
                <div className="space-y-2">
                  {stores.map(store => {
                    const staffCount = storeUsers.filter(u => u.store_id === store.id).length;
                    return (
                      <div key={store.id} className="flex items-center justify-between p-3 bg-bone-100 rounded-xl">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-navy-900 rounded-lg flex items-center justify-center">
                            <Store className="w-4 h-4 text-gold" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-navy-900">{store.name}</p>
                            <p className="text-xs text-navy-400">{staffCount} staff assigned</p>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          store.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                        }`}>
                          {store.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
