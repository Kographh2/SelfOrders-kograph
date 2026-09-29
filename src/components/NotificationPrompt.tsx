"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, BellOff, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface NotificationPromptProps {
  onComplete: () => void;
  storeId?: string;
}

export default function NotificationPrompt({ onComplete, storeId }: NotificationPromptProps) {
  const [visible, setVisible] = useState(true);
  const { user } = useAuth();

  const toUint8Array = (value: string) => {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  };

  const handleEnable = async () => {
    setVisible(false);
    try {
      if ("Notification" in window && Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm === "granted" && "serviceWorker" in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (vapidKey) {
              const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: toUint8Array(vapidKey),
              });
              await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  endpoint: sub.endpoint,
                  p256dh: btoa(String.fromCharCode(...Array.from(new Uint8Array(sub.getKey("p256dh")!)))),
                  auth: btoa(String.fromCharCode(...Array.from(new Uint8Array(sub.getKey("auth")!)))),
                  userId: user?.id ?? null,
                  anonymousSessionId: localStorage.getItem("selforder_session_id"),
                  storeId: storeId || null,
                }),
              });
            }
          } catch {
            // Push subscription failed — non-blocking
          }
        }
      }
    } catch {
      // Notification permission failed — non-blocking
    }
    localStorage.setItem("notification_prompt_seen", "1");
    onComplete();
  };

  const handleSkip = () => {
    setVisible(false);
    localStorage.setItem("notification_prompt_seen", "1");
    onComplete();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-navy-950/50 backdrop-blur-sm z-[80] flex items-end sm:items-center p-4"
          onClick={(e) => e.target === e.currentTarget && handleSkip()}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="bg-bone-50 rounded-3xl shadow-2xl w-full max-w-sm mx-auto p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-navy-900 rounded-2xl flex items-center justify-center">
                <Bell className="w-6 h-6 text-gold" />
              </div>
              <button onClick={handleSkip} className="p-1.5 text-navy-400 hover:text-navy-700 rounded-lg" aria-label="Lewati">
                <X className="w-4 h-4" />
              </button>
            </div>

            <h3 className="text-lg font-display font-bold text-navy-900 mb-2">
              Pantau pesananmu
            </h3>
            <p className="text-sm text-navy-500 leading-relaxed mb-6">
              Aktifkan notifikasi agar kamu tahu ketika pesanan dikonfirmasi, dimasak, dan siap disajikan.
            </p>

            <div className="space-y-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleEnable}
                className="w-full bg-navy-900 text-bone-50 py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-navy-800 transition-colors"
              >
                <Bell className="w-4 h-4" />
                Aktifkan Notifikasi
              </motion.button>
              <button
                onClick={handleSkip}
                className="w-full py-3 text-navy-500 text-sm font-medium hover:text-navy-700 transition-colors"
              >
                Nanti Saja
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
