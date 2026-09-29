"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Search, ShoppingCart, User, LogOut, LayoutDashboard, ScanLine } from "lucide-react";
import { useAuth, useRole } from "@/contexts/AuthContext";
import Link from "next/link";

interface FloatingNavProps {
  cartCount?: number;
  onCartClick?: () => void;
  onProfileClick?: () => void;
  onSearchClick?: () => void;
  onScanClick?: () => void;
}

export default function FloatingNav({
  cartCount = 0,
  onCartClick,
  onProfileClick,
  onSearchClick,
  onScanClick,
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
              className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-50 w-56 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl dark:border-white/10 dark:bg-[#09162b]"
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
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-blue-100 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#061124]/95"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto grid h-[4.75rem] w-full max-w-md grid-cols-5 items-center px-2">
          {/* Home */}
          <button className="flex flex-col items-center justify-self-center gap-1 px-2 py-1.5 text-blue-600" aria-label="Menu">
            <Home className="w-6 h-6" />
            <span className="text-[10px] font-medium">Menu</span>
          </button>

          {/* Search */}
          <button onClick={onSearchClick} className="flex flex-col items-center justify-self-center gap-1 px-2 py-1.5 text-slate-400 hover:text-blue-600" aria-label="Cari">
            <Search className="w-6 h-6" />
            <span className="text-[10px] font-medium">Cari</span>
          </button>

          <motion.button whileTap={{scale:.9}} onClick={onScanClick} className="relative -mt-8 grid h-16 w-16 justify-self-center place-items-center rounded-full border-[5px] border-white bg-blue-600 text-white shadow-xl shadow-blue-900/30 dark:border-[#061124]" aria-label="Scan QR meja"><ScanLine className="h-7 w-7"/></motion.button>

          {/* Cart */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onCartClick}
            className="relative flex flex-col items-center justify-self-center gap-1 px-2 py-1.5 text-slate-400 hover:text-blue-600"
            aria-label="Keranjang"
          >
            <ShoppingCart className="w-6 h-6" />
            <span className="text-[10px] font-medium">Keranjang</span>
            {cartCount > 0 && (
              <motion.span
                key={cartCount}
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                className="absolute -top-0.5 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white"
              >
                {cartCount > 99 ? "99+" : cartCount}
              </motion.span>
            )}
          </motion.button>

          {/* Profile */}
          <button
            onClick={() => setShowMenu(v => !v)}
            className={`relative flex flex-col items-center justify-self-center gap-1 px-2 py-1.5 ${showMenu ? "text-navy-900" : "text-navy-400"}`}
            aria-label="Akun"
          >
            {/* Always render User icon on SSR, swap to avatar after mount */}
            {showUserAvatar ? (
              <div className="w-6 h-6 bg-navy-900 rounded-full flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">
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
