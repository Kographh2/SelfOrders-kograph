import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isStaff, hasStoreAccess } from "@/lib/auth";
import { getStoreOperatingStatus } from "@/lib/store-hours";
import { isMenuScheduledNow } from "@/lib/menu-schedule";
import { createHash } from "crypto";

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
      loyaltyRedemptionCode,
      policyAccepted,
      orderType = "dine_in",
      pickupAt,
      reservationToken,
    } = body;
    const customerAuth = await getAuthUser(request);
    let claimedPromo: any = null;
    let claimedLoyalty: any = null;
    if (loyaltyRedemptionCode) {
      if (!customerAuth || customerAuth.role !== "user") return NextResponse.json({ error: "Login diperlukan untuk memakai reward poin" }, { status: 401 });
      if (promoClaimId) return NextResponse.json({ error: "Gunakan satu promo atau reward poin dalam satu pesanan" }, { status: 400 });
      const code = String(loyaltyRedemptionCode).trim().toUpperCase();
      const { data: redemption } = await supabaseAdmin.from("loyalty_redemptions")
        .select("id,user_id,status,expires_at,reward:loyalty_rewards(id,store_id,min_purchase,discount_amount,name)")
        .eq("code", code).eq("user_id", customerAuth.userId).eq("status", "available").gt("expires_at", new Date().toISOString()).maybeSingle();
      const reward = Array.isArray(redemption?.reward) ? redemption.reward[0] : redemption?.reward;
      if (!redemption || !reward || reward.store_id !== storeId) return NextResponse.json({ error: "Kode reward tidak valid, kedaluwarsa, atau bukan untuk cabang ini" }, { status: 400 });
      claimedLoyalty = { redemption, reward };
    }
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
    const { data: orderStore } = await supabaseAdmin.from("stores")
      .select("id,is_active,manual_closed,opening_hours,timezone")
      .eq("id", storeId).maybeSingle();
    if (!orderStore) return NextResponse.json({ error: "Toko tidak ditemukan" }, { status: 404 });
    const orderDate = orderType === "pickup" && pickupAt ? new Date(pickupAt) : new Date();
    const operatingStatus = getStoreOperatingStatus(orderStore, orderDate);
    if (!operatingStatus.is_open) {
      const nextOpen = operatingStatus.next_open_label ? ` Buka kembali ${operatingStatus.next_open_label}.` : "";
      return NextResponse.json({ error: `Toko sedang tutup.${nextOpen}` }, { status: 409 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Order harus memiliki minimal 1 item" }, { status: 400 });
    }
    if (!['dine_in', 'pickup'].includes(orderType)) return NextResponse.json({ error: "Jenis pesanan tidak valid" }, { status: 400 });
    if (orderType === "pickup") {
      if (!pickupAt || Number.isNaN(orderDate.getTime()) || orderDate.getTime() < Date.now() + 10 * 60_000 || orderDate.getTime() > Date.now() + 30 * 86400_000) {
        return NextResponse.json({ error: "Waktu pickup harus minimal 10 menit dan maksimal 30 hari dari sekarang" }, { status: 400 });
      }
    }
    if (orderType === "dine_in" && !tableId && !tableNumber) {
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

    if (orderType === "dine_in" && (tableId || tableNumber)) {
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

    if (orderType === "dine_in" && !resolvedTableId) {
      return NextResponse.json({ error: "QR meja tidak valid. Silakan scan ulang QR di meja." }, { status: 400 });
    }

    if (resolvedTableId) {
      const start=new Date(orderDate.getTime()-90*60000).toISOString(),end=new Date(orderDate.getTime()+90*60000).toISOString();
      const {data:reserved}=await supabaseAdmin.from("reservations").select("id,reserved_for,deposit_status,private_token_hash,status").eq("table_id",resolvedTableId).in("status",["confirmed","arrived","seated"]).gte("reserved_for",start).lte("reserved_for",end).limit(1).maybeSingle();
      if(reserved){const privateAllowed=Boolean(reservationToken&&["paid","not_required"].includes(reserved.deposit_status)&&createHash("sha256").update(String(reservationToken)).digest("hex")===reserved.private_token_hash&&Math.abs(new Date(reserved.reserved_for).getTime()-orderDate.getTime())<=120*60000);if(!privateAllowed)return NextResponse.json({error:`Meja ini sedang disiapkan untuk reservasi pada ${new Date(reserved.reserved_for).toLocaleString("id-ID")}. Silakan scan meja kosong lain.`},{status:409});}
    }

    const menuIds = [...new Set(items.map((item: { menu_item_id: string }) => item.menu_item_id))];
    const { data: menuRows, error: menuError } = await supabaseAdmin.from("menu_items")
      .select("id,name,is_available,show_on_menu,available_from,available_until,available_days,prep_minutes")
      .eq("store_id", storeId).in("id", menuIds);
    if (menuError) throw menuError;
    const menuById = new Map((menuRows ?? []).map(row => [row.id, row]));
    for (const id of menuIds) {
      const menu = menuById.get(id);
      if (!menu || !menu.is_available || !menu.show_on_menu || !isMenuScheduledNow(menu, orderStore.timezone || "Asia/Jakarta", orderDate)) {
        return NextResponse.json({ error: "Ada menu yang tidak tersedia pada waktu pesanan diproses" }, { status: 409 });
      }
    }

    const [branchPolicies, globalPolicies] = await Promise.all([
      supabaseAdmin.from("store_documents").select("id,document_type,version").eq("store_id", storeId).eq("status", "published").in("document_type", ["privacy", "terms"]),
      supabaseAdmin.from("store_documents").select("id,document_type,version").is("store_id", null).eq("status", "published").in("document_type", ["privacy", "terms"]),
    ]);
    if (branchPolicies.error || globalPolicies.error) throw branchPolicies.error || globalPolicies.error;
    const requiredPolicies = ["privacy", "terms"].flatMap(type => {
      const branch = (branchPolicies.data || []).find(policy => policy.document_type === type);
      const global = (globalPolicies.data || []).find(policy => policy.document_type === type);
      return [branch || global].filter(Boolean);
    });
    if (requiredPolicies.length && policyAccepted !== true) return NextResponse.json({ error: "Setujui Kebijakan Privasi dan Syarat Penggunaan sebelum memesan" }, { status: 412 });

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

    if (requiredPolicies.length) {
      const sessionHash = !customerAuth?.userId && anonymousSessionId
        ? createHash("sha256").update(String(anonymousSessionId)).digest("hex") : null;
      const { error: acceptanceError } = await supabaseAdmin.from("policy_acceptances").insert(requiredPolicies.map(policy => ({
        order_id: result.order_id,
        user_id: customerAuth?.userId || null,
        anonymous_session_hash: sessionHash,
        store_id: storeId,
        document_id: policy!.id,
        document_version: policy!.version,
      })));
      if (acceptanceError) {
        await supabaseAdmin.from("orders").delete().eq("id", result.order_id);
        return NextResponse.json({ error: "Persetujuan kebijakan belum dapat dicatat; pesanan tidak dibuat" }, { status: 500 });
      }
    }

    const prepMinutes = Math.max(5, Math.min(240, items.reduce((sum: number, item: { menu_item_id: string; quantity: number }) => sum + (Number(menuById.get(item.menu_item_id)?.prep_minutes) || 5) * item.quantity, 0)));
    const estimatedReadyAt = orderType === "pickup" ? orderDate.toISOString() : new Date(Date.now() + prepMinutes * 60_000).toISOString();
    await supabaseAdmin.from("orders").update({ order_type: orderType, pickup_at: orderType === "pickup" ? orderDate.toISOString() : null, estimated_ready_at: estimatedReadyAt }).eq("id", result.order_id);
    result.order_type = orderType;
    result.pickup_at = orderType === "pickup" ? orderDate.toISOString() : null;
    result.estimated_ready_at = estimatedReadyAt;

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

    if (claimedLoyalty) {
      const orderId = result.order_id as string;
      if (Number(result.subtotal) < Number(claimedLoyalty.reward.min_purchase || 0)) {
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        return NextResponse.json({ error: "Pesanan belum memenuhi minimum pembelian reward" }, { status: 400 });
      }
      const payableTotal = Math.max(0, Number(result.total_amount));
      const discount = Math.max(0, Math.min(Math.round(Number(claimedLoyalty.reward.discount_amount)), Math.max(0, payableTotal - 1)));
      const finalTotal = Number(result.total_amount) - discount;
      const { data: usedRedemption } = await supabaseAdmin.from("loyalty_redemptions")
        .update({ status: "reserved", used_order_id: orderId })
        .eq("id", claimedLoyalty.redemption.id).eq("status", "available").gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
      if (!usedRedemption) {
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        return NextResponse.json({ error: "Kode reward baru saja dipakai pada pesanan lain" }, { status: 409 });
      }
      await Promise.all([
        supabaseAdmin.from("orders").update({ loyalty_discount: discount, total_amount: finalTotal }).eq("id", orderId),
        supabaseAdmin.from("payments").update({ amount: finalTotal }).eq("order_id", orderId),
      ]);
      result.loyalty_discount = discount;
      result.total_amount = finalTotal;
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Gagal membuat pesanan";
    console.error("Orders POST error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
