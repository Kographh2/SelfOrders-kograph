import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { notifyOrderStatus } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

// Map Midtrans transaction_status to our internal payment status
function mapPaymentStatus(txStatus: string, fraudStatus?: string): string {
  if (txStatus === "capture") {
    return fraudStatus === "accept" ? "paid" : "failed";
  }
  if (txStatus === "settlement") return "paid";
  if (txStatus === "pending") return "pending";
  if (txStatus === "deny" || txStatus === "failure") return "failed";
  if (txStatus === "expire") return "expired";
  if (txStatus === "cancel") return "failed";
  if (txStatus === "refund" || txStatus === "partial_refund") return "refunded";
  return "pending";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      order_id: orderId,
      transaction_status: txStatus,
      fraud_status: fraudStatus,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: incomingSignature,
      transaction_id: transactionId,
    } = body;

    if (!orderId || !txStatus) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // ── Security: verify Midtrans signature ──
    if (incomingSignature) {
      const valid = await verifyMidtransSignature(
        orderId,
        statusCode ?? "",
        grossAmount ?? "",
        incomingSignature
      );
      if (!valid) {
        console.error("[webhook] Invalid Midtrans signature for order:", orderId);
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    } else {
      // In production, always require signature
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Signature required" }, { status: 403 });
      }
    }

    // ── Idempotency: skip if already processed ──
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id, status, midtrans_order_id")
      .eq("order_id", orderId)
      .single();

    if (existingPayment?.status === "paid") {
      // Already processed — return 200 to stop Midtrans retries
      return NextResponse.json({ status: "already_processed" }, { status: 200 });
    }

    const newPaymentStatus = mapPaymentStatus(txStatus, fraudStatus);
    const isPaid = newPaymentStatus === "paid";

    // Wallet top-ups use their own Midtrans order namespace and ledger.
    if (orderId.startsWith("TOPUP-")) {
      const topupId = orderId.slice(6);
      const { data: topup } = await supabaseAdmin.from("wallet_topups").select("id,amount,status").eq("id", topupId).eq("midtrans_order_id", orderId).single();
      if (!topup) return NextResponse.json({ error: "Top up tidak ditemukan" }, { status: 404 });
      if (Math.round(Number(grossAmount)) !== Math.round(Number(topup.amount))) return NextResponse.json({ error: "Nominal tidak cocok" }, { status: 400 });
      if (isPaid) {
        const { error } = await supabaseAdmin.rpc("wallet_add_topup", { p_topup_id: topupId });
        if (error) throw error;
      } else if (topup.status !== "paid") {
        await supabaseAdmin.from("wallet_topups").update({ status: newPaymentStatus === "refunded" ? "failed" : newPaymentStatus, updated_at: new Date().toISOString() }).eq("id", topupId);
      }
      return NextResponse.json({ status: isPaid ? "topup_paid" : newPaymentStatus });
    }

    // Update payment record
    await supabaseAdmin
      .from("payments")
      .update({
        status: newPaymentStatus,
        transaction_id: transactionId ?? null,
        midtrans_order_id: orderId,
        paid_at: isPaid ? new Date().toISOString() : null,
        snap_data: body,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);

    // Update order payment_status and order status
    const orderStatus = isPaid ? "confirmed" : newPaymentStatus === "failed" ? "cancelled" : undefined;

    const orderUpdate: Record<string, string> = {
      payment_status: isPaid ? "paid" : newPaymentStatus,
      updated_at: new Date().toISOString(),
    };
    if (orderStatus) orderUpdate.status = orderStatus;

    await supabaseAdmin
      .from("orders")
      .update(orderUpdate)
      .eq("id", orderId);

    if (isPaid) await notifyOrderStatus(orderId, "confirmed");

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Notification processing failed";
    console.error("Midtrans notification error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
