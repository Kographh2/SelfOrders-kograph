import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

let db;
let store, otherStore, category, table, menu, policy;
before(async () => {
  db = new PGlite({ extensions: { pgcrypto, "uuid-ossp": uuid_ossp } });
  // Supabase-owned namespaces only. All application DDL/RPCs below are real.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const file of ["schema.sql", "MIGRATION_SELFORDER_2026.sql", "MIGRATION_SELFORDER_FEATURES.sql", "MIGRATION_SELFORDER_ADVANCED.sql", "MIGRATION_SELFORDER_OPERATIONS.sql", "MIGRATION_SELFORDER_KIOSK.sql"]) {
    try { await db.exec(await readFile(file, "utf8")); }
    catch (error) { throw new Error(`${file}: ${error.message}`); }
  }
  store = randomUUID(); otherStore = randomUUID(); category = randomUUID(); table = randomUUID(); menu = randomUUID(); policy = randomUUID();
  await db.query("INSERT INTO stores(id,name,address,phone,email,tax_rate) VALUES($1,'Test branch','Test','0','fixture@example.test',0.11),($2,'Other branch','Test','0','other@example.test',0.11)", [store, otherStore]);
  await db.query("INSERT INTO categories(id,store_id,name) VALUES($1,$2,'Coffee')", [category, store]);
  await db.query("INSERT INTO tables(id,store_id,number) VALUES($1,$2,1)", [table, store]);
  await db.query("INSERT INTO menu_items(id,store_id,category_id,name,price,track_stock,stock_quantity,option_groups) VALUES($1,$2,$3,'Coffee',20000,true,100,$4::jsonb)", [menu, store, category, JSON.stringify([{ id: "size", name: "Size", min_select: 1, max_select: 1, options: [{ id: "regular", name: "Regular", price_delta: 0 }, { id: "large", name: "Large", price_delta: 5000 }] }])]);
  await db.query("INSERT INTO store_documents(id,store_id,document_type,version,title,content,status) VALUES($1,$2,'terms',1,'Terms','Fixture terms','published')", [policy, store]);
});
after(async () => { await db?.close(); });
const makeInput = (patch = {}) => ({ store, sid: randomUUID(), rid: randomUUID(), hash: randomUUID(), table, mode: "dine_in", items: [{ menu_item_id: menu, quantity: 1, option_ids: ["regular"], notes: "" }], policies: [policy], total: 22200, ...patch });
async function create(input) {
  const { rows } = await db.query("SELECT create_kiosk_order($1,'test-station',$2,$3,$4,$5,$6,$7::jsonb,$8::uuid[],$9) AS result", [input.store, input.sid, input.rid, input.hash, input.table, input.mode, JSON.stringify(input.items), input.policies, input.total]);
  return rows[0].result.order_id;
}
async function stock() { return Number((await db.query("SELECT stock_quantity FROM menu_items WHERE id=$1", [menu])).rows[0].stock_quantity); }
async function order(id) { return (await db.query("SELECT * FROM orders WHERE id=$1", [id])).rows[0]; }
async function settle(id, status, amount = 22200) { return db.query("SELECT settle_kiosk_payment($1,$2,$3,'fixture-transaction')", [id, amount, status]); }

test("real migrations apply and kiosk migration is repeatable", async () => {
  await db.exec(await readFile("MIGRATION_SELFORDER_KIOSK.sql", "utf8"));
});
test("retry preserves order, queue number, stock and policy acceptance", async () => {
  const input = makeInput(); const beforeStock = await stock();
  const ids = await Promise.all([create(input), create(input), create(input)]);
  assert.equal(new Set(ids).size, 1);
  assert.equal(await stock(), beforeStock - 1);
  assert.equal(Number((await db.query("SELECT count(*) FROM policy_acceptances WHERE order_id=$1", [ids[0]])).rows[0].count), 1);
  const saved = await order(ids[0]);
  assert.equal(saved.store_id, store); assert.ok(saved.order_number > 0);
  assert.equal(saved.anonymous_session_id, null);
  await assert.rejects(create({ ...input, hash: "changed" }), /sudah memiliki pesanan/);
});
test("server price mismatch rolls back order and reserved stock", async () => {
  const beforeStock = await stock();
  await assert.rejects(create(makeInput({ total: 1 })), /Harga berubah/);
  assert.equal(await stock(), beforeStock);
});
test("table and menu cannot cross branch boundaries", async () => {
  await assert.rejects(create(makeInput({ store: otherStore })), /cabang/);
});
test("required options, fractional quantities and insufficient stock are rejected", async () => {
  await assert.rejects(create(makeInput({ items: [{ menu_item_id: menu, quantity: 1, option_ids: [] }] })), /Pilihan/);
  await assert.rejects(create(makeInput({ items: [{ menu_item_id: menu, quantity: 1.5, option_ids: ["regular"] }] })), /Jumlah/);
  const beforeStock = await stock();
  await db.query("UPDATE menu_items SET stock_quantity=0 WHERE id=$1", [menu]);
  await assert.rejects(create(makeInput()), /Stok/);
  await db.query("UPDATE menu_items SET stock_quantity=$2 WHERE id=$1", [menu, beforeStock]);
});
test("missing or stale policy rolls back the entire transaction", async () => {
  const beforeStock = await stock();
  await assert.rejects(create(makeInput({ policies: [] })), /Kebijakan/);
  assert.equal(await stock(), beforeStock);
});
test("option price is calculated by existing atomic RPC", async () => {
  const id = await create(makeInput({ mode: "takeaway", table: null, items: [{ menu_item_id: menu, quantity: 1, option_ids: ["large"] }], total: 27750 }));
  const saved = await order(id);
  assert.equal(Number(saved.total_amount), 27750);
  assert.equal(saved.order_type, "pickup"); assert.equal(saved.pickup_at, null);
  assert.match((await db.query("SELECT notes FROM order_items WHERE order_id=$1", [id])).rows[0].notes, /Size: Large/);
});
test("unpaid kiosk order cannot enter kitchen processing", async () => {
  const id = await create(makeInput());
  await assert.rejects(db.query("UPDATE orders SET status='preparing' WHERE id=$1", [id]), /Bayar pesanan/);
});
test("only one worker can claim provider initialization", async () => {
  const id = await create(makeInput());
  const claim = () => db.query("UPDATE orders SET kiosk_payment_state='creating',payment_method='snap' WHERE id=$1 AND kiosk_payment_state='idle' RETURNING id", [id]);
  const results = await Promise.all([claim(), claim()]);
  assert.equal(results.reduce((sum, result) => sum + result.rows.length, 0), 1);
  await assert.rejects(db.query("UPDATE orders SET payment_method='cash' WHERE id=$1", [id]), /dialihkan/);
  await assert.rejects(db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [id]), /Midtrans/);
});
test("amount mismatch fails; valid settlement is atomic and idempotent", async () => {
  const id = await create(makeInput());
  await assert.rejects(settle(id, "paid", 1), /Nominal/);
  assert.equal((await order(id)).payment_status, "pending");
  await settle(id, "paid");
  await db.query("UPDATE orders SET status='preparing' WHERE id=$1", [id]);
  await settle(id, "paid"); await settle(id, "pending"); await settle(id, "expired");
  const saved = await order(id);
  assert.equal(saved.payment_status, "paid"); assert.equal(saved.status, "preparing");
  assert.equal((await db.query("SELECT status FROM payments WHERE order_id=$1", [id])).rows[0].status, "paid");
});
test("expiration releases stock once and late settlement needs review", async () => {
  const beforeStock = await stock(); const id = await create(makeInput());
  await settle(id, "expired"); await settle(id, "expired");
  assert.equal(await stock(), beforeStock);
  await assert.rejects(settle(id, "paid"), /rekonsiliasi/);
});
test("cleanup expires old drafts but keeps issued/uncertain payments", async () => {
  const draft = await create(makeInput()); const issued = await create(makeInput());
  await db.query("UPDATE orders SET created_at=now()-interval '31 minutes' WHERE id=ANY($1::uuid[])", [[draft, issued]]);
  await db.query("UPDATE orders SET kiosk_payment_state='uncertain' WHERE id=$1", [issued]);
  await db.query("SELECT expire_unpaid_kiosk_drafts()");
  assert.equal((await order(draft)).payment_status, "expired");
  assert.equal((await order(issued)).payment_status, "pending");
});
test("public and authenticated roles cannot execute financial kiosk RPCs", async () => {
  const { rows } = await db.query("SELECT has_function_privilege('anon','create_kiosk_order(uuid,text,uuid,uuid,text,uuid,text,jsonb,uuid[],numeric)','EXECUTE') AS a, has_function_privilege('authenticated','settle_kiosk_payment(uuid,numeric,text,text)','EXECUTE') AS b");
  assert.equal(rows[0].a, false); assert.equal(rows[0].b, false);
});
test("reserved table and inactive category cannot be ordered", async () => {
  const reservation = randomUUID();
  await db.query("INSERT INTO reservations(id,store_id,customer_name,phone,party_size,reserved_for,hold_until,table_id) VALUES($1,$2,'Fixture','000',1,now(),now()+interval '15 minutes',$3)", [reservation, store, table]);
  await assert.rejects(create(makeInput()), /direservasi/);
  await db.query("UPDATE reservations SET status='cancelled' WHERE id=$1", [reservation]);
  await db.query("UPDATE categories SET is_active=false WHERE id=$1", [category]);
  await assert.rejects(create(makeInput()), /Menu tidak tersedia/);
  await db.query("UPDATE categories SET is_active=true WHERE id=$1", [category]);
});
test("scheduled and manually closed branches reject checkout", async () => {
  await db.query("UPDATE menu_items SET available_from='00:01',available_until='00:02',available_days='{}' WHERE id=$1", [menu]);
  await assert.rejects(create(makeInput()), /jam ini/);
  await db.query("UPDATE menu_items SET available_from=null,available_until=null,available_days='{0,1,2,3,4,5,6}' WHERE id=$1", [menu]);
  await db.query("UPDATE stores SET manual_closed=true WHERE id=$1", [store]);
  await assert.rejects(create(makeInput()), /tutup/);
  await db.query("UPDATE stores SET manual_closed=false WHERE id=$1", [store]);
});
test("ingredient shortage rolls back menu stock; expiration restores both", async () => {
  const ingredient = randomUUID(); const beforeStock = await stock();
  await db.query("INSERT INTO ingredients(id,store_id,name,unit,stock_quantity) VALUES($1,$2,'Fixture milk','ml',100)", [ingredient, store]);
  await db.query("INSERT INTO menu_item_recipes(menu_item_id,ingredient_id,quantity_per_item) VALUES($1,$2,150)", [menu, ingredient]);
  await assert.rejects(create(makeInput()), /Bahan baku/);
  assert.equal(await stock(), beforeStock);
  await db.query("UPDATE ingredients SET stock_quantity=300 WHERE id=$1", [ingredient]);
  const id = await create(makeInput());
  assert.equal(Number((await db.query("SELECT stock_quantity FROM ingredients WHERE id=$1", [ingredient])).rows[0].stock_quantity), 150);
  await settle(id, "expired");
  assert.equal(Number((await db.query("SELECT stock_quantity FROM ingredients WHERE id=$1", [ingredient])).rows[0].stock_quantity), 300);
  assert.equal(await stock(), beforeStock);
  await db.query("DELETE FROM menu_item_recipes WHERE ingredient_id=$1", [ingredient]);
});
test("KIOSK history survives deletion attempts and refund status is allowed", async () => {
  const id = await create(makeInput());
  await assert.rejects(db.query("DELETE FROM orders WHERE id=$1", [id]), /Riwayat KIOSK/);
  await settle(id, "paid");
  await db.query("UPDATE orders SET payment_status='refunded' WHERE id=$1", [id]);
  assert.equal((await order(id)).payment_status, "refunded");
});
