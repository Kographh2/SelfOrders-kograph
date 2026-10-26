// Generated from mascot/LUUJAAA-Mascot-Studio-V2.html. Run node scripts/extract-luu.mjs; do not edit geometry.
export function createLuu(svg, options = {}) {
  const $ = id => svg.querySelector('[data-luu-part="'+id+'"]');
  const PI = Math.PI, sin = Math.sin;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const n = v => (+v.toFixed(3));
  const attr = (el, name, value) => {
    value = String(value);
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };
  const transform = (el, value) => attr(el, 'transform', value);
  const path = (el, value) => attr(el, 'd', value);
  const opacity = (el, value) => attr(el, 'opacity', n(clamp(value)));

  const PROPS = 'mount pillow lock book flag pen laptop blanket q spark wave battery heart zzz puff lines swirl conf'.split(' ');
  const propNodes = Object.fromEntries(PROPS.map(key => [key, $('p_' + key)]));
  const propWeights = Object.fromEntries(PROPS.map(key => [key, 0]));
  const D = Object.freeze({
    x:0, y:0, sx:1, sy:1, lean:0, head:0, hx:0, hy:0, earL:0, earR:0,
    tail:0, sit:0, sleep:0, lX:98, lY:251, rX:202, rY:251,
    bendL:-5, bendR:5, frontL:0, frontR:0, legL:0, legR:0,
    eye:1, wide:1, wink:0, closedCurve:-7, gazeX:0, gazeY:0,
    smile:.85, open:0, round:0, brows:0, browL:0, browR:0, browY:0, gray:0, burn:0, dots:0
  });
  const numericKeys = Object.keys(D);
  const cur = {...D};

  let time=0, disposed=false, frame=null, last=0, visible=true;
  let current=options.pose||'drained';
  const doc=svg.ownerDocument, win=doc?.defaultView;
  const media=win?.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>Boolean(options.reducedMotion||media?.matches);
  function jump(t, period, height) {
    const u = ((t % period) + period) % period;
    if (u < .15) {
      const k = smooth(u / .15);
      return {y:0, sy:1 - .055*k, sx:1 + .035*k};
    }
    if (u < .71) {
      const k = (u - .15) / .56, lift = sin(PI*k);
      return {y:-height*lift, sy:1 + .035*lift, sx:1 - .02*lift};
    }
    if (u < 1.03) {
      const k = (u - .71) / .32, settle = sin(PI*k) * Math.exp(-3*k);
      return {y:0, sy:1 - .07*settle, sx:1 + .045*settle};
    }
    return {y:0, sy:1, sx:1};
  }
  function pose(spec) {
    return t => ({...D, sy:1 + .006*sin(t*1.8),
      tail:5*sin(t*1.3), earL:sin(t*.7), earR:-sin(t*.8), props:[],
      ...(typeof spec === 'function' ? spec(t) : spec)});
  }

  const HELD={drained:pose(t => ({sy:.96, hy:7, head:7, eye:.15, smile:-.85,
      closedCurve:5, lX:100, lY:268, rX:200, rY:268, earL:-11, earR:11,
      gray:1, tail:-9, brows:.65, browL:-11, browR:11, props:['lines','puff']})),
thinking:pose(t => ({head:7, gazeX:2.5, gazeY:-3.5, eye:.88,
      rX:145, rY:199, bendR:-12, frontR:1, lY:256,
      brows:.7, browL:-5, browR:8, smile:-.12, props:['q']})),
confused:pose(t => ({head:-7 + .5*sin(t), gazeX:3, gazeY:-1,
      eye:.9, smile:-.5, brows:.85, browL:-6, browR:11, props:['q']})),
celebrating:pose(t => ({...jump(t,1.5,28), lX:68, lY:195,
      rX:232, rY:195, bendL:-9, bendR:9, eye:0, open:1,
      smile:1, earL:6, earR:-6, legL:2, legR:7, props:['conf','spark']})),
sleeping:pose(t => ({sleep:1, eye:0, closedCurve:5, smile:.65,
      lX:110, lY:249, rX:190, rY:253, tail:-5,
      sy:1+.005*sin(t*1.2), props:['pillow','blanket','zzz']}))};
  function armD(side, c) {
    const left = side === 'L';
    const A = [left ? 111 : 189, 211+c.sit*8];
    const B = [c[left ? 'lX':'rX'], c[left ? 'lY':'rY']];
    const delta = [B[0]-A[0], B[1]-A[1]];
    const len = Math.hypot(...delta) || 1;
    const normal = [-delta[1]/len, delta[0]/len];
    const bend = c[left ? 'bendL':'bendR'];
    const C = [(A[0]+B[0])/2 + normal[0]*bend, (A[1]+B[1])/2 + normal[1]*bend];
    const norm = (x,y) => {const d=Math.hypot(x,y)||1; return [-y/d,x/d];};
    const N0=norm(C[0]-A[0],C[1]-A[1]), N1=norm(B[0]-C[0],B[1]-C[1]);
    const rootW=12.5, r=10.2;
    const offset=(p,k,w) => [p[0]+k[0]*w,p[1]+k[1]*w];
    const p0=offset(A,N0,rootW), p1=offset(C,normal,11.5), p2=offset(B,N1,r);
    const q0=offset(A,N0,-rootW),q1=offset(C,normal,-11.5),q2=offset(B,N1,-r);
    const pt=p=>n(p[0])+' '+n(p[1]);
    const cap=`A${r} ${r} 0 0 0 ${pt(q2)}`;
    const full=`M${pt(p0)}Q${pt(p1)} ${pt(p2)}${cap}Q${pt(q1)} ${pt(q0)}Z`;
    const trim=(a,b,d,t=.38)=>[
      [(1-t)*(1-t)*a[0]+2*t*(1-t)*b[0]+t*t*d[0],(1-t)*(1-t)*a[1]+2*t*(1-t)*b[1]+t*t*d[1]],
      [mix(b[0],d[0],t),mix(b[1],d[1],t)]
    ];
    const [ps,pc]=trim(p0,p1,p2),[qs,qc]=trim(q0,q1,q2);
    const contour=`M${pt(ps)}Q${pt(pc)} ${pt(p2)}${cap}Q${pt(qc)} ${pt(qs)}`;
    const tangent=[N1[1],-N1[0]];
    return {full,contour,x:B[0]+tangent[0]*4.5,y:B[1]+tangent[1]*4.5,
      angle:Math.atan2(tangent[1],tangent[0])*180/PI-90};
  }
  function arm(side, c) {
    const shape=armD(side,c);
    for(const key of ['arm'+side+'bf','arm'+side+'f','armClipPath'+side]) path($(key),shape.full);
    path($('arm'+side+'s'),shape.contour);
    for(const name of ['handBack'+side,'handFront'+side]) {
      const el=$(name); attr(el,'cx',n(shape.x));attr(el,'cy',n(shape.y));
      attr(el,'rx',14);attr(el,'ry',10.5);
      transform(el,`rotate(${n(shape.angle)} ${n(shape.x)} ${n(shape.y)})`);
    }
    opacity($('arm'+side),c['front'+side]);
  }
  function leg(side,c) {
    const sign=side==='L'?-1:1, hip=150+sign*27, y=300-c['leg'+side];
    // Mirror BOTH endpoint paths before interpolation. Opposite winding would
    // collapse the right leg halfway between standing and sitting.
    const base=123;
    const standing=[base-15,267,base-18,277,base-16,y-8,base-16,y,
      base-16,y+16,base+16,y+16,base+16,y,
      base+16,y-8,base+18,277,base+15,267,base+7,265,base-7,265,base-15,267];
    const seated=[113,267,94,273,85,290,98,302,112,315,135,316,147,304,
      155,292,134,279,132,269,125,266,119,266,113,267];
    if(side==='R')for(let i=0;i<seated.length;i+=2){seated[i]=300-seated[i];standing[i]=300-standing[i];}
    const p=standing.map((v,i)=>n(mix(v,seated[i],c.sit)));
    const d=`M${p[0]} ${p[1]}C${p.slice(2,8).join(' ')}C${p.slice(8,14).join(' ')}C${p.slice(14,20).join(' ')}C${p.slice(20,26).join(' ')}Z`;
    path($('leg'+side+'f'),d);path($('legClipPath'+side),d);
    const hoof=$('hoof'+side);attr(hoof,'cx',n(mix(hip,150+sign*13,c.sit)));attr(hoof,'cy',n(mix(y+10,305,c.sit)));
    attr(hoof,'rx',n(mix(17,14,c.sit)));attr(hoof,'ry',n(mix(9,10.5,c.sit)));
  }
  function eye(side,c,blink) {
    const cx=side==='L'?113:187, cy=132;
    const open=clamp(c.eye*blink*(side==='R'?1-c.wink:1));
    const rx=8.4*c.wide, ry=11.7*open;
    const curve=c.closedCurve*(1-open);
    const upper=cy-ry*1.333+curve*1.333-(1-open)*1.6;
    const lower=cy+ry*1.333+curve*1.333+(1-open)*1.6;
    path($('eyePath'+side),`M${n(cx-rx)} ${cy}C${n(cx-rx)} ${n(upper)} ${n(cx+rx)} ${n(upper)} ${n(cx+rx)} ${cy}C${n(cx+rx)} ${n(lower)} ${n(cx-rx)} ${n(lower)} ${n(cx-rx)} ${cy}Z`);
    const glint=$('highlight'+side);attr(glint,'cx',cx+2.8);attr(glint,'cy',n(cy-4.3*open));
    attr(glint,'r',n(2.9*open));opacity(glint,smooth((open-.38)/.45));
  }
  function mouth(c) {
    const a=clamp(c.open), width=mix(9,14,a), h=mix(.5,17,a);
    path($('mouthLine'),`M141 173Q150 ${n(173+c.smile*8)} 159 173`);
    opacity($('mouthLine'),1-smooth(a*3));
    const top=171, mid=top+h*.85, end=top+h;
    const w=width*mix(1,.55,c.round),start=top+c.round*h*.35,upper=top+mix(3,-h*.3,c.round);
    path($('mouthOpen'),`M${n(150-w)} ${n(start)}C${n(150-w)} ${n(upper)} ${n(150+w)} ${n(upper)} ${n(150+w)} ${n(start)}C${n(150+w)} ${n(mid)} ${n(150+w*.35)} ${n(end)} 150 ${n(end)}C${n(150-w*.35)} ${n(end)} ${n(150-w)} ${n(mid)} ${n(150-w)} ${n(start)}Z`);
    opacity($('mouthOpen'),smooth(a*3));
    path($('tongue'),`M${n(150-w*.6)} ${n(top+h*.78)}Q150 ${n(top+h*.38)} ${n(150+w*.6)} ${n(top+h*.78)}Q150 ${n(top+h*1.12)} ${n(150-w*.6)} ${n(top+h*.78)}Z`);
    opacity($('tongue'),smooth(a*3)*(1-c.round));
  }
  function draw(staticFrame=false) {
    const c=cur;
    const still=reduced()||staticFrame;
    let blink=1;
    if(!still) {
      const phase=time%4.6;
      if(phase>3.8 && phase<3.98) blink=1-sin((phase-3.8)/.18*PI);
    }
    transform($('root'),`translate(${n(c.x)} ${n(c.y)}) translate(150 315) rotate(${n(c.lean)}) scale(${n(c.sx)} ${n(c.sy)}) translate(-150 -315)`);
    const bodyTransform=`translate(${n(c.sleep*35)} ${n(c.sleep*10)}) rotate(${n(c.sleep*-64)} 150 255)`;
    transform($('bodyRig'),bodyTransform);transform($('frontArms'),bodyTransform);
    transform($('heldProps'),bodyTransform);transform($('p_laptop'),bodyTransform);
    transform($('p_pen'),bodyTransform+` translate(${n(c.rX+1)} ${n(c.rY+2)}) rotate(25)`);
    transform($('head'),`translate(${n(c.hx-c.sleep*28)} ${n(c.hy+c.sit*8+c.sleep*100)}) rotate(${n(c.head-c.sleep*13)} 150 184)`);
    transform($('earL'),`rotate(${n(c.earL)} 77 110)`);
    transform($('earR'),`rotate(${n(c.earR)} 223 110)`);
    transform($('tail'),`rotate(${n(c.tail+c.sleep*180)} 202 270)`);
    transform($('band'),`translate(0 ${n(c.sit*8)}) rotate(${n(c.lean*.17 + (still?0:sin(time*1.8)*.35))} 150 187)`);
    const bottom=290-c.sit*4;
    const top=184+c.sit*8,neck=197+c.sit*8;
    const trunk=`M109 ${n(top)}C91 ${n(neck)} 87 235 94 266C97 282 111 ${n(bottom)} 150 ${n(bottom)}C189 ${n(bottom)} 203 282 206 266C213 235 209 ${n(neck)} 191 ${n(top)}Q150 ${n(top-8)} 109 ${n(top)}Z`;
    path($('bodyFill'),trunk);path($('bodyClipPath'),trunk);
    leg('L',c);leg('R',c);arm('L',c);arm('R',c);
    const milk=[255,253,249].map((v,i)=>Math.round(mix(v,[248,189,189][i],c.burn)));
    for(const id of ['silhouette','head','frontArms'])attr($(id),'fill',`rgb(${milk.join(',')})`);
    attr($('grayAmount'),'values',n(1-c.gray));
    transform($('gaze'),`translate(${n(c.gazeX)} ${n(c.gazeY)})`);
    eye('L',c,blink);eye('R',c,blink);mouth(c);
    for(const side of ['L','R']) {
      opacity($('brow'+side),c.brows);
      transform($('brow'+side),`translate(0 ${n(c.browY)}) rotate(${n(c['brow'+side])} ${side==='L'?110:190} 109)`);
    }
    const jumpScale=clamp(1+c.y/130,.6,1);
    attr($('shadow'),'rx',n(73*jumpScale+16*c.sleep));
    opacity($('shadow'),.1*clamp(1+c.y/80,.4,1));
    for(const key of PROPS) opacity(propNodes[key],propWeights[key]);
    opacity($('dots'),c.dots);
    [...$('dots').children].forEach((el,i)=>opacity(el,still?.8:.28+.72*Math.max(0,sin(time*3-i*.8))));
    transform($('p_q'),`translate(${n(c.hx*.25)} ${n(c.hy*.5+c.y*.5)})`);
    transform($('p_spark'),`translate(0 ${n(c.y*.35)})`);
    transform($('p_heart'),`translate(0 ${n(still?0:2*sin(time*1.6))})`);
    transform($('p_zzz'),`translate(0 ${n(still?0:1.7*sin(time*1.2))})`);
    transform($('p_conf'),`translate(0 ${n(still?0:5*sin(time*2.8))})`);
    transform($('p_wave'),`translate(${n((c.rX-230)*.35)} ${n((c.rY-180)*.35)})`);
    if(!still && propWeights.flag>.001) {
      const w=1.8*sin(time*2.8);
      path($('flagCloth'),`M232 173Q252 ${n(180+w)} 279 ${n(173+w)}L273 ${n(208+w)}Q251 ${n(216+w)} 232 207Z`);
    } else path($('flagCloth'),'M232 173Q252 180 279 173L273 208Q251 216 232 207Z');
  }

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
