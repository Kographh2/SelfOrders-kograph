"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Search, ShoppingCart, User, LogOut, LayoutDashboard } from "lucide-react";
import { useAuth, useRole } from "@/contexts/AuthContext";
import Link from "next/link";

interface FloatingNavProps {
  cartCount?: number;
  onCartClick?: () => void;
  onProfileClick?: () => void;
}

export default function FloatingNav({
  cartCount = 0,
  onCartClick,
  onProfileClick,
}: FloatingNavProps) {
  const [showMenu, setShowMenu] = useState(false);

  // ── Fix hydration: only read auth state after mount ───────────
  // SSR renders the "not logged in" state (User icon).
  // After hydration the client syncs to the real auth state.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { user, logout, isAuthenticated } = useAuth();
  const { isStaff } = useRole();

  // While not mounted, always render the non-auth version to match SSR
  const showUserAvatar = mounted && isAuthenticated;
  const showStaffLink  = mounted && isStaff;

  return (
    <>
      {/* Profile dropdown */}
      <AnimatePresence>
        {showMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-50 w-52 bg-bone-50 border border-navy-100 rounded-2xl shadow-soft-lg overflow-hidden"
            >
              {mounted && isAuthenticated && user && (
                <div className="p-3 border-b border-navy-100">
                  <p className="text-sm font-semibold text-navy-900 truncate">{user.name || "User"}</p>
                  <p className="text-xs text-navy-400 capitalize">{user.role}</p>
                </div>
              )}

              {showStaffLink && (
                <Link
                  href="/dashboard"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm text-navy-700 hover:bg-navy-50 transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
              )}

              {mounted && isAuthenticated && (
                <Link href="/profile" onClick={() => setShowMenu(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-navy-700 hover:bg-navy-50">
                  <User className="w-4 h-4" /> Profil & Tampilan
                </Link>
              )}

              {mounted && isAuthenticated ? (
                <button
                  onClick={() => { logout(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Keluar
                </button>
              ) : (
                <button
                  onClick={() => { onProfileClick?.(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-navy-700 hover:bg-navy-50 transition-colors"
                >
                  <User className="w-4 h-4" />
                  Masuk / Daftar
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom nav */}
      <motion.nav
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-bone-50/95 backdrop-blur-xl border-t border-navy-100"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-around h-16 px-2 max-w-sm mx-auto">
          {/* Home */}
          <button className="flex flex-col items-center gap-1 px-3 py-1.5 text-gold" aria-label="Menu">
            <Home className="w-6 h-6" />
            <span className="text-[10px] font-medium">Menu</span>
          </button>

          {/* Search */}
          <button className="flex flex-col items-center gap-1 px-3 py-1.5 text-navy-400" aria-label="Cari">
            <Search className="w-6 h-6" />
            <span className="text-[10px] font-medium">Cari</span>
          </button>

          {/* Cart */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onCartClick}
            className="relative flex flex-col items-center gap-1 px-3 py-1.5 text-navy-400"
            aria-label="Keranjang"
          >
            <ShoppingCart className="w-6 h-6" />
            <span className="text-[10px] font-medium">Keranjang</span>
            {cartCount > 0 && (
              <motion.span
                key={cartCount}
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                className="absolute -top-0.5 right-0.5 bg-gold text-navy-950 text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1"
              >
                {cartCount > 99 ? "99+" : cartCount}
              </motion.span>
            )}
          </motion.button>

          {/* Profile */}
          <button
            onClick={() => setShowMenu(v => !v)}
            className={`relative flex flex-col items-center gap-1 px-3 py-1.5 ${showMenu ? "text-navy-900" : "text-navy-400"}`}
            aria-label="Akun"
          >
            {/* Always render User icon on SSR, swap to avatar after mount */}
            {showUserAvatar ? (
              <div className="w-6 h-6 bg-navy-900 rounded-full flex items-center justify-center">
                <span className="text-bone-50 text-[10px] font-bold">
                  {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                </span>
              </div>
            ) : (
              <User className="w-6 h-6" />
            )}
            <span className="text-[10px] font-medium">Akun</span>
          </button>
        </div>
      </motion.nav>
    </>
  );
}
