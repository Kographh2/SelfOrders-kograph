"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, QrCode, Trash2, Table2, ExternalLink } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import QRCode from "qrcode";
import { useAuth, useRole, getAuthHeaders } from "@/contexts/AuthContext";
import { PageTransition, StaggerContainer, StaggerItem, EmptyState } from "@/components/ui/Animations";
import { ConfirmDialog } from "@/components/ui/ModernAlert";
import type { Table } from "@/types";

export default function TablesPage() {
  const { token, user } = useAuth();
  const { isOwnerOrAdmin } = useRole();
  const storeId = user?.store_id ?? "";

  const [tables, setTables] = useState<Table[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [qrPreviews, setQrPreviews] = useState<Record<string, string>>({});

  const fetchTables = useCallback(async () => {
    if (!token || !storeId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tables?storeId=${storeId}`, { headers: getAuthHeaders(token) });
      if (res.ok) setTables((await res.json()).data ?? []);
    } catch { toast.error("Gagal memuat data meja"); }
    finally { setIsLoading(false); }
  }, [token, storeId]);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  const generateQrDataUrl = async (table: Table) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const url = `${appUrl}/menu?store=${storeId}&table=${table.number}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: "#0B1622", light: "#FAF8F5" } });
      setQrPreviews(prev => ({ ...prev, [table.id]: dataUrl }));
      return dataUrl;
    } catch { toast.error("Gagal generate QR"); return null; }
  };

  const downloadQr = async (table: Table) => {
    const dataUrl = qrPreviews[table.id] || await generateQrDataUrl(table);
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-meja-${table.number}.png`;
    a.click();
  };

  const handleAddTable = async () => {
    const num = parseInt(newTableNumber);
    if (!num || num < 1) { toast.error("Nomor meja tidak valid"); return; }
    setIsSaving(true);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ storeId, number: num }),
      });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error); }
      toast.success(`Meja ${num} ditambahkan`);
      setNewTableNumber("");
      setShowForm(false);
      fetchTables();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menambah meja");
    } finally { setIsSaving(false); }
  };

  const handleDeactivate = async (id: string) => {
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/tables/${id}`, {
        method: "DELETE", headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error();
      setTables(prev => prev.filter(t => t.id !== id));
      toast.success("Meja dinonaktifkan");
    } catch { toast.error("Gagal menonaktifkan meja"); }
  };

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <PageTransition>
      <Toaster position="top-right" />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-navy-900">Manajemen Meja</h1>
            <p className="text-sm text-navy-500">{tables.length} meja terdaftar</p>
          </div>
          {isOwnerOrAdmin && (
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-navy-900 text-bone-50 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-navy-800 shadow-soft transition-all">
              <Plus className="w-4 h-4" /> Tambah Meja
            </motion.button>
          )}
        </div>

        {showForm && isOwnerOrAdmin && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft p-5 mb-6">
            <h3 className="font-semibold text-navy-900 mb-4">Tambah Meja Baru</h3>
            <div className="flex gap-3">
              <input
                type="number" value={newTableNumber}
                onChange={e => setNewTableNumber(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddTable()}
                placeholder="Nomor meja (contoh: 8)"
                className="input-field flex-1" min="1"
              />
              <button onClick={handleAddTable} disabled={isSaving}
                className="bg-navy-900 text-bone-50 px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-navy-800 disabled:opacity-50 transition-all">
                {isSaving ? "..." : "Tambah"}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2.5 rounded-xl border border-navy-200 text-navy-600 text-sm hover:bg-navy-50 transition-colors">
                Batal
              </button>
            </div>
          </motion.div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-navy-50 rounded-2xl h-48 animate-pulse" />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <EmptyState icon={Table2} title="Belum ada meja" description="Tambahkan meja untuk mulai menerima pesanan" />
        ) : (
          <StaggerContainer className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {tables.map(table => (
              <StaggerItem key={table.id}>
                <div className={`bg-bone-50 border rounded-2xl shadow-soft overflow-hidden ${table.is_active ? "border-navy-100" : "border-navy-200 opacity-60"}`}>
                  {/* QR Preview area */}
                  <div className="aspect-square bg-bone-100 flex items-center justify-center p-4">
                    {qrPreviews[table.id] ? (
                      <img src={qrPreviews[table.id]} alt={`QR Meja ${table.number}`} className="w-full h-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-navy-300">
                        <QrCode className="w-12 h-12" />
                        <span className="text-xs">Belum digenerate</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-bold text-navy-900 text-lg">Meja {table.number}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${table.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                          {table.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-navy-400 mb-3 truncate">
                      {appUrl}/menu?store={storeId}&table={table.number}
                    </p>

                    <div className="space-y-2">
                      <button
                        onClick={() => qrPreviews[table.id] ? downloadQr(table) : generateQrDataUrl(table)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-navy-900 text-bone-50 text-xs font-semibold hover:bg-navy-800 transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        {qrPreviews[table.id] ? "Download QR" : "Generate QR"}
                      </button>
                      <div className="flex gap-2">
                        <a
                          href={`${appUrl}/menu?store=${storeId}&table=${table.number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border border-navy-200 text-navy-600 text-xs hover:bg-navy-50 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> Buka
                        </a>
                        {isOwnerOrAdmin && (
                          <button
                            onClick={() => setDeleteTarget(table.id)}
                            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border border-red-200 text-red-500 text-xs hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Nonaktifkan Meja?"
        message="Meja akan dinonaktifkan. Pesanan yang sudah ada tidak akan terpengaruh."
        confirmLabel="Nonaktifkan"
        cancelLabel="Batal"
        confirmVariant="danger"
        onConfirm={() => deleteTarget && handleDeactivate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageTransition>
  );
}
