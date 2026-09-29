"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, X, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface AuthPromptProps {
  onComplete: () => void;
}

export default function AuthPrompt({ onComplete }: AuthPromptProps) {
  const [visible,    setVisible]    = useState(true);
  const [tab,        setTab]        = useState<"login" | "register">("login");
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [isLoading,  setIsLoading]  = useState(false);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const { login, register, anonymousLogin } = useAuth();

  const handleClose = () => { setVisible(false); onComplete(); };

  const handleGuest = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await anonymousLogin();
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
      handleClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (tab === "login") {
        await login(email, password);
        handleClose();
      } else {
        await register(name, email, password);
        setSuccessMsg("Akun berhasil dibuat! Cek email untuk konfirmasi, lalu login.");
        setTab("login");
        setPassword("");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-navy-950/50 backdrop-blur-sm z-[80] flex items-end sm:items-center p-4"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="bg-bone-50 rounded-3xl shadow-2xl w-full max-w-sm mx-auto p-5 max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-lg font-display font-bold text-navy-900">
                  {tab === "login" ? "Masuk ke akun" : "Buat akun baru"}
                </h3>
                <p className="text-sm text-navy-500 mt-0.5">
                  {tab === "login"
                    ? "Pantau riwayat pesananmu"
                    : "Daftar untuk pengalaman lebih baik"}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 text-navy-400 hover:text-navy-700 rounded-lg"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex bg-navy-50 rounded-xl p-1 mb-5">
              {(["login", "register"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setErrorMsg(null); setSuccessMsg(null); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    tab === t
                      ? "bg-bone-50 text-navy-900 shadow-soft"
                      : "text-navy-500"
                  }`}
                >
                  {t === "login" ? "Masuk" : "Daftar"}
                </button>
              ))}
            </div>

            {/* Error / Success banners */}
            {errorMsg && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-700">
                {successMsg}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3 mb-4">
              {tab === "register" && (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field w-full"
                  placeholder="Nama Lengkap"
                  required
                  autoComplete="name"
                />
              )}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field w-full"
                placeholder="Email"
                required
                autoComplete="email"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full"
                placeholder={tab === "register" ? "Password (min. 8 karakter)" : "Password"}
                required
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                minLength={tab === "register" ? 8 : undefined}
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={isLoading}
                className="w-full bg-navy-900 text-bone-50 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-navy-800 disabled:opacity-50 transition-all"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {tab === "login" ? "Masuk" : "Buat Akun"}
              </motion.button>
            </form>

            {/* Divider */}
            <div className="relative text-center mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-navy-100" />
              </div>
              <span className="relative bg-bone-50 px-3 text-xs text-navy-400">atau</span>
            </div>

            {/* Guest */}
            <button
              onClick={handleGuest}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-navy-200 text-navy-600 text-sm font-medium hover:bg-navy-50 disabled:opacity-50 transition-colors"
            >
              <User className="w-4 h-4" />
              Lanjut sebagai Tamu
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
