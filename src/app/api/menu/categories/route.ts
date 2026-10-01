import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin, hasStoreAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get("storeId");

    let query = supabaseAdmin
      .from("categories")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (storeId) query = query.eq("store_id", storeId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (error: unknown) {
    console.error("Categories GET error:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { storeId, name, description, displayOrder, translations } = body;

    if (!storeId || !name?.trim()) {
      return NextResponse.json({ error: "storeId and name are required" }, { status: 400 });
    }

    if (!hasStoreAccess(user, storeId)) {
      return NextResponse.json({ error: "Access denied for this store" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("categories")
      .insert({
        store_id: storeId,
        name: name.trim(),
        description: description?.trim() ?? null,
        display_order: displayOrder ?? 0,
        translations: translations ?? {},
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    console.error("Categories POST error:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
