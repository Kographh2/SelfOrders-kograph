import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin, hasStoreAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get("storeId");

    let query = supabaseAdmin.from("tables").select("*").order("number");
    if (storeId) query = query.eq("store_id", storeId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (error: unknown) {
    console.error("Tables GET error:", error);
    return NextResponse.json({ error: "Failed to fetch tables" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { storeId, number } = body;

    if (!storeId || typeof number !== "number") {
      return NextResponse.json({ error: "storeId and number are required" }, { status: 400 });
    }

    if (!hasStoreAccess(user, storeId)) {
      return NextResponse.json({ error: "Access denied for this store" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("tables")
      .insert({ store_id: storeId, number, is_active: true })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Table ${number} already exists in this store` },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    console.error("Tables POST error:", error);
    return NextResponse.json({ error: "Failed to create table" }, { status: 500 });
  }
}
