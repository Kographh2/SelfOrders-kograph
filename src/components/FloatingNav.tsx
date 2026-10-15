"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
  const reduceMotion = useReducedMotion();
  const profileRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showMenu) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setShowMenu(false); profileRef.current?.focus(); }
      if (event.key === "Tab") {
        const controls = panelRef.current?.querySelectorAll<HTMLElement>("a, button");
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [showMenu]);

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
              className="fixed inset-0 z-[51]"
              onClick={() => setShowMenu(false)}
            />
            <motion.div
              ref={panelRef}
              id="account-panel" role="dialog" aria-label="Akun" aria-modal="true"
              initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="account-panel liquid-glass"
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
        aria-label="Navigasi utama"
        initial={reduceMotion ? false : { y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="floating-dock liquid-glass"
      >
        <div className="dock-items">
          {/* Home */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion ? "instant" : "smooth" })} className="dock-item dock-item-active" aria-current="page" aria-label="Menu">
            <Home className="w-6 h-6" />
            <span className="text-[10px] font-medium">Menu</span>
          </button>

          {/* Search */}
          <button onClick={onSearchClick} className="dock-item" aria-label="Cari">
            <Search className="w-6 h-6" />
            <span className="text-[10px] font-medium">Cari</span>
          </button>

          <motion.button whileTap={reduceMotion ? undefined : {scale:.96}} onClick={onScanClick} className="dock-item dock-scan" aria-label="Scan QR meja"><ScanLine className="h-6 w-6"/><span>Scan QR</span></motion.button>

          {/* Cart */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onCartClick}
            className="dock-item relative"
            aria-label={`Keranjang, ${cartCount} item`}
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
            ref={profileRef} aria-expanded={showMenu} aria-controls="account-panel" aria-haspopup="dialog"
            className={`dock-item ${showMenu ? "dock-item-active" : ""}`}
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
