import { type NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isStaff } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isStaff(user)) return NextResponse.json({ error: "Akses kasir diperlukan" }, { status: 403 });
  const storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId;
  if (!storeId || !hasStoreAccess(user, storeId)) return NextResponse.json({ error: "Cabang tidak valid" }, { status: 403 });
  const { data: shift, error } = await supabaseAdmin.from("cashier_shifts").select("*")
    .eq("store_id", storeId).eq("cashier_id", user!.userId).is("closed_at", null).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!shift) return NextResponse.json({ data: { shift: null, summary: null } });
  const { data: summary, error: summaryError } = await supabaseAdmin.rpc("cashier_shift_summary", {
    p_shift_id: shift.id, p_cashier_id: user!.userId,
  });
  if (summaryError) return NextResponse.json({ error: summaryError.message }, { status: 500 });
  return NextResponse.json({ data: { shift, summary } });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isStaff(user)) return NextResponse.json({ error: "Akses kasir diperlukan" }, { status: 403 });
  try {
    const body = await request.json();
    const action = String(body.action || "");
    if (action === "open") {
      const storeId = String(body.storeId || user?.storeId || "");
      const openingCash = Number(body.openingCash);
      if (!storeId || !hasStoreAccess(user, storeId)) return NextResponse.json({ error: "Cabang tidak valid" }, { status: 403 });
      if (!Number.isFinite(openingCash) || openingCash < 0) return NextResponse.json({ error: "Kas awal tidak valid" }, { status: 400 });
      const { data, error } = await supabaseAdmin.from("cashier_shifts").insert({
        store_id: storeId, cashier_id: user!.userId, opening_cash: Math.round(openingCash),
      }).select().single();
      if (error) return NextResponse.json({ error: error.code === "23505" ? "Shift kasir masih terbuka" : error.message }, { status: 409 });
      await writeAudit(user!, storeId, "shift.open", "cashier_shift", data.id, null, data);
      return NextResponse.json({ data }, { status: 201 });
    }
    if (action === "close") {
      const shiftId = String(body.shiftId || "");
      const closingCash = Number(body.closingCash);
      if (!shiftId || !Number.isFinite(closingCash) || closingCash < 0) return NextResponse.json({ error: "Kas akhir tidak valid" }, { status: 400 });
      const { data, error } = await supabaseAdmin.rpc("close_cashier_shift", {
        p_shift_id: shiftId, p_cashier_id: user!.userId, p_closing_cash: Math.round(closingCash),
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      await writeAudit(user!, user?.storeId || null, "shift.close", "cashier_shift", shiftId, null, { closing_cash: Math.round(closingCash), result: data });
      return NextResponse.json({ data });
    }
    return NextResponse.json({ error: "Aksi shift tidak dikenal" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Gagal memproses shift" }, { status: 500 });
  }
}
