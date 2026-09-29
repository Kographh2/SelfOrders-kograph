import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isStaff, hasStoreAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

// UUID v4 regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get("storeId");
    const status = searchParams.get("status");
    const paymentStatus = searchParams.get("paymentStatus");

    if (!isStaff(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const effectiveStoreId = storeId || user?.storeId;
    if (user?.role !== "owner" && !effectiveStoreId) {
      return NextResponse.json({ error: "Store ID required" }, { status: 400 });
    }
    if (user?.role !== "owner" && effectiveStoreId && !hasStoreAccess(user, effectiveStoreId)) {
      return NextResponse.json({ error: "Access denied for this store" }, { status: 403 });
    }

    let query = supabaseAdmin
      .from("orders")
      .select("*, table:tables(id,number,store_id), order_items(*, menu_item:menu_items(id,name,price)), payments(*)")
      .order("created_at", { ascending: false });

    if (effectiveStoreId) query = query.eq("store_id", effectiveStoreId);
    if (status) query = query.eq("status", status);
    if (paymentStatus) query = query.eq("payment_status", paymentStatus);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch orders";
    console.error("Orders GET error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      storeId,
      tableId,      // bisa berupa UUID atau nomor meja (string/number)
      tableNumber,  // fallback: nomor meja eksplisit
      userId,
      anonymousSessionId,
      customerName,
      customerPhone,
      customerEmail,
      notes,
      items,
    } = body;

    if (!storeId) {
      return NextResponse.json({ error: "storeId is required" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Order harus memiliki minimal 1 item" }, { status: 400 });
    }

    for (const item of items) {
      if (!item.menu_item_id || typeof item.quantity !== "number" || item.quantity < 1) {
        return NextResponse.json(
          { error: "Setiap item harus punya menu_item_id dan quantity >= 1" },
          { status: 400 }
        );
      }
      if (item.notes && item.notes.length > 200) {
        return NextResponse.json({ error: "Catatan item terlalu panjang (maks 200 karakter)" }, { status: 400 });
      }
    }

    if (notes && notes.length > 500) {
      return NextResponse.json({ error: "Catatan pesanan terlalu panjang (maks 500 karakter)" }, { status: 400 });
    }

    // ── Resolve tableId: bisa UUID atau nomor meja ─────────────────
    let resolvedTableId: string | null = null;

    if (tableId || tableNumber) {
      const raw = tableId ?? tableNumber;

      if (raw && UUID_REGEX.test(String(raw))) {
        // Sudah berupa UUID — pakai langsung
        resolvedTableId = String(raw);
      } else if (raw !== null && raw !== undefined && raw !== "") {
        // Berupa nomor meja — lookup UUID dari database
        const tableNum = parseInt(String(raw), 10);
        if (!isNaN(tableNum)) {
          const { data: tableRow, error: tableErr } = await supabaseAdmin
            .from("tables")
            .select("id")
            .eq("store_id", storeId)
            .eq("number", tableNum)
            .eq("is_active", true)
            .single();

          if (tableErr || !tableRow) {
            console.warn(`[orders] Table number ${tableNum} not found in store ${storeId}`);
            // Tetap lanjut tanpa table_id daripada gagal total
            resolvedTableId = null;
          } else {
            resolvedTableId = tableRow.id;
          }
        }
      }
    }

    // ── Buat order via atomic DB function ─────────────────────────
    const { data: result, error: rpcError } = await supabaseAdmin.rpc("create_order_atomic", {
      p_store_id:            storeId,
      p_table_id:            resolvedTableId,
      p_user_id:             userId ?? null,
      p_anonymous_session_id: anonymousSessionId ?? null,
      p_customer_name:       customerName ?? null,
      p_customer_phone:      customerPhone ?? null,
      p_customer_email:      customerEmail ?? null,
      p_notes:               notes ?? null,
      p_items:               items,
    });

    if (rpcError) {
      console.error("create_order_atomic error:", rpcError);
      return NextResponse.json(
        { error: rpcError.message || "Gagal membuat pesanan" },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Gagal membuat pesanan";
    console.error("Orders POST error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
