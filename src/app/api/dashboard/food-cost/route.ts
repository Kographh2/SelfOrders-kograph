import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  const storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId || "";
  if (!isOwnerOrAdmin(user) || !storeId || !hasStoreAccess(user, storeId)) return NextResponse.json({ error: "Akses cabang ditolak" }, { status: 403 });

  const [{ data: menus, error: menuError }, { data: ingredients, error: ingredientError }] = await Promise.all([
    supabaseAdmin.from("menu_items").select("id,name,price,is_available,menu_item_recipes(quantity_per_item,ingredient:ingredients(id,name,unit,unit_cost))").eq("store_id", storeId).order("name"),
    supabaseAdmin.from("ingredients").select("id,name,unit,stock_quantity,unit_cost").eq("store_id", storeId).eq("is_active", true).order("name"),
  ]);
  if (menuError || ingredientError) return NextResponse.json({ error: menuError?.message || ingredientError?.message }, { status: 500 });
  const rows = (menus || []).map((menu: any) => {
    const recipe = (menu.menu_item_recipes || []).map((line: any) => ({
      ingredient: line.ingredient?.name || "Bahan",
      quantity: Number(line.quantity_per_item),
      unit: line.ingredient?.unit || "",
      unitCost: Number(line.ingredient?.unit_cost || 0),
    }));
    const cost = recipe.reduce((sum: number, line: any) => sum + line.quantity * line.unitCost, 0);
    const price = Number(menu.price || 0);
    return { id: menu.id, name: menu.name, price, cost, margin: price - cost, foodCostPercent: price > 0 ? cost / price * 100 : null, recipe, is_available: menu.is_available };
  });
  return NextResponse.json({ data: { menus: rows, ingredients: ingredients || [] } });
}
