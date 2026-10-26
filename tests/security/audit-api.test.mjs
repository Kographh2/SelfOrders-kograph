// Regression assertions: pass means the original exploit is rejected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { load, database, request, guard } from "./helpers.mjs";
process.env.JWT_SECRET="isolated-security-test-secret";
const admin={id:"11111111-1111-4111-8111-111111111111",email:"fixture@example.test",role:"admin",storeId:"store-a",sessionId:"22222222-2222-4222-8222-222222222222",version:1};
function fixture(resolve, role="admin"){
 const profile={...admin,role,is_active:true,store_id:"store-a",auth_version:1};
 const db=database(q=>q.table==="app_sessions"?{data:{id:admin.sessionId},error:null}:q.table==="users"&&q.columns?.includes("auth_version")?{data:profile,error:null}:resolve(q));
 const auth=load("src/lib/auth.ts",{"@/lib/supabase-server":{supabaseAdmin:db}});
 const token=auth.createToken({...admin,role});
 return {db,auth,token,profile,base:{"@/lib/auth":auth,"@/lib/supabase-server":{supabaseAdmin:db},"@/lib/audit":{writeAudit:async()=>{}},"@/lib/push-notifications":{notifyOrderStatus:async()=>{}},"@/lib/loyalty-order":{finalizeLoyaltyRedemption:async()=>{}},"@/lib/request-security":guard}};
}
test("A03: admin cannot mutate owner or foreign user; unassigned admin cannot list all users",async()=>{
 let writes=0;const f=fixture(q=>{if(q.op!=="select")writes++;return {data:{id:"owner-b",role:"owner",store_id:"store-b"},error:null};});
 const api=load("src/app/api/users/route.ts",f.base);
 assert.equal((await api.PATCH(request("/api/users","PATCH",{userId:"owner-b",role:"user",storeId:"store-a"},f.token))).status,403);
 assert.equal(writes,0);f.profile.store_id=null;
 assert.equal((await api.GET(request("/api/users","GET",undefined,f.token))).status,403);
});
test("A04: active identity resolves from database; deactivation/version mismatch fail closed",async()=>{
 const f=fixture(()=>({data:null,error:null}));
 assert.equal((await f.auth.getAuthUser(request("/api/users","GET",undefined,f.token))).role,"admin");
 f.profile.is_active=false;assert.equal(await f.auth.getAuthUser(request("/api/users","GET",undefined,f.token)),null);
 f.profile.is_active=true;f.profile.auth_version=2;assert.equal(await f.auth.getAuthUser(request("/api/users","GET",undefined,f.token)),null);
 f.profile.auth_version=1;f.profile.role="user";
 assert.equal((await f.auth.getAuthUser(request("/api/users","GET",undefined,f.token))).role,"user");
});
test("A05: foreign inventory id is rejected without a write",async()=>{
 let writes=0;const f=fixture(q=>{if(q.op!=="select")writes++;return {data:null,error:null};});
 const api=load("src/app/api/inventory/route.ts",f.base);
 assert.equal((await api.POST(request("/api/inventory","POST",{id:"foreign",storeId:"store-a",name:"Changed",unit:"g",stock_quantity:0},f.token))).status,404);
 assert.equal(writes,0);
});
test("A06: body user id cannot register a push subscription without identity",async()=>{
 const f=fixture(()=>{throw Error("No DB access expected");});
 const api=load("src/app/api/push/subscribe/route.ts",{...f.base,"@/lib/guest-session":{guestSession:()=>null},"@/lib/push-security":load("src/lib/push-security.ts")});
 assert.equal((await api.POST(request("/api/push/subscribe","POST",{userId:"victim",endpoint:"https://example.test/push"}))).status,401);
});
test("A06: outbound endpoints reject local, credential, port and arbitrary hosts",()=>{
 const {validPushEndpoint}=load("src/lib/push-security.ts");
 for(const url of ["http://127.0.0.1/x","https://example.test/x","https://fcm.googleapis.com:8443/x","https://user@fcm.googleapis.com/x"])assert.equal(validPushEndpoint(url),false,url);
 assert.equal(validPushEndpoint("https://fcm.googleapis.com/fcm/send/fixture"),true);
});
test("A07: customer projection excludes raw callback and signature",async()=>{
 const f=fixture(q=>{if(q.table==="orders"){assert.ok(!q.columns.includes("*"));assert.ok(!q.columns.includes("snap_data"));return {data:{id:"order",user_id:admin.id,payments:[{status:"pending"}]},error:null};}return {data:null,error:null};},"user");
 const api=load("src/app/api/orders/[orderId]/route.ts",{...f.base,"@/lib/public-fields":load("src/lib/public-fields.ts")});
 assert.equal((await api.GET(request("/api/orders/order","GET",undefined,f.token),{params:Promise.resolve({orderId:"order"})})).status,200);
});
test("A07: valid signature with forged settlement uses authoritative pending status",async()=>{
 process.env.MIDTRANS_SERVER_KEY="fixture-midtrans-secret";
 const id="33333333-3333-4333-8333-333333333333";let calls=0;let settled;
 const db={rpc:async(name,args)=>{assert.equal(name,"settle_verified_payment");settled=args;return {data:{payment_status:args.p_status},error:null};}};
 const midtrans=load("src/lib/midtrans.ts",{"midtrans-client":{Snap:class{transaction={status:async reference=>{calls++;return {order_id:reference,gross_amount:"25000.00",transaction_status:"pending"};}};}}});
 const reconcile=load("src/lib/payment-reconciliation.ts",{"@/lib/supabase-server":{supabaseAdmin:db},"@/lib/midtrans":midtrans,"@/lib/push-notifications":{notifyOrderStatus:async()=>{}}});
 const api=load("src/app/api/payment/notification/route.ts",{"@/lib/request-security":guard,"@/lib/midtrans":midtrans,"@/lib/payment-reconciliation":reconcile});
 const event={order_id:id,status_code:"201",gross_amount:"25000.00",transaction_status:"settlement",signature_key:createHash("sha512").update(id+"20125000.00"+process.env.MIDTRANS_SERVER_KEY).digest("hex")};
 assert.equal((await api.POST(request("/api/payment/notification","POST",event))).status,200);
 assert.equal(calls,1);assert.equal(settled.p_status,"pending");assert.equal(settled.p_provider.signature_key,undefined);
});
test("A07: mismatched provider reference and provider failure never settle",async()=>{
 let writes=0;
 for(const status of [async()=>({order_id:"wrong",gross_amount:25000}),async()=>{throw Error("offline");}]){
 const reconcile=load("src/lib/payment-reconciliation.ts",{"@/lib/supabase-server":{supabaseAdmin:{rpc:async()=>{writes++;}}},"@/lib/midtrans":{snap:{transaction:{status}}},"@/lib/push-notifications":{notifyOrderStatus:async()=>{}}});
 await assert.rejects(reconcile.reconcilePayment("33333333-3333-4333-8333-333333333333"));
 }assert.equal(writes,0);
});
test("A10: management catalog denies foreign branch and public hidden menu is unavailable",async()=>{
 const f=fixture(q=>{if(q.table==="menu_items"){assert.ok(q.filters.some(v=>v[0]==="eq"&&v[1]==="show_on_menu"&&v[2]===true));assert.ok(!q.columns.includes("*"));}return {data:null,error:null};});
 const modules={...f.base,"@/lib/menu-options":load("src/lib/menu-options.ts"),"@/lib/menu-metadata":load("src/lib/menu-metadata.ts"),"@/lib/menu-schedule":load("src/lib/menu-schedule.ts"),"@/lib/public-fields":load("src/lib/public-fields.ts")};
 const list=load("src/app/api/menu/items/route.ts",modules),detail=load("src/app/api/menu/items/[itemId]/route.ts",modules);
 assert.equal((await list.GET(request("/api/menu/items?management=true&storeId=store-b","GET",undefined,f.token))).status,403);
 assert.equal((await list.GET(request("/api/menu/items?management=true&storeId=store-a"))).status,403);
 assert.equal((await detail.GET(request("/api/menu/items/hidden"),{params:Promise.resolve({itemId:"hidden"})})).status,404);
});

test("manual reconciliation denies foreign branch and resolves only stored order reference",async()=>{
 let refs=[];let branch="store-b";
 const f=fixture(()=>({data:{id:"33333333-3333-4333-8333-333333333333",store_id:branch,payment_method:"snap"},error:null}));
 const api=load("src/app/api/payment/reconcile/route.ts",{...f.base,"@/lib/payment-reconciliation":{reconcilePayment:async id=>refs.push(id)}});
 assert.equal((await api.POST(request("/api/payment/reconcile","POST",{orderId:"order"},f.token))).status,404);
 assert.deepEqual(refs,[]);branch="store-a";
 assert.equal((await api.POST(request("/api/payment/reconcile","POST",{orderId:"order",reference:"forged"},f.token))).status,200);
 assert.deepEqual(refs,["33333333-3333-4333-8333-333333333333"]);
});

test("A09: cashier schedule query restricts attendance to its own staff id",async()=>{
 const f=fixture(q=>{if(q.table==="staff_attendance")assert.ok(q.filters.some(x=>x[0]==="eq"&&x[1]==="staff_id"&&x[2]===admin.id));return {data:[],error:null};},"kasir");
 const api=load("src/app/api/staff-schedules/route.ts",f.base);
 const response=await api.GET(request("/api/staff-schedules","GET",undefined,f.token));
 assert.equal(response.status,200);assert.deepEqual((await response.json()).data.attendance,[]);
});
