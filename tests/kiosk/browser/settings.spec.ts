import { test, expect, type Page } from "@playwright/test";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
async function ownerFixture(page: Page, options: { role?: string; fail?: boolean } = {}) {
  const role = options.role || "owner";
  const user = { id: first, name: "Owner Test", email: "owner@example.test", role, is_active: true };
  const settings = { stores: [{ id: first, name: "Luujaaa Pusat", address: "Cabang pusat", is_active: true, logo: null }, { id: second, name: "Luujaaa Selatan", address: "Cabang selatan", is_active: true, logo: null }], stations: [] as { store_id: string; is_enabled: boolean; is_default: boolean }[], baseUrl: "https://kiosk.luujaaa.my.id/kiosk" };
  const saves: unknown[] = [];
  await page.addInitScript(({ user }) => {
    localStorage.setItem("selforder_token", "fixture-owner-token");
    localStorage.setItem("selforder_user", JSON.stringify(user));
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "fixture-supabase-token", refresh_token: "fixture-refresh", token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user: { ...user, aud: "authenticated", app_metadata: {}, user_metadata: {} } }));
  }, { user });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/login") return route.fulfill({ json: { data: { user, token: "fixture-owner-token" } } });
    if (path === "/api/kiosk/settings") {
      if (options.fail) return route.fulfill({ status: 503, json: { error: "Jalankan MIGRATION_SELFORDER_KIOSK_SETTINGS.sql di Supabase terlebih dahulu." } });
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON(); saves.push(body);
        if (body.isDefault) settings.stations.forEach(s => { s.is_default = false; });
        settings.stations = settings.stations.filter(s => s.store_id !== body.storeId);
        settings.stations.push({ store_id: body.storeId, is_enabled: body.enabled, is_default: body.isDefault });
        return route.fulfill({ json: { data: { saved: true } } });
      }
      return route.fulfill({ json: { data: settings } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.route("**/auth/v1/**", route => route.fulfill({ json: { user } }));
  await page.route(/^https:\/\//, route => route.abort());
  return { saves };
}

test("owner configures branches, switches default, opens the right link and disables orders", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const fixture = await ownerFixture(page);
  await page.goto("/dashboard/settings");
  await page.getByRole("button", { name: "KIOSK", exact: true }).click();
  await expect(page.getByText("Belum ada cabang utama", { exact: true })).toBeVisible();
  await page.getByLabel("Toko / cabang").selectOption(first);
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByRole("status")).toContainText("Tersimpan");
  await expect(page.getByRole("link", { name: "Buka KIOSK" })).toHaveAttribute("href", `https://kiosk.luujaaa.my.id/kiosk?station=${first}`);
  await page.getByLabel("Toko / cabang").selectOption(second);
  await page.getByRole("checkbox", { name: /Jadikan cabang utama/ }).check();
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByText("Cabang utama: Luujaaa Selatan", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/kiosk-owner-settings.png", fullPage: true });
  await page.getByRole("checkbox", { name: /Terima pesanan KIOSK/ }).uncheck();
  await expect(page.getByRole("checkbox", { name: /Jadikan cabang utama/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByText("Belum ada cabang utama", { exact: true })).toBeVisible();
  expect(fixture.saves).toEqual([{ storeId: first, enabled: true, isDefault: true }, { storeId: second, enabled: true, isDefault: true }, { storeId: second, enabled: false, isDefault: false }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Simpan pengaturan" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/kiosk-owner-settings-phone.png", fullPage: true });
});
test("owner sees actionable migration error", async ({ page }) => {
  await ownerFixture(page, { fail: true });
  await page.goto("/dashboard/settings");
  await page.getByRole("button", { name: "KIOSK", exact: true }).click();
  await expect(page.getByRole("region", { name: "Pengaturan KIOSK" }).getByRole("alert")).toContainText("MIGRATION_SELFORDER_KIOSK_SETTINGS.sql");
  await expect(page.getByRole("button", { name: "Muat ulang" })).toBeVisible();
});
test("cashier does not see owner-only KIOSK controls", async ({ page }) => {
  await ownerFixture(page, { role: "kasir" });
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Pengaturan", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "KIOSK", exact: true })).toHaveCount(0);
});
