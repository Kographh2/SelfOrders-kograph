import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  const storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId || "";
  if (!isStaff(user) || !storeId || !hasStoreAccess(user, storeId)) return NextResponse.json({ error: "Akses cabang ditolak" }, { status: 403 });
  const { data: store } = await supabaseAdmin.from("stores").select("timezone").eq("id", storeId).maybeSingle();
  if (!store) return NextResponse.json({ error: "Cabang tidak ditemukan" }, { status: 404 });
  const timezone = store.timezone || "Asia/Jakarta";
  const start = new Date(Date.now() - 56 * 86400000).toISOString();
  const { data: orders, error } = await supabaseAdmin.from("orders")
    .select("id,created_at,order_items(name_snapshot,quantity)")
    .eq("store_id", storeId).eq("status", "completed").eq("payment_status", "paid")
    .gte("created_at", start).order("created_at", { ascending: false }).range(0, 4999);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const aggregate = new Map<string, Map<string, number>>();
  const display = new Map<string, string>();
  for (const order of orders || []) {
    const date = new Date(order.created_at);
    const day = dateFmt.format(date);
    const weekday = weekdayFmt.format(date);
    const key = `${weekday}|${day}`;
    if (!aggregate.has(weekday)) aggregate.set(weekday, new Map());
    const daily = aggregate.get(weekday)!;
    for (const item of order.order_items || []) {
      const name = String(item.name_snapshot || "Menu");
      daily.set(name, (daily.get(name) || 0) + Number(item.quantity || 0));
      display.set(name, name);
    }
  }
  const dayIndex = new Map([["Sun", 0], ["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6]]);
  const weekdayLabels = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const baseDate = new Date();
  const forecasts = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(baseDate.getTime() + offset * 86400000);
    const weekday = weekdayFmt.format(date);
    const samples = aggregate.get(weekday);
    const items = [...(samples || new Map()).entries()].map(([name, total]) => ({
      name: display.get(name) || name,
      predicted_quantity: Math.max(0, Math.round(total / Math.max(1, new Set((orders || []).filter(order => weekdayFmt.format(new Date(order.created_at)) === weekday).map(order => dateFmt.format(new Date(order.created_at)))).size))),
    })).sort((a, b) => b.predicted_quantity - a.predicted_quantity).slice(0, 10);
    return { date: dateFmt.format(date), weekday: weekdayLabels[dayIndex.get(weekday) ?? 0], sample_days: new Set((orders || []).filter(order => weekdayFmt.format(new Date(order.created_at)) === weekday).map(order => dateFmt.format(new Date(order.created_at)))).size, items };
  });
  return NextResponse.json({ data: { storeId, timezone, rangeDays: 56, basedOnCompletedPaidOrders: (orders || []).length, forecasts, note: "Rata-rata jumlah item pada hari yang sama dari maksimal 8 minggu terakhir; gunakan sebagai panduan dan sesuaikan manual." } });
}
