import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin, hasStoreAccess } from "@/lib/auth";

type Params = { params: Promise<{ tableId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
    const { tableId } = await params;
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: table } = await supabaseAdmin
      .from("tables")
      .select("id, store_id, number, qr_code")
      .eq("id", tableId)
      .single();

    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
    if (!hasStoreAccess(user, table.store_id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const qrUrl = `${appUrl}/menu?store=${table.store_id}&table=${table.number}`;

    return NextResponse.json({
      data: {
        tableId: table.id,
        tableNumber: table.number,
        qrUrl,
        currentQrCode: table.qr_code,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Failed to get QR" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
    const { tableId } = await params;
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: table } = await supabaseAdmin
      .from("tables")
      .select("id, store_id, number")
      .eq("id", tableId)
      .single();

    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
    if (!hasStoreAccess(user, table.store_id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const qrUrl = `${appUrl}/menu?store=${table.store_id}&table=${table.number}`;

    const { data: body } = await request.json().then((b) => ({ data: b })).catch(() => ({ data: {} }));
    const qrCode = body?.qrCode ?? qrUrl;

    await supabaseAdmin
      .from("tables")
      .update({ qr_code: qrCode, updated_at: new Date().toISOString() })
      .eq("id", tableId);

    return NextResponse.json({ data: { qrUrl, qrCode } }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Failed to generate QR" }, { status: 500 });
  }
}
