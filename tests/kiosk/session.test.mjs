import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import jwt from "jsonwebtoken";
import ts from "typescript";
import { NextRequest } from "next/server.js";

const require = createRequire(import.meta.url);
const secret = "isolated-unit-session-secret-of-more-than-32-chars";
const store = "11111111-1111-4111-8111-111111111111";
process.env.KIOSK_SESSION_SECRET = secret;
process.env.KIOSK_STATIONS = JSON.stringify({ fixture: { storeId: store, name: "Fixture" } });
process.env.KIOSK_DEFAULT_STATION = "fixture";
function load(file, overrides = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, name => name in overrides ? overrides[name] : require(name));
  return mod.exports;
}
const contracts = load("src/lib/kiosk/contracts.ts");
const server = load("src/lib/kiosk/server.ts", { "@/lib/supabase-server": { supabaseAdmin: { from: () => ({ select: async () => ({ data: [], error: null }) }) } }, "./contracts": contracts });
const request = token => new NextRequest("https://kiosk.example.test/api/kiosk/order", { headers: { Cookie: `${server.COOKIE}=${token}` } });
test("signed session is branch-bound; tampered and wrong-audience JWTs fail", async () => {
  const token = server.newSession(await server.stationConfig());
  assert.equal(server.getSession(request(token)).storeId, store);
  assert.throws(() => server.getSession(request(token + "x")), /Sesi berakhir/);
  assert.throws(() => server.getSession(request(jwt.sign({ sid: store, stationId: "fixture", storeId: store }, secret))), /Sesi berakhir/);
  const expired = jwt.sign({ sid: store, stationId: "fixture", storeId: store }, secret, { issuer: "selforder", audience: "selforder-kiosk", expiresIn: -1 });
  assert.throws(() => server.getSession(request(expired)), /Sesi berakhir/);
  const moved = jwt.sign({ sid: store, stationId: "fixture", storeId: "invalid-branch" }, secret, { issuer: "selforder", audience: "selforder-kiosk" });
  assert.throws(() => server.getSession(request(moved)), /Sesi berakhir/);
});
test("station and origin checks fail closed", async () => {
  await assert.rejects(() => server.stationConfig("unknown"), /belum terhubung/);
  await assert.rejects(() => server.stationConfig("__proto__"), /belum terhubung/);
  assert.throws(() => server.assertOrigin(new NextRequest("https://kiosk.example.test/api/kiosk/session")), /Asal/);
  assert.throws(() => server.assertOrigin(new NextRequest("https://kiosk.example.test/api/kiosk/session", { headers: { Origin: "https://other.example.test" } })), /Asal/);
  assert.doesNotThrow(() => server.assertOrigin(new NextRequest("https://kiosk.example.test/api/kiosk/session", { headers: { Origin: "https://kiosk.example.test" } })));
});
