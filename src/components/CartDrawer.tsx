"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingCart, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import type { CartItem } from "@/types";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onCheckout: () => void;
  onRemoveItem?: (itemId: string) => void;
  onUpdateQuantity?: (itemId: string, delta: number) => void;
}

export default function CartDrawer({
  isOpen,
  onClose,
  items,
  onCheckout,
  onRemoveItem,
  onUpdateQuantity,
}: CartDrawerProps) {
  const total = items.reduce((sum, item) => sum + (item.price + (item.selected_options ?? []).reduce((n, option) => n + option.price_delta, 0)) * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = () => {
    if (items.length === 0) {
      toast.error("Keranjang masih kosong");
      return;
    }
    onClose();
    onCheckout();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-navy-950/60 backdrop-blur-sm z-[100] flex items-end sm:items-center p-0 sm:p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.28 }}
            className="mx-auto flex max-h-[92vh] w-full max-w-md flex-col rounded-t-[2rem] bg-white shadow-2xl dark:bg-[#081426] sm:rounded-[2rem]"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-navy-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-navy-900">Keranjang</h3>
                  <p className="text-xs text-navy-500">{itemCount} item</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-navy-400 hover:text-navy-700 hover:bg-navy-100 rounded-xl transition-colors"
                aria-label="Tutup keranjang"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.length === 0 ? (
                <div className="text-center py-16 text-navy-400">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-navy-600">Keranjang kosong</p>
                  <p className="text-sm mt-1">Tambahkan item dari menu</p>
                </div>
              ) : (
                items.map((item) => (
                  <motion.div
                    key={`${item.id}:${[...(item.option_ids ?? [])].sort().join(",")}`}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="w-14 h-14 bg-navy-100 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <span className="text-2xl">🍽️</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-navy-900 text-sm truncate">{item.name}</h4>
                      {item.notes && (
                        <p className="text-xs text-navy-400 italic truncate mt-0.5">"{item.notes}"</p>
                      )}
                      {item.selected_options?.map(option => <p key={`${option.group_name}-${option.option_name}`} className="text-xs text-navy-500">{option.group_name}: {option.option_name}{option.price_delta ? ` (+Rp ${option.price_delta.toLocaleString("id-ID")})` : ""}</p>)}
                      <p className="text-xs text-navy-500 mt-1">
                        Rp {(item.price + (item.selected_options ?? []).reduce((n, option) => n + option.price_delta, 0)).toLocaleString("id-ID")} × {item.quantity}
                      </p>
                      <p className="text-sm font-bold text-navy-900 mt-0.5">
                        Rp {((item.price + (item.selected_options ?? []).reduce((n, option) => n + option.price_delta, 0)) * item.quantity).toLocaleString("id-ID")}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {onRemoveItem && (
                        <button
                          onClick={() => onRemoveItem(`${item.id}:${[...(item.option_ids ?? [])].sort().join(",")}`)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          aria-label="Hapus item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {onUpdateQuantity && (
                        <div className="flex items-center gap-1 mt-auto">
                          <button
                            onClick={() => onUpdateQuantity(`${item.id}:${[...(item.option_ids ?? [])].sort().join(",")}`, -1)}
                            className="w-6 h-6 bg-navy-100 text-navy-700 rounded-lg flex items-center justify-center text-sm font-bold hover:bg-navy-200 transition-colors"
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-sm font-bold text-navy-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQuantity(`${item.id}:${[...(item.option_ids ?? [])].sort().join(",")}`, 1)}
                            className="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm font-bold hover:bg-blue-700 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="px-5 py-4 border-t border-navy-100 flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-navy-600 text-sm">Subtotal</span>
                  <span className="text-xl font-bold text-navy-900">
                    Rp {total.toLocaleString("id-ID")}
                  </span>
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCheckout}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
                >
                  <ShoppingCart className="w-5 h-5" />
                  <span>Lanjut ke Pembayaran</span>
                </motion.button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
