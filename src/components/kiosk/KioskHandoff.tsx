"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, RefreshCw, Smartphone } from "lucide-react";
import styles from "./kiosk.module.css";

export default function KioskHandoff({ orderId, onComplete, onScanned }: { orderId: string; onComplete: () => void; onScanned: () => void }) {
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [scanned, setScanned] = useState(false);
  const [seconds, setSeconds] = useState(10);
  const [attempt, setAttempt] = useState(0);
  const complete = useRef(onComplete), notify = useRef(onScanned);
  complete.current = onComplete; notify.current = onScanned;
  useEffect(() => {
    let disposed = false, running = false, acknowledged = false;
    const controller = new AbortController();
    const poll = async () => {
      if (running || disposed || acknowledged) return;
      running = true;
      try {
        const response = await fetch("/api/kiosk/handoff", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "QR belum bisa dimuat.");
        const url = new URL(result.data.url);
        if (url.origin !== window.location.origin || url.pathname !== `/orders/${orderId}/waiting`) throw new Error("Tautan antrean tidak sesuai pesanan.");
        const image = await QRCode.toDataURL(url.toString(), { width: 320, margin: 4, errorCorrectionLevel: "M", color: { dark: "#142b45", light: "#ffffff" } });
        if (disposed) return;
        setQr(image); setError("");
        if (result.data.scannedAt) { acknowledged = true; setScanned(true); notify.current(); }
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : "Koneksi terganggu. QR akan dicoba kembali."); }
      finally { running = false; }
    };
    void poll(); const timer = setInterval(() => void poll(), 2500);
    return () => { disposed = true; controller.abort(); clearInterval(timer); };
  }, [orderId, attempt]);
  useEffect(() => {
    if (!scanned) return;
    const deadline = Date.now() + 10000;
    let ended = false;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining && !ended) { ended = true; complete.current(); }
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [scanned]);
  return <div className={styles.handoff}>
    {scanned ? <div className={styles.scanSuccess} role="status"><CheckCircle2 size={42}/><h2>Berhasil dipindai</h2><p>Waiting page sudah terbuka di ponsel Anda. Pantau status pesanan dari sana.</p><strong>Layar ini akan tertutup dalam {seconds} detik</strong><span>Kiosk akan kembali ke halaman awal.</span></div> : <>
      <div className={styles.handoffHeading}><Smartphone size={24}/><h2>Pindai untuk pantau pesanan</h2></div>
      <p>Buka kamera ponsel, pindai QR ini, lalu buka tautannya. Tunggu tulisan “Berhasil dipindai” sebelum meninggalkan kiosk.</p>
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} width={320} height={320} alt="QR untuk membuka waiting page pesanan Anda" />
      ) : <div className={styles.qrLoading} role="status">Menyiapkan QR antrean…</div>}
      <span className={styles.scanWaiting}>Menunggu waiting page dibuka di ponsel</span>
      {error && <div className={styles.handoffError} role="alert"><p>{error}</p><button className={styles.secondary} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={18}/>Coba muat QR lagi</button></div>}
    </>}
  </div>;
}
