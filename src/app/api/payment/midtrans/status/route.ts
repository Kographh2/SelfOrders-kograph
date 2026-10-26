import { type NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { reconcilePayment } from "@/lib/payment-reconciliation";
import { supabaseAdmin } from "@/lib/supabase-server";

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
    const data = await reconcilePayment(order.id);
    return NextResponse.json({ data: { ...data, checked: true } });
  } catch (error) {
    console.error("Midtrans status check error:", error);
    return NextResponse.json({ error: "Status belum bisa diambil dari Midtrans. Coba lagi sebentar." }, { status: 502 });
  }
}
