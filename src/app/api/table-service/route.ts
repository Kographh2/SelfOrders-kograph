import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  const storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId || "";
  if (!isStaff(user) || !storeId || !hasStoreAccess(user, storeId)) return fail("Akses cabang ditolak", 403);
  const { data, error } = await supabaseAdmin.from("table_service_requests").select("*,table:tables(number)").eq("store_id", storeId)
    .order("created_at", { ascending: false }).limit(100);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const storeId = String(body.storeId || "");
  const tableNumber = Number(body.tableNumber);
  const requestType = String(body.requestType || "");
  const allowedTypes = ["waiter", "bill", "utensils", "water", "other"];
  if (!storeId || !Number.isInteger(tableNumber) || !allowedTypes.includes(requestType)) return fail("Permintaan meja tidak valid");
  const { data: table } = await supabaseAdmin.from("tables").select("id").eq("store_id", storeId).eq("number", tableNumber).eq("is_active", true).maybeSingle();
  if (!table) return fail("Meja tidak ditemukan", 404);
  const recentSince = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: recent } = await supabaseAdmin.from("table_service_requests").select("id,status,created_at").eq("table_id", table.id).eq("request_type", requestType).in("status", ["new", "acknowledged"]).gte("created_at", recentSince).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recent) return NextResponse.json({ data: recent, repeated: true }, { status: 200 });
  const { data, error } = await supabaseAdmin.from("table_service_requests").insert({ store_id: storeId, table_id: table.id, request_type: requestType, note: String(body.note || "").trim().slice(0, 300) || null }).select().single();
  if (error) return fail(error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isStaff(user)) return fail("Akses staf diperlukan", 403);
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = String(body.status || "");
  if (!id || !["acknowledged", "completed", "cancelled"].includes(status)) return fail("Status permintaan tidak valid");
  const { data: existing } = await supabaseAdmin.from("table_service_requests").select("id,store_id,status").eq("id", id).maybeSingle();
  if (!existing || !hasStoreAccess(user, existing.store_id)) return fail("Permintaan tidak ditemukan", 404);
  const { data, error } = await supabaseAdmin.from("table_service_requests").update({ status, handled_by: user!.userId, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) return fail(error.message, 500);
  await writeAudit(user!, existing.store_id, `table_service.${status}`, "table_service_request", id, existing, data);
  return NextResponse.json({ data });
}
