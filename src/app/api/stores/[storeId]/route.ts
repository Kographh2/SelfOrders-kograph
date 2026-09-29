import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin } from "@/lib/auth";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
    const { storeId } = await params;
  try {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, slug, address, phone, email, logo, timezone, currency, tax_rate, service_charge_rate, is_active")
      .eq("id", storeId)
      .single();

    if (error || !data) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch store" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
    const { storeId } = await params;
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user) || !hasStoreAccess(user, storeId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { name, slug, address, phone, email, logo, timezone, currency, taxRate, serviceChargeRate, isActive } = body;

    const { data, error } = await supabaseAdmin
      .from("stores")
      .update({
        ...(name !== undefined && { name: name.trim() }),
        ...(slug !== undefined && { slug: slug?.trim().toLowerCase() ?? null }),
        ...(address !== undefined && { address: address.trim() }),
        ...(phone !== undefined && { phone: phone.trim() }),
        ...(email !== undefined && { email: email.trim() }),
        ...(logo !== undefined && { logo }),
        ...(timezone !== undefined && { timezone }),
        ...(currency !== undefined && { currency }),
        ...(taxRate !== undefined && { tax_rate: taxRate }),
        ...(serviceChargeRate !== undefined && { service_charge_rate: serviceChargeRate }),
        ...(isActive !== undefined && { is_active: isActive }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", storeId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to update store" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
    const { storeId } = await params;
  try {
    const user = await getAuthUser(request);
    if (user?.role !== "owner") {
      return NextResponse.json({ error: "Only owners can delete stores" }, { status: 403 });
    }

    // Soft delete — deactivate instead of destroy
    const { error } = await supabaseAdmin
      .from("stores")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", storeId);

    if (error) throw error;

    return NextResponse.json({ message: "Store deactivated" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to delete store" }, { status: 500 });
  }
}
