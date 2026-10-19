import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { assertOrigin, failure, KioskError, reply } from "@/lib/kiosk/server";
import { verifyTracking } from "@/lib/kiosk/tracking";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderId: string }> };
async function tracked(request: NextRequest, context: Context) {
  const { orderId } = await context.params;
  const claims = verifyTracking(request.headers.get("x-kiosk-tracking"), orderId);
  const { data, error } = await supabaseAdmin.from("orders")
    .select("id,store_id,kiosk_session_id,kiosk_tracking_ack_at,order_number,status,payment_status,order_type,estimated_ready_at,call_active,subtotal,tax_amount,service_charge,total_amount,created_at,completed_at,store:stores(name,address,phone),table:tables(number),order_items(id,menu_item_id,name_snapshot,price_snapshot,quantity,subtotal,notes,options_snapshot)")
    .eq("id", orderId).eq("store_id", claims.storeId).eq("payment_status", "paid").not("kiosk_session_id", "is", null).maybeSingle();
  if (error) throw error;
  if (!data) throw new KioskError("Pesanan kiosk yang sudah dibayar tidak ditemukan.", 404);
  return data;
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const { kiosk_session_id: _session, kiosk_tracking_ack_at: _ack, ...safe } = await tracked(request, context);
    // Deliberate read-only projection: no payment token, account identity or session credentials.
    return reply(safe);
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    assertOrigin(request);
    const order = await tracked(request, context);
    if (!order.kiosk_tracking_ack_at) {
      const { error } = await supabaseAdmin.from("orders").update({ kiosk_tracking_ack_at: new Date().toISOString() })
        .eq("id", order.id).eq("store_id", order.store_id).eq("kiosk_session_id", order.kiosk_session_id)
        .eq("payment_status", "paid").is("kiosk_tracking_ack_at", null);
      if (error) throw error;
    }
    return reply({ acknowledged: true });
  } catch (error) { return failure(error); }
}
