import { supabaseAdmin } from "@/lib/supabase-server";

export function kioskPaymentStatus(status: string, fraud?: string) {
  if (status === "settlement" || (status === "capture" && fraud === "accept")) return "paid";
  if (status === "expire") return "expired";
  if (["deny", "failure", "cancel"].includes(status)) return "failed";
  return "pending";
}
export async function settleKioskPayment(orderId: string, amount: string | undefined, status: string, transactionId?: string, fraud?: string) {
  const value = Number(amount);
  if (!amount || !Number.isFinite(value) || value <= 0) throw new Error("Nominal pembayaran tidak valid");
  const { data, error } = await supabaseAdmin.rpc("settle_kiosk_payment", { p_order_id: orderId, p_amount: value, p_status: kioskPaymentStatus(status, fraud), p_transaction_id: transactionId || null });
  if (error) throw error;
  return data;
}
