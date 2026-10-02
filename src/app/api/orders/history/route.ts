import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user || user.role !== "user") return NextResponse.json({ error: "Login pelanggan diperlukan" }, { status: 401 });
  const page = Math.max(0, Number(request.nextUrl.searchParams.get("page") || 0));
  const pageSize = 20;
  const { data, error } = await supabaseAdmin.from("orders")
    .select("id,store_id,order_number,customer_name,status,payment_status,payment_method,order_type,total_amount,created_at,completed_at,store:stores(name),table:tables(number),order_items(id,menu_item_id,name_snapshot,price_snapshot,quantity,subtotal,notes,options_snapshot,menu_item:menu_items(name))")
    .eq("user_id", user.userId).order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [], page, pageSize, hasMore: (data || []).length === pageSize });
}
