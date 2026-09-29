import { type NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";

type Params = { params: Promise<{ orderId: string }> };
export async function PUT(request: NextRequest, { params }: Params) {
  const { orderId } = await params;
  const user = await getAuthUser(request);
  const body = await request.json().catch(() => ({}));
  const sessionId = String(body.sessionId ?? "");
  const { data: order } = await supabaseAdmin.from("orders").select("id,user_id,anonymous_session_id,store_id")
    .eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  const customer = (!!user?.userId && user.userId === order.user_id) || (!order.user_id && !!sessionId && sessionId === order.anonymous_session_id);
  const staff = isStaff(user) && hasStoreAccess(user, order.store_id);
  if (!customer && !staff) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  const { error } = await supabaseAdmin.from("orders").update({ call_active: false, call_acknowledged_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { call_active: false } });
}
