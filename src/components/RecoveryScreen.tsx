"use client";

import document from "../../public/offline.html";

export default function RecoveryScreen({ mode = "offline" }: { mode?: "offline" | "error" }) {
  const returnTo = typeof window === "undefined" ? "/menu" : window.location.pathname === "/offline" ? "/menu" : window.location.pathname + window.location.search + window.location.hash;
  const config = JSON.stringify({ mode, returnTo }).replace(/</g, "\\u003c");
  return <><style>{".consumer-dock { display: none !important; }"}</style><iframe title={mode === "offline" ? "Koneksi terputus dan permainan offline" : "Pemulihan aplikasi"}
    srcDoc={document.replace("__RECOVERY_CONFIG__", config)}
    style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0, zIndex: 10000, background: "#f5f7fa" }} /></>;
}
