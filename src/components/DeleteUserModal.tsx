"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, UserX, AlertTriangle } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import type { User } from "@/types";

interface DeleteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onConfirm: () => Promise<void>;
}

export default function DeleteUserModal({
  isOpen,
  onClose,
  user,
  onConfirm,
}: DeleteUserModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
      await onConfirm();
      toast.custom(
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-800 rounded-xl shadow-lg">
          <UserX className="w-4 h-4" />
          <span className="text-sm font-medium">
            User {user.name} berhasil dihapus
          </span>
        </div>,
        { duration: 3000 }
      );
      onClose();
    } catch (err: any) {
      toast.custom(
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-800 rounded-xl shadow-lg">
          <X className="w-4 h-4" />
          <span className="text-sm font-medium">
            {err?.message || "Gagal menghapus user"}
          </span>
        </div>,
        { duration: 3500 }
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Toaster position="top-center" />
      <AnimatePresence>
        {isOpen && user && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 20 }}
              className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8 max-w-md w-full relative overflow-hidden"
            >
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-gradient-to-br from-red-500/5 to-rose-500/5 rounded-full filter blur-2xl" />

              <div className="flex flex-col items-center text-center relative">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15, delay: 0.1 }}
                  className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6"
                >
                  <UserX className="w-10 h-10 text-red-600" />
                </motion.div>

                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  Hapus User?
                </h3>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="text-gray-600 dark:text-gray-400 mb-6 text-sm"
                >
                  Anda akan menghapus user{" "}
                  <strong className="text-gray-900 dark:text-gray-200">
                    {user.name}
                  </strong>{" "}
                  ({user.email}). Aksi ini tidak bisa dibatalkan.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl mb-6"
                >
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    User yang dihapus tidak akan dapat masuk lagi, dan semua
                    data terkait akan dihapus sesuai kebijakan.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="flex gap-3 w-full"
                >
                  <button
                    onClick={onClose}
                    disabled={isDeleting}
                    className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-3 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isDeleting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Hapus User
                      </>
                    )}
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
