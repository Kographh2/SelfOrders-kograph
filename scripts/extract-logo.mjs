// Preserve the supplied artwork and original letter-by-letter Web Animations rig.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import sharp from 'sharp';
const source=readFileSync('mascot/logo/LUUJAAA-Animated-Logo (1).html','utf8');
const image=source.match(/data-src="data:image\/png;base64,([^"]+)"/)?.[1];
if(!image)throw new Error('Expected embedded original logo PNG');
mkdirSync('public/brand',{recursive:true});
// Local responsive asset, with the original image proportions and alpha channel.
await sharp(Buffer.from(image,'base64')).resize({width:1086,withoutEnlargement:true}).webp({lossless:true}).toFile('public/brand/luujaaa-logo.webp');
const script=source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const start=script.indexOf("  'use strict';"),end=script.indexOf('  window.LuujaaaLogo = Logo;');
if(start<0||end<0)throw new Error('Logo animation source changed; review extraction');
const core=script.slice(start,end);
writeFileSync('src/lib/mascot/logo-runtime.js',`// Generated from the supplied logo studio. Speed is fixed at 1x.
export function createLuuLogo(el, options = {}) {
  if(!el.animate)return {destroy(){}};
${core}
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const logo=new Logo(el,{src:options.src||'/brand/luujaaa-logo.webp',speed:1,autoplay:false,loop:Boolean(options.loop)});
  let disposed=false;
  function update(){
    logo.reset();
    if(disposed)return;
    if(options.reducedMotion||media.matches||document.hidden){logo._set('visible');return;}
    if(options.loop)void logo.play();else void logo.enter();
  }
  // Paint a complete logo while the local image decodes, including slow devices.
  logo._set('visible');logo.ready.then(()=>{if(!disposed)update();});
  media.addEventListener('change',update);document.addEventListener('visibilitychange',update);
  return {destroy(){disposed=true;media.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);logo.destroy();}};
}
`);
const css=source.match(/<style>([\s\S]*?)\n\n\*/)?.[1];
if(!css)throw new Error('Logo CSS missing');
writeFileSync('src/lib/mascot/logo.css',css+'\n');
console.log('Extracted original embedded PNG and animation at 1x (no studio controls).');
