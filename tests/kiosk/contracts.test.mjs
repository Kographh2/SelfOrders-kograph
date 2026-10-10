import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

// Load the pure TS contract using the project's existing compiler; no runner dependency.
const code = ts.transpileModule(readFileSync("src/lib/kiosk/contracts.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", "require", code)(mod, mod.exports, createRequire(import.meta.url));
const { parseCheckout, kioskTotals, linePrice } = mod.exports;
const id = "11111111-1111-4111-8111-111111111111";
const input = () => ({ requestId: id, mode: "takeaway", tableId: null, expectedTotal: 22200, policyIds: [], items: [{ menu_item_id: id, quantity: 1, option_ids: [], notes: "" }] });
test("rejects invalid counts, totals, ids and unbounded notes", () => {
  for (const quantity of [0, -1, 1.5, 21, NaN, "1"]) assert.throws(() => parseCheckout({ ...input(), items: [{ ...input().items[0], quantity }] }));
  assert.throws(() => parseCheckout({ ...input(), requestId: "bad" }));
  assert.throws(() => parseCheckout({ ...input(), expectedTotal: Infinity }));
  assert.throws(() => parseCheckout({ ...input(), mode: "dine_in" }));
  assert.throws(() => parseCheckout({ ...input(), items: [{ ...input().items[0], notes: "a".repeat(201) }] }));
});
test("client prices are discarded and takeaway never carries a table", () => {
  const result = parseCheckout({ ...input(), tableId: id, items: [{ ...input().items[0], price: 1, option_ids: ["b", "a", "b"] }] });
  assert.equal(result.tableId, null); assert.equal(result.items[0].price, undefined); assert.deepEqual(result.items[0].option_ids, ["a", "b"]);
});
test("preview includes options and matches branch tax/service calculation", () => {
  const unit = linePrice({ price: 20000, option_groups: [{ options: [{ id: "large", price_delta: 5000 }] }] }, ["large"]);
  assert.equal(unit, 25000);
  assert.deepEqual(kioskTotals(unit, { tax_rate: .11, service_charge_rate: .05 }), { subtotal: 25000, tax: 2750, service: 1250, total: 29000 });
});
