import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { load,database,request,guard } from "../security/helpers.mjs";
const id="11111111-1111-4111-8111-111111111111",sessionId="22222222-2222-4222-8222-222222222222",secret="fixture-signing-secret";
process.env.JWT_SECRET=secret;
const accessToken=jwt.sign({session_id:sessionId}, "fixture-supabase-only");
function route(active=true,revoked=false){
 const profile={id,email:"verified@example.test",role:"kasir",store_id:id,is_active:active,auth_version:1,name:"Fixture"};
 const db=database(q=>({data:q.table==="users"?profile:q.op==="select"&&revoked?{id:sessionId,user_id:id,auth_version:1,revoked_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()}:null,error:null}));
 db.auth={getUser:async token=>({data:{user:token===accessToken?profile:null},error:null})};
 const auth=load("src/lib/auth.ts",{"@/lib/supabase-server":{supabaseAdmin:db}});
 return load("src/app/api/auth/login/route.ts",{"@/lib/auth":auth,"@/lib/supabase-server":{supabaseAdmin:db},"@/lib/request-security":guard});
}
test("UID-only, invalid bearer and mismatched identity cannot get a session",async()=>{
 const api=route();
 for(const [uid,bearer] of [[id,""],[id,"invalid"],["different",accessToken]])assert.equal((await api.POST(request("/api/auth/login","POST",{supabaseUid:uid},bearer))).status,401);
});
test("valid exchange stores JWT in HttpOnly cookie and returns no credential",async()=>{
 const response=await route().POST(request("/api/auth/login","POST",{supabaseUid:id,email:"untrusted"},accessToken));
 assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.data.token,"session");
 const cookie=response.cookies.get("selforder_account").value;
 const claims=jwt.verify(cookie,secret,{audience:"selforder-account",issuer:"selforder"});
 assert.equal(claims.email,"verified@example.test");assert.equal(claims.role,"kasir");assert.equal(claims.sessionId,sessionId);assert.equal(claims.exp-claims.iat,3600);
 assert.match(response.headers.get("set-cookie"),/HttpOnly/i);
});
test("inactive account cannot exchange a session",async()=>assert.equal((await route(false).POST(request("/api/auth/login","POST",{supabaseUid:id},accessToken))).status,403));
test("revoked Supabase session cannot resurrect itself by omitting app cookie",async()=>assert.equal((await route(true,true).POST(request("/api/auth/login","POST",{supabaseUid:id},accessToken))).status,401));
test("missing secret cannot use historical fallback",async()=>{
 const before=process.env.JWT_SECRET;delete process.env.JWT_SECRET;
 const auth=load("src/lib/auth.ts",{"@/lib/supabase-server":{supabaseAdmin:{}}});
 assert.throws(()=>auth.createToken({id,role:"owner",email:"test"}),/JWT_SECRET/);process.env.JWT_SECRET=before;
});
