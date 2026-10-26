import {test,expect} from '@playwright/test';
import {readFileSync,readdirSync} from 'node:fs';
const store={id:'luu-store',name:'Luu Kitchen',is_open:true};
async function catalog(page:import('@playwright/test').Page){
 await page.addInitScript(()=>{localStorage.setItem('notification_prompt_seen','1');localStorage.setItem('install_prompt_dismissed','1');});
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/connection')return route.fulfill({json:{reachable:true}});
  return route.fulfill({json:{data:path==='/api/stores'?[store]:path==='/api/stores/luu-store'?store:path==='/api/menu/items'?[{id:'luu-coffee',name:'Kopi Luu',description:'Kopi susu',price:20000,is_available:true}]:path==='/api/guest-session'?{id:'fixture-guest'}:[]}});
 });
}
test('original Drained geometry is preserved; local offline art has no missing joints',async({page})=>{
 const name=readdirSync('mascot').find(name=>name.endsWith('-Mascot-Studio-V2.html'))!;
 await page.route('**/mascot-reference',route=>route.fulfill({contentType:'text/html',body:readFileSync('mascot/'+name,'utf8')}));
 await page.goto('/mascot-reference');
 await page.evaluate(()=>{(window as any).LuuStudio.seek('p_drained',0);});
 const ids=['bodyFill','armLbf','armRbf','legLf','legRf','eyePathL','eyePathR'];
 const geometry=await page.evaluate(ids=>ids.map(id=>document.getElementById(id)?.getAttribute('d')),ids);
 await page.locator('#frame').screenshot({path:'artifacts/ui/luu-reference.png'});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/connection',route=>route.abort());
 await page.goto('/offline');
 const frame=page.frameLocator('iframe[title="Pemulihan koneksi bersama Luu"]');
 for(let i=0;i<ids.length;i++)await expect(frame.locator(`[data-luu-part="${ids[i]}"]`)).toHaveAttribute('d',geometry[i]!);
 await frame.locator('#mascot').screenshot({path:'artifacts/ui/luu-drained.png'});
 await expect(frame.locator('[data-luu-part="grayAmount"]')).toHaveAttribute('values','0');
});
test('repeated disconnects recover without reload and preserve a typed search',async({page,context})=>{
 await catalog(page);await page.goto('/search?store=luu-store');
 await page.getByRole('textbox',{name:'Cari makanan atau minuman'}).fill('tidak ada ini');
 await expect(page.locator('[data-luu-pose="confused"]')).toBeVisible();
 await page.evaluate(()=>{(window as any).draftMarker='same document';});
 for(let i=0;i<2;i++){
  await context.setOffline(true);
  const frame=page.frameLocator('iframe[title="Pemulihan koneksi bersama Luu"]');
  await expect(frame.getByRole('heading',{name:'Koneksi lagi terputus'})).toBeVisible();
  await expect(frame.locator('#saved')).toBeHidden();
  await expect(frame.locator('#empty-draft')).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('iframe[title="Pemulihan koneksi bersama Luu"]')).toHaveCount(0,{timeout:12000});
  await expect(page.getByRole('textbox')).toHaveValue('tidak ada ini');
  await page.getByRole('textbox').fill('tidak ada ini');
  await expect(page.getByRole('textbox')).toBeFocused();
  expect(await page.evaluate(()=>(window as any).draftMarker)).toBe('same document');
 }
 await page.getByRole('link',{name:'Menu',exact:true}).click();
 await page.getByRole('link',{name:'Cari',exact:true}).click();
 await page.getByRole('textbox',{name:'Cari makanan atau minuman'}).fill('xxx');
 await expect(page.locator('[data-luu-pose="confused"]')).toHaveCount(1);
 const ids=await page.locator('[data-luu-pose] [id]').evaluateAll(nodes=>nodes.map(n=>n.id));expect(new Set(ids).size).toBe(ids.length);
});
test('only a real saved draft is available offline, with timestamp and notes',async({page,context})=>{
 await catalog(page);
 await page.addInitScript(()=>sessionStorage.setItem('selforder_order_draft',JSON.stringify({version:1,savedAt:Date.now(),order:{storeId:'luu-store',orderType:'pickup',table:'',reservation:'',pickupAt:''},cart:[{id:'luu-coffee',name:'Kopi Luu',price:20000,quantity:2,notes:'Tanpa gula, sedikit es'}]})));
 await page.goto('/cart');await expect(page.getByRole('heading',{name:'Keranjang',exact:true})).toBeVisible();
 await context.setOffline(true);
 const frame=page.frameLocator('iframe[title="Pemulihan koneksi bersama Luu"]');
 await frame.getByText('Lihat draf tersimpan',{exact:true}).click();
 await expect(frame.locator('#draft')).toContainText('2 × Kopi Luu');await expect(frame.locator('#draft')).toContainText('Tanpa gula, sedikit es');
 await expect(frame.locator('#draft-updated')).toContainText('Draf tersimpan');
 await expect(frame.locator('#empty-draft')).toBeHidden();
 await context.setOffline(false);await expect(page.getByRole('heading',{name:'Keranjang',exact:true})).toBeVisible();
 await expect(page.getByText('Tanpa gula, sedikit es',{exact:true})).toBeVisible();
});
test('timeout has a bounded single check; access denial stays on its page',async({page})=>{
 let checks=0;
 await page.route('**/api/connection',async route=>{checks++;await new Promise(resolve=>setTimeout(resolve,7000));await route.abort().catch(()=>{});});
 await page.goto('/offline');const frame=page.frameLocator('iframe[title="Pemulihan koneksi bersama Luu"]');
 await frame.getByRole('button',{name:'Coba lagi',exact:true}).click();
 await expect(frame.getByRole('button',{name:'Memeriksa koneksi…'})).toBeDisabled();
 await expect(frame.locator('#network')).toHaveText('Layanan belum siap',{timeout:9000});expect(checks).toBe(1);
 await page.route('**/api/stores',route=>route.fulfill({status:403,json:{error:'forbidden'}}));await page.goto('/menu');
 await expect(page.getByText('Halaman ini belum dapat diakses.',{exact:false})).toBeVisible();
 await expect(page.locator('iframe[title="Pemulihan koneksi bersama Luu"]')).toHaveCount(0);
});

test('slow catalog uses only the animated wordmark; a covered recovery never polls twice',async({page,context})=>{
 await catalog(page);
 await page.route('**/api/stores',async route=>{await new Promise(resolve=>setTimeout(resolve,1600));await route.fulfill({json:{data:[store]}});});
 await page.goto('/menu?store=luu-store');
 await expect(page.locator('.menu-loading [data-brand-logo]')).toBeVisible();
 await expect(page.locator('.menu-loading [data-luu-pose]')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Luu Kitchen',exact:true})).toBeVisible();
 await expect(page.locator('[data-luu-pose="thinking"]')).toHaveCount(0);
 await page.route('**/api/stores',route=>route.fulfill({status:503,json:{error:'unavailable'}}));
 let probes=0;await page.route('**/api/connection',route=>{probes++;return route.abort();});
 await page.goto('/menu?store=luu-store');
 await expect(page.locator('iframe[title="Pemulihan koneksi bersama Luu"]')).toHaveCount(1);
 await context.setOffline(true);
 await expect(page.frameLocator('iframe[title="Pemulihan koneksi bersama Luu"]').getByRole('heading',{name:'Koneksi lagi terputus'})).toBeVisible();
 await expect.poll(()=>probes).toBe(1);
 await expect(page.locator('iframe[title="Pemulihan koneksi bersama Luu"]')).toHaveCount(1);
});
