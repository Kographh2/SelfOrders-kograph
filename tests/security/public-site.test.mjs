import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load,database,request,guard} from './helpers.mjs';
const config=load('src/lib/public-site-config.ts');
test('public settings require a canonical HTTPS origin and a plain verification token',()=>{
 const defaults=config.PUBLIC_SITE_DEFAULTS;
 assert.equal(config.validatePublicSite(defaults).indexingEnabled,false);
 for(const publicUrl of ['javascript:alert(1)','http://example.com','https://user:pass@example.com','https://example.com/orders?token=secret'])assert.throws(()=>config.validatePublicSite({...defaults,publicUrl}));
 assert.throws(()=>config.validatePublicSite({...defaults,indexingEnabled:true}));
 assert.throws(()=>config.validatePublicSite({...defaults,googleVerification:'<meta name="bad">'}));
 assert.equal(config.validatePublicSite({...defaults,publicUrl:'https://example.com/',indexingEnabled:true}).publicUrl,'https://example.com');
});

test('crawl settings publish only public canonical URLs when indexing is enabled',async()=>{
 let site={...config.PUBLIC_SITE_DEFAULTS,publicUrl:'https://luujaaa.example'};
 const imports={'@/lib/public-site':{getPublicSite:async()=>site}};
 const robots=load('src/app/robots.ts',imports).default,sitemap=load('src/app/sitemap.ts',imports).default;
 assert.equal((await robots()).rules.disallow,'/');assert.deepEqual(await sitemap(),[]);
 site.indexingEnabled=true;
 assert.equal((await robots()).sitemap,'https://luujaaa.example/sitemap.xml');
 assert.deepEqual((await sitemap()).map(r=>r.url),['https://luujaaa.example/menu','https://luujaaa.example/help','https://luujaaa.example/about']);
});

test('global FAQ drafts are owner-only and a scoped admin cannot delete global content',async()=>{
 let user=null;const queries=[];
 const route=load('src/app/api/policies/route.ts',{
  '@/lib/auth':{getAuthUser:async()=>user,isOwnerOrAdmin:u=>['owner','admin'].includes(u?.role),hasStoreAccess:()=>true},
  '@/lib/audit':{writeAudit:async()=>{}},
  '@/lib/supabase-server':{supabaseAdmin:database(q=>{queries.push(q);return {data:q.filters.some(f=>f[0]==='maybeSingle')?{id:'faq',store_id:null}:[],error:null};})},
 });
 await route.GET(request('/api/policies?includeDraft=1'));
 assert.ok(queries.find(q=>q.table==='store_faqs').filters.some(f=>f[0]==='eq'&&f[1]==='is_published'&&f[2]===true));
 user={role:'admin',storeId:'assigned',userId:'admin'};queries.length=0;
 assert.equal((await route.DELETE(request('/api/policies?faqId=faq','DELETE'))).status,404);
 assert.equal(queries.filter(q=>q.op==='delete').length,0);
 user={role:'owner',storeId:'assigned',userId:'owner'};queries.length=0;
 const result=await route.POST(request('/api/policies','POST',{action:'faq',id:'faq',storeId:null,question:'Question here?',answer:'Owner edited answer',publish:false}));
 assert.equal(result.status,200);assert.equal(queries.find(q=>q.op==='update').payload.store_id,null);
});
test('only an owner from the same origin can persist public settings; storage errors never claim success',async()=>{
 let role='admin',origin=true,fail=false,writes=0;const tags=[];
 const route=load('src/app/api/public-site/route.ts',{
  '@/lib/auth':{getAuthUser:async()=>({role,userId:'fixture-owner'})},'@/lib/request-security':{...guard,sameOrigin:()=>origin},'@/lib/public-site-config':config,
  'next/cache':{revalidateTag:tag=>tags.push(tag)},'@/lib/supabase-server':{supabaseAdmin:database(q=>{if(q.op==='upsert')writes++;return {data:null,error:fail?{message:'unavailable'}:null};})},
 });
 const save=()=>route.PUT(request('/api/public-site','PUT',config.PUBLIC_SITE_DEFAULTS));
 assert.equal((await save()).status,403);assert.equal(writes,0);
 role='owner';origin=false;assert.equal((await save()).status,403);assert.equal(writes,0);
 origin=true;fail=true;assert.equal((await save()).status,503);assert.equal(tags.length,0);
 fail=false;assert.equal((await save()).status,200);assert.deepEqual(tags,['public-site']);
});
