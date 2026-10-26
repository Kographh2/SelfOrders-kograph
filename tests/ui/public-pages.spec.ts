import {test,expect} from '@playwright/test';
const policies={documents:['terms','privacy','refund'].map((kind,index)=>({id:kind,document_type:kind,title:['Ketentuan pemesanan','Kebijakan privasi','Pembatalan & pengembalian dana'][index],content:'Periksa rincian pesanan sebelum membayar. Hubungi petugas cabang untuk bantuan dan informasi lebih lanjut.',version:1,published_at:'2026-10-26T00:00:00Z'})),faqs:[{id:'faq',question:'Bagaimana mengikuti pesanan?',answer:'Buka halaman status pesanan untuk melihat pembaruan dari cabang.'}]};
for(const theme of ['light','dark'])test(`help and payment have readable navy surfaces in ${theme}`,async({page})=>{
 await page.addInitScript(theme=>localStorage.setItem('selforder_theme',theme),theme);
 await page.setViewportSize({width:320,height:740});
 await page.route('**/api/**',route=>route.fulfill({json:{data:new URL(route.request().url()).pathname==='/api/policies'?policies:[]}}));
 await page.goto('/help');
 await expect(page.getByRole('heading',{name:'Bantuan & ketentuan'})).toBeVisible();
 await expect(page.locator('.public-doc')).toHaveCount(3);
 await page.getByText('Bagaimana mengikuti pesanan?',{exact:true}).click();
 await expect(page.getByText(policies.faqs[0].answer)).toBeVisible();
 const contrast=await page.locator('.public-doc').first().evaluate(node=>{
  const rgb=(s:string)=>s.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  const luminance=(s:string)=>{const [r,g,b]=rgb(s);return .2126*r+.7152*g+.0722*b;};
  const a=luminance(getComputedStyle(node).color),b=luminance(getComputedStyle(node.closest('.public-card')!).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 });expect(contrast).toBeGreaterThanOrEqual(4.5);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/ui/help-${theme}.png`,fullPage:true});
 await page.goto('/payment/finish?orderId=invalid');
 await expect(page.getByRole('heading',{name:'Pesanan tidak ditemukan'})).toBeVisible();
 await expect(page.locator('.public-card')).toHaveCSS('background-color',theme==='dark'?'rgb(18, 34, 56)':'rgb(255, 255, 255)');
 await page.screenshot({path:`artifacts/ui/payment-${theme}.png`});
});

test('public identity, app icons, crawl controls and private-page exclusion are served',async({request})=>{
 const manifest=await (await request.get('/manifest.json')).json();expect(manifest.name).toBe('Luujaaa.id');expect(manifest.icons.some((icon:{purpose:string})=>icon.purpose==='maskable')).toBe(true);
 for(const path of ['/favicon.ico','/favicon-48.png','/apple-touch-icon.png','/icon-192.png','/icon-maskable-512.png'])expect((await request.get(path)).status()).toBe(200);
 const about=await request.get('/about');expect(await about.text()).toContain('Luujaaa.id');
 const robots=await request.get('/robots.txt');expect(robots.status()).toBe(200);expect(await robots.text()).toContain('Disallow: /');
 const sitemap=await request.get('/sitemap.xml');expect(sitemap.status()).toBe(200);expect(await sitemap.text()).not.toContain('/orders');
 for(const path of ['/payment/finish?orderId=invalid','/profile','/menu?table=9'])expect((await request.get(path)).headers()['x-robots-tag']).toContain('noindex');
});
