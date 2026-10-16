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
  test(`consumer pages and persistent cart at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/menu?store=ui-store&table=7");
    await expect(page.getByRole("heading", { name: "Ruang Rasa" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/ui/restaurant-menu-${width}.png`, fullPage: true });
    await expect(page.locator(".restaurant-masthead")).toHaveCSS("background-color", "rgb(20, 43, 69)");
    expect(await page.locator(".restaurant-greeting h2").evaluate(node => getComputedStyle(node).fontFamily)).not.toMatch(/Georgia|Times/);
    expect((await page.locator(".restaurant-header").boundingBox())!.height).toBeLessThan(520);
    const dock = page.getByRole("navigation", { name: "Navigasi utama" });
    await page.getByRole("button", { name: "Tambah Kopi Susu Gula Aren", exact: true }).click();
    await dock.getByRole("link", { name: "Cari", exact: true }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("heading", { name: "Cari menu", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Cari makanan atau minuman" }).fill("tidak-ada");
    await expect(page.getByText("Menu tidak ditemukan")).toBeVisible();
    await page.getByRole("button", { name: "Hapus pencarian" }).click();
    await page.getByRole("button", { name: "Tambah Nasi Ayam Panggang Sambal Matah Spesial", exact: true }).click();
    await dock.getByRole("link", { name: "Keranjang, 2 item" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: "Keranjang", exact: true })).toBeVisible();
    await expect(page.getByText("Meja 7", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Kopi Susu Gula Aren", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tambah Kopi Susu Gula Aren", exact: true }).click();
    await expect(dock.getByRole("link", { name: "Keranjang, 3 item" })).toBeVisible();
    await page.getByRole("button", { name: "Kurangi Kopi Susu Gula Aren", exact: true }).click();
    await expect(dock.getByRole("link", { name: "Keranjang, 2 item" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/ui/cart-${width}.png`, fullPage: true });
    await dock.getByRole("link", { name: "Profil", exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Profil", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Akun", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/ui/profile-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "Pengaturan", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dock.getByRole("link", { name: "Keranjang, 2 item" }).click();
    await expect(page.getByText("Meja 7", { exact: true })).toBeVisible();
  });
}

test("preferences persist, and payment fits a short screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Gelap", exact: true }).click();
  await page.getByRole("switch", { name: "Kurangi animasi" }).click();
  await page.getByRole("switch", { name: "Kurangi transparansi" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("switch", { name: "Kurangi animasi" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-glass", "solid");
  await page.screenshot({ path: "artifacts/ui/settings-dark.png", fullPage: true });
  await page.goto("/menu?store=ui-store&table=1");
  await expect(page.locator(".restaurant-menu")).toHaveCSS("background-color", "rgb(8, 19, 33)");
  await page.screenshot({ path: "artifacts/ui/menu-navy-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Tambah Kopi Susu Gula Aren", exact: true }).click();
  await page.getByRole("link", { name: "Keranjang, 1 item" }).click();
  await page.getByRole("button", { name: "Lanjut ke pembayaran", exact: true }).click();
  const payment = page.getByRole("dialog", { name: "Pilih pembayaran" });
  await expect(payment).toBeVisible();
  const bounds = await payment.boundingBox();
  expect(bounds!.height).toBeLessThanOrEqual(568);
  await payment.getByRole("button", { name: "Lanjutkan pembayaran" }).scrollIntoViewIfNeeded();
  await expect(payment.getByRole("button", { name: "Lanjutkan pembayaran" })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(payment).not.toBeVisible();
});

test("glass navigation supports drag, cancellation and keyboard links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/profile");
  const menu = page.getByRole("navigation").getByRole("link", { name: "Menu", exact: true });
  const search = page.getByRole("navigation").getByRole("link", { name: "Cari", exact: true });
  const lens = page.locator(".glass-lens");
  const profileTab = page.getByRole("navigation").getByRole("link", { name: "Profil", exact: true });
  const profileBounds = (await profileTab.boundingBox())!;
  await expect(lens).toHaveCSS("opacity", "0");
  await page.mouse.move(profileBounds.x + profileBounds.width / 2, profileBounds.y + profileBounds.height / 2);
  await page.mouse.down();
  await expect(page.locator(".glass-tabbar")).toHaveClass(/is-pressed/);
  await expect(lens).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "artifacts/ui/nav-pressed.png" });
  await page.mouse.up();
  await expect(lens).toHaveCSS("opacity", "0");
  await expect(page).toHaveURL(/\/profile$/);
  const a = (await menu.boundingBox())!, b = (await search.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await expect(page.locator(".glass-tabbar")).toHaveClass(/is-dragging/);
  await page.mouse.up();
  await expect(page).toHaveURL(/\/search$/);
  await expect(search).toHaveAttribute("aria-current", "page");
  const profile = page.getByRole("navigation").getByRole("link", { name: "Profil", exact: true });
  await profile.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/profile$/);
  await page.locator(".glass-tabbar").dispatchEvent("pointerdown", { pointerId: 5, button: 0, clientX: a.x });
  await page.locator(".glass-tabbar").dispatchEvent("pointercancel", { pointerId: 5 });
  await expect(page.locator(".glass-tabbar")).not.toHaveClass(/is-dragging/);
  await expect(lens).toHaveCSS("opacity", "0");
});

test("switching stores clears cart and old table context", async ({ page }) => {
  await page.goto("/menu?store=ui-store&table=7&reservation=fixture-reservation");
  await page.getByRole("button", { name: "Tambah Kopi Susu Gula Aren", exact: true }).click();
  await page.route("**/api/stores/second-store", route => route.fulfill({ json: { data: { ...store, id: "second-store", name: "Cabang Kedua" } } }));
  await page.goto("/menu?store=second-store");
  await expect(page.getByRole("heading", { name: "Cabang Kedua" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Keranjang, 0 item" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("selforder_order_draft")!).order.table)).toBe("");
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("selforder_order_draft")!).order.reservation)).toBe("");
});

test("direct empty cart and pickup validation", async ({ page }) => {
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Mulai dari yang Anda suka" })).toBeVisible();
  await page.getByRole("link", { name: "Jelajahi menu" }).click();
  await page.getByRole("button", { name: "Tambah Kopi Susu Gula Aren", exact: true }).click();
  await page.getByRole("link", { name: "Keranjang, 1 item" }).click();
  await page.getByRole("button", { name: "Lanjut ke pembayaran", exact: true }).click();
  await expect(page.getByText("Pilih waktu pengambilan yang akan datang")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Pilih pembayaran" })).toHaveCount(0);
});
