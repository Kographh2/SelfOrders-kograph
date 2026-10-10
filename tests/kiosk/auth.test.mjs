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
const id = "11111111-1111-4111-8111-111111111111";
const secret = "isolated-auth-test-key-not-a-real-secret";
process.env.JWT_SECRET = secret;
const auth = load("src/lib/auth.ts");
const request = (uid = id, bearer = "fixture-access-token") => new NextRequest("https://example.test/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify({ supabaseUid: uid, email: "untrusted@example.test" }) });
function route(active = true) {
  const user = { id, email: "verified@example.test", role: "kasir", store_id: id, is_active: active, name: "Fixture" };
  const supabaseAdmin = {
    auth: {
      getUser: async token => token === "fixture-access-token" ? { data: { user }, error: null } : { data: { user: null }, error: new Error("Invalid") },
      admin: { getUserById: async () => ({ data: { user }, error: null }) },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: user, error: null }) }) }) }),
  };
  return load("src/app/api/auth/login/route.ts", { "@/lib/supabase-server": { supabaseAdmin }, "@/lib/auth": auth });
}
test("UID-only, invalid bearer and mismatched Supabase identity cannot get a JWT", async () => {
  const handler = route();
  assert.equal((await handler.POST(request(id, ""))).status, 401);
  assert.equal((await handler.POST(request(id, "invalid"))).status, 401);
  assert.equal((await handler.POST(request("22222222-2222-4222-8222-222222222222"))).status, 401);
});
test("valid Supabase exchange preserves database role/store and ignores client email", async () => {
  const response = await route().POST(request());
  assert.equal(response.status, 200);
  const result = await response.json();
  const claims = jwt.verify(result.data.token, secret);
  assert.equal(claims.role, "kasir"); assert.equal(claims.storeId, id);
  assert.equal(claims.email, "verified@example.test");
});
test("inactive staff account remains rejected", async () => {
  assert.equal((await route(false).POST(request())).status, 403);
});
test("missing JWT signing secret cannot use the historical fallback", async () => {
  delete process.env.JWT_SECRET;
  const noSecret = load("src/lib/auth.ts");
  assert.throws(() => noSecret.createToken({ id, email: "fixture@example.test", role: "owner" }), /JWT_SECRET/);
  const legacy = jwt.sign({ userId: id, role: "owner" }, "change-this-secret-in-production-immediately");
  assert.equal(await noSecret.getAuthUser(new NextRequest("https://example.test/api/orders", { headers: { Authorization: `Bearer ${legacy}` } })), null);
});
