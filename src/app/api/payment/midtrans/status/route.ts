import { type NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { snap } from "@/lib/midtrans";
import { supabaseAdmin } from "@/lib/supabase-server";
import { notifyOrderStatus } from "@/lib/push-notifications";
import { finalizeLoyaltyRedemption } from "@/lib/loyalty-order";

export const dynamic = "force-dynamic";

function mapStatus(transactionStatus: string, fraudStatus?: string) {
  if (transactionStatus === "settlement") return "paid";
  if (transactionStatus === "capture") return fraudStatus === "accept" ? "paid" : "failed";
  if (transactionStatus === "expire") return "expired";
  if (["deny", "failure", "cancel"].includes(transactionStatus)) return "failed";
  if (transactionStatus === "refund" || transactionStatus === "partial_refund") return "refunded";
  return "pending";
}

export async function POST(request: NextRequest) {
  try {
    const { orderId, sessionId } = await request.json();
    if (!orderId) return NextResponse.json({ error: "orderId wajib diisi" }, { status: 400 });

    const { data: order, error } = await supabaseAdmin.from("orders")
      .select("id,user_id,anonymous_session_id,payment_status,payment_method,total_amount,status")
      .eq("id", orderId).maybeSingle();
    if (error || !order) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });

    const user = await getAuthUser(request);
    const ownsOrder = Boolean((user?.userId && user.userId === order.user_id) ||
      (sessionId && sessionId === order.anonymous_session_id));
    if (!ownsOrder) return NextResponse.json({ error: "Akses pesanan ditolak" }, { status: 403 });
    if (order.payment_status !== "pending") {
      return NextResponse.json({ data: { payment_status: order.payment_status } });
    }
    if (order.payment_method !== "snap") {
      return NextResponse.json({ data: { payment_status: order.payment_status, checked: false } });
    }

    // Read the authoritative state from Midtrans; browser callbacks/webhooks
    // can be delayed, so the customer can still refresh payment status here.
    const transaction = await snap.transaction.status(order.id);
    if (transaction.order_id !== order.id) {
      return NextResponse.json({ error: "Referensi transaksi tidak cocok" }, { status: 409 });
    }
    if (transaction.gross_amount && Math.round(Number(transaction.gross_amount)) !== Math.round(Number(order.total_amount))) {
      return NextResponse.json({ error: "Nominal transaksi tidak cocok" }, { status: 409 });
    }

    const paymentStatus = mapStatus(transaction.transaction_status, transaction.fraud_status);
    const isPaid = paymentStatus === "paid";
    const now = new Date().toISOString();
    await supabaseAdmin.from("payments").update({
      status: paymentStatus,
      transaction_id: transaction.transaction_id ?? null,
      midtrans_order_id: order.id,
      paid_at: isPaid ? now : null,
      snap_data: transaction,
      updated_at: now,
    }).eq("order_id", order.id).neq("status", "paid");

    const orderUpdate: Record<string, string> = { payment_status: paymentStatus, updated_at: now };
    if (isPaid) orderUpdate.status = "confirmed";
    else if (paymentStatus === "failed") orderUpdate.status = "cancelled";
    await supabaseAdmin.from("orders").update(orderUpdate).eq("id", order.id).eq("payment_status", "pending");
    await finalizeLoyaltyRedemption(order.id, paymentStatus);

    if (isPaid) await notifyOrderStatus(order.id, "confirmed");
    const { data: latest } = await supabaseAdmin.from("orders").select("payment_status").eq("id", order.id).single();
    return NextResponse.json({ data: { payment_status: latest?.payment_status ?? paymentStatus, checked: true } });
  } catch (error) {
    console.error("Midtrans status check error:", error);
    return NextResponse.json({ error: "Status belum bisa diambil dari Midtrans. Coba lagi sebentar." }, { status: 502 });
  }
}
