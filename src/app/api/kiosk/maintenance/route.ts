import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { snap } from "@/lib/midtrans";
import { settleKioskPayment } from "@/lib/kiosk/payment";
import { failure, KioskError, reply } from "@/lib/kiosk/server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const incoming = Buffer.from(request.headers.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (!secret || incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) throw new KioskError("Unauthorized", 401);
    const expired = await supabaseAdmin.rpc("expire_unpaid_kiosk_drafts");
    if (expired.error) throw expired.error;
    const { data: orders, error } = await supabaseAdmin.from("orders").select("id").not("kiosk_session_id", "is", null).eq("payment_status", "pending").neq("kiosk_payment_state", "idle").order("updated_at").limit(20);
    if (error) throw error;
    let synced = 0;
    let needsReview = 0;
    for (const order of orders || []) {
      try {
        const tx = await snap.transaction.status(order.id);
        if (tx.order_id !== order.id) throw new Error("Reference mismatch");
        await settleKioskPayment(order.id, tx.gross_amount, tx.transaction_status, tx.transaction_id, tx.fraud_status);
        synced++;
      } catch { needsReview++; }
      // Rotate the bounded reconciliation batch; missing provider references
      // remain pending for staff review rather than releasing stock unsafely.
      const updated = await supabaseAdmin.from("orders").update({ updated_at: new Date().toISOString() }).eq("id", order.id);
      if (updated.error) throw updated.error;
    }
    return reply({ expiredDrafts: expired.data, synced, needsReview });
  } catch (error) { return failure(error); }
}
