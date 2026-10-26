"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";

function FinishRedirect() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") || searchParams.get("order_id") || "";
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    // Order IDs are UUIDs. Construct the destination locally instead of trusting
    // a user-controlled return URL, preventing an open redirect.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
      setInvalid(true);
      return;
    }
    const timer = window.setTimeout(() => {
      window.location.replace(`/orders/${encodeURIComponent(orderId)}/waiting`);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [orderId]);

  return (
    <main className="public-page grid place-items-center">
      <section className="public-card w-full max-w-md text-center">
        {invalid ? (
          <>
            <TriangleAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-black">Pesanan tidak ditemukan</h1>
            <p className="mt-2 text-sm text-slate-600">Link pengalihan pembayaran tidak berisi nomor pesanan yang valid.</p>
            <Link href="/menu" className="public-button mt-6">Kembali ke menu</Link>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl public-notice">
              <Loader2 className="h-9 w-9 animate-spin" />
            </div>
            <h1 className="mt-5 text-2xl font-black">Memeriksa status pembayaran</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Kami sedang memastikan status pembayaran. Kamu akan diarahkan ke halaman status pesanan sebentar lagi.</p>
            <div className="public-notice mt-6 inline-flex items-center gap-2 text-xs">
              <Loader2 className="h-4 w-4 animate-spin" /> Mengalihkan ke halaman pesanan…
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function PaymentFinishPage() {
  return <Suspense fallback={<main className="public-page grid place-items-center"><Loader2 className="h-9 w-9 animate-spin" /></main>}><FinishRedirect /></Suspense>;
}
