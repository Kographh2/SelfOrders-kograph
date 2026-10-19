"use client";

import { useEffect, useState } from "react";

export function useKioskTracking(orderId: string, loaded: boolean) {
  const [access, setAccess] = useState<{ orderId: string; token: string | null } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    const incoming = new URLSearchParams(window.location.hash.slice(1)).get("kiosk");
    let token = incoming;
    try {
      const key = `selforder_kiosk_tracking:${orderId}`;
      if (incoming) { sessionStorage.setItem(key, incoming); history.replaceState(null, "", window.location.pathname + window.location.search); }
      else token = sessionStorage.getItem(key);
    } catch { /* Keep the fragment when storage is unavailable so reload can still recover. */ }
    setAcknowledged(false); setAccess({ orderId, token });
  }, [orderId]);
  const credential = access?.orderId === orderId ? access.token : null;
  useEffect(() => {
    if (!credential || !loaded) return;
    let disposed = false, running = false, done = false;
    const controller = new AbortController();
    const acknowledge = async () => {
      if (disposed || running || done || document.visibilityState !== "visible") return;
      running = true;
      try {
        const response = await fetch(`/api/kiosk-tracking/${orderId}`, { method: "POST", headers: { "x-kiosk-tracking": credential }, cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (response.ok && (await response.json()).data?.acknowledged && !disposed) { done = true; setAcknowledged(true); }
      } catch { /* Retry only the idempotent receipt acknowledgement, never payments/orders. */ }
      finally { running = false; }
    };
    // Only acknowledge after the waiting UI has rendered, never on a link preview or GET request.
    const frame = requestAnimationFrame(() => void acknowledge());
    const interval = setInterval(() => void acknowledge(), 5000);
    const visible = () => void acknowledge();
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; controller.abort(); cancelAnimationFrame(frame); clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [credential, loaded, orderId]);
  return { credential, ready: access?.orderId === orderId, acknowledged };
}
