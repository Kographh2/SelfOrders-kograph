"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Preferences = { theme: "light" | "dark" | "system"; reduceMotion: boolean; solidGlass: boolean; menuLanguage: "id" | "en" };
const defaults: Preferences = { theme: "system", reduceMotion: false, solidGlass: false, menuLanguage: "id" };
const Context = createContext<{ preferences: Preferences; update: (patch: Partial<Preferences>) => void }>({ preferences: defaults, update: () => {} });
export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const theme = localStorage.getItem("selforder_theme");
      setPreferences({ theme: theme === "dark" || theme === "light" ? theme : "system", reduceMotion: localStorage.getItem("selforder_reduce_motion") === "1", solidGlass: localStorage.getItem("selforder_solid_glass") === "1", menuLanguage: localStorage.getItem("selforder_menu_language") === "en" ? "en" : "id" });
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", preferences.theme === "dark" || (preferences.theme === "system" && media.matches));
    apply(); media.addEventListener("change", apply);
    document.documentElement.dataset.motion = preferences.reduceMotion ? "reduce" : "auto";
    document.documentElement.dataset.glass = preferences.solidGlass ? "solid" : "auto";
    try {
      localStorage.setItem("selforder_theme", preferences.theme);
      localStorage.setItem("selforder_reduce_motion", preferences.reduceMotion ? "1" : "0");
      localStorage.setItem("selforder_solid_glass", preferences.solidGlass ? "1" : "0");
      localStorage.setItem("selforder_menu_language", preferences.menuLanguage);
    } catch {}
    return () => media.removeEventListener("change", apply);
  }, [preferences, ready]);
  return <Context.Provider value={{ preferences, update: patch => setPreferences(current => ({ ...current, ...patch })) }}>{children}</Context.Provider>;
}
export const usePreferences = () => useContext(Context);
