// One self-contained artifact for both React recovery and document navigation.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>readFileSync(path,'utf8');
const art=JSON.parse(read('src/lib/mascot/luu-art.json'));
const inline=['src/lib/mascot/luu-runtime.js','src/lib/connection-monitor.js','src/lib/offline/game.js','src/lib/offline/recovery.js'].map(path=>read(path).replace(/export function /g,'function ')).join('\n');
const html=read('src/lib/offline/recovery.template.html').replace('__RECOVERY_CSS__',()=>read('src/lib/offline/recovery.css')).replace('__LUU_SVG__',()=>art.drained).replace('__RECOVERY_JS__',()=>inline);
writeFileSync('public/offline.html',html);
// Updating art or recovery behavior must also update the imported worker script.
const revision=createHash('sha256').update(html).digest('hex').slice(0,12);
writeFileSync('public/offline-worker.js',read('public/offline-worker.js').replace(/const RECOVERY_CACHE = "[^"]+";/,`const RECOVERY_CACHE = "selforder-recovery-v2-luu-${revision}";`));
console.log('Generated local Luu recovery document; no external assets.');
