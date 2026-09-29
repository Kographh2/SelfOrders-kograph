import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin, hasStoreAccess } from "@/lib/auth";

type Params = { params: Promise<{ categoryId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
    const { categoryId } = await params;
  try {
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select("*")
      .eq("id", categoryId)
      .single();

    if (error || !data) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Failed to fetch category" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
    const { categoryId } = await params;
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from("categories")
      .select("store_id")
      .eq("id", categoryId)
      .single();

    if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    if (!hasStoreAccess(user, existing.store_id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, displayOrder, isActive } = body;

    const { data, error } = await supabaseAdmin
      .from("categories")
      .update({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() ?? null }),
        ...(displayOrder !== undefined && { display_order: displayOrder }),
        ...(isActive !== undefined && { is_active: isActive }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", categoryId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
    const { categoryId } = await params;
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from("categories")
      .select("store_id")
      .eq("id", categoryId)
      .single();

    if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    if (!hasStoreAccess(user, existing.store_id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("categories")
      .delete()
      .eq("id", categoryId);

    if (error) throw error;

    return NextResponse.json({ message: "Category deleted" }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
