import { test, expect } from "@playwright/test";

test("offline screen works without a service worker; game matches and restarts", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/profile");
  await context.setOffline(true);
  const frame = page.frameLocator('iframe[title="Pemulihan koneksi bersama Luu"]');
  await expect(frame.getByRole("heading", { name: "Koneksi lagi terputus" })).toBeVisible();
  await expect(frame.getByRole("img",{name:"Luujaaa"})).toBeVisible();
  await frame.getByText("Main sebentar",{exact:true}).click();
  const cards = frame.locator(".tile");
  await expect(cards).toHaveCount(12);
  await cards.nth(0).focus();
  await page.keyboard.press("Enter");
  await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "true");
  await frame.getByRole("button", { name: "Ulangi game" }).click();
  // Learn the shuffled positions through real clicks, then solve every pair.
  const positions = new Map<string, number[]>();
  for (let i = 0; i < 12; i += 2) {
    await cards.nth(i).click();
    await cards.nth(i + 1).click();
    for (const index of [i, i + 1]) {
      const icon = (await cards.nth(index).textContent())!;
      positions.set(icon, [...(positions.get(icon) || []), index]);
    }
    await expect.poll(async () => (await cards.nth(i).getAttribute("aria-disabled")) === "true" || (await cards.nth(i).getAttribute("aria-pressed")) === "false").toBe(true);
  }
  for (const pair of positions.values()) {
    expect(pair).toHaveLength(2);
    if (await cards.nth(pair[0]).getAttribute("aria-disabled") === "true") continue;
    await cards.nth(pair[0]).click();
    await cards.nth(pair[1]).click();
  }
  await expect(frame.locator("#pairs")).toHaveText("6 / 6 pasang");
  await expect(frame.locator("#result")).toContainText("Lengkap!");
  await frame.getByRole("button", { name: "Ulangi game" }).click();
  await expect(frame.locator("#moves")).toHaveText("0 langkah");
  await frame.getByRole("button", { name: "Coba lagi" }).click();
  await expect(frame.locator("#feedback")).toContainText("Masih belum terhubung");
  expect(await frame.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/ui/offline-mobile.png" });
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "Profil", exact: true })).toBeVisible();
});

test("catalog failure has recovery screen, failed probe stays, successful retry restores menu", async ({ page }) => {
  await page.route("**/api/stores", route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.route("**/api/connection", route => route.fulfill({ status: 503, json: {} }));
  await page.goto("/menu?store=recovery-test&table=9");
  const frame = page.frameLocator('iframe[title="Pemulihan koneksi bersama Luu"]');
  await expect(frame.getByRole("heading", { name: "Ada kendala sementara" })).toBeVisible();
  await frame.getByRole("button", { name: "Coba lagi" }).click();
  await expect(frame.locator("#feedback")).toContainText("belum siap");
  await page.unroute("**/api/connection");
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/connection") return route.fulfill({ json: { reachable: true } });
    const store = { id: "recovery-test", name: "Recovery Resto", is_open: true };
    return route.fulfill({ json: { data: path === "/api/stores" ? [store] : path === "/api/stores/recovery-test" ? store : [] } });
  });
  await frame.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page.getByRole("heading", { name: "Recovery Resto" })).toBeVisible();
  await expect(page).toHaveURL(/store=recovery-test&table=9/);
});

test.describe("installed offline fallback", () => {
  test.use({ serviceWorkers: "allow" });
  test("reload and new document navigation stay playable offline; no account/API pages cached", async ({ page, context }) => {
    await page.goto("/profile");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Koneksi lagi terputus" })).toBeVisible();
    await page.getByText("Main sebentar",{exact:true}).click();
    await page.getByRole("button", { name: "Kartu 1, tertutup", exact: true }).click();
    await expect(page.locator(".tile").first()).toHaveAttribute("aria-pressed", "true");
    await page.goto("/orders?from=offline-test");
    await expect(page.getByRole("heading", { name: "Koneksi lagi terputus" })).toBeVisible();
    const cached = await page.evaluate(async () => {
      const key=(await caches.keys()).find(key=>key.startsWith("selforder-recovery-v2-luu-"));
      if(!key)throw new Error("Luu offline cache not installed");
      const cache = await caches.open(key);
      return (await cache.keys()).map(request => new URL(request.url).pathname);
    });
    expect(cached).toEqual(["/offline.html"]);
    await context.setOffline(false);
    await expect(page).toHaveURL(/\/orders\?from=offline-test$/);
    await expect(page.locator("#game-title")).toHaveCount(0);
  });
});
