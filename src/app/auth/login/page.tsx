"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { UtensilsCrossed, Eye, EyeOff, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

function LoginForm() {
  const [tab,        setTab]        = useState<"login" | "register">("login");
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [isLoading,  setIsLoading]  = useState(false);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { login, register } = useAuth();
  const router   = useRouter();
  const params   = useSearchParams();
  const redirect = params.get("redirect") ?? "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (tab === "login") {
        await login(email, password);
        router.push(redirect);
      } else {
        if (!name.trim()) { setErrorMsg("Nama wajib diisi"); return; }
        if (password.length < 8) { setErrorMsg("Password minimal 8 karakter"); return; }
        await register(name, email, password);
        setSuccessMsg("Akun berhasil dibuat! Cek email untuk konfirmasi, lalu login di sini.");
        setTab("login");
        setPassword("");
        setName("");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-bone-50 rounded-3xl shadow-2xl w-full max-w-sm p-6"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-7">
          <div className="w-10 h-10 bg-navy-900 rounded-2xl flex items-center justify-center">
            <UtensilsCrossed className="w-5 h-5 text-gold" />
          </div>
          <span className="font-display font-bold text-xl text-navy-900">SelfOrder</span>
        </div>

        {/* Tabs */}
        <div className="flex bg-navy-50 rounded-xl p-1 mb-5">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setErrorMsg(null); setSuccessMsg(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t ? "bg-bone-50 text-navy-900 shadow-soft" : "text-navy-500"
              }`}
            >
              {t === "login" ? "Masuk" : "Daftar"}
            </button>
          ))}
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success */}
        {successMsg && (
          <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-700">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === "register" && (
            <div>
              <label className="label-field">Nama Lengkap</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field w-full"
                placeholder="Nama Anda"
                required
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="label-field">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field w-full"
              placeholder="email@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="label-field">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full pr-10"
                placeholder={tab === "register" ? "Min. 8 karakter" : "••••••••"}
                required
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                minLength={tab === "register" ? 8 : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600"
                aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={isLoading}
            className="w-full bg-navy-900 text-bone-50 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-navy-800 disabled:opacity-50 transition-all mt-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {tab === "login" ? "Masuk" : "Buat Akun"}
          </motion.button>
        </form>

        <p className="text-center text-xs text-navy-400 mt-5">
          {tab === "login" ? (
            <>Belum punya akun?{" "}
              <button onClick={() => setTab("register")} className="text-navy-700 font-semibold hover:underline">
                Daftar
              </button>
            </>
          ) : (
            <>Sudah punya akun?{" "}
              <button onClick={() => setTab("login")} className="text-navy-700 font-semibold hover:underline">
                Masuk
              </button>
            </>
          )}
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-navy-900" />}>
      <LoginForm />
    </Suspense>
  );
}
