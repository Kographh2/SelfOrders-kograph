import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { NextRequest } from "next/server.js";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, name => name in overrides ? overrides[name] : require(name));
  return mod.exports;
}
const lib = load("src/lib/restaurant-ads.ts");
const auth = load("src/lib/auth.ts", {"@/lib/supabase-server":{supabaseAdmin:{}}});
const store = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const input = { storeId: store, title: "Menu istimewa", description: "Pilihan restoran", imageUrl: "https://images.example.com/photo.jpg", linkUrl: "/search", linkLabel: "Lihat menu", isActive: true, displayOrder: 0 };
const request = (method, body = input, query = `storeId=${store}`) => new NextRequest(`https://example.test/api/ads?${query}`, { method, ...(method !== "GET" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
function handler(user, rows = [], storeActive = true, fail = false) {
  const writes = [];
  const supabaseAdmin = { from(table) {
    let filters = [], patch = null, insert = false;
    const query = {
      select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, limit() { return query; },
      update(value) { patch = value; return query; }, insert(value) { patch = value; insert = true; return query; },
      result() {
        if (fail) return { error: { code: "42P01" }, data: null };
        let data = table === "stores" ? [{ id: store, is_active: storeActive }] : rows;
        data = data.filter(row => filters.every(([key, value]) => row[key] === value));
        if (patch) { writes.push({ filters, patch }); data = insert ? [{ id, ...patch }] : data.map(row => ({ ...row, ...patch })); }
        return { data, error: null };
      },
      maybeSingle: async () => { const result = query.result(); return { ...result, data: result.data?.[0] ?? null }; },
      then(resolve, reject) { return Promise.resolve(query.result()).then(resolve, reject); },
    };
    return query;
  } };
  return { writes, route: load("src/app/api/ads/route.ts", { "@/lib/restaurant-ads": lib, "@/lib/auth": { ...auth, getAuthUser: async () => user }, "@/lib/supabase-server": { supabaseAdmin } }) };
}

test("reject executable, protocol-relative, credentialed and malformed URLs", () => {
  for (const value of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "data:text/html,test", "https://user:pass@example.com", "http://example.com", "/foo\nbar"]) assert.throws(() => lib.safeAdUrl(value));
  assert.equal(lib.safeAdUrl("/search?category=coffee"), "/search?category=coffee");
  assert.equal(lib.safeAdUrl("https://example.com/menu"), "https://example.com/menu");
});
test("validate bounded content and order; hidden preferences are scoped by ad and store", () => {
  assert.equal(lib.validateAd(input).title, input.title);
  for (const patch of [{ title: "" }, { title: "x".repeat(101) }, { displayOrder: -1 }, { displayOrder: 1.1 }, { isActive: "true" }, { storeId: "bad" }]) assert.throws(() => lib.validateAd({ ...input, ...patch }));
  assert.notEqual(lib.dismissedAdKey({ id, store_id: store }), lib.dismissedAdKey({ id, store_id: other }));
});
test("public endpoint returns only active ads in the active requested store", async () => {
  const rows = [{ id, store_id: store, is_active: true }, { id: "draft", store_id: store, is_active: false }, { id: "other", store_id: other, is_active: true }];
  const { route } = handler(null, rows);
  const response = await route.GET(request("GET"));
  assert.deepEqual((await response.json()).data, [rows[0]]);
  assert.deepEqual((await (await handler(null, rows, false).route.GET(request("GET"))).json()).data, []);
});
test("anonymous, customer and cashier cannot manage or publish ads", async () => {
  for (const user of [null, { role: "user" }, { role: "kasir", storeId: store }]) {
    const { route, writes } = handler(user);
    assert.equal((await route.GET(request("GET", null, `storeId=${store}&manage=1`))).status, 403);
    assert.equal((await route.POST(request("POST"))).status, 403);
    assert.equal((await route.PATCH(request("PATCH", { ...input, id }))).status, 403);
    assert.equal(writes.length, 0);
  }
});
test("admin cannot access another store or move another store's ad", async () => {
  const { route, writes } = handler({ role: "admin", storeId: store }, [{ id, store_id: other }]);
  assert.equal((await route.POST(request("POST", { ...input, storeId: other }))).status, 403);
  assert.equal((await route.GET(request("GET", null, `storeId=${other}&manage=1`))).status, 403);
  assert.equal((await route.PATCH(request("PATCH", { ...input, id }))).status, 404);
  assert.deepEqual(writes[0].filters, [["id", id], ["store_id", store]]);
});
test("owner can publish; invalid payloads fail without writes", async () => {
  const { route, writes } = handler({ role: "owner" });
  assert.equal((await route.POST(request("POST", { ...input, linkUrl: "javascript:alert(1)" }))).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await route.POST(request("POST"))).status, 201);
  assert.equal(writes[0].patch.store_id, store);
});
test("missing migration produces a recoverable 503", async () => {
  const { route } = handler({ role: "owner" }, [], true, true);
  assert.equal((await route.GET(request("GET", null, `storeId=${store}&manage=1`))).status, 503);
});
test("SQL migration is repeatable and enforces data constraints and RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE stores(id uuid PRIMARY KEY);");
    const sql = readFileSync("MIGRATION_RESTAURANT_ADS.sql", "utf8");
    await db.exec(sql); await db.exec(sql);
    await db.query("INSERT INTO stores VALUES ($1)", [store]);
    await assert.rejects(db.query("INSERT INTO restaurant_ads(store_id,title,display_order) VALUES ($1,'Test',-1)", [store]));
    await db.query("INSERT INTO restaurant_ads(store_id,title) VALUES ($1,'Test')", [store]);
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='restaurant_ads'")).rows[0].relrowsecurity, true);
    await db.exec("SET ROLE anon");
    await assert.rejects(db.query("SELECT * FROM restaurant_ads"));
    await db.exec("RESET ROLE; SET ROLE service_role;");
    assert.equal((await db.query("SELECT * FROM restaurant_ads")).rows.length, 1);
  } finally { await db.close(); }
});
