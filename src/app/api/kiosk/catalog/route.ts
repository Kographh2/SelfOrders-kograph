import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { COOKIE, failure, getSession, KioskError, ownedOrder, reply, stationConfig } from "@/lib/kiosk/server";
import { getStoreOperatingStatus } from "@/lib/store-hours";
import { isMenuScheduledNow } from "@/lib/menu-schedule";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const requested = request.nextUrl.searchParams.get("station");
    let station: Awaited<ReturnType<typeof stationConfig>> | undefined;
    // Keep an issued order recoverable on refresh, even after disabling a branch
    // or changing the default. Reset deletes this cookie before loading a new menu.
    if (request.cookies.has(COOKIE)) {
      let session;
      try { session = getSession(request); } catch { /* Expired sessions use current configuration. */ }
      if (session && (!requested || requested === session.stationId) && await ownedOrder(session)) {
        station = { id: session.stationId, storeId: session.storeId, name: "" };
      }
    }
    station ??= await stationConfig(requested);
    const results = await Promise.all([
      supabaseAdmin.from("stores").select("id,name,address,logo,is_active,tax_rate,service_charge_rate,timezone,opening_hours,manual_closed").eq("id", station.storeId).single(),
      supabaseAdmin.from("categories").select("id,name,display_order").eq("store_id", station.storeId).eq("is_active", true).order("display_order"),
      supabaseAdmin.from("menu_items").select("id,category_id,name,description,price,image,is_available,is_featured,option_groups,track_stock,stock_quantity,allergens,dietary_tags,available_from,available_until,available_days,prep_minutes").eq("store_id", station.storeId).eq("show_on_menu", true).order("display_order"),
      supabaseAdmin.from("tables").select("id,number").eq("store_id", station.storeId).eq("is_active", true).order("number"),
      supabaseAdmin.from("store_documents").select("id,store_id,document_type,version,title,content").eq("status", "published").in("document_type", ["privacy", "terms"]).or(`store_id.eq.${station.storeId},store_id.is.null`),
    ]);
    for (const result of results) if (result.error) throw result.error;
    const [storeResult, categories, items, tables, docs] = results;
    const store = storeResult.data;
    if (!store || Array.isArray(store)) throw new KioskError("Cabang tidak ditemukan", 404);
    const policies = ["privacy", "terms"].flatMap(type => {
      const rows = (docs.data || []) as unknown as { document_type: string; store_id: string | null }[];
      const doc = rows.find(d => d.document_type === type && d.store_id === station.storeId) || rows.find(d => d.document_type === type && !d.store_id);
      return doc ? [doc] : [];
    });
    return reply({ station: { id: station.id, name: store.name }, store, operating: getStoreOperatingStatus(store), categories: categories.data, items: (items.data || []).filter(item => isMenuScheduledNow(item, store.timezone || "Asia/Jakarta")), tables: tables.data, policies });
  } catch (error) { return failure(error); }
}
