"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { useState } from "react";

type AlertType = "success" | "error" | "warning" | "info";

const alertConfig: Record<AlertType, {
  icon: typeof CheckCircle;
  bg: string;
  border: string;
  text: string;
  iconColor: string;
}> = {
  success: { icon: CheckCircle,    bg: "bg-green-50",  border: "border-green-200", text: "text-green-800", iconColor: "text-green-600" },
  error:   { icon: AlertCircle,    bg: "bg-red-50",    border: "border-red-200",   text: "text-red-800",   iconColor: "text-red-600" },
  warning: { icon: AlertTriangle,  bg: "bg-amber-50",  border: "border-amber-200", text: "text-amber-800", iconColor: "text-amber-600" },
  info:    { icon: Info,           bg: "bg-blue-50",   border: "border-blue-200",  text: "text-blue-800",  iconColor: "text-blue-600" },
};

interface AlertProps {
  type: AlertType;
  title: string;
  message?: string;
  onClose?: () => void;
  closable?: boolean;
}

export function Alert({ type, title, message, onClose, closable = true }: AlertProps) {
  const [visible, setVisible] = useState(true);
  const cfg = alertConfig[type];
  const Icon = cfg.icon;

  const handleClose = () => {
    setVisible(false);
    onClose?.();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={`flex items-start gap-3 p-4 rounded-xl border ${cfg.bg} ${cfg.border}`}
        >
          <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cfg.iconColor}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${cfg.text}`}>{title}</p>
            {message && <p className={`text-xs mt-0.5 ${cfg.text} opacity-80`}>{message}</p>}
          </div>
          {closable && (
            <button
              onClick={handleClose}
              className={`p-1 rounded-lg hover:bg-black/10 transition-colors ${cfg.iconColor}`}
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Confirmation dialog
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-navy-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && onCancel()}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", damping: 22 }}
            className="bg-bone-50 rounded-2xl shadow-2xl p-6 max-w-sm w-full"
          >
            <h3 className="text-lg font-bold text-navy-900 mb-2">{title}</h3>
            <p className="text-sm text-navy-600 mb-6">{message}</p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl border border-navy-200 text-navy-700 font-medium text-sm hover:bg-navy-50 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors ${
                  confirmVariant === "danger"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-navy-900 text-bone-50 hover:bg-navy-800"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
