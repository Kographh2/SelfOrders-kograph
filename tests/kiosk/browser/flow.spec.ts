import { test, expect, type Page } from "@playwright/test";

const storeId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const tableId = "33333333-3333-4333-8333-333333333333";
const policyId = "44444444-4444-4444-8444-444444444444";
const catalog = {
  station: { id: "fixture", name: "Fixture station" },
  store: { id: storeId, name: "Kographh · Test Kitchen", tax_rate: .11, service_charge_rate: 0 },
  operating: { is_open: true }, categories: [{ id: "coffee", name: "Coffee" }, { id: "food", name: "Food" }],
  items: [
    { id: itemId, category_id: "coffee", name: "Kopi Susu Aren", description: "Espresso, susu segar, dan gula aren.", price: 20000, is_available: true, is_featured: true, track_stock: true, stock_quantity: 8, option_groups: [{ id: "size", name: "Ukuran", min_select: 1, max_select: 1, options: [{ id: "regular", name: "Regular", price_delta: 0 }, { id: "large", name: "Large", price_delta: 5000 }] }], allergens: ["susu"] },
    { id: "55555555-5555-4555-8555-555555555555", category_id: "coffee", name: "Espresso", description: "Single origin, fresh roast.", price: 18000, is_available: true, option_groups: [] },
    { id: "66666666-6666-4666-8666-666666666666", category_id: "food", name: "Croissant", price: 25000, is_available: false, option_groups: [] },
  ], tables: [{ id: tableId, number: 7 }], policies: [{ id: policyId, version: 1, title: "Syarat Penggunaan", content: "Dokumen kebijakan fixture untuk pengujian lokal.", document_type: "terms" }],
};
type FixtureOrder = { id: string; order_number: number; total_amount: number; subtotal: number; tax_amount: number; service_charge: number; status: string; payment_status: string };
async function fixture(page: Page, options: { lostResponse?: boolean; empty?: boolean; closed?: boolean; fail?: boolean } = {}) {
  const requests: Record<string, unknown>[] = [];
  let order: FixtureOrder | null = null;
  let tokenRequests = 0;
  let dropped = false;
  await page.route("**/api/kiosk/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/catalog")) return route.fulfill({ status: options.fail ? 503 : 200, json: options.fail ? { error: "KIOSK belum terhubung ke cabang. Hubungi petugas." } : { data: { ...catalog, items: options.empty ? [] : catalog.items, operating: { is_open: !options.closed } } } });
    if (path.endsWith("/session")) return route.fulfill({ json: { data: { stationId: "fixture" } } });
    if (path.endsWith("/order") && method === "POST") {
      const body = route.request().postDataJSON(); requests.push(body);
      if (!order) order = { id: "77777777-7777-4777-8777-777777777777", order_number: 42, total_amount: body.expectedTotal, subtotal: 25000, tax_amount: 2750, service_charge: 0, status: "pending", payment_status: "pending" };
      if (options.lostResponse && !dropped) { dropped = true; return route.abort("connectionreset"); }
      return route.fulfill({ json: { data: order } });
    }
    if (path.endsWith("/order")) return route.fulfill({ json: { data: order } });
    if (path.endsWith("/payment") && method === "POST") { tokenRequests++; return route.fulfill({ json: { data: { token: "fixture-snap-token" } } }); }
    if (path.endsWith("/payment") && method === "PUT") {
      if (order) { order.payment_status = "paid"; order.status = "confirmed"; }
      return route.fulfill({ json: { data: { payment_status: "paid" } } });
    }
    throw new Error(`Unmocked kiosk request: ${method} ${path}`);
  });
  // Any unintended external API call fails; tests never contact live Supabase/Midtrans.
  await page.route(/^https:\/\//, route => route.abort());
  await page.addInitScript(() => {
    window.snap = { pay: (_token, callbacks) => { setTimeout(() => callbacks.onSuccess?.({ transaction_status: "settlement" }), 100); }, hide: () => {}, embed: () => {} };
  });
  return { requests, tokens: () => tokenRequests };
}
async function chooseCoffee(page: Page) {
  await page.getByRole("button", { name: /Kopi Susu Aren,/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("radio", { name: /Large/ }).check();
  await page.getByPlaceholder("Contoh: tanpa es").fill("Sedikit es");
  await page.getByRole("button", { name: /Tambah ke pesanan/ }).click();
}
async function checkout(page: Page, portrait = false) {
  await (portrait ? page.getByRole("button", { name: /item · Lihat pesanan/ }) : page.getByRole("button", { name: "Periksa pesanan" })).click();
  await page.getByRole("button", { name: "Lanjut checkout" }).click();
  await page.getByRole("checkbox", { name: /Saya telah membaca/ }).check();
}

test("landscape: dine-in, options, cart, payment, confirmation and privacy reset", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const mock = await fixture(page);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/kiosk");
  await page.screenshot({ path: "test-results/kiosk-welcome-landscape.png", fullPage: true });
  await page.getByRole("button", { name: /Makan di sini/ }).click();
  await expect(page.getByRole("button", { name: /Croissant,/ })).toBeDisabled();
  await page.screenshot({ path: "test-results/kiosk-menu-landscape.png", fullPage: true });
  await chooseCoffee(page); await checkout(page);
  await expect(page.getByRole("button", { name: /Buat pesanan & lanjut bayar/ })).toBeDisabled();
  await page.getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "Syarat Penggunaan", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Dokumen kebijakan fixture");
  await page.getByRole("button", { name: "Selesai membaca" }).click();
  await page.getByRole("button", { name: /Buat pesanan & lanjut bayar/ }).dblclick();
  await expect(page.getByRole("heading", { name: "Selesaikan pembayaran Anda." })).toBeVisible();
  expect(mock.requests).toHaveLength(1);
  expect(mock.requests[0]).toMatchObject({ tableId, expectedTotal: 27750, mode: "dine_in", items: [{ menu_item_id: itemId, quantity: 1, option_ids: ["large"], notes: "Sedikit es" }], policyIds: [policyId] });
  await page.getByRole("button", { name: "Buka pembayaran" }).click();
  await expect(page.getByRole("heading", { name: "Kami siapkan dengan hati." })).toBeVisible();
  expect(mock.tokens()).toBe(1);
  await expect(page.getByText("042", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/kiosk-confirmation.png", fullPage: true });
  await page.getByRole("button", { name: /Selesai · Pelanggan berikutnya/ }).click();
  await expect(page.getByRole("button", { name: /Bawa pulang/ })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("selforder_kiosk_checkout"))).toBeNull();
  expect(errors).toEqual([]);
});
test("portrait: takeaway, search, lost response retry retains same order key", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const mock = await fixture(page, { lostResponse: true });
  await page.goto("/kiosk"); await page.getByRole("button", { name: /Bawa pulang/ }).click();
  await page.getByRole("textbox", { name: "Cari menu" }).fill("tidakada");
  await expect(page.getByRole("heading", { name: "Belum menemukan yang cocok?" })).toBeVisible();
  await page.getByRole("button", { name: "Hapus pencarian" }).click();
  await chooseCoffee(page);
  await page.screenshot({ path: "test-results/kiosk-menu-portrait.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await checkout(page, true); await page.getByRole("button", { name: /Buat pesanan & lanjut bayar/ }).click();
  await expect(page.getByRole("button", { name: "Coba kirim kembali" })).toBeEnabled();
  await page.getByRole("button", { name: "Coba kirim kembali" }).click();
  await expect(page.getByRole("heading", { name: "Selesaikan pembayaran Anda." })).toBeVisible();
  expect(mock.requests).toHaveLength(2); expect(mock.requests[0]).toEqual(mock.requests[1]);
  expect(mock.requests[0].tableId).toBeNull();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Selesaikan pembayaran Anda." })).toBeVisible();
  expect(mock.requests).toHaveLength(2);
});
test("touch phone layout, required option and idle timeout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page); await page.goto("/kiosk");
  await page.getByRole("button", { name: /Bawa pulang/ }).click();
  await page.getByRole("button", { name: /Kopi Susu Aren,/ }).click();
  await page.getByRole("button", { name: /Tambah ke pesanan/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Tutup dialog" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Shift wall-clock time only: browser-native animation timelines keep ticking.
  // Virtualizing performance/RAF while WAAPI uses document.timeline can strand
  // an exit animation in the future and does not represent real user idleness.
  const now = Date.now();
  await page.clock.setFixedTime(new Date(now + 95000));
  await expect(page.getByRole("heading", { name: "Masih ingin melanjutkan?" })).toBeVisible();
  await page.clock.setFixedTime(new Date(now + 126000));
  await expect(page.getByRole("button", { name: /Bawa pulang/ })).toBeVisible();
});
test("empty, closed and unconfigured states are usable", async ({ page }) => {
  await fixture(page, { empty: true }); await page.goto("/kiosk");
  await page.getByRole("button", { name: /Bawa pulang/ }).click();
  await expect(page.getByRole("heading", { name: "Menu belum tersedia" })).toBeVisible();
  await page.unrouteAll(); await fixture(page, { closed: true }); await page.goto("/kiosk");
  await expect(page.getByRole("heading", { name: "Cabang sedang tutup" })).toBeVisible();
  await page.unrouteAll(); await fixture(page, { fail: true }); await page.goto("/kiosk");
  await expect(page.getByRole("button", { name: "Muat kembali" })).toBeVisible();
});
test("Snap success callback alone cannot confirm a pending server payment", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page); await page.goto("/kiosk");
  await page.getByRole("button", { name: /Bawa pulang/ }).click();
  await chooseCoffee(page); await checkout(page);
  await page.getByRole("button", { name: /Buat pesanan & lanjut bayar/ }).click();
  await page.route("**/api/kiosk/payment", route => route.fulfill({ json: { data: route.request().method() === "POST" ? { token: "fixture-token" } : { payment_status: "pending" } } }));
  await page.getByRole("button", { name: "Buka pembayaran" }).click();
  await expect(page.getByRole("button", { name: "Periksa status" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Selesaikan pembayaran Anda." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kami siapkan dengan hati." })).toHaveCount(0);
  await page.screenshot({ path: "test-results/kiosk-payment-pending.png", fullPage: true });
});
test("a late paid polling response cannot restore a previous customer's screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page); await page.goto("/kiosk");
  await page.getByRole("button", { name: /Bawa pulang/ }).click();
  await chooseCoffee(page); await checkout(page);
  await page.getByRole("button", { name: /Buat pesanan & lanjut bayar/ }).click();
  await expect(page.getByRole("heading", { name: "Selesaikan pembayaran Anda." })).toBeVisible();
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route("**/api/kiosk/order", async route => {
    started = true; await delayed;
    await route.fulfill({ json: { data: { id: "77777777-7777-4777-8777-777777777777", order_number: 42, total_amount: 27750, subtotal: 25000, tax_amount: 2750, service_charge: 0, status: "confirmed", payment_status: "paid" } } });
  });
  await expect.poll(() => started, { timeout: 10000 }).toBe(true);
  await page.getByRole("button", { name: "Mulai ulang" }).click();
  await page.getByRole("button", { name: "Ya, akhiri sesi" }).click();
  await expect(page.getByRole("button", { name: /Bawa pulang/ })).toBeVisible();
  const response = page.waitForResponse("**/api/kiosk/order"); release(); await response;
  await expect(page.getByRole("button", { name: /Bawa pulang/ })).toBeVisible();
  await expect(page.getByText("042", { exact: true })).toHaveCount(0);
});
test("real HTTP: hostname rewrite, signed cookie, CSRF and UID-only login rejected", async ({ request }) => {
  const host = await request.get("/", { headers: { Host: "kiosk.luujaaa.my.id" }, maxRedirects: 0 });
  expect(host.status()).toBe(200); expect(await host.text()).toContain("KIOSK");
  const normal = await request.get("/", { maxRedirects: 0 }); expect([307, 308]).toContain(normal.status());
  const csrf = await request.post("/api/kiosk/session", { data: { station: "fixture" } }); expect(csrf.status()).toBe(403);
  const session = await request.post("/api/kiosk/session", { data: { station: "fixture" }, headers: { Origin: "http://localhost:3127" } });
  expect(session.status()).toBe(200);
  const cookie = session.headers()["set-cookie"];
  expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=strict"); expect(cookie).toContain("Secure"); expect(cookie).toContain("Path=/api/kiosk");
  const unknown = await request.post("/api/kiosk/session", { data: { station: "unknown" }, headers: { Origin: "http://localhost:3127" } }); expect(unknown.status()).toBe(503);
  const login = await request.post("/api/auth/login", { data: { supabaseUid: storeId } }); expect(login.status()).toBe(401);
  const cron = await request.get("/api/kiosk/maintenance"); expect(cron.status()).toBe(401);
});
