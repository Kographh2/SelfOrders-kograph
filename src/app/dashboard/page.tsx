"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag, CheckCircle, Clock, XCircle,
  UtensilsCrossed, Table2, TrendingUp, RefreshCw,
} from "lucide-react";
import { useAuth, useRole, getAuthHeaders } from "@/contexts/AuthContext";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/ui/Animations";

interface OrderRow {
  id: string;
  status: string;
  payment_status: string;
  total_amount: number;
  created_at: string;
}
interface Stats {
  orders:    OrderRow[];
  menuItems: { id: string; is_available: boolean }[];
  tables:    { id: string; is_active: boolean }[];
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: number | string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-bone-50 border border-navy-100 rounded-2xl p-5 shadow-soft">
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-bone-50" />
      </div>
      <p className="text-2xl font-display font-bold text-navy-900">{value}</p>
      <p className="text-sm font-medium text-navy-700 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-navy-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { token, user } = useAuth();
  const { role } = useRole();
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Use refs to track stable values and prevent closure stale deps
  const tokenRef   = useRef(token);
  const storeIdRef = useRef(user?.store_id ?? "");
  useEffect(() => { tokenRef.current   = token;              }, [token]);
  useEffect(() => { storeIdRef.current = user?.store_id ?? ""; }, [user?.store_id]);

  const fetchStats = useCallback(async (silent = false) => {
    const t = tokenRef.current;
    const s = storeIdRef.current;
    if (!t) return;
    if (!silent) setIsLoading(true);
    try {
      const url = `/api/dashboard/stats${s ? `?storeId=${s}` : ""}`;
      const res = await fetch(url, { headers: getAuthHeaders(t) });
      if (res.ok) setStats((await res.json()).data);
    } catch { /* non-fatal */ }
    finally { if (!silent) setIsLoading(false); }
  }, []); // ✅ Empty deps — reads from refs, never stale, never changes reference

  // ✅ Fetch once on mount when token is available
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!token || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchStats();
  }, [token, fetchStats]);

  // ✅ Refetch when tab regains focus — NOT on a timer
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchStats(true); // silent = don't show spinner
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchStats]);

  const orders      = stats?.orders ?? [];
  const today       = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === today);
  const pending     = orders.filter(o => o.status === "pending").length;
  const completed   = todayOrders.filter(o => o.status === "completed").length;
  const cancelled   = todayOrders.filter(o => o.status === "cancelled").length;
  const revenue     = todayOrders
    .filter(o => o.payment_status === "paid")
    .reduce((s, o) => s + Number(o.total_amount), 0);
  const availableItems = (stats?.menuItems ?? []).filter(m => m.is_available).length;
  const activeTables   = (stats?.tables   ?? []).filter(t => t.is_active).length;

  return (
    <PageTransition>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-navy-900">Dashboard</h1>
            <p className="text-sm text-navy-500 mt-0.5 capitalize">
              {role} · {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <button
            onClick={() => fetchStats()}
            disabled={isLoading}
            className="p-2.5 text-navy-500 hover:bg-navy-100 rounded-xl transition-colors disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-navy-50 rounded-2xl h-28 animate-pulse" />
            ))}
          </div>
        ) : (
          <StaggerContainer className="space-y-6">
            <StaggerItem>
              <div className="bg-navy-900 text-bone-50 rounded-2xl p-6">
                <p className="text-navy-300 text-sm mb-1">Pendapatan Hari Ini</p>
                <p className="text-4xl font-display font-bold">
                  Rp {revenue.toLocaleString("id-ID")}
                </p>
                <p className="text-navy-400 text-xs mt-2">{completed} pesanan selesai hari ini</p>
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Pesanan Pending"  value={pending}       sub="Butuh konfirmasi"  icon={Clock}          color="bg-amber-500" />
                <StatCard label="Selesai Hari Ini" value={completed}     sub="Pesanan completed" icon={CheckCircle}    color="bg-green-600" />
                <StatCard label="Dibatalkan"        value={cancelled}     sub="Hari ini"          icon={XCircle}        color="bg-red-500"   />
                <StatCard label="Total Pesanan"     value={orders.length} sub="Semua waktu"       icon={ShoppingBag}    color="bg-navy-700"  />
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label="Menu Tersedia" value={availableItems}
                  sub={`dari ${stats?.menuItems?.length ?? 0} total`}
                  icon={UtensilsCrossed} color="bg-navy-600"
                />
                <StatCard
                  label="Meja Aktif" value={activeTables}
                  sub={`dari ${stats?.tables?.length ?? 0} total`}
                  icon={Table2} color="bg-navy-500"
                />
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="bg-bone-50 border border-navy-100 rounded-2xl shadow-soft overflow-hidden">
                <div className="px-5 py-4 border-b border-navy-100 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-navy-500" />
                  <h2 className="font-semibold text-navy-900">Pesanan Terbaru</h2>
                </div>
                {orders.length === 0 ? (
                  <div className="text-center py-12 text-navy-400 text-sm">Belum ada pesanan</div>
                ) : (
                  <div className="divide-y divide-navy-50">
                    {orders.slice(0, 8).map(order => (
                      <div key={order.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-sm font-medium text-navy-900">
                            #{order.id.slice(-6).toUpperCase()}
                          </p>
                          <p className="text-xs text-navy-400">
                            {new Date(order.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            order.status === "completed" ? "bg-green-50 text-green-700" :
                            order.status === "pending"   ? "bg-amber-50 text-amber-700" :
                            order.status === "cancelled" ? "bg-red-50 text-red-700" :
                            "bg-blue-50 text-blue-700"
                          }`}>
                            {order.status}
                          </span>
                          <span className="text-sm font-semibold text-navy-900">
                            Rp {Number(order.total_amount).toLocaleString("id-ID")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </StaggerItem>
          </StaggerContainer>
        )}
      </div>
    </PageTransition>
  );
}
