import type { Category, MenuItem, Store } from "@/types";

export type KioskCatalog = {
  station: { id: string; name: string };
  store: Store;
  operating: { is_open: boolean; next_open_label?: string };
  categories: Category[];
  items: MenuItem[];
  tables: { id: string; number: number }[];
  policies: { id: string; version: number; title: string; content: string; document_type: string }[];
};
export type KioskLine = { menu_item_id: string; quantity: number; option_ids: string[]; notes: string };
export type KioskCheckout = { requestId: string; tableId: string | null; mode: "dine_in" | "takeaway"; items: KioskLine[]; policyIds: string[]; expectedTotal: number };
export type KioskOrder = { id: string; order_number: number; total_amount: number; subtotal: number; tax_amount: number; service_charge: number; status: string; payment_status: string };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCheckout(value: unknown): KioskCheckout {
  if (!value || typeof value !== "object") throw new Error("Pesanan tidak valid");
  const v = value as KioskCheckout;
  if (!UUID.test(v.requestId) || !["dine_in", "takeaway"].includes(v.mode)) throw new Error("Referensi pesanan tidak valid");
  if (v.mode === "dine_in" && (typeof v.tableId !== "string" || !UUID.test(v.tableId))) throw new Error("Pilih nomor meja");
  if (!Number.isFinite(v.expectedTotal) || v.expectedTotal <= 0) throw new Error("Total tidak valid");
  if (!Array.isArray(v.policyIds) || v.policyIds.length > 2 || v.policyIds.some(id => typeof id !== "string" || !UUID.test(id))) throw new Error("Persetujuan tidak valid");
  if (!Array.isArray(v.items) || !v.items.length || v.items.length > 40) throw new Error("Pilih 1 sampai 40 baris menu");
  const items = v.items.map(item => {
    if (!item || typeof item.menu_item_id !== "string" || !UUID.test(item.menu_item_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new Error("Jumlah menu harus 1 sampai 20");
    if (typeof item.notes !== "string" || item.notes.length > 200 || !Array.isArray(item.option_ids) || item.option_ids.length > 60 || item.option_ids.some(id => typeof id !== "string" || id.length > 100)) throw new Error("Pilihan menu tidak valid");
    return { menu_item_id: item.menu_item_id, quantity: item.quantity, notes: item.notes.trim(), option_ids: [...new Set(item.option_ids)].sort() };
  }).sort((a, b) => a.menu_item_id.localeCompare(b.menu_item_id));
  if (items.reduce((sum, item) => sum + item.quantity, 0) > 100) throw new Error("Maksimal 100 item per pesanan");
  return { requestId: v.requestId, mode: v.mode, tableId: v.mode === "dine_in" ? v.tableId : null, items, policyIds: [...new Set(v.policyIds)].sort(), expectedTotal: v.expectedTotal };
}

export function linePrice(item: MenuItem, ids: string[]) {
  return Number(item.price) + (item.option_groups || []).flatMap(g => g.options).filter(o => ids.includes(o.id)).reduce((sum, o) => sum + Number(o.price_delta), 0);
}
export function kioskTotals(subtotal: number, store: Pick<Store, "tax_rate" | "service_charge_rate">) {
  const tax = Math.round(subtotal * Number(store.tax_rate || 0) * 100) / 100;
  const service = Math.round(subtotal * Number(store.service_charge_rate || 0) * 100) / 100;
  return { subtotal, tax, service, total: Math.round(subtotal + tax + service) };
}
