"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, ShoppingBag, ChefHat, UtensilsCrossed, Clock3,
  Tag, Table2, QrCode, Users, Settings, Store, LogOut, Boxes, BarChart3, ClipboardList, MessageCircle,
  ChevronLeft, ChevronRight, Menu, X, ScanBarcode, BadgePercent, Truck, Gift, ClipboardCheck, ShieldCheck, MessageSquareWarning, TrendingUp,
} from "lucide-react";
import { useAuth, useRole } from "@/contexts/AuthContext";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",          label: "Dashboard",   icon: LayoutDashboard,  roles: ["owner","admin","kasir"] },
  { href: "/dashboard/orders",   label: "Pesanan",     icon: ShoppingBag,      roles: ["owner","admin","kasir"] },
  { href: "/dashboard/kitchen",  label: "Dapur",       icon: ChefHat,          roles: ["owner","admin","kasir"] },
  { href: "/dashboard/pos",      label: "POS & Scanner",icon: ScanBarcode,      roles: ["owner","admin","kasir"] },
  { href: "/dashboard/menu",     label: "Menu",        icon: UtensilsCrossed,  roles: ["owner","admin"] },
  { href: "/dashboard/categories", label: "Kategori",  icon: Tag,              roles: ["owner","admin"] },
  { href: "/dashboard/tables",   label: "Meja",        icon: Table2,           roles: ["owner","admin"] },
  { href: "/dashboard/qr",       label: "QR Generator",icon: QrCode,           roles: ["owner","admin"] },
  { href: "/dashboard/users",    label: "Pengguna",    icon: Users,            roles: ["owner","admin"] },
  { href: "/dashboard/stores",   label: "Toko",        icon: Store,            roles: ["owner"] },
  { href: "/dashboard/promos",   label: "Promo Struk", icon: BadgePercent,     roles: ["owner"] },
  { href: "/dashboard/settings", label: "Pengaturan",  icon: Settings,         roles: ["owner","admin"] },
  { href: "/dashboard/hours", label: "Jam Operasional", icon: Clock3,          roles: ["owner","admin"] },
  { href: "/dashboard/inventory", label: "Stok Bahan", icon: Boxes, roles: ["owner","admin"] },
  { href: "/dashboard/reports", label: "Laporan", icon: BarChart3, roles: ["owner","admin","kasir"] },
  { href: "/dashboard/audit", label: "Aktivitas", icon: ClipboardList, roles: ["owner","admin"] },
  { href: "/dashboard/reservations", label: "Reservasi", icon: Table2, roles: ["owner","admin","kasir"] },
  { href: "/dashboard/telegram", label: "Chat Telegram", icon: MessageCircle, roles: ["owner","admin","kasir"] },
  { href: "/dashboard/purchasing", label: "Pemasok & Pembelian", icon: Truck, roles: ["owner","admin"] },
  { href: "/dashboard/food-cost", label: "HPP & Margin Menu", icon: TrendingUp, roles: ["owner","admin"] },
  { href: "/dashboard/rewards", label: "Reward Loyalti", icon: Gift, roles: ["owner","admin"] },
  { href: "/dashboard/refunds", label: "Refund", icon: ClipboardCheck, roles: ["owner","admin"] },
  { href: "/dashboard/customer-care", label: "Layanan Pelanggan", icon: MessageSquareWarning, roles: ["owner","admin","kasir"] },
  { href: "/dashboard/forecast", label: "Prediksi & Persiapan", icon: TrendingUp, roles: ["owner","admin"] },
  { href: "/dashboard/staff", label: "Jadwal & Absensi", icon: ClipboardCheck, roles: ["owner","admin","kasir"] },
  { href: "/dashboard/policies", label: "Kebijakan & FAQ", icon: ShieldCheck, roles: ["owner","admin"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { role } = useRole();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => role && item.roles.includes(role));

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
          isActive
            ? "bg-gold text-navy-950 font-semibold shadow-soft"
            : "text-navy-300 hover:bg-navy-800 hover:text-bone-50"
        }`}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-navy-900" : ""}`} />
        {(!collapsed || mobileOpen) && (
          <span className="text-sm truncate">{item.label}</span>
        )}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-navy-800 ${collapsed && !mobileOpen ? "justify-center" : ""}`}>
        <div className="w-8 h-8 bg-gold rounded-xl flex items-center justify-center flex-shrink-0">
          <UtensilsCrossed className="w-4 h-4 text-navy-950" />
        </div>
        {(!collapsed || mobileOpen) && (
          <span className="font-display font-bold text-bone-50 text-sm">SelfOrder</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-3 pb-4 border-t border-navy-800 pt-4 space-y-2">
        {(!collapsed || mobileOpen) && user && (
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-bone-50 truncate">{user.name}</p>
            <p className="text-xs text-navy-400 capitalize">{user.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-navy-400 hover:bg-red-900/30 hover:text-red-400 transition-all"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {(!collapsed || mobileOpen) && <span className="text-sm">Keluar</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 bg-navy-900 text-bone-50 rounded-xl shadow-soft-lg"
        aria-label="Buka menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-navy-950/60 z-40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "tween", duration: 0.22 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-navy-900 z-50 lg:hidden"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-1.5 text-navy-400 hover:text-bone-50"
                aria-label="Tutup menu"
              >
                <X className="w-5 h-5" />
              </button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-navy-900 transition-all duration-200 flex-shrink-0 ${
          collapsed ? "w-[68px]" : "w-56"
        }`}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="absolute bottom-20 -right-3 w-6 h-6 bg-navy-700 border border-navy-600 rounded-full text-navy-300 flex items-center justify-center hover:bg-navy-600 transition-colors"
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>
    </>
  );
}
