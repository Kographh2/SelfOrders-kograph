export function normalizeMenuTranslations(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, { name?: unknown; description?: unknown }>;
  return Object.fromEntries(["en", "id"].map(language => {
    const row = input[language] ?? {};
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 120) : "";
    const description = typeof row.description === "string" ? row.description.trim().slice(0, 500) : "";
    return [language, { ...(name ? { name } : {}), ...(description ? { description } : {}) }];
  }));
}

export function normalizeMenuTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((tag): tag is string => typeof tag === "string")
    .map(tag => tag.trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 30);
}

export function normalizeMenuDays(value: unknown) {
  if (!Array.isArray(value)) return [0, 1, 2, 3, 4, 5, 6];
  const days = [...new Set(value.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))];
  if (days.length !== value.length || !days.length) throw new Error("Hari tampil menu tidak valid");
  return days.sort((a, b) => a - b);
}

export function normalizeMenuSchedule(from: unknown, until: unknown) {
  const validate = (value: unknown) => value == null || value === "" || (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value));
  if (!validate(from) || !validate(until) || Boolean(from) !== Boolean(until)) {
    throw new Error("Atur jam mulai dan selesai menu dengan benar");
  }
  return { from: from || null, until: until || null };
}
