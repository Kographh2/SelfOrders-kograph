"use client";

import { usePreferences } from "@/contexts/PreferencesContext";
import { MotionConfig } from "framer-motion";

export default function MotionProvider({ children }: { children: React.ReactNode }) {
  const { preferences } = usePreferences();
  return <MotionConfig reducedMotion={preferences.reduceMotion ? "always" : "user"}>{children}</MotionConfig>;
}
