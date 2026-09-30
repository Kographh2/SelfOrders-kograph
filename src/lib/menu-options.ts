import { randomUUID } from "crypto";
import type { MenuOptionGroup } from "@/types";

export function normalizeOptionGroups(value: unknown): MenuOptionGroup[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 12) throw new Error("Maksimal 12 grup pilihan per menu");
  return value.map((group, groupIndex) => {
    const row = group as Partial<MenuOptionGroup>;
    if (!row.name?.trim() || !Array.isArray(row.options) || row.options.length === 0) {
      throw new Error(`Grup pilihan ${groupIndex + 1} belum lengkap`);
    }
    if (row.options.length > 30) throw new Error("Maksimal 30 pilihan per grup");
    const options = row.options.map((option) => {
      const price = Number(option.price_delta ?? 0);
      if (!option.name?.trim() || !Number.isFinite(price) || price < 0) {
        throw new Error("Nama dan harga tambahan pilihan tidak valid");
      }
      return { id: option.id || randomUUID(), name: option.name.trim().slice(0, 80), price_delta: Math.round(price) };
    });
    const maxSelect = Math.max(1, Math.min(options.length, Number(row.max_select) || 1));
    const required = Boolean(row.required);
    return {
      id: row.id || randomUUID(), name: row.name.trim().slice(0, 80), required,
      min_select: required ? Math.max(1, Math.min(maxSelect, Number(row.min_select) || 1)) : 0,
      max_select: maxSelect, options,
    };
  });
}
