import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request), storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId;
  if (!isOwnerOrAdmin(user) || !storeId || !hasStoreAccess(user, storeId)) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  const { data, error } = await supabaseAdmin.from("audit_logs").select("*,actor:users(id,name,email)").eq("store_id", storeId).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}
