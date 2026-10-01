import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin, isStaff } from "@/lib/auth";
import {writeAudit} from "@/lib/audit";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request), storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId;
  if (!isStaff(user) || !storeId || !hasStoreAccess(user, storeId)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { data, error } = await supabaseAdmin.from("ingredients").select("*,menu_item_recipes(id,menu_item_id,quantity_per_item,menu_item:menu_items(id,name))").eq("store_id", storeId).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const {data:menuItems}=await supabaseAdmin.from("menu_items").select("id,name").eq("store_id",storeId).order("name");
  return NextResponse.json({ data: data || [],menuItems:menuItems||[] });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request), body = await request.json();
  const storeId = String(body.storeId || user?.storeId || "");
  if (!isOwnerOrAdmin(user) || !storeId || !hasStoreAccess(user, storeId)) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  const name = String(body.name || "").trim(), unit = String(body.unit || "").trim();
  if (!name || !unit || !Number.isFinite(Number(body.stock_quantity)) || Number(body.stock_quantity) < 0) return NextResponse.json({ error: "Nama, satuan, dan stok valid wajib diisi" }, { status: 400 });
  let recipeMenuId: string | undefined;
  if (body.menu_item_id) {
    const quantity = Number(body.quantity_per_item);
    const { data: menu } = await supabaseAdmin.from("menu_items").select("id").eq("id", body.menu_item_id).eq("store_id", storeId).maybeSingle();
    if (!menu || !Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "Resep menu tidak valid" }, { status: 400 });
    recipeMenuId = menu.id;
  }
  const id = body.id ? String(body.id) : undefined;
  const { data: before } = id ? await supabaseAdmin.from("ingredients").select("*").eq("id", id).eq("store_id", storeId).maybeSingle() : { data: null };
  const { data, error } = await supabaseAdmin.from("ingredients").upsert({ ...(id ? { id } : {}), store_id: storeId, name, unit, stock_quantity: Number(body.stock_quantity), low_stock_threshold: Math.max(0, Number(body.low_stock_threshold) || 0), unit_cost: Math.max(0, Number(body.unit_cost) || 0), updated_at: new Date().toISOString() }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (id && before && Number(before.stock_quantity) !== Number(data.stock_quantity)) await supabaseAdmin.from("ingredient_movements").insert({ ingredient_id: id, actor_id: user!.userId, movement_type: Number(data.stock_quantity) > Number(before.stock_quantity) ? "restock" : "adjustment", quantity_delta: Number(data.stock_quantity) - Number(before.stock_quantity), notes: String(body.notes || "Penyesuaian stok") });
  await writeAudit(user!,storeId,id?"ingredient.update":"ingredient.create","ingredient",data.id,before,data);
  if (recipeMenuId) {
    const { error: recipeError } = await supabaseAdmin.from("menu_item_recipes").upsert({ menu_item_id: recipeMenuId, ingredient_id: data.id, quantity_per_item: Number(body.quantity_per_item) }, { onConflict: "menu_item_id,ingredient_id" });
    if (recipeError) return NextResponse.json({ error: recipeError.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}
