import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";
import { notifyOrderStatus } from "@/lib/push-notifications";
import { finalizeLoyaltyRedemption } from "@/lib/loyalty-order";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestedCode = String(body.orderId || "").trim();
    if (!requestedCode) return NextResponse.json({ error: "orderId required" }, { status: 400 });
    let orderId = requestedCode;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requestedCode)) {
      const { data: payment } = await supabaseAdmin.from("payments").select("order_id").eq("transaction_id", requestedCode).maybeSingle();
      if (!payment) return NextResponse.json({ error: "Kode QR pembayaran tidak valid" }, { status: 404 });
      orderId = payment.order_id;
    }
    const { data: order } = await supabaseAdmin.from("orders").select("id,store_id,user_id,anonymous_session_id,order_number,total_amount,payment_status,status,kiosk_session_id").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    if (order.kiosk_session_id) return NextResponse.json({ error: "Pesanan KIOSK memakai pembayaran digital. Periksa status Midtrans sebelum melakukan tindakan lain." }, { status: 409 });
    const { data: activeSplit } = await supabaseAdmin.from("split_bills").select("id").eq("order_id", orderId).eq("status", "active").maybeSingle();
    if (activeSplit) return NextResponse.json({ error: "Pesanan ini sedang menggunakan split bill" }, { status: 409 });
    if (body.confirm === true) {
      const user = await getAuthUser(request);
      if (!isStaff(user) || !hasStoreAccess(user, order.store_id)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      if (order.status === "cancelled") return NextResponse.json({ error: "Pesanan yang dibatalkan tidak dapat dikonfirmasi pembayarannya" }, { status: 409 });
      if (order.payment_status === "paid") return NextResponse.json({ data: order });
      const { data: shift } = await supabaseAdmin.from("cashier_shifts").select("id").eq("store_id", order.store_id).eq("cashier_id", user!.userId).is("closed_at", null).maybeSingle();
      if (!shift) return NextResponse.json({ error: "Buka shift kasir sebelum mengonfirmasi pembayaran tunai" }, { status: 409 });
      await supabaseAdmin.from("payments").update({ status:"paid", paid_by:user!.userId, paid_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq("order_id", orderId);
      const { data, error } = await supabaseAdmin.from("orders").update({ payment_status:"paid", status:"confirmed", payment_method:"cash", updated_at:new Date().toISOString() }).eq("id", orderId).select().single();
      if (error) throw error;
      await finalizeLoyaltyRedemption(orderId, "paid");
      await notifyOrderStatus(orderId, "confirmed");
      return NextResponse.json({ data });
    }
    const customer = await getAuthUser(request);
    const ownsOrder = (customer?.userId && customer.userId === order.user_id) || (body.sessionId && body.sessionId === order.anonymous_session_id);
    if (!ownsOrder) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (order.payment_status !== "pending") return NextResponse.json({ error: "Pembayaran sudah diproses" }, { status: 400 });
    const cashCode = `CASH-${String(order.order_number).padStart(3,"0")}-${order.id.slice(0,8).toUpperCase()}`;
    await supabaseAdmin.from("orders").update({ payment_method:"cash", updated_at:new Date().toISOString() }).eq("id", orderId);
    await supabaseAdmin.from("payments").update({ method:"cash", transaction_id:cashCode, updated_at:new Date().toISOString() }).eq("order_id", orderId);
    return NextResponse.json({ data:{ cashCode, orderNumber:order.order_number, total:order.total_amount } });
  } catch (error) {
    console.error("Cash payment error", error);
    return NextResponse.json({ error:"Gagal memproses pembayaran tunai" }, { status:500 });
  }
}
