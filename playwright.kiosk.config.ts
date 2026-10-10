import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/kiosk/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://localhost:3127", browserName: "chromium", channel: process.env.KIOSK_TEST_BROWSER || "chrome", headless: true, screenshot: "only-on-failure", trace: "retain-on-failure", serviceWorkers: "block" },
  webServer: [{ command: "node tests/kiosk/browser/mock-database.mjs", url: "http://127.0.0.1:3128/health", reuseExistingServer: false }, {
    command: "npm.cmd run start -- -p 3127",
    url: "http://localhost:3127/kiosk",
    reuseExistingServer: false,
    timeout: 60000,
    env: { SELFORDER_BUILD_DIR: ".next-kiosk-test", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3128", NEXT_PUBLIC_SUPABASE_ANON_KEY: "isolated-test-anon", SUPABASE_SERVICE_ROLE_KEY: "isolated-test-service", KIOSK_DEFAULT_STATION: "fixture", KIOSK_HOSTNAME: "kiosk.luujaaa.my.id", KIOSK_STATIONS: JSON.stringify({ fixture: { storeId: "11111111-1111-4111-8111-111111111111", name: "Fixture station" } }), KIOSK_SESSION_SECRET: "isolated-browser-test-secret-not-a-real-credential" },
  }],
});
