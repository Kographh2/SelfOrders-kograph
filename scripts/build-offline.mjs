// One self-contained artifact for both React recovery and document navigation.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>readFileSync(path,'utf8');
const art=JSON.parse(read('src/lib/mascot/luu-art.json'));
const inline=['src/lib/mascot/luu-runtime.js','src/lib/mascot/logo-runtime.js','src/lib/connection-monitor.js','src/lib/offline/game.js','src/lib/offline/recovery.js'].map(path=>read(path).replace(/export function /g,'function ')).join('\n');
const logo='data:image/webp;base64,'+readFileSync('public/brand/luujaaa-logo.webp').toString('base64');
const logoMarkup=`<span class="luu-logo" style="width:120px"><span id="brand-logo" role="img" aria-label="Luujaaa" style="display:block;width:100%;aspect-ratio:3/1"><img alt="" src="${logo}" width="1086" height="362" style="width:100%;height:auto"></span></span>`;
const html=read('src/lib/offline/recovery.template.html').replace('__RECOVERY_CSS__',()=>read('src/lib/offline/recovery.css')+'\n'+read('src/lib/mascot/logo.css')+'\n.luu-logo{display:block;background:white;padding:3px 5px;border-radius:9px;flex-shrink:0}.luu-logo .luu{width:100%}')
 .replace('__LUU_LOGO__',()=>logoMarkup).replace('__LUU_SVG__',()=>art.drained).replace('__RECOVERY_JS__',()=>inline);
writeFileSync('public/offline.html',html);
// Updating art or recovery behavior must also update the imported worker script.
const revision=createHash('sha256').update(html).digest('hex').slice(0,12);
writeFileSync('public/offline-worker.js',read('public/offline-worker.js').replace(/const RECOVERY_CACHE = "[^"]+";/,`const RECOVERY_CACHE = "selforder-recovery-v2-luu-${revision}";`));
console.log('Generated local Luu recovery document; no external assets.');
