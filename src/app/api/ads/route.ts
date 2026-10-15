import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin } from "@/lib/auth";
import { isUuid, validateAd } from "@/lib/restaurant-ads";

export const dynamic = "force-dynamic";
const fields = "id,store_id,title,description,image_url,link_url,link_label,is_active,display_order";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get("storeId");
  const manage = request.nextUrl.searchParams.get("manage") === "1";
  if (!isUuid(storeId)) return reply({ error: "Cabang tidak valid" }, 400);
  try {
    if (manage) {
      const user = await getAuthUser(request);
      if (!isOwnerOrAdmin(user) || !hasStoreAccess(user, storeId)) return reply({ error: "Akses ditolak" }, 403);
    } else {
      const { data, error } = await supabaseAdmin.from("stores").select("id").eq("id", storeId).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!data) return reply({ data: [] });
    }
    let query = supabaseAdmin.from("restaurant_ads").select(fields).eq("store_id", storeId);
    if (!manage) query = query.eq("is_active", true);
    const { data, error } = await query.order("display_order").order("created_at").limit(100);
    if (error) throw error;
    return reply({ data: data ?? [] });
  } catch (error) {
    console.error("Ads GET failed", error);
    return reply({ error: "Iklan belum dapat dimuat. Pastikan migrasi iklan sudah diterapkan." }, 503);
  }
}

async function write(request: NextRequest, edit: boolean) {
  const user = await getAuthUser(request);
  if (!isOwnerOrAdmin(user)) return reply({ error: "Akses ditolak" }, 403);
  let body: Record<string, unknown>;
  let input: ReturnType<typeof validateAd>;
  try {
    body = await request.json();
    input = validateAd(body);
    if (edit && !isUuid(body.id)) throw new Error("ID iklan tidak valid");
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "Data tidak valid" }, 400); }
  if (!hasStoreAccess(user, input.store_id)) return reply({ error: "Akses cabang ditolak" }, 403);
  try {
    const query = edit
      ? supabaseAdmin.from("restaurant_ads").update({ ...input, updated_at: new Date().toISOString() }).eq("id", body.id).eq("store_id", input.store_id)
      : supabaseAdmin.from("restaurant_ads").insert(input);
    const { data, error } = await query.select(fields).maybeSingle();
    if (error) throw error;
    if (!data) return reply({ error: "Iklan tidak ditemukan di cabang ini" }, 404);
    return reply({ data }, edit ? 200 : 201);
  } catch (error) {
    console.error("Ads write failed", error);
    return reply({ error: "Iklan gagal disimpan. Pastikan migrasi iklan sudah diterapkan." }, 503);
  }
}
export const POST = (request: NextRequest) => write(request, false);
export const PATCH = (request: NextRequest) => write(request, true);
