// Security regressions against a disposable database with legacy grants.
// Fully disposable PGlite database. No network or hosted database access.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
let db;
const user = "11111111-1111-4111-8111-111111111111";
const store = "22222222-2222-4222-8222-222222222222";
before(async () => {
  db = new PGlite({ extensions: { pgcrypto, "uuid-ossp": uuid_ossp } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const file of ["schema.sql", "MIGRATION_SELFORDER_2026.sql", "MIGRATION_SELFORDER_FEATURES.sql", "MIGRATION_SELFORDER_ADVANCED.sql", "MIGRATION_SELFORDER_OPERATIONS.sql", "MIGRATION_SELFORDER_KIOSK.sql", "MIGRATION_SELFORDER_KIOSK_SETTINGS.sql", "MIGRATION_KIOSK_HANDOFF.sql", "MIGRATION_RESTAURANT_ADS.sql", "MIGRATION_TELEGRAM_RESERVATION_OTP.sql", "MIGRATION_TELEGRAM_OTP_AUTO_DELIVERY.sql"]) {
    await db.exec(await readFile(file, "utf8"));
  }
  await db.query("INSERT INTO auth.users(id) VALUES($1)", [user]);
  await db.query("INSERT INTO users(id,email,role) VALUES($1,'fixture@example.test','user')", [user]);
  await db.query("INSERT INTO stores(id,name,address,phone,email) VALUES($1,'Fixture','Fixture','0','fixture@example.test')", [store]);
  await db.query("INSERT INTO wallets(user_id,balance) VALUES($1,0)", [user]);
  // Explicit deployment assumption: legacy Supabase grants on public tables.
  // Repository migrations do NOT establish those grants; hosted ACLs must be inspected.
  await db.exec("GRANT USAGE ON SCHEMA public,auth TO anon,authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated;");
  // Reproduce deploying operations before the transaction migration (SQL 42703).
  assert.equal((await db.query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='payment_attempt_state'")).rows[0].count,0);
  await db.exec(await readFile("MIGRATION_OPERATIONS_20261024.sql","utf8"));
  assert.equal((await db.query("SELECT operations_summary(NULL) result")).rows[0].result.uncertain,0);
  for(const file of ["MIGRATION_SECURITY_20261024.sql","MIGRATION_TRANSACTIONS_20261024.sql","MIGRATION_CHECKOUT_20261024.sql","MIGRATION_OPERATIONS_20261024.sql","MIGRATION_PUBLIC_CONTENT_20261026.sql"])await db.exec(await readFile(file,"utf8"));
});
const menu="44444444-4444-4444-8444-444444444444";
const category="55555555-5555-4555-8555-555555555555";
let counter=0;
async function checkout(extra={}) {
 const key=`66666666-6666-4666-8666-${String(++counter).padStart(12,"0")}`;
 const payload={store_id:store,user_id:user,guest:null,name:"Fixture",order_type:"pickup",pickup_at:new Date(Date.now()+3600000).toISOString(),ready_at:new Date(Date.now()+3600000).toISOString(),policy_accepted:true,items:[{menu_item_id:menu,quantity:1}],...extra};
 const {rows}=await db.query("SELECT checkout_order($1,$2,$3,$4) result",[key,user,"a".repeat(64),JSON.stringify(payload)]);
 return {result:rows[0].result,key,payload};
}
test("checkout rolls back stock and order on an invalid discount; repeated request is idempotent",async()=>{
 await db.query("INSERT INTO categories(id,store_id,name) VALUES($1,$2,'Food')",[category,store]);
 await db.query("INSERT INTO menu_items(id,store_id,category_id,name,price,track_stock,stock_quantity) VALUES($1,$2,$3,'Fixture',25000,true,50)",[menu,store,category]);
 await assert.rejects(checkout({promo_claim_id:"77777777-7777-4777-8777-777777777777"}));
 assert.equal((await db.query("SELECT stock_quantity FROM menu_items WHERE id=$1",[menu])).rows[0].stock_quantity,50);
 const {result,key,payload}=await checkout();
 const replay=await db.query("SELECT checkout_order($1,$2,$3,$4) result",[key,user,"a".repeat(64),JSON.stringify(payload)]);
 assert.equal(replay.rows[0].result.order_id,result.order_id);
 assert.equal((await db.query("SELECT stock_quantity FROM menu_items WHERE id=$1",[menu])).rows[0].stock_quantity,49);
 await assert.rejects(db.query("SELECT checkout_order($1,$2,$3,$4)",[key,user,"b".repeat(64),JSON.stringify(payload)]),/different cart/);
});
test("operations migration reruns without resetting payment attempts and counts uncertain orders",async()=>{
 const {result}=await checkout();
 assert.equal((await db.query("SELECT payment_attempt_state FROM orders WHERE id=$1",[result.order_id])).rows[0].payment_attempt_state,"idle");
 await assert.rejects(db.query("UPDATE orders SET payment_attempt_state='invalid' WHERE id=$1",[result.order_id]),/check constraint/);
 await db.query("UPDATE orders SET payment_attempt_state='uncertain' WHERE id=$1",[result.order_id]);
 await db.exec(await readFile("MIGRATION_OPERATIONS_20261024.sql","utf8"));
 assert.equal((await db.query("SELECT payment_attempt_state FROM orders WHERE id=$1",[result.order_id])).rows[0].payment_attempt_state,"uncertain");
 assert.equal((await db.query("SELECT operations_summary($1) result",[store])).rows[0].result.uncertain,1);
 await db.query("UPDATE orders SET payment_attempt_state='idle' WHERE id=$1",[result.order_id]);
});

test("verified settlement rejects amount mismatch and is idempotent without status regression",async()=>{
 const {result}=await checkout();const id=result.order_id,amount=result.total_amount;
 await db.query("UPDATE orders SET payment_method='snap' WHERE id=$1",[id]);
 await assert.rejects(db.query("SELECT settle_verified_payment($1,$2,'paid','tx','{}')",[id,Number(amount)+1]),/mismatch/);
 await db.query("SELECT settle_verified_payment($1,$2,'paid','tx','{}')",[id,amount]);
 await db.query("UPDATE orders SET status='completed' WHERE id=$1",[id]);
 const replay=await db.query("SELECT settle_verified_payment($1,$2,'paid','tx','{}') result",[id,amount]);
 assert.equal(replay.rows[0].result.changed,false);
 await db.query("SELECT settle_verified_payment($1,$2,'pending','tx','{}')",[id,amount]);
 assert.equal((await db.query("SELECT status FROM orders WHERE id=$1",[id])).rows[0].status,"completed");
 assert.equal((await db.query("SELECT status FROM payments WHERE order_id=$1",[id])).rows[0].status,"paid");
});
test("cancelled wallet order rolls back the debit and ledger",async()=>{
 const {result}=await checkout();
 await db.query("UPDATE wallets SET balance=100000 WHERE user_id=$1",[user]);
 await db.query("UPDATE orders SET status='cancelled' WHERE id=$1",[result.order_id]);
 await assert.rejects(db.query("SELECT wallet_pay_order($1,$2)",[user,result.order_id]),/Cancelled/);
 assert.equal(Number((await db.query("SELECT balance FROM wallets WHERE user_id=$1",[user])).rows[0].balance),100000);
 assert.equal((await db.query("SELECT * FROM wallet_transactions WHERE reference_id=$1",[result.order_id])).rows.length,0);
});
test("split attempt is reserved once; correct amount settles all parts atomically",async()=>{
 const {result}=await checkout();const total=Number(result.total_amount),first=Math.floor(total/2);
 const bill=await db.query("SELECT create_split_bill($1,$2,'fixture-hash',$3) id",[result.order_id,user,JSON.stringify([first,total-first])]);
 const parts=(await db.query("SELECT * FROM split_bill_parts WHERE split_bill_id=$1 ORDER BY id",[bill.rows[0].id])).rows;
 for(let i=0;i<parts.length;i++){
   const ref="SPLIT-fixture-"+parts[i].id;
   assert.equal((await db.query("SELECT reserve_split_attempt($1,$2) ok",[parts[i].id,ref])).rows[0].ok,true);
   assert.equal((await db.query("SELECT reserve_split_attempt($1,$2) ok",[parts[i].id,ref+"-duplicate"])).rows[0].ok,false);
   await db.query("SELECT settle_verified_payment($1,$2,'paid','tx','{}')",[ref,parts[i].amount]);
 }
 assert.equal((await db.query("SELECT payment_status FROM orders WHERE id=$1",[result.order_id])).rows[0].payment_status,"paid");
});
test("identity change revokes persisted sessions",async()=>{
 const session="88888888-8888-4888-8888-888888888888";
 await db.query("INSERT INTO app_sessions(id,user_id,auth_version) VALUES($1,$2,1)",[session,user]);
 await db.query("UPDATE users SET is_active=false WHERE id=$1",[user]);
 const row=(await db.query("SELECT revoked_at FROM app_sessions WHERE id=$1",[session])).rows[0];
 assert.ok(row.revoked_at);
 assert.equal((await db.query("SELECT auth_version FROM users WHERE id=$1",[user])).rows[0].auth_version,2);
 await db.query("UPDATE users SET is_active=true WHERE id=$1",[user]);
});
test("OTP reservation admits at most five parallel attempts",async()=>{
 const otp=(await db.query("INSERT INTO telegram_reservation_otps(phone,status,expires_at) VALUES('+628123456789','sent',now()+interval '5 minutes') RETURNING id")).rows[0].id;
 const calls=await Promise.all(Array.from({length:10},()=>db.query("SELECT reserve_otp_attempt($1) attempt",[otp])));
 assert.equal(calls.filter(r=>r.rows[0].attempt!==null).length,5);
});
test("manual refund commits order, payment and audit together and rejects duplicate completion",async()=>{
 const owner="99999999-9999-4999-8999-999999999999";
 await db.query("INSERT INTO auth.users(id) VALUES($1)",[owner]);
 await db.query("INSERT INTO users(id,email,role) VALUES($1,'owner@example.test','owner')",[owner]);
 const {result}=await checkout();
 await db.query("UPDATE orders SET payment_method='cash',payment_status='paid',status='confirmed' WHERE id=$1",[result.order_id]);
 await db.query("UPDATE payments SET method='cash',status='paid' WHERE order_id=$1",[result.order_id]);
 const refund=(await db.query("INSERT INTO refund_requests(order_id,store_id,amount,reason) VALUES($1,$2,$3,'Fixture') RETURNING id",[result.order_id,store,result.total_amount])).rows[0].id;
 await assert.rejects(db.query("SELECT complete_manual_refund($1,$2,'proof')",[refund,user]),/Owner/);
 await assert.rejects(db.query("SELECT complete_manual_refund($1,$2,'')",[refund,owner]),/evidence/);
 await db.query("SELECT complete_manual_refund($1,$2,'receipt fixture')",[refund,owner]);
 await assert.rejects(db.query("SELECT complete_manual_refund($1,$2,'receipt fixture')",[refund,owner]),/state changed/);
 assert.equal((await db.query("SELECT payment_status FROM orders WHERE id=$1",[result.order_id])).rows[0].payment_status,"refunded");
 assert.equal((await db.query("SELECT status FROM payments WHERE order_id=$1",[result.order_id])).rows[0].status,"refunded");
 assert.equal((await db.query("SELECT count(*) FROM audit_logs WHERE action='refund.manual_complete' AND entity_id=$1",[refund])).rows[0].count,1);
});

test("missing policy acceptance rolls back checkout stock",async()=>{
 const doc=(await db.query("INSERT INTO store_documents(store_id,document_type,version,title,content,status) VALUES($1,'terms',1,'Terms','Fixture','published') RETURNING id",[store])).rows[0].id;
 const stock=(await db.query("SELECT stock_quantity FROM menu_items WHERE id=$1",[menu])).rows[0].stock_quantity;
 await assert.rejects(checkout({policy_accepted:false}),/kebijakan/);
 assert.equal((await db.query("SELECT stock_quantity FROM menu_items WHERE id=$1",[menu])).rows[0].stock_quantity,stock);
 await db.query("DELETE FROM store_documents WHERE id=$1",[doc]);
});

after(async () => { await db?.close(); });
async function asRole(role, fn) {
  await db.exec(`SET ROLE ${role}`);
  try { return await fn(); } finally { await db.exec("RESET ROLE"); }
}

test("AUDIT A01: financial tables enforce RLS after the checked-in migrations", async () => {
  const { rows } = await db.query("SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('wallets','wallet_transactions','wallet_topups','withdrawal_requests','order_feedback') ORDER BY relname");
  assert.equal(rows.length, 5);
  assert.ok(rows.every(row => row.relrowsecurity));
});

test("AUDIT A01: anon cannot change wallet balance", async () => {
  const before=Number((await db.query("SELECT balance FROM wallets WHERE user_id=$1", [user])).rows[0].balance);
  await assert.rejects(asRole("anon", () => db.query("UPDATE wallets SET balance=999999 WHERE user_id=$1", [user])), /permission denied/);
  assert.equal(Number((await db.query("SELECT balance FROM wallets WHERE user_id=$1", [user])).rows[0].balance), before);
});

test("AUDIT A02: anon cannot insert an already-paid order outside checkout RPC", async () => {
  const order = "33333333-3333-4333-8333-333333333333";
  await assert.rejects(asRole("anon", () => db.query("INSERT INTO orders(id,store_id,order_number,subtotal,total_amount,payment_status,status) VALUES($1,$2,999,1,1,'paid','confirmed')", [order, store])), /permission denied/);
});

test("AUDIT A08: own profile read succeeds without policy recursion", async () => {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  const result=await asRole("authenticated", () => db.query("SELECT id,role FROM users WHERE id=$1", [user]));
  assert.equal(result.rows[0].role,"user");
  await assert.rejects(asRole("authenticated",()=>db.query("UPDATE users SET role='owner' WHERE id=$1",[user])),/permission denied/);
});

test("catalog and store management cannot bypass API visibility or session revocation via Data API",async()=>{
 await assert.rejects(asRole("anon",()=>db.query("SELECT * FROM menu_items")),/permission denied/);
 for(const table of ["stores","categories","menu_items","tables","store_settings"]){
  const result=await db.query("SELECT has_table_privilege('authenticated',$1,'UPDATE') allowed",[table]);
  assert.equal(result.rows[0].allowed,false,table);
 }
});

test("public content seed preserves edits and deletions, and settings are not writable through public roles",async()=>{
 const first=await db.query("SELECT id FROM store_faqs WHERE id='e0261026-0000-4000-8000-000000000001'");assert.equal(first.rows.length,1);
 await db.exec("UPDATE store_faqs SET answer='Owner edited this answer' WHERE id='e0261026-0000-4000-8000-000000000001'; DELETE FROM store_faqs WHERE id='e0261026-0000-4000-8000-000000000008'; UPDATE public_site_settings SET settings=jsonb_set(settings,'{businessName}','\"Owner brand\"');");
 await db.exec(await readFile("MIGRATION_PUBLIC_CONTENT_20261026.sql","utf8"));
 assert.equal((await db.query("SELECT answer FROM store_faqs WHERE id='e0261026-0000-4000-8000-000000000001'")).rows[0].answer,"Owner edited this answer");
 assert.equal((await db.query("SELECT count(*) FROM store_faqs WHERE id='e0261026-0000-4000-8000-000000000008'")).rows[0].count,0);
 assert.equal((await db.query("SELECT settings->>'businessName' name FROM public_site_settings")).rows[0].name,"Owner brand");
 assert.equal((await db.query("SELECT count(*) FROM store_documents WHERE store_id IS NULL AND status='published'")).rows[0].count,3);
 for(const role of ['anon','authenticated'])await assert.rejects(asRole(role,()=>db.exec("UPDATE public_site_settings SET settings='{}'")),/permission denied/);
});
