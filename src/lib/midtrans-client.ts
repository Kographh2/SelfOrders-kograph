"use client";

type SnapClient = NonNullable<Window["snap"]>;

let snapPromise: Promise<SnapClient> | null = null;

/** Load the Snap.js SDK once and wait until window.snap is available. */
export function loadMidtransSnap(): Promise<SnapClient> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Midtrans Snap hanya tersedia di browser"));
  }

  if (window.snap) return Promise.resolve(window.snap);
  if (snapPromise) return snapPromise;

  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY?.trim();
  if (!clientKey) {
    return Promise.reject(new Error("NEXT_PUBLIC_MIDTRANS_CLIENT_KEY belum dikonfigurasi"));
  }

  snapPromise = new Promise<SnapClient>((resolve, reject) => {
    const script = document.createElement("script");
    const isProduction = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";

    script.src = isProduction
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";
    script.dataset.midtransSnap = "true";
    script.dataset.clientKey = clientKey;
    script.async = true;
    script.onload = () => {
      if (window.snap) resolve(window.snap);
      else reject(new Error("SDK Midtrans Snap termuat tetapi tidak tersedia"));
    };
    script.onerror = () => reject(new Error("Gagal memuat SDK Midtrans Snap"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    snapPromise = null;
    throw error;
  });

  return snapPromise;
}
