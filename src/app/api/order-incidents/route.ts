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
  const { data, error } = await supabaseAdmin.from("order_incidents").select("*,order:orders(order_number,customer_name,status,payment_status),assignee:users!order_incidents_assigned_to_fkey(name)")
    .eq("store_id", storeId).order("created_at", { ascending: false }).limit(200);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  const body = await request.json().catch(() => ({}));
  const orderId = String(body.orderId || "");
  const sessionId = String(body.sessionId || "");
  const category = String(body.category || "");
  const description = String(body.description || "").trim().slice(0, 2000);
  if (!orderId || !description || !["late", "missing_item", "wrong_item", "payment", "quality", "other"].includes(category)) return fail("Kategori dan keterangan wajib diisi");
  const { data: order } = await supabaseAdmin.from("orders").select("id,store_id,user_id,anonymous_session_id").eq("id", orderId).maybeSingle();
  if (!order) return fail("Pesanan tidak ditemukan", 404);
  const isCustomer = Boolean((user?.userId && user.userId === order.user_id) || (sessionId && sessionId === order.anonymous_session_id));
  if (!isCustomer && !(isStaff(user) && hasStoreAccess(user, order.store_id))) return fail("Akses pesanan ditolak", 403);
  const { data, error } = await supabaseAdmin.from("order_incidents").insert({ order_id: orderId, store_id: order.store_id, reporter_id: user?.role === "user" ? user.userId : null, category, description }).select().single();
  if (error) return fail(error.code === "23505" ? "Laporan untuk kategori ini sedang ditangani" : error.message, 409);
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isStaff(user)) return fail("Akses staf diperlukan", 403);
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = String(body.status || "");
  const resolutionNote = String(body.resolutionNote || "").trim().slice(0, 2000) || null;
  if (!id || !["in_review", "resolved", "rejected"].includes(status)) return fail("Status laporan tidak valid");
  const { data: before } = await supabaseAdmin.from("order_incidents").select("id,store_id,status").eq("id", id).maybeSingle();
  if (!before || !hasStoreAccess(user, before.store_id)) return fail("Laporan tidak ditemukan", 404);
  const { data, error } = await supabaseAdmin.from("order_incidents").update({ status, resolution_note: resolutionNote, assigned_to: user!.userId, resolved_at: ["resolved", "rejected"].includes(status) ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) return fail(error.message, 500);
  await writeAudit(user!, before.store_id, `order_incident.${status}`, "order_incident", id, before, data);
  return NextResponse.json({ data });
}
