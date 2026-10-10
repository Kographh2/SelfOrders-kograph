import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/kiosk/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://localhost:3127", browserName: "chromium", channel: process.env.KIOSK_TEST_BROWSER || "chrome", headless: true, screenshot: "only-on-failure", trace: "retain-on-failure", serviceWorkers: "block" },
  webServer: {
    command: "npm.cmd run start -- -p 3127",
    url: "http://localhost:3127/kiosk",
    reuseExistingServer: false,
    timeout: 60000,
    env: { SELFORDER_BUILD_DIR: ".next-kiosk-test", KIOSK_DEFAULT_STATION: "fixture", KIOSK_STATIONS: JSON.stringify({ fixture: { storeId: "11111111-1111-4111-8111-111111111111", name: "Fixture station" } }), KIOSK_SESSION_SECRET: "isolated-browser-test-secret-not-a-real-credential" },
  },
});
