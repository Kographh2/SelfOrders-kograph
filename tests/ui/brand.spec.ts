import {test,expect} from '@playwright/test';
const store={id:'brand-store',name:'Luu Kitchen',is_open:true};
async function fixtures(page:import('@playwright/test').Page,closed=false){
 await page.addInitScript(()=>{localStorage.setItem('notification_prompt_seen','1');localStorage.setItem('install_prompt_dismissed','1');});
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  return route.fulfill({json:{data:path==='/api/stores'?[store]:path==='/api/stores/brand-store'?{...store,is_open:!closed,next_open_label:'besok pukul 08.00'}:path==='/api/menu/items'?[{id:'coffee',name:'Kopi Luu',price:20000,is_available:true}]:[]}});
 });
}

test('logo loading tracks real requests; original letter timing stays at 1x',async({page})=>{
 await fixtures(page);
 await page.addInitScript(()=>{
  (window as any).logoTimings=[];(window as any).logoAnimations=[];const original=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){
   if(this.classList.contains('luu-layer'))(window as any).logoTimings.push(options);
   const animation=original.call(this,frames,options);
   if(this.classList.contains('luu-layer'))(window as any).logoAnimations.push({node:this,animation});
   return animation;
  };
 });
 let releaseStores!:()=>void,releaseItems!:()=>void;
 const stores=new Promise<void>(resolve=>releaseStores=resolve),items=new Promise<void>(resolve=>releaseItems=resolve);
 await page.route('**/api/stores',async route=>{await stores;await route.fulfill({json:{data:[store]}});});
 await page.route('**/api/menu/items?*',async route=>{await items;await route.fulfill({json:{data:[{id:'coffee',name:'Kopi Luu',price:20000,is_available:true}]}});});
 await page.goto('/menu?store=brand-store',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.menu-loading [role="status"]')).toHaveText('Memuat informasi toko…');
 await expect(page.locator('.menu-loading [data-brand-logo]')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).logoTimings.some((t:any)=>t.duration===480&&t.delay===600))).toBe(true);
 releaseStores();await expect(page.locator('.menu-loading [role="status"]')).toHaveText('Memuat menu dan ketersediaan…');
 await page.setViewportSize({width:320,height:740});
 await page.screenshot({path:'artifacts/ui/logo-loading.png'});
 releaseItems();await expect(page.getByRole('heading',{name:'Luu Kitchen',exact:true})).toBeVisible();
 await expect(page.locator('.menu-loading')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).logoAnimations.filter((entry:any)=>!entry.node.isConnected).every((entry:any)=>entry.animation.playState==='idle'))).toBe(true);
 await expect(page.locator('.site-brand-header [data-brand-logo]')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('closed store uses Sleeping and local logo on a small dark screen',async({page})=>{
 await fixtures(page,true);await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('selforder_theme','dark'));
 await page.setViewportSize({width:320,height:740});await page.goto('/menu?store=brand-store');
 await expect(page.getByRole('heading',{name:'Toko sedang tutup'})).toBeVisible();
 await expect(page.locator('[data-luu-pose="sleeping"]')).toBeVisible();
 await expect(page.getByText('Buka kembali besok pukul 08.00')).toBeVisible();
 const logo=page.locator('.site-brand-header [data-brand-logo]');await expect(logo).toBeVisible();
 await expect.poll(()=>logo.locator('img').evaluateAll(images=>images.length===9&&images.every(img=>(img as HTMLImageElement).naturalWidth>0))).toBe(true);
 expect(await logo.evaluate(node=>node.getAnimations({subtree:true}).length)).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/ui/luu-sleeping.png'});
});

test('shared logo stays upper-left through repeated page changes and reduced motion',async({page})=>{
 await fixtures(page);await page.emulateMedia({reducedMotion:'reduce'});
 for(const path of ['/profile','/settings','/orders','/login','/profile']){
  await page.goto(path);const logo=page.locator('.site-brand-header [data-brand-logo]');await expect(logo).toBeVisible();
  const box=await logo.boundingBox();expect(box!.x).toBeLessThan(80);expect(box!.y).toBeLessThan(40);
  await expect(logo).toHaveAttribute('data-speed','1');
 }
});
