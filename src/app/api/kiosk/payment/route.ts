import { NextRequest } from "next/server";
import { createSnapTransaction, snap } from "@/lib/midtrans";
import { supabaseAdmin } from "@/lib/supabase-server";
import { assertOrigin, failure, getSession, KioskError, ownedOrder, reply } from "@/lib/kiosk/server";
import { settleKioskPayment } from "@/lib/kiosk/payment";

export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    const session = getSession(request);
    const order = await ownedOrder(session);
    if (!order) throw new KioskError("Pesanan tidak ditemukan", 404);
    if (order.payment_status !== "pending" || order.status === "cancelled") throw new KioskError("Pembayaran sudah diproses. Periksa status pesanan.", 409);
    if (order.snap_token) return reply({ token: order.snap_token });
    if (!process.env.MIDTRANS_SERVER_KEY || !process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY) throw new KioskError("Pembayaran belum tersedia. Hubungi petugas.", 503);
    // Durable compare-and-set survives concurrent tabs, retries and serverless workers.
    const { data: claimed, error: claimError } = await supabaseAdmin.from("orders").update({ kiosk_payment_state: "creating", payment_method: "snap" }).eq("id", order.id).eq("kiosk_payment_state", "idle").eq("payment_status", "pending").neq("status", "cancelled").select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw new KioskError("Pembayaran sedang disiapkan atau perlu pemeriksaan petugas. Tekan Periksa status; jangan membuat pembayaran lain.", 409);
    try {
      const { data: lines, error } = await supabaseAdmin.from("order_items").select("id,name_snapshot,subtotal,quantity").eq("order_id", order.id);
      if (error) throw error;
      const result = await createSnapTransaction({
        orderId: order.id, amount: Number(order.total_amount),
        items: (lines || []).map(line => ({ id: line.id, name: line.name_snapshot, price: Number(line.subtotal) / line.quantity, quantity: line.quantity })).concat([
          { id: "tax", name: "Pajak", price: Number(order.tax_amount), quantity: 1 },
          { id: "service", name: "Biaya layanan", price: Number(order.service_charge), quantity: 1 },
        ].filter(line => line.price > 0)),
        customerName: "Pelanggan KIOSK", enabledPayments: ["qris", "gopay", "shopeepay"],
        finishUrl: new URL(`/kiosk?station=${encodeURIComponent(session.stationId)}&resume=1`, request.nextUrl.origin).toString(),
      });
      const saved = await supabaseAdmin.from("orders").update({ snap_token: result.token, redirect_url: result.redirectUrl, kiosk_payment_state: "ready" }).eq("id", order.id);
      if (saved.error) throw saved.error;
      return reply({ token: result.token });
    } catch (error) {
      // Never retry provider creation after an ambiguous timeout. Staff must
      // reconcile the SAME order UUID in Midtrans; no second charge is issued.
      await supabaseAdmin.from("orders").update({ kiosk_payment_state: "uncertain" }).eq("id", order.id).eq("kiosk_payment_state", "creating");
      throw error;
    }
  } catch (error) { return failure(error); }
}
export async function PUT(request: NextRequest) {
  try {
    assertOrigin(request);
    const order = await ownedOrder(getSession(request));
    if (!order) throw new KioskError("Pesanan tidak ditemukan", 404);
    if (order.payment_status !== "pending" || order.kiosk_payment_state === "idle") return reply({ payment_status: order.payment_status });
    const transaction = await snap.transaction.status(order.id);
    if (transaction.order_id !== order.id) throw new Error("Referensi pembayaran berbeda");
    return reply(await settleKioskPayment(order.id, transaction.gross_amount, transaction.transaction_status, transaction.transaction_id, transaction.fraud_status));
  } catch (error) { return failure(error); }
}
