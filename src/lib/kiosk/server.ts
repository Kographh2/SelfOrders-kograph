import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { UUID } from "./contracts";

export const COOKIE = "selforder_kiosk";
export class KioskError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function stationConfig(id?: string | null) {
  const stationId = id || process.env.KIOSK_DEFAULT_STATION;
  let stations: Record<string, { storeId: string; name: string }>;
  try { stations = JSON.parse(process.env.KIOSK_STATIONS || "{}"); }
  catch { throw new KioskError("Konfigurasi KIOSK belum valid. Hubungi petugas.", 503); }
  const station = stationId && Object.hasOwn(stations, stationId) ? stations[stationId] : null;
  if (!station || !UUID.test(station.storeId) || typeof station.name !== "string") throw new KioskError("KIOSK belum terhubung ke cabang. Hubungi petugas.", 503);
  return { id: stationId!, ...station };
}
function secret() {
  const value = process.env.KIOSK_SESSION_SECRET || process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new KioskError("Sesi KIOSK belum dikonfigurasi. Hubungi petugas.", 503);
  return value;
}
export function assertOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) throw new KioskError("Asal permintaan tidak valid", 403);
}
export type KioskSession = { sid: string; stationId: string; storeId: string };
export function getSession(request: NextRequest): KioskSession {
  const key = secret();
  try {
    const payload = jwt.verify(request.cookies.get(COOKIE)?.value || "", key, { algorithms: ["HS256"], audience: "selforder-kiosk", issuer: "selforder" }) as KioskSession;
    const station = stationConfig(payload.stationId);
    if (!UUID.test(payload.sid) || station.storeId !== payload.storeId) throw new Error();
    return payload;
  } catch { throw new KioskError("Sesi berakhir. Silakan mulai pesanan baru.", 401); }
}
export function newSession(station: ReturnType<typeof stationConfig>) {
  return jwt.sign({ sid: randomUUID(), stationId: station.id, storeId: station.storeId }, secret(), { algorithm: "HS256", expiresIn: "30m", audience: "selforder-kiosk", issuer: "selforder" });
}
export function reply(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store, private" } });
}
export function failure(error: unknown) {
  if (!(error instanceof KioskError)) console.error("[kiosk]", error);
  return NextResponse.json({ error: error instanceof KioskError ? error.message : "Layanan belum tersedia. Coba lagi atau hubungi petugas." }, { status: error instanceof KioskError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
export const orderColumns = "id,order_number,total_amount,subtotal,tax_amount,service_charge,status,payment_status";
export async function ownedOrder(session: KioskSession) {
  const { data, error } = await supabaseAdmin.from("orders").select(`${orderColumns},snap_token,kiosk_payment_state`).eq("kiosk_session_id", session.sid).eq("store_id", session.storeId).maybeSingle();
  if (error) throw error;
  return data;
}
