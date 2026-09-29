import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin, hasStoreAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);

    // Public: only show basic active store info (for menu page)
    if (!user) {
      const { data, error } = await supabaseAdmin
        .from("stores")
        .select("id, name, slug, address, logo, is_active")
        .eq("is_active", true);
      if (error) throw error;
      return NextResponse.json({ data: data ?? [] }, { status: 200 });
    }

    // Owner sees all stores
    if (user.role === "owner") {
      const { data, error } = await supabaseAdmin.from("stores").select("*").order("created_at");
      if (error) throw error;
      return NextResponse.json({ data: data ?? [] }, { status: 200 });
    }

    // Admin/kasir see their assigned store
    if (user.storeId) {
      const { data, error } = await supabaseAdmin
        .from("stores")
        .select("*")
        .eq("id", user.storeId);
      if (error) throw error;
      return NextResponse.json({ data: data ?? [] }, { status: 200 });
    }

    return NextResponse.json({ data: [] }, { status: 200 });
  } catch (error: unknown) {
    console.error("Stores GET error:", error);
    return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (user?.role !== "owner") {
      return NextResponse.json({ error: "Only owners can create stores" }, { status: 403 });
    }

    const body = await request.json();
    const { name, slug, address, phone, email, logo, timezone, currency, taxRate, serviceChargeRate } = body;

    if (!name?.trim() || !address?.trim() || !phone?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: "name, address, phone, and email are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("stores")
      .insert({
        name: name.trim(),
        slug: slug?.trim().toLowerCase() ?? null,
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        logo: logo ?? null,
        timezone: timezone ?? "Asia/Jakarta",
        currency: currency ?? "IDR",
        tax_rate: taxRate ?? 0.11,
        service_charge_rate: serviceChargeRate ?? 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    // Init order sequence for new store
    await supabaseAdmin
      .from("order_sequences")
      .insert({ store_id: data.id, last_number: 0 });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create store";
    console.error("Store POST error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
