// Deterministic extraction of the supplied art and rig; no studio DOM or events.
import {readFileSync, readdirSync, writeFileSync, mkdirSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const files=readdirSync('mascot').filter(name=>name.endsWith('-Mascot-Studio-V2.html'));
if(files.length!==1)throw new Error('Expected one Mascot Studio V2 source');
const source=readFileSync('mascot/'+files[0],'utf8');
const svg=source.match(/<svg id="luu"[\s\S]*?<\/svg>/)?.[0];
if(!svg)throw new Error('Source SVG missing');
const script=source.match(/<script>([\s\S]*?)<\/script>/)[1];
const ast=ts.createSourceFile('studio.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let held;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='HELD')held=node.initializer;ts.forEachChild(node,visit)}visit(ast);
const poses={drained:'p_drained',thinking:'thinking',confused:'p_confused',celebrating:'p_celebrating',sleeping:'p_sleeping'};
const entries=Object.entries(poses).map(([key,original])=>`${key}:${held.properties.find(p=>p.name.getText(ast)===original).initializer.getText(ast)}`);
const constants=script.slice(script.indexOf('  const PI ='),script.indexOf('  const motionQuery'));
const defaults=script.slice(script.indexOf('  const D ='),script.indexOf('  let time ='));
const samples=script.slice(script.indexOf('  function jump('),script.indexOf('  const HELD'));
const geometry=script.slice(script.indexOf('  function armD('),script.indexOf('  function target()'));
const runtime=`// Generated from mascot/${files[0]}. Run node scripts/extract-luu.mjs; do not edit geometry.
export function createLuu(svg, options = {}) {
  const $ = id => svg.querySelector('[data-luu-part="'+id+'"]');
${constants}
  const PROPS = 'mount pillow lock book flag pen laptop blanket q spark wave battery heart zzz puff lines swirl conf'.split(' ');
  const propNodes = Object.fromEntries(PROPS.map(key => [key, $('p_' + key)]));
  const propWeights = Object.fromEntries(PROPS.map(key => [key, 0]));
${defaults}
  let time=0, disposed=false, frame=null, last=0, visible=true;
  let current=options.pose||'drained';
  const doc=svg.ownerDocument, win=doc?.defaultView;
  const media=win?.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>Boolean(options.reducedMotion||media?.matches);
${samples}
  const HELD={${entries.join(',\n')}};
${geometry}
  function sample(snap=false, dt=1/30) {
    const goal=HELD[current](reduced()?0:time);
    if(current==='drained'&&!reduced())goal.sy+=.0018*Math.sin(time*.8);
    // Celebrate briefly, then hold the original smile without looping jumps.
    if(current==='celebrating'&&time>2.7){goal.y=0;goal.sx=1;goal.sy=1;goal.props=['spark'];}
    for(const key of numericKeys)cur[key]=snap?goal[key]:mix(cur[key],goal[key],1-Math.exp(-dt*13));
    for(const key of PROPS)propWeights[key]=goal.props.includes(key)?1:0;
    draw(snap||reduced());
  }
  sample(true);
  if(options.staticOnly)return {destroy(){},setPose(){}};
  function stop(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;last=0;}
  function tick(now){
    frame=null;if(disposed||doc.hidden||!visible||reduced())return;
    const dt=last?Math.min(.05,(now-last)/1000):1/30;
    if(!last||dt>=1/30){last=now;time+=dt;sample(false,dt);}
    frame=win.requestAnimationFrame(tick);
  }
  function wake(){stop();if(disposed)return;if(reduced()){time=0;sample(true);}else if(!doc.hidden&&visible)frame=win.requestAnimationFrame(tick);}
  media?.addEventListener('change',wake);doc.addEventListener('visibilitychange',wake);
  const observer=win.IntersectionObserver?new win.IntersectionObserver(entries=>{visible=entries[0].isIntersecting;wake();}):null;
  observer?.observe(svg);wake();
  return {setPose(pose){if(HELD[pose]){current=pose;time=0;wake();}},destroy(){disposed=true;stop();observer?.disconnect();media?.removeEventListener('change',wake);doc.removeEventListener('visibilitychange',wake);}};
}
`;
mkdirSync('src/lib/mascot',{recursive:true});
writeFileSync('src/lib/mascot/luu-runtime.js',runtime);
const context={};vm.runInNewContext(runtime.replace('export function','function')+';globalThis.render=createLuu;',context);
const snapshots={};
for(const pose of Object.keys(poses)){
 const nodes={};for(const match of svg.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
  const attrs={};for(const a of match[0].matchAll(/([\w:-]+)="([^"]*)"/g))attrs[a[1]]=a[2];
  nodes[match[1]]={attrs,getAttribute:k=>attrs[k]??null,setAttribute:(k,v)=>attrs[k]=String(v),children:[]};
 }
 nodes.dots.children=Array.from({length:3},()=>({getAttribute:()=>null,setAttribute(){}}));
 context.render({querySelector:selector=>nodes[selector.match(/"([^"]+)"/)[1]]},{pose,staticOnly:true,reducedMotion:true});
 snapshots[pose]=svg.replace(/<([^\s>]+)([^>]*\bid="([^"]+)"[^>]*)>/g,(tag,name,rest,id)=>{
  const attrs=Object.entries(nodes[id].attrs).map(([k,v])=>`${k}="${v.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`).join(' ');
  return '<'+name+' '+attrs+' data-luu-part="'+id+'"'+(tag.endsWith('/>')?'/>':'>');
 });
}
writeFileSync('src/lib/mascot/luu-art.json',JSON.stringify(snapshots));
console.log('Extracted original SVG, geometry and five application poses.');
