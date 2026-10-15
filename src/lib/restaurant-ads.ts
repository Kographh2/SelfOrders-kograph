export interface RestaurantAd {
  id: string;
  store_id: string;
  title: string;
  description: string;
  image_url: string | null;
  link_url: string | null;
  link_label: string;
  is_active: boolean;
  display_order: number;
}

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Links are optional; never allow executable schemes or protocol-relative URLs. */
export function safeAdUrl(value: unknown, image = false): string | null {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > 2048 || /[\s\\\u0000-\u001f]/.test(value)) throw new Error("URL iklan tidak valid");
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Report the same validation error for malformed and unsafe URLs. */ }
  throw new Error(image ? "Gunakan URL gambar HTTPS atau path lokal" : "Gunakan tautan HTTPS atau path dalam aplikasi");
}

export function validateAd(body: Record<string, unknown>) {
  if (!isUuid(body.storeId)) throw new Error("Cabang tidak valid");
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const label = typeof body.linkLabel === "string" ? body.linkLabel.trim() : "Lihat penawaran";
  if (!title || title.length > 100 || description.length > 500 || label.length > 40) throw new Error("Judul wajib diisi (maks. 100), deskripsi maks. 500, dan label maks. 40 karakter");
  if (typeof body.isActive !== "boolean") throw new Error("Status iklan tidak valid");
  const order = body.displayOrder;
  if (typeof order !== "number" || !Number.isInteger(order) || order < 0 || order > 9999) throw new Error("Urutan harus berupa angka 0–9999");
  return { store_id: body.storeId, title, description, image_url: safeAdUrl(body.imageUrl, true), link_url: safeAdUrl(body.linkUrl), link_label: label || "Lihat penawaran", is_active: body.isActive, display_order: order };
}

export const dismissedAdKey = (ad: Pick<RestaurantAd, "store_id" | "id">) => `${ad.store_id}:${ad.id}`;
