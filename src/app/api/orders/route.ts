import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isStaff, hasStoreAccess } from "@/lib/auth";
import { getStoreOperatingStatus } from "@/lib/store-hours";
import { isMenuScheduledNow } from "@/lib/menu-schedule";
import { guestSession } from "@/lib/guest-session";
import { boundedJson, requestBudget, sameOrigin } from "@/lib/request-security";
import { CUSTOMER_ORDER_FIELDS } from "@/lib/public-fields";
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
    const page=Math.max(1,Math.min(10000,Number(searchParams.get("page"))||1));
    const limit=Math.max(1,Math.min(100,Number(searchParams.get("limit"))||50));
    if(!Number.isInteger(page)||!Number.isInteger(limit))return NextResponse.json({error:"Pagination tidak valid"},{status:400});

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
      .select(CUSTOMER_ORDER_FIELDS,{count:"exact"})
      .order("created_at", { ascending: false });

    if (effectiveStoreId) query = query.eq("store_id", effectiveStoreId);
    if (status) query = query.eq("status", status);
    if(searchParams.get("active")==="1")query=query.in("status",["pending","confirmed","preparing","ready"]);
    if (paymentStatus) query = query.eq("payment_status", paymentStatus);

    const { data, error, count } = await query.range((page-1)*limit,page*limit-1);
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], pagination:{page,limit,total:count || 0,hasMore:page*limit<(count || 0)} }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch orders";
    console.error("Orders GET error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: "Origin ditolak" }, { status: 403 });
    const ipBudget=await requestBudget(request,"checkout-source",60,60);if(ipBudget)return ipBudget;
    const body = await boundedJson(request);

    const {
      storeId,
      tableId,      // bisa berupa UUID atau nomor meja (string/number)
      tableNumber,  // fallback: nomor meja eksplisit
      requestId,
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
    const anonymousSessionId = guestSession(request);
    if (!customerAuth && !anonymousSessionId) return NextResponse.json({error:"Sesi pemesanan tidak valid. Muat ulang halaman."},{status:401});
    if (!UUID_REGEX.test(String(requestId))) return NextResponse.json({error:"ID checkout tidak valid"},{status:400});
    const limited = await requestBudget(request,"checkout",10,60,customerAuth?.userId || anonymousSessionId!);
    if(limited)return limited;
    if ((promoClaimId || loyaltyRedemptionCode) && (!customerAuth || customerAuth.role !== "user")) return NextResponse.json({error:"Login pelanggan diperlukan untuk diskon"},{status:401});
    if(promoClaimId && loyaltyRedemptionCode)return NextResponse.json({error:"Pilih satu promo atau reward"},{status:400});

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
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
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
      if (!item.menu_item_id || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
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

    const prepMinutes = Math.max(5, Math.min(240, items.reduce((sum: number, item: { menu_item_id: string; quantity: number }) => sum + (Number(menuById.get(item.menu_item_id)?.prep_minutes) || 5) * item.quantity, 0)));
    const input = {
      store_id:storeId,table_id:resolvedTableId,user_id:customerAuth?.userId || null,guest:anonymousSessionId,
      name:String(customerName || "").slice(0,120),phone:String(customerPhone || "").slice(0,30),
      email:String(customerEmail || "").slice(0,254),notes:notes || null,items,
      promo_claim_id:promoClaimId || null,loyalty_code:loyaltyRedemptionCode ? String(loyaltyRedemptionCode).trim().toUpperCase() : null,
      policy_accepted:policyAccepted === true,order_type:orderType,pickup_at:orderType==="pickup" ? orderDate.toISOString() : null,
    };
    const {data:result,error:rpcError} = await supabaseAdmin.rpc("checkout_order",{
      p_request:requestId,p_identity:customerAuth?.userId || anonymousSessionId!,
      p_hash:createHash("sha256").update(JSON.stringify(input)).digest("hex"),
      p_data:{...input,ready_at:orderType==="pickup" ? orderDate.toISOString() : new Date(Date.now()+prepMinutes*60_000).toISOString()},
    });
    if(rpcError)return NextResponse.json({error:rpcError.message || "Pesanan belum dapat dibuat"},{status:409});

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Gagal membuat pesanan";
    console.error("Orders POST error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
