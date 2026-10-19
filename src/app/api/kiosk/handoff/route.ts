import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { failure, getSession, KioskError, ownedOrder, reply } from "@/lib/kiosk/server";
import { trackingToken } from "@/lib/kiosk/tracking";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    const owned = await ownedOrder(session);
    if (!owned || owned.payment_status !== "paid") throw new KioskError("QR antrean tersedia setelah pembayaran terkonfirmasi.", 409);
    const { data: order, error } = await supabaseAdmin.from("orders").select("id,store_id,created_at,kiosk_tracking_ack_at")
      .eq("id", owned.id).eq("store_id", session.storeId).eq("kiosk_session_id", session.sid).eq("payment_status", "paid").single();
    if (error) throw error;
    if (!order) throw new KioskError("Pesanan tidak tersedia", 404);
    // Keep the link on the same deployment; tokens in fragments never reach HTTP logs/referrers.
    const url = new URL(`/orders/${order.id}/waiting`, request.nextUrl.origin);
    url.hash = `kiosk=${trackingToken(order)}`;
    return reply({ url: url.toString(), scannedAt: order.kiosk_tracking_ack_at });
  } catch (error) { return failure(error); }
}
