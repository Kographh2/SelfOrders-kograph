import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin, hasStoreAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get("storeId");
    const categoryId = searchParams.get("categoryId");
    const featured = searchParams.get("featured");

    let query = supabaseAdmin
      .from("menu_items")
      .select("*")
      .order("display_order", { ascending: true });

    if (storeId) query = query.eq("store_id", storeId);
    if (categoryId) query = query.eq("category_id", categoryId);
    if (featured === "true") query = query.eq("is_featured", true);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (error: unknown) {
    console.error("Menu items GET error:", error);
    return NextResponse.json({ error: "Failed to fetch menu items" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { storeId, categoryId, name, description, price, image, isAvailable, isFeatured, displayOrder } = body;

    if (!storeId || !categoryId || !name?.trim()) {
      return NextResponse.json({ error: "storeId, categoryId and name are required" }, { status: 400 });
    }

    if (typeof price !== "number" || price < 0) {
      return NextResponse.json({ error: "Valid price is required" }, { status: 400 });
    }

    if (!hasStoreAccess(user, storeId)) {
      return NextResponse.json({ error: "Access denied for this store" }, { status: 403 });
    }

    // Verify category belongs to same store (prevent cross-store injection)
    const { data: cat } = await supabaseAdmin
      .from("categories")
      .select("store_id")
      .eq("id", categoryId)
      .single();

    if (!cat || cat.store_id !== storeId) {
      return NextResponse.json({ error: "Category does not belong to this store" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .insert({
        store_id: storeId,
        category_id: categoryId,
        name: name.trim(),
        description: description?.trim() ?? null,
        price,
        image: image ?? null,
        is_available: isAvailable ?? true,
        is_featured: isFeatured ?? false,
        display_order: displayOrder ?? 0,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    console.error("Menu items POST error:", error);
    return NextResponse.json({ error: "Failed to create menu item" }, { status: 500 });
  }
}
