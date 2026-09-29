"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Minus, Star, Clock,
  ShoppingCart, AlertCircle, Sparkles, Tag,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import FloatingNav from "@/components/FloatingNav";
import CartDrawer from "@/components/CartDrawer";
import NotificationPrompt from "@/components/NotificationPrompt";
import AuthPrompt from "@/components/AuthPrompt";
import PaymentModal from "@/components/PaymentModal";
import { TypingText } from "@/components/ui/Animations";
import { useAuth } from "@/contexts/AuthContext";
import type { MenuItem as MenuItemType, CartItem } from "@/types";

interface Category { id: string; name: string; display_order: number }
interface StoreInfo { id: string; name: string; address: string; tax_rate?: number; service_charge_rate?: number }

export default function MenuPageContent() {
  const params    = useSearchParams();
  const tableNum  = params.get("table") ?? "";   // nomor meja dari QR, misal "2"
  const storeId   = params.get("store") ?? "";

  const { token, user, isAuthenticated } = useAuth();

  const [showNotification, setShowNotification] = useState(false);
  const [showAuth,         setShowAuth]          = useState(false);
  const [cart,             setCart]              = useState<CartItem[]>([]);
  const [showPayment,      setShowPayment]        = useState(false);
  const [showCart,         setShowCart]           = useState(false);

  const [categories,    setCategories]    = useState<Category[]>([]);
  const [menuItems,     setMenuItems]     = useState<MenuItemType[]>([]);
  const [storeInfo,     setStoreInfo]     = useState<StoreInfo | null>(null);
  const [selectedCat,   setSelectedCat]   = useState<string>("all");
  const [searchQuery,   setSearchQuery]   = useState("");
  const [isLoading,     setIsLoading]     = useState(true);
  const [error,         setError]          = useState<string | null>(null);

  // Track if notification prompt was shown
  const promptShownRef = useRef(false);

  useEffect(() => {
    if (!localStorage.getItem("selforder_session_id")) {
      localStorage.setItem("selforder_session_id", crypto.randomUUID());
    }
  }, []);

  const fetchMenuData = useCallback(async () => {
    if (!storeId) { setError("Store ID tidak ditemukan. Scan ulang QR."); setIsLoading(false); return; }
    try {
      setIsLoading(true);
      setError(null);

      const [storeRes, catRes, menuRes] = await Promise.all([
        fetch(`/api/stores/${storeId}`),
        fetch(`/api/menu/categories?storeId=${storeId}`),
        fetch(`/api/menu/items?storeId=${storeId}`),
      ]);

      if (storeRes.ok) setStoreInfo((await storeRes.json()).data);
      if (catRes.ok)   setCategories((await catRes.json()).data ?? []);
      if (menuRes.ok)  setMenuItems((await menuRes.json()).data ?? []);
    } catch {
      setError("Menu gagal dimuat. Periksa koneksi dan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => { fetchMenuData(); }, [fetchMenuData]);

  // Show notification prompt after 1.5s (only once, only if not authenticated)
  useEffect(() => {
    if (isAuthenticated || promptShownRef.current) return;
    const t = setTimeout(() => { setShowNotification(true); promptShownRef.current = true; }, 1500);
    return () => clearTimeout(t);
  }, [isAuthenticated]);

  const addToCart = (item: MenuItemType) => {
    if (!item.is_available) { toast.error("Menu ini sedang tidak tersedia"); return; }
    setCart(prev => {
      const ex = prev.find(c => c.id === item.id);
      if (ex) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { ...item, quantity: 1 }];
    });
    toast.custom(() => (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 text-bone-50 rounded-xl shadow-soft-lg text-sm font-medium">
        <Star className="w-4 h-4 text-gold" />
        <span>{item.name} ditambahkan</span>
      </div>
    ), { duration: 1400 });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const ex = prev.find(c => c.id === itemId);
      if (ex && ex.quantity > 1) return prev.map(c => c.id === itemId ? { ...c, quantity: c.quantity - 1 } : c);
      return prev.filter(c => c.id !== itemId);
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    if (delta < 0) removeFromCart(itemId);
    else { const item = menuItems.find(m => m.id === itemId); if (item) addToCart(item); }
  };

  const cartCount  = cart.reduce((n, i) => n + i.quantity, 0);

  const filtered = menuItems.filter(item => {
    const matchCat    = selectedCat === "all" || item.category_id === selectedCat;
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const featured = menuItems.filter(i => i.is_featured && i.is_available);

  return (
    <div className="min-h-screen bg-bone-50 pb-24">
      <Toaster position="top-center" />

      {/* Prompts */}
      {showNotification && !isAuthenticated && (
        <NotificationPrompt onComplete={() => { setShowNotification(false); setShowAuth(true); }} />
      )}
      {showAuth && !isAuthenticated && (
        <AuthPrompt onComplete={() => setShowAuth(false)} />
      )}

      {/* Drawers */}
      <CartDrawer
        isOpen={showCart}
        onClose={() => setShowCart(false)}
        items={cart}
        onCheckout={() => { setShowCart(false); setShowPayment(true); }}
        onRemoveItem={id => setCart(prev => prev.filter(c => c.id !== id))}
        onUpdateQuantity={updateQuantity}
      />

      {showPayment && storeId && (
        <PaymentModal
          isOpen={showPayment}
          onClose={() => setShowPayment(false)}
          storeId={storeId}
          tableNumber={tableNum}   // ← kirim nomor meja, bukan UUID
          cartItems={cart}
          onOrderCreated={(orderId, orderNumber) => {
            console.log("Order created:", orderId, "#" + orderNumber);
          }}
          onPaymentComplete={() => {
            setCart([]);
            setShowPayment(false);
          }}
        />
      )}

      {/* Loading */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-[3px] border-navy-200 border-t-gold rounded-full animate-spin" />
              <p className="text-navy-500 text-sm">Memuat menu...</p>
            </div>
          </motion.div>
        ) : error ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-navy-700 font-medium">{error}</p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={fetchMenuData} className="btn-primary">
              Coba Lagi
            </motion.button>
          </motion.div>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

            {/* Header */}
            <header className="relative bg-navy-900 text-bone-50 px-4 pt-6 pb-8"
              style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))" }}>
              <div className="mb-5">
                <TypingText text={storeInfo?.name ?? "Restaurant"} className="text-2xl font-display font-bold" />
                {tableNum && (
                  <motion.p initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="text-navy-300 mt-1 text-sm flex items-center gap-1.5">
                    🍽️ Meja {tableNum}
                    {storeInfo?.address && <><span className="opacity-40 mx-1">·</span>{storeInfo.address}</>}
                  </motion.p>
                )}
              </div>

              {/* Search */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari menu favoritmu..."
                  className="w-full pl-12 pr-4 py-3.5 bg-navy-800/60 text-bone-50 rounded-2xl placeholder-navy-400 focus:outline-none focus:ring-2 focus:ring-gold/40 border border-navy-700"
                />
              </motion.div>
            </header>

            {/* Featured */}
            {featured.length > 0 && !searchQuery && (
              <section className="px-4 pt-5 pb-2">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-gold" />
                  <h3 className="text-base font-display font-bold text-navy-900">Rekomendasi</h3>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {featured.slice(0, 6).map(item => (
                    <motion.button key={item.id} whileTap={{ scale: 0.96 }} onClick={() => addToCart(item)}
                      className="min-w-[160px] bg-bone-50 border border-navy-100 rounded-2xl shadow-soft overflow-hidden flex-shrink-0 text-left">
                      <div className="aspect-[4/3] bg-navy-50 flex items-center justify-center overflow-hidden relative">
                        {item.image
                          ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          : <span className="text-4xl">🍽️</span>}
                        <div className="absolute top-2 right-2 bg-gold/90 text-navy-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Favorit
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="font-semibold text-navy-900 text-sm truncate">{item.name}</p>
                        <p className="text-gold font-bold text-sm mt-0.5">
                          Rp {item.price.toLocaleString("id-ID")}
                        </p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </section>
            )}

            {/* Category tabs */}
            <section className="px-4 py-3">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {[{ id: "all", name: "Semua" }, ...categories].map(cat => (
                  <motion.button key={cat.id} whileTap={{ scale: 0.94 }}
                    onClick={() => setSelectedCat(cat.id)}
                    className={`px-4 py-2 rounded-xl whitespace-nowrap font-medium text-sm transition-all ${
                      selectedCat === cat.id
                        ? "bg-navy-900 text-bone-50 shadow-soft"
                        : "bg-bone-100 text-navy-500 border border-navy-100 hover:bg-navy-50"
                    }`}>
                    {cat.name}
                  </motion.button>
                ))}
              </div>
            </section>

            {/* Menu items */}
            <section className="px-4 space-y-3 pb-6">
              {filtered.length === 0 ? (
                <div className="text-center py-16">
                  <Tag className="w-10 h-10 mx-auto mb-3 text-navy-300" />
                  <p className="font-medium text-navy-600">Menu tidak ditemukan</p>
                  <p className="text-sm text-navy-400 mt-1">Coba kata kunci lain</p>
                </div>
              ) : (
                filtered.map((item, i) => {
                  const inCart = cart.find(c => c.id === item.id);
                  return (
                    <motion.div key={item.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.04, 0.4) }}
                      className={`bg-bone-50 border border-navy-100 rounded-2xl shadow-soft overflow-hidden ${!item.is_available ? "opacity-60" : ""}`}>
                      <div className="flex gap-3 p-4">
                        {/* Image */}
                        <div className="w-24 h-24 bg-navy-50 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden relative">
                          {item.image
                            ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            : <span className="text-4xl">🍽️</span>}
                          {!item.is_available && (
                            <div className="absolute inset-0 bg-navy-900/60 flex items-center justify-center rounded-xl">
                              <span className="text-bone-50 text-[10px] font-bold bg-red-600 px-2 py-0.5 rounded-full">Habis</span>
                            </div>
                          )}
                          {item.is_featured && item.is_available && (
                            <div className="absolute top-1 right-1 bg-gold text-navy-950 text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">★</div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-navy-900">{item.name}</h3>
                          {item.description && (
                            <p className="text-xs text-navy-500 line-clamp-2 mt-0.5">{item.description}</p>
                          )}
                          <div className="flex items-center gap-2 text-[11px] text-navy-400 mt-1.5">
                            <Clock className="w-3 h-3" /><span>10-15 mnt</span>
                          </div>

                          <div className="flex items-center justify-between mt-3">
                            <span className="text-base font-bold text-navy-900">
                              Rp {item.price.toLocaleString("id-ID")}
                            </span>

                            {item.is_available ? (
                              inCart ? (
                                <div className="flex items-center gap-2">
                                  <motion.button whileTap={{ scale: 0.9 }}
                                    onClick={() => removeFromCart(item.id)}
                                    className="w-8 h-8 bg-navy-100 text-navy-700 rounded-xl flex items-center justify-center hover:bg-navy-200 transition-colors"
                                    aria-label="Kurangi">
                                    <Minus className="w-4 h-4" />
                                  </motion.button>
                                  <span className="w-6 text-center text-sm font-bold text-navy-900">
                                    {inCart.quantity}
                                  </span>
                                  <motion.button whileTap={{ scale: 0.9 }}
                                    onClick={() => addToCart(item)}
                                    className="w-8 h-8 bg-navy-900 text-bone-50 rounded-xl flex items-center justify-center hover:bg-navy-800 transition-colors shadow-soft"
                                    aria-label="Tambah">
                                    <Plus className="w-4 h-4" />
                                  </motion.button>
                                </div>
                              ) : (
                                <motion.button whileTap={{ scale: 0.9 }}
                                  onClick={() => addToCart(item)}
                                  className="w-10 h-10 bg-navy-900 text-bone-50 rounded-xl flex items-center justify-center hover:bg-navy-800 transition-colors shadow-soft"
                                  aria-label="Tambah ke keranjang">
                                  <Plus className="w-5 h-5" />
                                </motion.button>
                              )
                            ) : (
                              <span className="text-xs font-medium text-red-500 bg-red-50 px-3 py-1.5 rounded-xl">Habis</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </section>

          </motion.div>
        )}
      </AnimatePresence>

      <FloatingNav
        cartCount={cartCount}
        onCartClick={() => setShowCart(true)}
        onProfileClick={() => setShowAuth(true)}
      />
    </div>
  );
}
