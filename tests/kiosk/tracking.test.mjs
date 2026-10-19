import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server.js";
const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, name => name in overrides ? overrides[name] : require(name));
  return mod.exports;
}
process.env.KIOSK_SESSION_SECRET = "tracking-test-secret-at-least-thirty-two-chars";
const contracts = load("src/lib/kiosk/contracts.ts");
const server = load("src/lib/kiosk/server.ts", { "./contracts": contracts, "@/lib/supabase-server": {} });
const tracking = load("src/lib/kiosk/tracking.ts", { "./contracts": contracts, "./server": server });
const id = "77777777-7777-4777-8777-777777777777", store = "11111111-1111-4111-8111-111111111111", sid = "22222222-2222-4222-8222-222222222222";
const base = { id, store_id: store, created_at: new Date().toISOString() };
test("tracking credentials are order-bound, expiring, and cannot become kiosk sessions", () => {
  const token = tracking.trackingToken(base);
  assert.equal(tracking.trackingToken(base), token);
  assert.deepEqual(tracking.verifyTracking(token, id), { orderId: id, storeId: store });
  assert.throws(() => tracking.verifyTracking(token, store), /tidak valid/);
  assert.throws(() => tracking.verifyTracking(token + "x", id), /tidak valid/);
  assert.throws(() => tracking.verifyTracking(null, id), /tidak valid/);
  const expired = jwt.sign({ orderId: id, storeId: store }, process.env.KIOSK_SESSION_SECRET, { expiresIn: -1, audience: "selforder-kiosk-tracking", issuer: "selforder" });
  assert.throws(() => tracking.verifyTracking(expired, id), /kedaluwarsa/);
  assert.throws(() => server.getSession(new NextRequest("https://kiosk.test/api/kiosk/order", { headers: { Cookie: `${server.COOKIE}=${token}` } })), /Sesi berakhir/);
  const session = server.newSession({ id: "fixture", storeId: store });
  assert.throws(() => tracking.verifyTracking(session, id), /tidak valid/);
});
function database(row) {
  const calls = [];
  return { calls, from() {
    const ops = []; calls.push(ops);
    const chain = { select(value) { ops.push(["select", value]); return chain; }, update(value) { ops.push(["update", value]); return chain; }, eq(...args) { ops.push(["eq", ...args]); return chain; }, not(...args) { ops.push(["not", ...args]); return chain; }, is(...args) { ops.push(["is", ...args]); return chain; }, maybeSingle() { return chain; }, single() { return chain; }, then(resolve) { return Promise.resolve({ data: row, error: null }).then(resolve); } };
    return chain;
  } };
}
const req = (token, method = "GET", origin = "https://kiosk.test") => new NextRequest(`https://kiosk.test/api/kiosk-tracking/${id}`, { method, headers: { ...(token ? { "x-kiosk-tracking": token } : {}), Origin: origin } });
const context = { params: Promise.resolve({ orderId: id }) };
function route(db) { return load("src/app/api/kiosk-tracking/[orderId]/route.ts", { "@/lib/supabase-server": { supabaseAdmin: db }, "@/lib/kiosk/server": server, "@/lib/kiosk/tracking": tracking }); }
test("phone GET never acknowledges and only requests paid kiosk orders in the signed branch", async () => {
  const db = database({ ...base, kiosk_session_id: sid, kiosk_tracking_ack_at: null, payment_status: "paid", order_items: [] });
  const response = await route(db).GET(req(tracking.trackingToken(base)), context);
  assert.equal(response.status, 200);
  const data = (await response.json()).data;
  assert.equal(data.kiosk_session_id, undefined); assert.equal(data.kiosk_tracking_ack_at, undefined);
  assert.equal(db.calls.flat().some(op => op[0] === "update"), false);
  for (const op of [["eq", "id", id], ["eq", "store_id", store], ["eq", "payment_status", "paid"], ["not", "kiosk_session_id", "is", null]]) assert.ok(db.calls[0].some(actual => JSON.stringify(actual) === JSON.stringify(op)));
  assert.doesNotMatch(db.calls[0][0][1], /snap_token|user_id|anonymous_session_id|payments\(/);
});
test("acknowledgement checks token and origin, updates only a paid unacknowledged order, and is idempotent", async () => {
  const row = { ...base, kiosk_session_id: sid, kiosk_tracking_ack_at: null };
  const db = database(row), api = route(db), token = tracking.trackingToken(base);
  assert.equal((await api.POST(req(null, "POST"), context)).status, 403);
  assert.equal((await api.POST(req(token, "POST", "https://other.test"), context)).status, 403);
  assert.equal(db.calls.length, 0);
  assert.equal((await api.POST(req(token, "POST"), context)).status, 200);
  assert.ok(db.calls[1].some(op => op[0] === "is" && op[1] === "kiosk_tracking_ack_at" && op[2] === null));
  row.kiosk_tracking_ack_at = new Date().toISOString();
  const previous = db.calls.length;
  assert.equal((await api.POST(req(token, "POST"), context)).status, 200);
  assert.equal(db.calls.length, previous + 1);
  assert.equal((await route(database(null)).POST(req(token, "POST"), context)).status, 404);
});
test("handoff QR is unavailable before verified payment and unavailable to an unsigned station", async () => {
  let state = "pending";
  const db = database({ ...base, kiosk_tracking_ack_at: null });
  const api = load("src/app/api/kiosk/handoff/route.ts", { "@/lib/supabase-server": { supabaseAdmin: db }, "@/lib/kiosk/tracking": tracking, "@/lib/kiosk/server": { ...server, ownedOrder: async () => ({ id, payment_status: state }) } });
  const session = server.newSession({ id: "fixture", storeId: store });
  const request = new NextRequest("https://kiosk.test/api/kiosk/handoff", { headers: { Cookie: `${server.COOKIE}=${session}` } });
  assert.equal((await api.GET(new NextRequest(request.url))).status, 401);
  assert.equal((await api.GET(request)).status, 409); assert.equal(db.calls.length, 0);
  state = "paid";
  const response = await api.GET(request); assert.equal(response.status, 200);
  const url = new URL((await response.json()).data.url);
  assert.equal(url.origin, "https://kiosk.test"); assert.equal(url.pathname, `/orders/${id}/waiting`); assert.equal(url.search, "");
  assert.ok(url.hash.startsWith("#kiosk="));
});
