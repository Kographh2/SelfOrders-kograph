import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getStoreOperatingStatus } from "@/lib/store-hours";
import { parseCheckout } from "@/lib/kiosk/contracts";
import { assertOrigin, failure, getSession, KioskError, ownedOrder, reply, stationConfig } from "@/lib/kiosk/server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const order = await ownedOrder(getSession(request));
    if (!order) return reply(null);
    const { snap_token: _token, kiosk_payment_state: _state, ...safe } = order;
    return reply(safe);
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    const session = getSession(request);
    let checkout;
    try { checkout = parseCheckout(await request.json()); }
    catch (error) { throw new KioskError(error instanceof Error ? error.message : "Pesanan tidak valid"); }
    const existing = await ownedOrder(session);
    if (!existing) {
      const station = await stationConfig(session.stationId);
      if (station.storeId !== session.storeId) throw new KioskError("Cabang berubah. Silakan mulai pesanan baru.", 409);
      const { data: store, error } = await supabaseAdmin.from("stores").select("is_active,manual_closed,opening_hours,timezone").eq("id", session.storeId).single();
      if (error) throw error;
      if (!getStoreOperatingStatus(store).is_open) throw new KioskError("Cabang sedang tutup. Hubungi petugas.", 409);
    }
    const { error } = await supabaseAdmin.rpc("create_kiosk_order", {
      p_store_id: session.storeId, p_station_id: session.stationId, p_session_id: session.sid,
      p_request_id: checkout.requestId, p_request_hash: createHash("sha256").update(JSON.stringify(checkout)).digest("hex"),
      p_table_id: checkout.tableId, p_mode: checkout.mode, p_items: checkout.items,
      p_policy_ids: checkout.policyIds, p_expected_total: checkout.expectedTotal,
    });
    if (error) {
      if (error.code === "P0001") throw new KioskError(error.message, 409);
      throw error;
    }
    return GET(request);
  } catch (error) { return failure(error); }
}
