import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin, hasStoreAccess, isStaff } from "@/lib/auth";
import { normalizeOptionGroups } from "@/lib/menu-options";
import { normalizeMenuDays, normalizeMenuSchedule, normalizeMenuTags, normalizeMenuTranslations } from "@/lib/menu-metadata";
import {writeAudit} from "@/lib/audit";
import { isMenuScheduledNow } from "@/lib/menu-schedule";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get("storeId");
    const categoryId = searchParams.get("categoryId");
    const featured = searchParams.get("featured");
    const managementView = searchParams.get("management") === "true" && isStaff(user);
    let timezone = "Asia/Jakarta";
    if (storeId && !managementView) {
      const { data: store } = await supabaseAdmin.from("stores").select("timezone").eq("id", storeId).maybeSingle();
      timezone = store?.timezone || timezone;
    }

    let query = supabaseAdmin
      .from("menu_items")
      .select("*")
      .order("display_order", { ascending: true });

    if (storeId) query = query.eq("store_id", storeId);
    if (categoryId) query = query.eq("category_id", categoryId);
    if (featured === "true") query = query.eq("is_featured", true);
    // Customer menu hides unavailable/hidden items and items whose tracked
    // stock has run out. Staff still see them in the branch menu manager.
    if (!managementView) {
      query = query.eq("is_available", true).eq("show_on_menu", true)
        .or("track_stock.eq.false,stock_quantity.gt.0");
    }

    const { data, error } = await query;
    if (error) throw error;

    await writeAudit(user!,storeId,"menu.create","menu_item",data.id,null,data);
    const visible = managementView ? data ?? [] : (data ?? []).filter(item => isMenuScheduledNow(item, timezone));
    return NextResponse.json({ data: visible }, { status: 200 });
  } catch (error: unknown) {
    console.error("Menu items GET error:", error);
    return NextResponse.json({ error: "Failed to fetch menu items" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { storeId, categoryId, name, description, price, image, isAvailable, isFeatured, displayOrder, optionGroups, trackStock, stockQuantity, showOnMenu, translations, allergens, dietaryTags, availableFrom, availableUntil, availableDays, prepMinutes, isBundle } = body;

    if (!storeId || !categoryId || !name?.trim()) {
      return NextResponse.json({ error: "storeId, categoryId and name are required" }, { status: 400 });
    }

    if (typeof price !== "number" || price < 0) {
      return NextResponse.json({ error: "Valid price is required" }, { status: 400 });
    }

    if (!hasStoreAccess(user, storeId)) {
      return NextResponse.json({ error: "Access denied for this store" }, { status: 403 });
    }

    // Verify category belongs to same store (prevent cross-store injection)
    const { data: cat } = await supabaseAdmin
      .from("categories")
      .select("store_id")
      .eq("id", categoryId)
      .single();

    if (!cat || cat.store_id !== storeId) {
      return NextResponse.json({ error: "Category does not belong to this store" }, { status: 400 });
    }

    const schedule = normalizeMenuSchedule(availableFrom, availableUntil);
    const prep = Math.floor(Number(prepMinutes ?? 10));
    if (!Number.isFinite(prep) || prep < 1 || prep > 240) return NextResponse.json({ error: "Waktu persiapan harus 1-240 menit" }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .insert({
        store_id: storeId,
        category_id: categoryId,
        name: name.trim(),
        description: description?.trim() ?? null,
        price,
        image: image ?? null,
        is_available: isAvailable ?? true,
        is_featured: isFeatured ?? false,
        display_order: displayOrder ?? 0,
        option_groups: normalizeOptionGroups(optionGroups),
        track_stock: Boolean(trackStock),
        stock_quantity: trackStock ? Number(stockQuantity ?? 0) : null,
        show_on_menu: showOnMenu !== false,
        translations: normalizeMenuTranslations(translations),
        allergens: normalizeMenuTags(allergens),
        dietary_tags: normalizeMenuTags(dietaryTags),
        available_from: schedule.from,
        available_until: schedule.until,
        available_days: normalizeMenuDays(availableDays),
        prep_minutes: prep,
        is_bundle: Boolean(isBundle),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    console.error("Menu items POST error:", error);
    const message = error instanceof Error ? error.message : "Failed to create menu item";
    const validationError = /maksimal|belum lengkap|tidak valid|atur jam|waktu persiapan|hari tampil/i.test(message);
    return NextResponse.json({ error: message }, { status: validationError ? 400 : 500 });
  }
}
