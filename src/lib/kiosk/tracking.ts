import jwt from "jsonwebtoken";
import { UUID } from "./contracts";
import { KioskError } from "./server";

type TrackingClaims = { orderId: string; storeId: string };
function secret() {
  const value = process.env.KIOSK_SESSION_SECRET || process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new KioskError("Tautan antrean belum dikonfigurasi. Hubungi petugas.", 503);
  return value;
}
export function trackingToken(order: { id: string; store_id: string; created_at: string }) {
  const exp = Math.floor(new Date(order.created_at).getTime() / 1000) + 24 * 60 * 60;
  if (!Number.isFinite(exp) || exp <= Date.now() / 1000) throw new KioskError("Tautan antrean telah kedaluwarsa. Hubungi petugas.", 410);
  return jwt.sign({ orderId: order.id, storeId: order.store_id, exp }, secret(), { algorithm: "HS256", audience: "selforder-kiosk-tracking", issuer: "selforder", noTimestamp: true });
}
export function verifyTracking(token: string | null, orderId: string): TrackingClaims {
  const key = secret();
  try {
    if (!token || token.length > 2048 || !UUID.test(orderId)) throw new Error();
    const value = jwt.verify(token, key, { algorithms: ["HS256"], audience: "selforder-kiosk-tracking", issuer: "selforder" }) as TrackingClaims;
    if (value.orderId !== orderId || !UUID.test(value.storeId)) throw new Error();
    return { orderId, storeId: value.storeId };
  } catch { throw new KioskError("Tautan antrean tidak valid atau sudah kedaluwarsa. Pindai kembali QR di kiosk atau hubungi petugas.", 403); }
}
