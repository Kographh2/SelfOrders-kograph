import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { UUID } from "@/lib/kiosk/contracts";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
async function owner(request: NextRequest) {
  const user = await getAuthUser(request);
  if (user?.role !== "owner") return false;
  // Recheck the current role; an old JWT must not retain settings access.
  const { data, error } = await supabaseAdmin.from("users").select("role").eq("id", user.userId).single();
  return !error && data?.role === "owner";
}
function failure(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (["42P01", "PGRST205", "PGRST202", "42883"].includes(code || "")) {
    return json({ error: "Jalankan MIGRATION_SELFORDER_KIOSK_SETTINGS.sql di Supabase terlebih dahulu." }, 503);
  }
  if (code === "P0001") return json({ error: (error as { message: string }).message }, 400);
  console.error("[kiosk-settings]", error);
  return json({ error: "Pengaturan belum dapat disimpan atau dimuat. Coba kembali." }, 503);
}
export async function GET(request: NextRequest) {
  try {
    if (!await owner(request)) return json({ error: "Hanya owner yang dapat mengatur KIOSK." }, 403);
    const [stores, stations] = await Promise.all([
      supabaseAdmin.from("stores").select("id,name,address,logo,is_active").order("name"),
      supabaseAdmin.from("kiosk_stations").select("store_id,is_enabled,is_default,updated_at"),
    ]);
    if (stores.error) throw stores.error;
    if (stations.error) throw stations.error;
    const host = process.env.KIOSK_HOSTNAME || "kiosk.luujaaa.my.id";
    const origin = /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : request.nextUrl.origin;
    return json({ data: { stores: stores.data, stations: stations.data, baseUrl: `${origin}/kiosk` } });
  } catch (error) { return failure(error); }
}
export async function PUT(request: NextRequest) {
  try {
    if (!await owner(request)) return json({ error: "Hanya owner yang dapat mengatur KIOSK." }, 403);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Data pengaturan tidak valid." }, 400); }
    if (!body || typeof body.storeId !== "string" || !UUID.test(body.storeId) || typeof body.enabled !== "boolean" || typeof body.isDefault !== "boolean" || (body.isDefault && !body.enabled)) {
      return json({ error: "Pilih cabang yang valid. Cabang utama harus aktif." }, 400);
    }
    const { error } = await supabaseAdmin.rpc("save_kiosk_station", { p_store_id: body.storeId, p_enabled: body.enabled, p_default: body.isDefault });
    if (error) throw error;
    return json({ data: { saved: true } });
  } catch (error) { return failure(error); }
}
