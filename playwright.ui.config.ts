import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui", workers: 1, timeout: 45000,
  use: { baseURL: "http://localhost:3134", channel: "chrome", headless: true, serviceWorkers: "block", screenshot: "only-on-failure" },
  webServer: { command: "npm.cmd run start -- -p 3134", url: "http://localhost:3134/menu", reuseExistingServer: false, timeout: 60000, env: { SELFORDER_BUILD_DIR: process.env.SELFORDER_BUILD_DIR || ".next-ui" } },
});
