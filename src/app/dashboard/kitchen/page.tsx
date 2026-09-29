"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Clock, CheckCircle, ChefHat, X, RefreshCw, Table2, User, ArrowRight,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { PageTransition, StaggerContainer, StaggerItem, EmptyState } from "@/components/ui/Animations";
import { useAuth, useRole, getAuthHeaders } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Order, OrderStatus } from "@/types";

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; bg: string; next?: OrderStatus }
> = {
  pending:   { label: "Menunggu",       color: "text-amber-700",  bg: "bg-amber-50",  next: "confirmed" },
  confirmed: { label: "Dikonfirmasi",   color: "text-blue-700",   bg: "bg-blue-50",   next: "preparing" },
  preparing: { label: "Dimasak",        color: "text-orange-700", bg: "bg-orange-50", next: "ready" },
  ready:     { label: "Siap Disajikan", color: "text-green-700",  bg: "bg-green-50",  next: "completed" },
  completed: { label: "Selesai",        color: "text-navy-500",   bg: "bg-navy-50" },
  cancelled: { label: "Dibatalkan",     color: "text-red-700",    bg: "bg-red-50" },
};

const ACTIVE_STATUSES: OrderStatus[] = ["pending", "confirmed", "preparing", "ready"];
const ALL_STATUSES: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "completed", "cancelled"];

export default function KitchenPage() {
  const { token, user } = useAuth();
  const { isStaff } = useRole();
  const storeId = user?.store_id ?? "";
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      const res = await fetch(
        `/api/orders?storeId=${storeId}`,
        { headers: getAuthHeaders(token) }
      );
      if (!res.ok) throw new Error();
      const r = await res.json();
      setOrders(r.data ?? []);
    } catch {
      toast.error("Gagal memuat pesanan");
    } finally {
      setIsLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    if (token) fetchOrders();
  }, [fetchOrders, token]);

  // Realtime subscription
  useEffect(() => {
    if (!storeId) return;

    channelRef.current = supabase
      .channel(`kitchen-orders-${storeId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `store_id=eq.${storeId}`,
      }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [storeId, fetchOrders]);

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(token) },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error ?? "Gagal update status");
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
      toast.success(`Status diperbarui: ${STATUS_CONFIG[newStatus].label}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal update status";
      toast.error(msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const displayed = orders.filter((o) => {
    if (o.payment_status !== "paid") return false;
    if (filter === "all") return ACTIVE_STATUSES.includes(o.status);
    return o.status === filter;
  });

  if (!isStaff) {
    return (
      <div className="flex items-center justify-center min-h-screen">
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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-navy-900 rounded-xl flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-navy-900">Dapur</h1>
              <p className="text-sm text-navy-500">{displayed.length} pesanan aktif</p>
            </div>
          </div>
          <button
            onClick={fetchOrders}
            className="p-2.5 text-navy-500 hover:text-navy-700 hover:bg-navy-100 rounded-xl transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {[
            { id: "all", label: "Aktif" },
            ...ACTIVE_STATUSES.map((s) => ({ id: s, label: STATUS_CONFIG[s].label })),
            { id: "completed", label: "Selesai" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as OrderStatus | "all")}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                filter === tab.id
                  ? "bg-navy-900 text-bone-50 shadow-soft"
                  : "bg-bone-100 text-navy-500 border border-navy-100 hover:bg-navy-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Orders grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-[3px] border-navy-200 border-t-gold rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <EmptyState
            icon={ChefHat}
            title="Tidak ada pesanan"
            description="Pesanan baru akan muncul di sini secara real-time"
          />
        ) : (
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayed.map((order) => {
              const cfg = STATUS_CONFIG[order.status];
              const isUpdating = updatingId === order.id;
              return (
                <StaggerItem key={order.id}>
                  <motion.div
                    layout
                    className={`rounded-2xl border-2 overflow-hidden shadow-soft ${
                      order.status === "pending" ? "border-amber-300" : "border-navy-100"
                    }`}
                  >
                    {/* Card header */}
                    <div className="bg-navy-900 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-bone-50 font-bold text-lg">#{order.order_number}</span>
                        {order.status === "pending" && (
                          <motion.span
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ repeat: Infinity, duration: 1.4 }}
                            className="w-2.5 h-2.5 bg-amber-400 rounded-full"
                          />
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>

                    <div className="bg-bone-50 p-4 space-y-3">
                      {/* Table & customer */}
                      <div className="flex items-center gap-3 text-sm text-navy-500">
                        {order.table && (
                          <span className="flex items-center gap-1">
                            <Table2 className="w-4 h-4" />
                            Meja {order.table.number}
                          </span>
                        )}
                        {order.customer_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {order.customer_name}
                          </span>
                        )}
                      </div>

                      {/* Items */}
                      <div className="space-y-1.5">
                        {(order.order_items ?? []).map((item) => (
                          <div key={item.id} className="flex justify-between items-start text-sm">
                            <div>
                              <span className="font-medium text-navy-900">
                                {item.quantity}× {item.name_snapshot}
                              </span>
                              {item.notes && (
                                <p className="text-xs text-navy-400 italic">"{item.notes}"</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {order.notes && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                          📝 {order.notes}
                        </div>
                      )}

                      {/* Time */}
                      <div className="flex items-center gap-1 text-xs text-navy-400">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(order.created_at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>

                      {/* Action button */}
                      {cfg.next && (
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => updateStatus(order.id, cfg.next!)}
                          disabled={isUpdating}
                          className="w-full bg-navy-900 text-bone-50 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-navy-800 disabled:opacity-50 transition-all"
                        >
                          {isUpdating ? (
                            <div className="w-4 h-4 border-2 border-bone-200 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <span>→ {STATUS_CONFIG[cfg.next].label}</span>
                            </>
                          )}
                        </motion.button>
                      )}

                      {order.status === "completed" && (
                        <div className="flex items-center justify-center gap-1.5 text-sm text-green-600 py-2">
                          <CheckCircle className="w-4 h-4" />
                          <span>Pesanan selesai</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        )}
      </div>
    </PageTransition>
  );
}
