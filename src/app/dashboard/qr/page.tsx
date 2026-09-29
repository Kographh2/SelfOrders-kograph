"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { QrCode, Download, ExternalLink, Copy, Check, Store } from "lucide-react";
import QRCodeLib from "qrcode";
import { useAuth, useRole, getAuthHeaders } from "@/contexts/AuthContext";
import { PageTransition } from "@/components/ui/Animations";
import toast, { Toaster } from "react-hot-toast";
import type { Table, Store as StoreType } from "@/types";

export default function QRPage() {
  const { token, user } = useAuth();
  const { isOwner } = useRole();

  const [stores,       setStores]       = useState<StoreType[]>([]);
  const [tables,       setTables]       = useState<Table[]>([]);
  const [selectedStore,setSelectedStore]= useState<string>("");
  const [selectedTable,setSelectedTable]= useState<string>("");
  const [qrDataUrl,    setQrDataUrl]    = useState("");
  const [qrUrl,        setQrUrl]        = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied,       setCopied]       = useState(false);

  // Auto-select store for non-owner
  useEffect(() => {
    if (!isOwner && user?.store_id) {
      setSelectedStore(user.store_id);
    }
  }, [isOwner, user?.store_id]);

  // Load stores (owner only)
  useEffect(() => {
    if (!token || !isOwner) return;
    fetch("/api/stores", { headers: getAuthHeaders(token) })
      .then(r => r.json())
      .then(r => {
        const active = (r.data ?? []).filter((s: StoreType) => s.is_active);
        setStores(active);
        if (active.length === 1) setSelectedStore(active[0].id);
      });
  }, [token, isOwner]);

  // Load tables when store selected
  const loadTables = useCallback(async () => {
    if (!token || !selectedStore) return;
    setTables([]);
    setSelectedTable("");
    setQrDataUrl("");
    try {
      const res = await fetch(`/api/tables?storeId=${selectedStore}`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const r = await res.json();
        setTables((r.data ?? []).filter((t: Table) => t.is_active));
      }
    } catch {
      toast.error("Gagal memuat meja");
    }
  }, [token, selectedStore]);

  useEffect(() => { loadTables(); }, [loadTables]);

  const generateQR = async () => {
    if (!selectedStore || !selectedTable) {
      toast.error("Pilih toko dan meja terlebih dahulu");
      return;
    }
    setIsGenerating(true);
    try {
      const appUrl = window.location.origin;
      const table  = tables.find(t => t.id === selectedTable);
      if (!table) throw new Error("Meja tidak ditemukan");

      const url = `${appUrl}/menu?store=${selectedStore}&table=${table.number}`;
      setQrUrl(url);

      const storeName = stores.find(s => s.id === selectedStore)?.name ?? "";

      const dataUrl = await QRCodeLib.toDataURL(url, {
        width: 400,
        margin: 3,
        color: { dark: "#0F1E2B", light: "#FAF8F5" },
        errorCorrectionLevel: "H",
      });
      setQrDataUrl(dataUrl);
      toast.success(`QR Meja ${table.number} siap!`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal generate QR");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadQR = () => {
    if (!qrDataUrl) return;
    const table     = tables.find(t => t.id === selectedTable);
    const storeName = stores.find(s => s.id === selectedStore)?.name ?? "toko";
    const filename  = `QR-${storeName.replace(/\s+/g, "-")}-Meja-${table?.number ?? selectedTable}.png`;
    const a = document.createElement("a");
    a.href     = qrDataUrl;
    a.download = filename;
    a.click();
    toast.success("QR didownload!");
  };

  const copyUrl = async () => {
    if (!qrUrl) return;
    await navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("URL disalin!");
  };

  // Generate all tables at once
  const downloadAll = async () => {
    if (!selectedStore || tables.length === 0) return;
    const appUrl = window.location.origin;
    toast.loading("Generating semua QR...", { id: "batch-qr" });

    for (const table of tables) {
      const url     = `${appUrl}/menu?store=${selectedStore}&table=${table.number}`;
      const storeName = stores.find(s => s.id === selectedStore)?.name ?? "toko";
      try {
        const dataUrl = await QRCodeLib.toDataURL(url, {
          width: 400, margin: 3,
          color: { dark: "#0F1E2B", light: "#FAF8F5" },
          errorCorrectionLevel: "H",
        });
        const a = document.createElement("a");
        a.href     = dataUrl;
        a.download = `QR-${storeName.replace(/\s+/g, "-")}-Meja-${table.number}.png`;
        a.click();
        await new Promise(r => setTimeout(r, 300)); // prevent browser blocking
      } catch { /* continue */ }
    }
    toast.success(`${tables.length} QR didownload!`, { id: "batch-qr" });
  };

  const selectedTableObj = tables.find(t => t.id === selectedTable);
  const selectedStoreName = stores.find(s => s.id === selectedStore)?.name ?? "";

  return (
    <PageTransition>
      <Toaster position="top-right" />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-navy-900 rounded-xl flex items-center justify-center">
            <QrCode className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-navy-900">QR Generator</h1>
            <p className="text-sm text-navy-500">Generate QR code untuk setiap meja</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Controls */}
          <div className="space-y-4">
            <div className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft p-5 space-y-4">
              {/* Store selector (owner only) */}
              {isOwner && stores.length > 1 && (
                <div>
                  <label className="label-field">Pilih Toko</label>
                  <select
                    value={selectedStore}
                    onChange={e => { setSelectedStore(e.target.value); setQrDataUrl(""); }}
                    className="input-field w-full"
                  >
                    <option value="">— Pilih toko —</option>
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Store info for non-owner */}
              {!isOwner && user?.store_id && (
                <div className="flex items-center gap-2 bg-navy-50 rounded-xl px-3 py-2">
                  <Store className="w-4 h-4 text-navy-400" />
                  <span className="text-sm text-navy-700 font-medium">
                    {selectedStoreName || "Toko kamu"}
                  </span>
                </div>
              )}

              {/* Table selector */}
              <div>
                <label className="label-field">Pilih Meja</label>
                {tables.length === 0 ? (
                  <p className="text-sm text-navy-400 py-2">
                    {selectedStore
                      ? "Belum ada meja. Tambahkan di halaman Meja."
                      : "Pilih toko terlebih dahulu."}
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {tables.map(table => (
                      <motion.button
                        key={table.id}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => { setSelectedTable(table.id); setQrDataUrl(""); }}
                        className={`aspect-square rounded-xl text-sm font-bold transition-all ${
                          selectedTable === table.id
                            ? "bg-navy-900 text-bone-50 shadow-soft"
                            : "bg-bone-100 text-navy-700 border border-navy-200 hover:bg-navy-50"
                        }`}
                      >
                        {table.number}
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>

              {/* Generate button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={generateQR}
                disabled={isGenerating || !selectedStore || !selectedTable}
                className="w-full bg-navy-900 text-bone-50 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-navy-800 disabled:opacity-50 transition-all"
              >
                <QrCode className="w-4 h-4" />
                {isGenerating ? "Generating..." : `Generate QR Meja ${selectedTableObj?.number ?? ""}`}
              </motion.button>

              {/* Download all */}
              {tables.length > 1 && selectedStore && (
                <button
                  onClick={downloadAll}
                  className="w-full py-3 rounded-xl border border-navy-200 text-navy-700 text-sm font-medium hover:bg-navy-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Semua ({tables.length} Meja)
                </button>
              )}
            </div>

            {/* Instructions */}
            <div className="bg-navy-900 text-bone-50 rounded-2xl p-5 text-sm space-y-2">
              <p className="font-semibold text-gold mb-3">Cara pakai QR:</p>
              <p className="flex items-start gap-2 text-navy-300">
                <span className="bg-navy-700 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                Generate QR untuk setiap nomor meja
              </p>
              <p className="flex items-start gap-2 text-navy-300">
                <span className="bg-navy-700 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                Download PNG dan print
              </p>
              <p className="flex items-start gap-2 text-navy-300">
                <span className="bg-navy-700 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                Tempel di meja sesuai nomor
              </p>
              <p className="flex items-start gap-2 text-navy-300">
                <span className="bg-navy-700 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                Customer scan → langsung ke menu
              </p>
            </div>
          </div>

          {/* Right: Preview */}
          <div>
            {qrDataUrl ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft p-6"
              >
                <div className="text-center mb-4">
                  <p className="text-xs text-navy-400 mb-0.5">Preview QR</p>
                  <p className="font-semibold text-navy-900">
                    {selectedStoreName} · Meja {selectedTableObj?.number}
                  </p>
                </div>

                {/* QR Image */}
                <div className="bg-bone-100 rounded-2xl p-4 flex items-center justify-center mb-5">
                  <img
                    src={qrDataUrl}
                    alt={`QR Meja ${selectedTableObj?.number}`}
                    className="w-64 h-64 object-contain rounded-xl"
                  />
                </div>

                {/* URL display */}
                <div className="bg-navy-50 rounded-xl px-3 py-2 mb-4 flex items-center gap-2">
                  <p className="text-xs text-navy-600 font-mono flex-1 truncate">{qrUrl}</p>
                  <button onClick={copyUrl} className="flex-shrink-0 text-navy-400 hover:text-navy-700" aria-label="Copy URL">
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={downloadQR}
                    className="flex-1 flex items-center justify-center gap-2 bg-navy-900 text-bone-50 py-3 rounded-xl text-sm font-semibold hover:bg-navy-800 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download PNG
                  </motion.button>
                  <a
                    href={qrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-navy-200 text-navy-700 text-sm font-medium hover:bg-navy-50 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Test
                  </a>
                </div>
              </motion.div>
            ) : (
              <div className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft h-full min-h-[320px] flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-navy-50 rounded-2xl flex items-center justify-center mb-4">
                  <QrCode className="w-8 h-8 text-navy-300" />
                </div>
                <p className="font-medium text-navy-600">Belum ada QR</p>
                <p className="text-sm text-navy-400 mt-1">
                  {!selectedStore
                    ? "Pilih toko terlebih dahulu"
                    : !selectedTable
                    ? "Pilih nomor meja"
                    : "Klik Generate QR"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
