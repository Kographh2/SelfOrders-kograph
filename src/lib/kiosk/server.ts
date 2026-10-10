import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { UUID } from "./contracts";

export const COOKIE = "selforder_kiosk";
export class KioskError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function stationConfig(id?: string | null) {
  if (id != null && (typeof id !== "string" || id.length > 100)) throw new KioskError("Station tidak valid", 400);
  const { data: configured, error } = await supabaseAdmin.from("kiosk_stations").select("store_id,is_enabled,is_default");
  // Preserve existing env-based installations until the settings migration is applied.
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw error;
  if (configured?.length) {
    const row = id ? configured.find(s => s.store_id === id) : configured.find(s => s.is_default);
    if (!row?.is_enabled) throw new KioskError("KIOSK belum aktif untuk cabang ini. Hubungi petugas.", 503);
    const { data: store, error: storeError } = await supabaseAdmin.from("stores").select("id,name,is_active").eq("id", row.store_id).single();
    if (storeError) throw storeError;
    if (!store?.is_active) throw new KioskError("Cabang sedang tidak aktif. Hubungi petugas.", 503);
    return { id: store.id as string, storeId: store.id as string, name: store.name as string };
  }
  const stationId = id || process.env.KIOSK_DEFAULT_STATION;
  let stations: Record<string, { storeId: string; name: string }>;
  try { stations = JSON.parse(process.env.KIOSK_STATIONS || "{}"); }
  catch { throw new KioskError("Konfigurasi KIOSK belum valid. Hubungi petugas.", 503); }
  const station = stations && stationId && Object.hasOwn(stations, stationId) ? stations[stationId] : null;
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
    // An issued session retains its signed branch so pending payments remain
    // accessible even after the owner disables a terminal. New orders revalidate it.
    if (!UUID.test(payload.sid) || !UUID.test(payload.storeId) || typeof payload.stationId !== "string" || !payload.stationId || payload.stationId.length > 100) throw new Error();
    return payload;
  } catch { throw new KioskError("Sesi berakhir. Silakan mulai pesanan baru.", 401); }
}
export function newSession(station: Awaited<ReturnType<typeof stationConfig>>) {
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
