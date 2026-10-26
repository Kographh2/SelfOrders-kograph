import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {createHash} from "node:crypto";

const script = readFileSync(new URL("../../public/offline-worker.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../../public/offline.html", import.meta.url), "utf8");
test("offline cache revision follows its entire self-contained document",()=>{
  assert.ok(script.includes('selforder-recovery-v2-luu-'+createHash('sha256').update(html).digest('hex').slice(0,12)));
});
function worker(fetch, cached = true) {
  const listeners = {};
  vm.runInNewContext(script, {
    self: { location: { origin: "https://selforder.test" }, addEventListener: (name, callback) => { listeners[name] = callback; } },
    caches: { match: async () => cached ? new Response(html) : undefined },
    URL, Response, AbortController, setTimeout, clearTimeout, fetch,
  });
  return request => {
    let promise;
    listeners.fetch({ request: { method: "GET", mode: "navigate", url: "https://selforder.test/menu", ...request }, respondWith: value => { promise = value; } });
    return promise;
  };
}
test("navigation network failures serve a self-contained offline game", async () => {
  const response = await worker(async () => { throw new TypeError("Network failed"); })({});
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.match(body, /data-recovery-mode="offline"/);
  assert.match(body, /Pasangkan menunya/);
  assert.doesNotMatch(body, /<script[^>]+src=|<link[^>]+rel="stylesheet"|<img /);
});
test("missing cached document returns an honest reconnect response", async () => {
  const response = await worker(async () => { throw new TypeError("Network failed"); }, false)({});
  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type"), /text\/plain/);
  assert.match(await response.text(), /Sambungkan internet/);
});
test("HTTP 503 serves a service-error page; successful and 404 responses pass through", async () => {
  const response = await worker(async () => new Response("unavailable", { status: 503 }))({});
  assert.match(await response.text(), /data-recovery-mode="error"/);
  for (const status of [200, 404]) {
    const original = new Response("original", { status });
    assert.equal(await worker(async () => original)({}), original);
  }
});
test("API, mutations, external requests, and RSC requests are never intercepted or replayed", () => {
  const handle = worker(() => { throw new Error("Must not fetch"); });
  for (const request of [{ url: "https://selforder.test/api/orders" }, { method: "POST" }, { url: "https://payments.test/checkout" }, { mode: "cors" }]) {
    assert.equal(handle(request), undefined);
  }
});
