import { test, expect } from "@playwright/test";

const store = { id: "ui-store", name: "Ruang Rasa", address: "Jl. Melati 12, Jakarta", is_open: true };
const items = [
  { id: "coffee", name: "Kopi Susu Gula Aren", description: "Espresso, susu segar, dan gula aren.", price: 28000, category_id: "drinks", is_available: true, is_featured: true },
  { id: "rice", name: "Nasi Ayam Panggang Sambal Matah Spesial", description: "Ayam panggang dengan sambal segar.", price: 48000, category_id: "food", is_available: true },
  { id: "sold", name: "Croissant Almond", description: "Dipanggang setiap pagi.", price: 32000, category_id: "food", is_available: false },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("notification_prompt_seen", "1");
    localStorage.setItem("install_prompt_dismissed", "1");
  });
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname === "/api/stores") data = [store];
    if (url.pathname === "/api/stores/ui-store") data = store;
    if (url.pathname === "/api/menu/categories") data = [{ id: "food", name: "Makanan" }, { id: "drinks", name: "Minuman" }];
    if (url.pathname === "/api/menu/items") data = items;
    await route.fulfill({ json: { data } });
  });
});

for (const width of [320, 390, 768, 1440]) {
  test(`menu, cart and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/menu");
    await expect(page.getByRole("heading", { name: "Ruang Rasa" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dock = page.getByRole("navigation", { name: "Navigasi utama" });
    await expect(dock).toBeVisible();
    await page.getByRole("button", { name: "Tambah Kopi Susu Gula Aren", exact: true }).click();
    await expect(page.getByRole("button", { name: "Keranjang, 1 item" })).toBeVisible();
    await page.getByRole("button", { name: "Kurangi Kopi Susu Gula Aren", exact: true }).click();
    await expect(page.getByRole("button", { name: "Keranjang, 0 item" })).toBeVisible();
    await page.getByRole("button", { name: "Tambah Kopi Susu Gula Aren", exact: true }).click();
    await page.getByRole("button", { name: "Keranjang, 1 item" }).click();
    await expect(page.getByRole("dialog", { name: "Keranjang", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Keranjang", exact: true })).not.toBeVisible();
    await page.getByRole("button", { name: "Akun", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Akun", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Akun", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Cari", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Cari makanan atau minuman" })).toBeFocused();
    await page.getByRole("textbox", { name: "Cari makanan atau minuman" }).fill("tidak-ada");
    await expect(page.getByText("Menu tidak ditemukan")).toBeVisible();
    await page.getByRole("textbox", { name: "Cari makanan atau minuman" }).fill("");
    await expect(page.locator(".menu-card").first()).toHaveCSS("opacity", "1");
    await page.screenshot({ path: `artifacts/ui/menu-${width}.png`, fullPage: true });
  });
}

test("dark theme, reduced motion and short-screen payment", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("selforder_theme", "dark"));
  await page.goto("/menu?store=ui-store&table=1");
  await page.getByRole("button", { name: "Tambah Kopi Susu Gula Aren", exact: true }).click();
  await page.getByRole("button", { name: "Keranjang, 1 item" }).click();
  await page.getByRole("button", { name: "Lanjut ke Pembayaran", exact: true }).click();
  const payment = page.getByRole("dialog", { name: "Pilih pembayaran" });
  await expect(payment).toBeVisible();
  const bounds = await payment.boundingBox();
  expect(bounds!.height).toBeLessThanOrEqual(568);
  await payment.getByRole("button", { name: "Lanjutkan pembayaran" }).scrollIntoViewIfNeeded();
  await expect(payment.getByRole("button", { name: "Lanjutkan pembayaran" })).toBeInViewport();
  await page.screenshot({ path: "artifacts/ui/payment-dark.png" });
});
