import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin, hasStoreAccess } from "@/lib/auth";

type Params = { params: Promise<{ tableId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
    const { tableId } = await params;
  try {
    const { data, error } = await supabaseAdmin
      .from("tables")
      .select("*")
      .eq("id", tableId)
      .single();

    if (error || !data) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch table" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
    const { tableId } = await params;
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from("tables")
      .select("store_id")
      .eq("id", tableId)
      .single();

    if (!existing) return NextResponse.json({ error: "Table not found" }, { status: 404 });
    if (!hasStoreAccess(user, existing.store_id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { number, isActive, qrCode } = body;

    const { data, error } = await supabaseAdmin
      .from("tables")
      .update({
        ...(number !== undefined && { number }),
        ...(isActive !== undefined && { is_active: isActive }),
        ...(qrCode !== undefined && { qr_code: qrCode }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tableId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to update table" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
    const { tableId } = await params;
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from("tables")
      .select("store_id")
      .eq("id", tableId)
      .single();

    if (!existing) return NextResponse.json({ error: "Table not found" }, { status: 404 });
    if (!hasStoreAccess(user, existing.store_id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("tables")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", tableId);

    if (error) throw error;

    return NextResponse.json({ message: "Table deactivated" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to delete table" }, { status: 500 });
  }
}
