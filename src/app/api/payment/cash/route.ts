import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";
import { notifyOrderStatus } from "@/lib/push-notifications";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId = String(body.orderId || "");
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
    const { data: order } = await supabaseAdmin.from("orders").select("id,store_id,user_id,anonymous_session_id,order_number,total_amount,payment_status,status").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    if (body.confirm === true) {
      const user = await getAuthUser(request);
      if (!isStaff(user) || !hasStoreAccess(user, order.store_id)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      if (order.payment_status === "paid") return NextResponse.json({ data: order });
      await supabaseAdmin.from("payments").update({ status:"paid", paid_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq("order_id", orderId);
      const { data, error } = await supabaseAdmin.from("orders").update({ payment_status:"paid", status:"confirmed", payment_method:"cash", updated_at:new Date().toISOString() }).eq("id", orderId).select().single();
      if (error) throw error;
      await notifyOrderStatus(orderId, "confirmed");
      return NextResponse.json({ data });
    }
    const customer = await getAuthUser(request);
    const ownsOrder = (customer?.userId && customer.userId === order.user_id) || (body.sessionId && body.sessionId === order.anonymous_session_id);
    if (!ownsOrder) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (order.payment_status !== "pending") return NextResponse.json({ error: "Pembayaran sudah diproses" }, { status: 400 });
    await supabaseAdmin.from("orders").update({ payment_method:"cash", updated_at:new Date().toISOString() }).eq("id", orderId);
    await supabaseAdmin.from("payments").update({ method:"cash", transaction_id:`CASH-${order.id}`, updated_at:new Date().toISOString() }).eq("order_id", orderId);
    return NextResponse.json({ data:{ cashCode:`CASH-${order.id}`, orderNumber:order.order_number, total:order.total_amount } });
  } catch (error) {
    console.error("Cash payment error", error);
    return NextResponse.json({ error:"Gagal memproses pembayaran tunai" }, { status:500 });
  }
}
