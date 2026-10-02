import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasStoreAccess, isOwnerOrAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
const jsonError = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  const storeId = request.nextUrl.searchParams.get("storeId") || user?.storeId || "";
  if (!isOwnerOrAdmin(user) || !storeId || !hasStoreAccess(user, storeId)) return jsonError("Akses cabang ditolak", 403);
  const [suppliers, orders, ingredients] = await Promise.all([
    supabaseAdmin.from("suppliers").select("*").eq("store_id", storeId).order("name"),
    supabaseAdmin.from("purchase_orders").select("*,supplier:suppliers(name),items:purchase_order_items(*,ingredient:ingredients(id,name,unit))").eq("store_id", storeId).order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("ingredients").select("id,name,unit,stock_quantity,unit_cost").eq("store_id", storeId).eq("is_active", true).order("name"),
  ]);
  const error = suppliers.error || orders.error || ingredients.error;
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: { suppliers: suppliers.data || [], orders: orders.data || [], ingredients: ingredients.data || [] } });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!isOwnerOrAdmin(user)) return jsonError("Akses owner/admin diperlukan", 403);
  const body = await request.json().catch(() => ({}));
  const storeId = String(body.storeId || user?.storeId || "");
  if (!storeId || !hasStoreAccess(user, storeId)) return jsonError("Cabang tidak valid", 403);

  if (body.action === "supplier") {
    const name = String(body.name || "").trim().slice(0, 120);
    if (!name) return jsonError("Nama pemasok wajib diisi");
    const payload = { store_id: storeId, name, contact_name: String(body.contactName || "").trim().slice(0, 120) || null,
      phone: String(body.phone || "").trim().slice(0, 40) || null, email: String(body.email || "").trim().slice(0, 160) || null,
      address: String(body.address || "").trim().slice(0, 500) || null, notes: String(body.notes || "").trim().slice(0, 1000) || null,
      is_active: body.isActive !== false, updated_at: new Date().toISOString() };
    let data: Record<string, unknown> | null = null;
    let error: { code?: string; message: string } | null = null;
    if (body.id) {
      const { data: existing } = await supabaseAdmin.from("suppliers").select("id,store_id").eq("id", String(body.id)).maybeSingle();
      if (!existing || existing.store_id !== storeId) return jsonError("Pemasok tidak ditemukan di cabang ini", 404);
      const updated = await supabaseAdmin.from("suppliers").update(payload).eq("id", String(body.id)).eq("store_id", storeId).select().single();
      data = updated.data; error = updated.error;
    } else {
      const inserted = await supabaseAdmin.from("suppliers").insert(payload).select().single();
      data = inserted.data; error = inserted.error;
    }
    if (error) return jsonError(error.code === "23505" ? "Nama pemasok sudah digunakan di cabang ini" : error.message, 409);
    if (!data) return jsonError("Pemasok gagal disimpan", 500);
    await writeAudit(user!, storeId, body.id ? "supplier.update" : "supplier.create", "supplier", String(data.id), null, data);
    return NextResponse.json({ data }, { status: body.id ? 200 : 201 });
  }

  if (body.action === "purchase_order") {
    const supplierId = String(body.supplierId || "");
    const items = Array.isArray(body.items) ? body.items : [];
    if (!supplierId || !items.length || items.length > 100) return jsonError("Pemasok dan minimal satu bahan wajib dipilih");
    const { data: supplier } = await supabaseAdmin.from("suppliers").select("id").eq("id", supplierId).eq("store_id", storeId).eq("is_active", true).maybeSingle();
    if (!supplier) return jsonError("Pemasok tidak valid untuk cabang ini", 404);
    const normalized: Array<{ ingredient_id: string; quantity_ordered: number; unit_cost: number; expires_at: string | null }> = items.map((item: Record<string, unknown>) => ({ ingredient_id: String(item.ingredientId || ""), quantity_ordered: Number(item.quantity), unit_cost: Number(item.unitCost), expires_at: item.expiresAt ? String(item.expiresAt) : null }));
    if (normalized.some(item => !item.ingredient_id || !Number.isFinite(item.quantity_ordered) || item.quantity_ordered <= 0 || !Number.isFinite(item.unit_cost) || item.unit_cost < 0)) return jsonError("Jumlah dan harga bahan tidak valid");
    if (normalized.some(item => item.expires_at && (!/^\d{4}-\d{2}-\d{2}$/.test(item.expires_at) || !Number.isFinite(Date.parse(`${item.expires_at}T00:00:00Z`))))) return jsonError("Tanggal kedaluwarsa tidak valid");
    const ids = [...new Set(normalized.map(item => item.ingredient_id))];
    const { data: ingredients, error: ingredientError } = await supabaseAdmin.from("ingredients").select("id").eq("store_id", storeId).in("id", ids);
    if (ingredientError || ingredients?.length !== ids.length) return jsonError("Bahan tidak ditemukan di cabang ini");
    const orderNumber = `PO-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const { data: order, error } = await supabaseAdmin.from("purchase_orders").insert({ store_id: storeId, supplier_id: supplierId, order_number: orderNumber, status: "ordered", ordered_at: new Date().toISOString(), notes: String(body.notes || "").trim().slice(0, 1000) || null, created_by: user!.userId }).select().single();
    if (error || !order) return jsonError(error?.message || "Gagal membuat pesanan pembelian", 500);
    const { error: itemError } = await supabaseAdmin.from("purchase_order_items").insert(normalized.map(item => ({ purchase_order_id: order.id, ingredient_id: item.ingredient_id, quantity_ordered: item.quantity_ordered, unit_cost: item.unit_cost, expires_at: item.expires_at })));
    if (itemError) { await supabaseAdmin.from("purchase_orders").delete().eq("id", order.id); return jsonError(itemError.message, 500); }
    await writeAudit(user!, storeId, "purchase_order.create", "purchase_order", order.id, null, { orderNumber, itemCount: normalized.length });
    return NextResponse.json({ data: order }, { status: 201 });
  }

  if (body.action === "receive") {
    const orderId = String(body.orderId || "");
    const { data: order } = await supabaseAdmin.from("purchase_orders").select("id,store_id,status").eq("id", orderId).maybeSingle();
    if (!order || order.store_id !== storeId) return jsonError("Pesanan pembelian tidak ditemukan", 404);
    const { data, error } = await supabaseAdmin.rpc("receive_purchase_order", { p_order_id: orderId, p_actor_id: user!.userId });
    if (error) return jsonError(error.message, 409);
    await writeAudit(user!, storeId, "purchase_order.receive", "purchase_order", orderId, order, data);
    return NextResponse.json({ data });
  }
  if (body.action === "waste") {
    const ingredientId = String(body.ingredientId || ""), quantity = Number(body.quantity);
    if (!ingredientId || !Number.isFinite(quantity) || quantity <= 0) return jsonError("Bahan dan jumlah terbuang tidak valid");
    const { data: ingredient } = await supabaseAdmin.from("ingredients").select("id,store_id,name").eq("id", ingredientId).maybeSingle();
    if (!ingredient || ingredient.store_id !== storeId) return jsonError("Bahan tidak ditemukan di cabang ini", 404);
    const { data, error } = await supabaseAdmin.rpc("record_ingredient_waste", { p_ingredient_id: ingredientId, p_quantity: quantity, p_actor_id: user!.userId, p_notes: String(body.notes || "").slice(0, 500) });
    if (error) return jsonError(error.message, 409);
    await writeAudit(user!, storeId, "ingredient.waste", "ingredient", ingredientId, null, { quantity, notes: body.notes });
    return NextResponse.json({ data });
  }
  return jsonError("Aksi pembelian tidak dikenali");
}
