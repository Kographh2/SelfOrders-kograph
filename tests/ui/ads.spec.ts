import { test, expect } from "@playwright/test";

const store = { id: "ads-store", name: "Ruang Rasa", address: "Jakarta", is_open: true };
const ad = (id: string, title: string) => ({ id, store_id: store.id, title, description: "Temukan pilihan untuk menemani waktu makan Anda.", image_url: null, link_url: "/search", link_label: "Lihat menu", is_active: true, display_order: 0 });
const menu = [{ id: "coffee", name: "Kopi Susu", price: 28000, category_id: "drinks", is_available: true, is_featured: true, description: "Kopi dan susu segar." }];
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("notification_prompt_seen", "1"); localStorage.setItem("install_prompt_dismissed", "1"); });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/stores" ? [store] : path === `/api/stores/${store.id}` ? store : path === "/api/menu/items" ? menu : [];
    return route.fulfill({ json: { data } });
  });
});

test("one popup rotates after five seconds, can pause, and can close", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/ads?**", route => route.fulfill({ json: { data: [ad("a", "Menu pilihan hari ini"), ad("b", "Teman ngopi Anda")] } }));
  await page.goto("/menu");
  const dialog = page.getByRole("dialog", { name: "Penawaran restoran" });
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole("heading", { name: "Menu pilihan hari ini" })).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(dialog.locator("article")).toHaveAttribute("data-ad-id", "a");
  await expect(dialog.getByRole("heading", { name: "Teman ngopi Anda" })).toBeVisible({ timeout: 7000 });
  await dialog.getByRole("button", { name: "Jeda iklan" }).click();
  await page.waitForTimeout(5500);
  await expect(dialog.locator("article")).toHaveAttribute("data-ad-id", "b");
  await expect(dialog).toHaveCount(1);
  await page.screenshot({ path: "artifacts/ui/restaurant-ad.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Tambah Kopi Susu", exact: true }).click();
  await expect(page.getByRole("link", { name: "Keranjang, 1 item" })).toBeVisible();
});

test("dismissal is per ad; a new ad still appears after all old ads are hidden", async ({ page }) => {
  let ads = [ad("a", "Penawaran A"), ad("b", "Penawaran B")];
  await page.route("**/api/ads?**", route => route.fulfill({ json: { data: ads } }));
  await page.goto("/menu");
  const dialog = page.getByRole("dialog", { name: "Penawaran restoran" });
  await dialog.getByRole("checkbox", { name: /Jangan tampilkan iklan ini lagi/ }).check();
  await dialog.getByRole("button", { name: "Iklan berikutnya" }).click();
  await expect(dialog.getByRole("heading", { name: "Penawaran B" })).toBeVisible();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByRole("button", { name: "Tutup iklan" }).click();
  await page.reload();
  await expect(dialog.getByRole("heading", { name: "Penawaran B" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Penawaran A" })).toHaveCount(0);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Tutup iklan" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ruang Rasa" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await expect(dialog).toHaveCount(0);
  ads = [...ads, ad("c", "Penawaran baru")];
  await page.reload();
  await expect(dialog.getByRole("heading", { name: "Penawaran baru" })).toBeVisible();
});

test("small dark screen, storage failure, and ad API failure keep ordering accessible", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("selforder_theme", "dark");
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === "selforder_hidden_ads_v1") throw new DOMException("blocked"); original.call(this, key, value); };
  });
  await page.route("**/api/ads?**", route => route.fulfill({ json: { data: [ad("a", "Penawaran untuk makan bersama keluarga")] } }));
  await page.goto("/menu");
  const dialog = page.getByRole("dialog", { name: "Penawaran restoran" });
  await dialog.getByRole("checkbox").check();
  await expect(page.getByRole("status")).toContainText("Browser tidak mengizinkan penyimpanan");
  expect((await dialog.boundingBox())!.height).toBeLessThanOrEqual(544);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Tutup iklan" }).click();
  await page.unroute("**/api/ads?**");
  await page.route("**/api/ads?**", route => route.fulfill({ status: 503, json: { error: "migration missing" } }));
  await page.reload();
  await page.getByRole("button", { name: "Tambah Kopi Susu", exact: true }).click();
  await expect(page.getByRole("link", { name: "Keranjang, 1 item" })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
