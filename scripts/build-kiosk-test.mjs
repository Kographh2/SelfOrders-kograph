import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const build = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, SELFORDER_BUILD_DIR: ".next-kiosk-test", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3128", NEXT_PUBLIC_SUPABASE_ANON_KEY: "isolated-test-anon", SUPABASE_SERVICE_ROLE_KEY: "isolated-test-service", NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=4096 --max-semi-space-size=4" },
});
build.on("error", error => { console.error(error.message); process.exitCode = 1; });
build.on("exit", code => { process.exitCode = code ?? 1; });
