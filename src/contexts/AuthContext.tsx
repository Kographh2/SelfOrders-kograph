"use client";

import {
  createContext, useContext, useEffect,
  useState, useCallback, useMemo, ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@/types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  anonymousLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "selforder_token";
const USER_KEY  = "selforder_user";

function ls(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch {}
}
function lsDel(key: string) {
  try { localStorage.removeItem(key); } catch {}
}
function getStoredUser(): User | null {
  const raw = ls(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as User; } catch { return null; }
}

async function fetchJwt(supabaseUid: string, email: string, accessToken: string): Promise<{ token: string; user: User } | null> {
  try {
    if (!accessToken) return null;
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ supabaseUid, email }),
    });
    if (!res.ok) return null;
    const r = await res.json();
    if (!r.data?.token || !r.data?.user) return null;
    return { token: r.data.token as string, user: r.data.user as User };
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<User | null>(getStoredUser);
  const [token,     setToken]     = useState<string | null>(() => ls(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);

  const saveSession = useCallback((u: User, t: string) => {
    setUser(u);
    setToken(t);
    lsSet(USER_KEY,  JSON.stringify(u));
    lsSet(TOKEN_KEY, t);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    lsDel(USER_KEY);
    lsDel(TOKEN_KEY);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_OUT" || !session?.user) {
          clearSession();
          setIsLoading(false);
          return;
        }
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED" ||
          !ls(TOKEN_KEY)
        ) {
          const result = await fetchJwt(session.user.id, session.user.email ?? "", session.access_token);
          if (result) saveSession(result.user, result.token);
        }
        setIsLoading(false);
      }
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setIsLoading(false);
    });
    return () => subscription.unsubscribe();
  // saveSession / clearSession are stable (useCallback with no deps)
  }, [saveSession, clearSession]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !password) throw new Error("Email dan password wajib diisi");

      const { data, error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("invalid login credentials") || msg.includes("invalid credentials"))
          throw new Error("Email atau password salah");
        if (msg.includes("email not confirmed"))
          throw new Error("Email belum dikonfirmasi. Cek inbox kamu.");
        if (msg.includes("too many requests"))
          throw new Error("Terlalu banyak percobaan. Coba lagi nanti.");
        throw new Error(error.message);
      }
      if (!data?.user) throw new Error("Login gagal — coba lagi");
      if (data.user.is_anonymous) {
        await supabase.auth.signOut();
        throw new Error("Sesi tidak valid. Silakan login ulang.");
      }

      const result = await fetchJwt(data.user.id, data.user.email ?? trimmed, data.session?.access_token || "");
      if (!result) throw new Error("Gagal memuat profil. Coba lagi.");
      saveSession(result.user, result.token);
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  const register = useCallback(async (name: string, email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedName  = name.trim();
      if (!trimmedName)         throw new Error("Nama wajib diisi");
      if (!trimmedEmail)        throw new Error("Email wajib diisi");
      if (password.length < 8) throw new Error("Password minimal 8 karakter");

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail, password,
        options: { data: { name: trimmedName } },
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("user already"))
          throw new Error("Email sudah terdaftar. Silakan login.");
        throw new Error(error.message);
      }
      if (!data?.user) throw new Error("Registrasi gagal");
      if (data.session) {
        const result = await fetchJwt(data.user.id, trimmedEmail, data.session.access_token);
        if (result) saveSession(result.user, result.token);
      }
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  const anonymousLogin = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw new Error(error.message);
      if (!data?.user) throw new Error("Gagal membuat sesi tamu");
      const result = await fetchJwt(data.user.id, "", data.session?.access_token || "");
      if (result) saveSession(result.user, result.token);
    } catch (e) {
      console.warn("[auth] anonymousLogin gagal:", e);
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  const logout = useCallback(async (): Promise<void> => {
    clearSession();
    try { await supabase.auth.signOut(); } catch {}
  }, [clearSession]);

  // ✅ useMemo: context value only changes when actual values change
  // This prevents all consumers from re-rendering on every AuthProvider render
  const value = useMemo(() => ({
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    register,
    logout,
    anonymousLogin,
  }), [user, token, isLoading, login, register, logout, anonymousLogin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}

export function useRole() {
  const { user } = useAuth();
  const role = user?.role;
  // ✅ useMemo: only recomputes when role changes (string — stable)
  return useMemo(() => ({
    role,
    isOwner:         role === "owner",
    isAdmin:         role === "admin",
    isCashier:       role === "kasir",
    isUser:          role === "user",
    isStaff:         role === "owner" || role === "admin" || role === "kasir",
    isOwnerOrAdmin:  role === "owner" || role === "admin",
    canManageStores: role === "owner" || role === "admin",
    canDeleteUsers:  role === "owner",
    canManageUsers:  role === "owner" || role === "admin",
  }), [role]);
}

export function getAuthHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
