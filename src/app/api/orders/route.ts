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
      promoClaimId,
    } = body;
    const customerAuth = await getAuthUser(request);
    let claimedPromo: any = null;
    if (promoClaimId) {
      if (!customerAuth || customerAuth.role !== "user") return NextResponse.json({ error: "Login diperlukan untuk memakai promo" }, { status: 401 });
      const { data: claim } = await supabaseAdmin.from("promo_claims").select("id,user_id,used_order_id,promo:promos(*)").eq("id", promoClaimId).eq("user_id", customerAuth.userId).single();
      const promo = Array.isArray(claim?.promo) ? claim?.promo[0] : claim?.promo;
      const now = Date.now();
      if (!claim || !promo || claim.used_order_id || !promo.is_active || promo.store_id !== storeId || new Date(promo.starts_at).getTime() > now || (promo.ends_at && new Date(promo.ends_at).getTime() < now)) {
        return NextResponse.json({ error: "Promo tidak valid, kedaluwarsa, atau sudah digunakan" }, { status: 400 });
      }
      claimedPromo = { claim, promo };
    }

    if (!storeId) {
      return NextResponse.json({ error: "storeId is required" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Order harus memiliki minimal 1 item" }, { status: 400 });
    }
    if (!tableId && !tableNumber) {
      return NextResponse.json({ error: "Scan QR meja yang valid sebelum membuat pesanan" }, { status: 400 });
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
            return NextResponse.json({ error: `Meja ${tableNum} tidak aktif atau tidak terdaftar di toko ini` }, { status: 400 });
          } else {
            resolvedTableId = tableRow.id;
          }
        }
      }
    }

    if (!resolvedTableId) {
      return NextResponse.json({ error: "QR meja tidak valid. Silakan scan ulang QR di meja." }, { status: 400 });
    }

    // ── Buat order via atomic DB function ─────────────────────────
    const { data: result, error: rpcError } = await supabaseAdmin.rpc("create_order_atomic", {
      p_store_id:            storeId,
      p_table_id:            resolvedTableId,
      p_user_id:             customerAuth?.userId ?? null,
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

    if (claimedPromo) {
      const orderId = result.order_id as string;
      const { data: orderItems } = await supabaseAdmin.from("order_items").select("menu_item_id,subtotal").eq("order_id", orderId);
      let eligibleSubtotal = Number(result.subtotal);
      if (claimedPromo.promo.applies_to === "products") {
        const { data: targets } = await supabaseAdmin.from("promo_products").select("menu_item_id").eq("promo_id", claimedPromo.promo.id);
        const allowed = new Set((targets || []).map(row => row.menu_item_id));
        eligibleSubtotal = (orderItems || []).filter(row => allowed.has(row.menu_item_id)).reduce((sum, row) => sum + Number(row.subtotal), 0);
      }
      if (Number(result.subtotal) < Number(claimedPromo.promo.min_purchase || 0) || eligibleSubtotal <= 0) {
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        return NextResponse.json({ error: "Pesanan belum memenuhi syarat promo" }, { status: 400 });
      }
      let discount = claimedPromo.promo.discount_type === "percent" ? eligibleSubtotal * Number(claimedPromo.promo.discount_value) / 100 : Number(claimedPromo.promo.discount_value);
      if (claimedPromo.promo.max_discount) discount = Math.min(discount, Number(claimedPromo.promo.max_discount));
      discount = Math.max(0, Math.min(Math.round(discount), Number(result.total_amount)));
      const finalTotal = Number(result.total_amount) - discount;
      const { data: usedClaim } = await supabaseAdmin.from("promo_claims").update({ used_order_id: orderId, used_at: new Date().toISOString() }).eq("id", promoClaimId).is("used_order_id", null).select("id").maybeSingle();
      if (!usedClaim) { await supabaseAdmin.from("orders").delete().eq("id", orderId); return NextResponse.json({ error: "Promo baru saja digunakan di pesanan lain" }, { status: 409 }); }
      await Promise.all([
        supabaseAdmin.from("orders").update({ promo_id: claimedPromo.promo.id, promo_claim_id: promoClaimId, promo_discount: discount, total_amount: finalTotal }).eq("id", orderId),
        supabaseAdmin.from("payments").update({ amount: finalTotal }).eq("order_id", orderId),
      ]);
      result.promo_discount = discount;
      result.total_amount = finalTotal;
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Gagal membuat pesanan";
    console.error("Orders POST error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
