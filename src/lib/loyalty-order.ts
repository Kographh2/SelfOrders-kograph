import { supabaseAdmin } from "@/lib/supabase-server";

export async function finalizeLoyaltyRedemption(orderId: string, paymentStatus: string) {
  if (paymentStatus === "paid") {
    await supabaseAdmin.from("loyalty_redemptions").update({ status: "used", used_at: new Date().toISOString() })
      .eq("used_order_id", orderId).eq("status", "reserved");
  } else if (["failed", "expired"].includes(paymentStatus)) {
    await supabaseAdmin.from("loyalty_redemptions").update({ status: "available", used_order_id: null, used_at: null })
      .eq("used_order_id", orderId).eq("status", "reserved");
  }
}
