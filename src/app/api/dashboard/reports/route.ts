import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";

function dateInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function startOfDayInZone(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let timestamp = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
    timestamp += target - Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  }
  return new Date(timestamp);
}

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isStaff(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId;
  if (!storeId || !hasStoreAccess(user, storeId)) return NextResponse.json({ error: "Akses cabang ditolak" }, { status: 403 });
  const { data: store } = await supabaseAdmin.from("stores").select("timezone").eq("id", storeId).maybeSingle();
  if (!store) return NextResponse.json({ error: "Cabang tidak ditemukan" }, { status: 404 });
  let timeZone = store.timezone || "Asia/Jakarta";
  let today: string;
  try { today = dateInZone(new Date(), timeZone); } catch { timeZone = "Asia/Jakarta"; today = dateInZone(new Date(), timeZone); }
  const from = request.nextUrl.searchParams.get("from") || shiftDate(today, -30);
  const to = request.nextUrl.searchParams.get("to") || today;
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  };
  if (!validDate(from) || !validDate(to) || from > to || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 366) {
    return NextResponse.json({ error: "Rentang tanggal tidak valid (maksimal 367 hari)" }, { status: 400 });
  }
  const start = startOfDayInZone(from, timeZone).toISOString();
  const end = startOfDayInZone(shiftDate(to, 1), timeZone).toISOString();
  const { data: orders, error } = await supabaseAdmin.from("orders").select("id,order_number,total_amount,payment_method,payment_status,created_at,order_items(name_snapshot,quantity,subtotal)").eq("store_id", storeId).gte("created_at", start).lt("created_at", end).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const paid = (orders || []).filter(o => o.payment_status === "paid");
  const products: Record<string, { quantity: number; sales: number }> = {};
  const hours: Record<string, number> = {};
  const methods: Record<string, number> = {};
  for (const order of paid) {
    const hour = new Date(order.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", hour12: false, timeZone });
    hours[hour] = (hours[hour] || 0) + 1;
    const method = order.payment_method || "unknown";
    methods[method] = (methods[method] || 0) + Number(order.total_amount || 0);
    for (const item of (order.order_items || []) as { name_snapshot: string; quantity: number; subtotal: number }[]) {
      const itemName = item.name_snapshot || "Menu";
      products[itemName] ||= { quantity: 0, sales: 0 };
      products[itemName].quantity += Number(item.quantity);
      products[itemName].sales += Number(item.subtotal);
    }
  }
  const { data: shifts } = await supabaseAdmin.from("cashier_shifts").select("id,opening_cash,expected_cash,closing_cash,opened_at,closed_at,cashier_id").eq("store_id", storeId).gte("opened_at", start).lt("opened_at", end).not("closed_at", "is", null);
  const shiftReports = (shifts || []).map(shift => {
    const expectedCash = Number(shift.expected_cash ?? shift.opening_cash);
    return { ...shift, expected_cash: expectedCash, cash_difference: Number(shift.closing_cash || 0) - expectedCash };
  });
  return NextResponse.json({ data: { orders: paid, totals: { orderCount: paid.length, sales: paid.reduce((n, o) => n + Number(o.total_amount || 0), 0) }, products: Object.entries(products).map(([name, value]) => ({ name, ...value })).sort((a,b)=>b.quantity-a.quantity), hours, methods, shifts: shiftReports } });
}
