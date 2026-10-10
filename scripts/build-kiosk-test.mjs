import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const build = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, SELFORDER_BUILD_DIR: ".next-kiosk-test", NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=4096" },
});
build.on("error", error => { console.error(error.message); process.exitCode = 1; });
build.on("exit", code => { process.exitCode = code ?? 1; });
