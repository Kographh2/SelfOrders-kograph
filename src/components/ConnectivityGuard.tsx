"use client";

import { useEffect, useState } from "react";
import RecoveryScreen from "./RecoveryScreen";
import {OfflineCoverContext} from "@/contexts/OfflineCoverContext";

export default function ConnectivityGuard({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let timer:ReturnType<typeof setTimeout>;
    const disconnected = () => { clearTimeout(timer);timer=setTimeout(()=>setOffline(true),600); };
    if (!navigator.onLine) disconnected();
    window.addEventListener("offline", disconnected);
    return () => {clearTimeout(timer);window.removeEventListener("offline", disconnected);};
  }, []);
  return <><OfflineCoverContext.Provider value={offline}><div hidden={offline} inert={offline}>{children}</div></OfflineCoverContext.Provider>{offline && <RecoveryScreen onRecovered={()=>setOffline(false)}/>}</>;
}
