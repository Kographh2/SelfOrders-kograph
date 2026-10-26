import { snap } from "@/lib/midtrans";
import { supabaseAdmin } from "@/lib/supabase-server";
import { notifyOrderStatus } from "@/lib/push-notifications";
export async function reconcilePayment(reference: string) {
  if (!/^(?:TOPUP-|RES-|SPLIT-)?[a-zA-Z0-9-]{8,100}$/.test(reference)) throw new Error("Referensi pembayaran tidak valid");
  const tx = await snap.transaction.status(reference);
  const amount = Number(tx.gross_amount);
  if (tx.order_id !== reference || !tx.gross_amount || !Number.isFinite(amount) || amount <= 0) throw new Error("Referensi atau nominal provider tidak cocok");
  const status = tx.transaction_status === "settlement" || (tx.transaction_status === "capture" && tx.fraud_status === "accept") ? "paid" :
    tx.transaction_status === "expire" ? "expired" : ["deny", "failure", "cancel"].includes(tx.transaction_status) ? "failed" :
    ["refund", "partial_refund"].includes(tx.transaction_status) ? "refunded" : "pending";
  const { data, error } = await supabaseAdmin.rpc("settle_verified_payment", {
    p_reference: reference, p_amount: amount, p_status: status, p_transaction: tx.transaction_id || null,
    p_provider: { refunds: tx.refunds || [] },
  });
  if (error) throw new Error("Pembayaran perlu direkonsiliasi. Hubungi petugas.");
  if (data?.changed && data.order_id) await notifyOrderStatus(data.order_id, "confirmed");
  return data;
}
