"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, CircleCheck, TriangleAlert } from "lucide-react";

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
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-navy-950 via-navy-900 to-blue-950 p-5 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-8 text-center text-navy-950 shadow-2xl">
        {invalid ? (
          <>
            <TriangleAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-black">Pesanan tidak ditemukan</h1>
            <p className="mt-2 text-sm text-slate-600">Link pengalihan pembayaran tidak berisi nomor pesanan yang valid.</p>
            <Link href="/menu" className="mt-6 inline-flex rounded-xl bg-navy-950 px-5 py-3 text-sm font-bold text-white">Kembali ke menu</Link>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CircleCheck className="h-9 w-9" />
            </div>
            <h1 className="mt-5 text-2xl font-black">Pembayaran diproses</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Kami sedang memastikan status pembayaran. Kamu akan diarahkan ke halaman status pesanan sebentar lagi.</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold text-blue-800">
              <Loader2 className="h-4 w-4 animate-spin" /> Mengalihkan ke halaman pesanan…
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function PaymentFinishPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-navy-950 text-white"><Loader2 className="h-9 w-9 animate-spin" /></main>}><FinishRedirect /></Suspense>;
}
