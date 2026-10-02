import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  const storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId || "";
  if (!isStaff(user) || !storeId || !hasStoreAccess(user, storeId)) return NextResponse.json({ error: "Akses cabang ditolak" }, { status: 403 });
  const { data, error } = await supabaseAdmin.from("order_feedback")
    .select("id,rating,note,tip_amount,created_at,order:orders!inner(id,order_number,store_id,customer_name,completed_at),cashier:users!order_feedback_cashier_id_fkey(name)")
    .eq("order.store_id", storeId).order("created_at", { ascending: false }).limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data || [];
  const average = rows.length ? rows.reduce((sum, row) => sum + Number(row.rating), 0) / rows.length : 0;
  const distribution = Object.fromEntries([1, 2, 3, 4, 5].map(rating => [rating, rows.filter(row => Number(row.rating) === rating).length]));
  return NextResponse.json({ data: { feedback: rows, average: Number(average.toFixed(2)), count: rows.length, distribution } });
}
