"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, RefreshCw, Eye, ChevronDown } from "lucide-react";
import { useAuth, getAuthHeaders } from "@/contexts/AuthContext";
import { PageTransition, StaggerContainer, StaggerItem, EmptyState } from "@/components/ui/Animations";
import { ConfirmDialog } from "@/components/ui/ModernAlert";
import toast, { Toaster } from "react-hot-toast";
import type { Order, OrderStatus } from "@/types";

const STATUS_LABELS: Record<OrderStatus | "all", string> = {
  all: "Semua",
  pending: "Pending",
  confirmed: "Dikonfirmasi",
  preparing: "Dimasak",
  ready: "Siap",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending:   "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  preparing: "bg-orange-50 text-orange-700 border-orange-200",
  ready:     "bg-green-50 text-green-700 border-green-200",
  completed: "bg-navy-50 text-navy-600 border-navy-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const VALID_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  pending:   "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready:     "completed",
};

export default function OrdersPage() {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<OrderStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const storeId = user?.store_id ?? "";
      const params = new URLSearchParams();
      if (storeId) params.set("storeId", storeId);
      if (activeFilter !== "all") params.set("status", activeFilter);

      const res = await fetch(`/api/orders?${params}`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const r = await res.json();
        setOrders(r.data ?? []);
      }
    } catch { toast.error("Gagal memuat pesanan"); }
    finally { setIsLoading(false); }
  }, [token, user?.store_id, activeFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error);
      }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      toast.success(`Status: ${STATUS_LABELS[status]}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal update status");
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelOrder = async (orderId: string) => {
    setCancelTarget(null);
    await updateStatus(orderId, "cancelled");
  };

  return (
    <PageTransition>
      <Toaster position="top-right" />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-navy-900">Pesanan</h1>
            <p className="text-sm text-navy-500 mt-0.5">{orders.length} pesanan ditemukan</p>
          </div>
          <button onClick={fetchOrders} className="p-2.5 text-navy-500 hover:bg-navy-100 rounded-xl transition-colors" aria-label="Refresh">
            <RefreshCw className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {(Object.keys(STATUS_LABELS) as (OrderStatus | "all")[]).map(status => (
            <button
              key={status}
              onClick={() => setActiveFilter(status)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeFilter === status
                  ? "bg-navy-900 text-bone-50 shadow-soft"
                  : "bg-bone-100 text-navy-500 border border-navy-100 hover:bg-navy-50"
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-navy-50 rounded-2xl h-20 animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Tidak ada pesanan" description="Pesanan akan muncul di sini" />
        ) : (
          <StaggerContainer className="space-y-3">
            {orders.map(order => {
              const isExpanded = expandedId === order.id;
              const nextStatus = VALID_NEXT[order.status];
              const isUpdating = updatingId === order.id;
              return (
                <StaggerItem key={order.id}>
                  <div className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft overflow-hidden">
                    {/* Header row */}
                    <div
                      className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-navy-50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    >
                      <div className="w-10 h-10 bg-navy-900 rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-bone-50 font-bold text-sm">#{order.order_number}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[order.status]}`}>
                            {STATUS_LABELS[order.status]}
                          </span>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            order.payment_status === "paid" ? "bg-green-50 text-green-700" :
                            order.payment_status === "failed" ? "bg-red-50 text-red-700" :
                            "bg-amber-50 text-amber-700"
                          }`}>
                            {order.payment_status === "paid" ? "Lunas" : order.payment_status === "failed" ? "Gagal" : "Belum Bayar"}
                          </span>
                        </div>
                        <p className="text-xs text-navy-400 mt-1">
                          {order.table ? `Meja ${order.table.number} · ` : ""}
                          {order.customer_name || "Guest"} ·{" "}
                          {new Date(order.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-bold text-navy-900 text-sm">
                          Rp {Number(order.total_amount).toLocaleString("id-ID")}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-navy-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-navy-100 px-4 py-4 space-y-4"
                      >
                        {/* Items */}
                        <div className="space-y-2">
                          {(order.order_items ?? []).map(item => (
                            <div key={item.id} className="flex justify-between text-sm">
                              <div>
                                <span className="font-medium text-navy-900">{item.quantity}× {item.name_snapshot}</span>
                                {item.notes && <p className="text-xs text-navy-400 italic">"{item.notes}"</p>}
                              </div>
                              <span className="text-navy-700 font-medium">
                                Rp {(item.price_snapshot * item.quantity).toLocaleString("id-ID")}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Totals */}
                        <div className="border-t border-navy-100 pt-3 space-y-1 text-sm">
                          <div className="flex justify-between text-navy-500">
                            <span>Subtotal</span>
                            <span>Rp {Number(order.subtotal).toLocaleString("id-ID")}</span>
                          </div>
                          {order.tax_amount > 0 && (
                            <div className="flex justify-between text-navy-500">
                              <span>Pajak</span>
                              <span>Rp {Number(order.tax_amount).toLocaleString("id-ID")}</span>
                            </div>
                          )}
                          {order.service_charge > 0 && (
                            <div className="flex justify-between text-navy-500">
                              <span>Service Charge</span>
                              <span>Rp {Number(order.service_charge).toLocaleString("id-ID")}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-navy-900 pt-1 border-t border-navy-100">
                            <span>Total</span>
                            <span>Rp {Number(order.total_amount).toLocaleString("id-ID")}</span>
                          </div>
                        </div>

                        {order.notes && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                            📝 Catatan: {order.notes}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-1">
                          {nextStatus && (
                            <motion.button
                              whileTap={{ scale: 0.97 }}
                              onClick={() => updateStatus(order.id, nextStatus)}
                              disabled={isUpdating}
                              className="flex-1 bg-navy-900 text-bone-50 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-navy-800 disabled:opacity-50 transition-all"
                            >
                              {isUpdating ? (
                                <div className="w-4 h-4 border-2 border-bone-200 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                `→ ${STATUS_LABELS[nextStatus]}`
                              )}
                            </motion.button>
                          )}
                          {["pending", "confirmed"].includes(order.status) && (
                            <button
                              onClick={() => setCancelTarget(order.id)}
                              disabled={isUpdating}
                              className="px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-all"
                            >
                              Batalkan
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!cancelTarget}
        title="Batalkan Pesanan?"
        message="Tindakan ini tidak bisa dibatalkan. Pesanan akan berstatus cancelled."
        confirmLabel="Ya, Batalkan"
        cancelLabel="Tidak"
        confirmVariant="danger"
        onConfirm={() => cancelTarget && cancelOrder(cancelTarget)}
        onCancel={() => setCancelTarget(null)}
      />
    </PageTransition>
  );
}
