import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { NextRequest } from "next/server.js";
const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, name => name in overrides ? overrides[name] : require(name));
  return mod.exports;
}
const contracts = load("src/lib/kiosk/contracts.ts");
const store = "11111111-1111-4111-8111-111111111111";
function mockDB(results) {
  return { from(table) {
    const query = { select() { return query; }, eq() { return query; }, in() { return query; }, or() { return query; }, order() { return query; }, single() { return query; }, then(resolve, reject) { return Promise.resolve(results[table] || { data: [], error: null }).then(resolve, reject); } };
    return query;
  } };
}
function server(results) { return load("src/lib/kiosk/server.ts", { "@/lib/supabase-server": { supabaseAdmin: mockDB(results) }, "./contracts": contracts }); }
test("database settings override malformed env and use the current store name", async () => {
  process.env.KIOSK_STATIONS = "invalid json";
  const s = server({ kiosk_stations: { data: [{ store_id: store, is_enabled: true, is_default: true }] }, stores: { data: { id: store, name: "Nama toko asli", is_active: true } } });
  assert.deepEqual(await s.stationConfig(), { id: store, storeId: store, name: "Nama toko asli" });
  assert.deepEqual(await s.stationConfig(store), await s.stationConfig());
  await assert.rejects(s.stationConfig("unknown"), /belum aktif/);
  await assert.rejects(s.stationConfig({ storeId: store }), /tidak valid/);
});
test("disabled configuration never falls back to old environment settings", async () => {
  process.env.KIOSK_DEFAULT_STATION = "legacy";
  process.env.KIOSK_STATIONS = JSON.stringify({ legacy: { storeId: store, name: "Legacy" } });
  const s = server({ kiosk_stations: { data: [{ store_id: store, is_enabled: false, is_default: false }] } });
  await assert.rejects(s.stationConfig(), /belum aktif/);
  await assert.rejects(s.stationConfig(store), /belum aktif/);
  await assert.rejects(s.stationConfig("legacy"), /belum aktif/);
});
test("legacy fallback is only allowed for empty or not-yet-migrated installations", async () => {
  process.env.KIOSK_DEFAULT_STATION = "legacy";
  process.env.KIOSK_STATIONS = JSON.stringify({ legacy: { storeId: store, name: "Legacy" } });
  assert.equal((await server({ kiosk_stations: { error: { code: "PGRST205" } } }).stationConfig()).storeId, store);
  await assert.rejects(server({ kiosk_stations: { error: new Error("database unavailable") } }).stationConfig(), /database unavailable/);
  await assert.rejects(server({ kiosk_stations: { data: [{ store_id: store, is_enabled: true, is_default: true }] }, stores: { data: { id: store, is_active: false } } }).stationConfig(), /tidak aktif/);
});
function settings(role, currentRole = role, rpc = async () => ({ error: null })) {
  return load("src/app/api/kiosk/settings/route.ts", {
    "@/lib/auth": { getAuthUser: async () => role ? { role, userId: store } : null },
    "@/lib/supabase-server": { supabaseAdmin: { ...mockDB({ users: { data: { role: currentRole } }, stores: { data: [{ id: store, name: "Store" }] }, kiosk_stations: { data: [] } }), rpc } },
    "@/lib/kiosk/contracts": contracts,
  });
}
const req = body => new NextRequest("https://kiosk.example.test/api/kiosk/settings", body === undefined ? {} : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
test("only a current owner may read or write settings", async () => {
  for (const [role, current] of [[null, null], ["kasir", "kasir"], ["admin", "admin"], ["owner", "user"]]) {
    const route = settings(role, current, () => { throw new Error("must not write"); });
    assert.equal((await route.GET(req())).status, 403);
    assert.equal((await route.PUT(req({ storeId: store, enabled: true, isDefault: true }))).status, 403);
  }
});
test("owner saves validated values using the atomic RPC; client fields cannot override it", async () => {
  const calls = [];
  const route = settings("owner", "owner", async (...args) => { calls.push(args); return { error: null }; });
  for (const body of [null, {}, { storeId: store, enabled: "true", isDefault: true }, { storeId: store, enabled: false, isDefault: true }]) {
    assert.equal((await route.PUT(req(body))).status, 400);
  }
  assert.equal(calls.length, 0);
  assert.equal((await route.PUT(req({ storeId: store, enabled: true, isDefault: true, name: "fake", userId: "fake" }))).status, 200);
  assert.deepEqual(calls, [["save_kiosk_station", { p_store_id: store, p_enabled: true, p_default: true }]]);
  const response = await route.GET(req());
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal((await response.json()).data.stores[0].name, "Store");
});
test("settings reports the required migration to owner without exposing database errors", async () => {
  const route = settings("owner", "owner", async () => ({ error: { code: "PGRST202", message: "internal details" } }));
  const response = await route.PUT(req({ storeId: store, enabled: true, isDefault: true }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /MIGRATION_SELFORDER_KIOSK_SETTINGS.sql/);
});

test("disabled station blocks new orders but permits retry and recovery of an existing order", async () => {
  class KioskError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  let existing = null;
  let calls = 0;
  const route = load("src/app/api/kiosk/order/route.ts", {
    "@/lib/supabase-server": { supabaseAdmin: { rpc: async () => { calls++; return { error: null }; } } },
    "@/lib/store-hours": { getStoreOperatingStatus: () => { throw new Error("disabled station must not reach store lookup"); } },
    "@/lib/kiosk/contracts": contracts,
    "@/lib/kiosk/server": {
      KioskError, assertOrigin() {}, getSession: () => ({ sid: store, stationId: store, storeId: store }),
      stationConfig: async () => { throw new KioskError("KIOSK belum aktif", 503); },
      ownedOrder: async () => existing,
      reply: data => Response.json({ data }), failure: e => Response.json({ error: e.message }, { status: e.status || 500 }),
    },
  });
  const body = { requestId: store, mode: "takeaway", tableId: null, expectedTotal: 10000, policyIds: [], items: [{ menu_item_id: store, quantity: 1, option_ids: [], notes: "" }] };
  assert.equal((await route.POST(req(body))).status, 503);
  assert.equal(calls, 0);
  existing = { id: store, payment_status: "pending", snap_token: "private-token", kiosk_payment_state: "ready" };
  const retry = await route.POST(req(body));
  assert.equal(retry.status, 200); assert.equal(calls, 1);
  const payload = await retry.json();
  assert.equal(payload.data.payment_status, "pending");
  assert.equal(payload.data.snap_token, undefined);
});

test("catalog refresh preserves the signed branch of an issued order after station disable", async () => {
  let existing = { id: store };
  class KioskError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const route = load("src/app/api/kiosk/catalog/route.ts", {
    "@/lib/supabase-server": { supabaseAdmin: mockDB({ stores: { data: { id: store, name: "Original branch", is_active: true } } }) },
    "@/lib/store-hours": { getStoreOperatingStatus: () => ({ is_open: true }) },
    "@/lib/menu-schedule": { isMenuScheduledNow: () => true },
    "@/lib/kiosk/server": {
      COOKIE: "kiosk", KioskError, getSession: () => ({ sid: store, stationId: store, storeId: store }),
      stationConfig: async () => { throw new KioskError("disabled", 503); }, ownedOrder: async () => existing,
      reply: data => Response.json({ data }), failure: e => Response.json({ error: e.message }, { status: e.status || 500 }),
    },
  });
  const request = (cookie = true, query = "") => new NextRequest(`https://kiosk.example.test/api/kiosk/catalog${query}`, { headers: cookie ? { Cookie: "kiosk=signed-cookie" } : {} });
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.station.id, store);
  assert.equal((await route.GET(request(false))).status, 503);
  assert.equal((await route.GET(request(true, "?station=another"))).status, 503);
  existing = null;
  assert.equal((await route.GET(request())).status, 503);
});
