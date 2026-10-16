"use client";

import { useEffect, useState } from "react";
import RecoveryScreen from "./RecoveryScreen";

export default function ConnectivityGuard({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const disconnected = () => setOffline(true);
    if (!navigator.onLine) disconnected();
    window.addEventListener("offline", disconnected);
    // Recovery stays open until the user retries, so reconnecting never interrupts the game.
    return () => window.removeEventListener("offline", disconnected);
  }, []);
  return <><div hidden={offline} inert={offline}>{children}</div>{offline && <RecoveryScreen />}</>;
}
