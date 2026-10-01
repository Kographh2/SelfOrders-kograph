import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, isOwnerOrAdmin, hasStoreAccess } from "@/lib/auth";
import { normalizeOptionGroups } from "@/lib/menu-options";
import { normalizeMenuDays, normalizeMenuSchedule, normalizeMenuTags, normalizeMenuTranslations } from "@/lib/menu-metadata";
import {writeAudit} from "@/lib/audit";

type Params = { params: Promise<{ itemId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
    const { itemId } = await params;
  try {
    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (error || !data) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch item" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
    const { itemId } = await params;
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from("menu_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (!hasStoreAccess(user, existing.store_id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, price, image, isAvailable, isFeatured, displayOrder, categoryId, optionGroups, trackStock, stockQuantity, showOnMenu, translations, allergens, dietaryTags, availableFrom, availableUntil, availableDays, prepMinutes, isBundle } = body;

    if (price !== undefined && (typeof price !== "number" || price < 0)) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }
    const schedule = normalizeMenuSchedule(availableFrom, availableUntil);
    const prep = prepMinutes === undefined ? undefined : Math.floor(Number(prepMinutes));
    if (prep !== undefined && (!Number.isFinite(prep) || prep < 1 || prep > 240)) return NextResponse.json({ error: "Waktu persiapan harus 1-240 menit" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .update({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() ?? null }),
        ...(price !== undefined && { price }),
        ...(image !== undefined && { image }),
        ...(isAvailable !== undefined && { is_available: isAvailable }),
        ...(isFeatured !== undefined && { is_featured: isFeatured }),
        ...(displayOrder !== undefined && { display_order: displayOrder }),
        ...(categoryId !== undefined && { category_id: categoryId }),
        ...(optionGroups !== undefined && { option_groups: normalizeOptionGroups(optionGroups) }),
        ...(trackStock !== undefined && { track_stock: Boolean(trackStock) }),
        ...(stockQuantity !== undefined && { stock_quantity: trackStock === false ? null : Math.max(0, Math.floor(Number(stockQuantity))) }),
        ...(showOnMenu !== undefined && { show_on_menu: Boolean(showOnMenu) }),
        ...(translations !== undefined && { translations: normalizeMenuTranslations(translations) }),
        ...(allergens !== undefined && { allergens: normalizeMenuTags(allergens) }),
        ...(dietaryTags !== undefined && { dietary_tags: normalizeMenuTags(dietaryTags) }),
        ...(availableFrom !== undefined && { available_from: schedule.from }),
        ...(availableUntil !== undefined && { available_until: schedule.until }),
        ...(availableDays !== undefined && { available_days: normalizeMenuDays(availableDays) }),
        ...(prep !== undefined && { prep_minutes: prep }),
        ...(isBundle !== undefined && { is_bundle: Boolean(isBundle) }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .select()
      .single();

    if (error) throw error;
    await writeAudit(user!,existing.store_id,price!==undefined||stockQuantity!==undefined?"menu.sensitive_update":"menu.update","menu_item",itemId,existing,data);

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update item";
    const validationError = /maksimal|belum lengkap|tidak valid|atur jam|waktu persiapan|hari tampil/i.test(message);
    return NextResponse.json({ error: message }, { status: validationError ? 400 : 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
    const { itemId } = await params;
  try {
    const user = await getAuthUser(request);
    if (!isOwnerOrAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from("menu_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (!hasStoreAccess(user, existing.store_id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("menu_items")
      .delete()
      .eq("id", itemId);

    if (error) throw error;
    await writeAudit(user!,existing.store_id,"menu.delete","menu_item",itemId,existing,null);

    return NextResponse.json({ message: "Item deleted" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
