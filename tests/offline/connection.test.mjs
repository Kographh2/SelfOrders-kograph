import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from '../security/helpers.mjs';
const {createConnectionMonitor}=load('src/lib/connection-monitor.js');
function fixture(fetch,extra={}){
 const listeners=new Map(),timers=new Set();let calls=0,recovered=0;const states=[];
 const target={addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)}};
 const env={...target,document:{...target,hidden:false},navigator:{onLine:true},fetch:(...args)=>{calls++;return fetch(...args)},setTimeout:(fn,ms)=>{const key=setTimeout(()=>{timers.delete(key);fn()},ms===6000?100:ms<=1200?1:ms);timers.add(key);return key;},clearTimeout:key=>{timers.delete(key);clearTimeout(key);}};
 const monitor=createConnectionMonitor({env,automatic:false,onState:state=>states.push(state),onRecovered:()=>recovered++,...extra});
 return {monitor,env,states,listeners,timers,calls:()=>calls,recovered:()=>recovered};
}
test('single-flight retry requires two good probes and page verification',async()=>{
 const f=fixture(async()=>new Response(JSON.stringify({reachable:true})),{verify:async()=>true});
 const first=f.monitor.check();assert.equal(first,f.monitor.check());await first;
 assert.equal(f.calls(),2);assert.equal(f.recovered(),1);assert.equal(f.states.at(-1).status,'online');
 f.monitor.dispose();assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
});
test('server errors and access failures do not become offline',async()=>{
 for(const status of [401,403,500,503]){
  const f=fixture(async()=>new Response('',{status}));await f.monitor.check();assert.equal(f.states.at(-1).status,'unavailable');assert.equal(f.recovered(),0);f.monitor.dispose();
 }
});
test('timeout, offline and disposal abort pending probes without late recovery',async()=>{
 const wait=(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
 const f=fixture(wait);await f.monitor.check();assert.equal(f.states.at(-1).status,'unavailable');f.monitor.dispose();
 const offline=fixture(async()=>{throw new TypeError('network')});offline.env.navigator.onLine=false;await offline.monitor.check();assert.equal(offline.states.at(-1).status,'offline');offline.monitor.dispose();
 const stopped=fixture(wait);const pending=stopped.monitor.check();stopped.monitor.dispose();await pending;assert.equal(stopped.recovered(),0);assert.equal(stopped.timers.size,0);
});
test('unstable recovery and failed page verification keep the recovery screen',async()=>{
 let count=0;const unstable=fixture(async()=>new Response(++count===1?JSON.stringify({reachable:true}):'failure',{status:count===1?200:503}));
 await unstable.monitor.check();assert.equal(unstable.recovered(),0);unstable.monitor.dispose();
 const page=fixture(async()=>new Response(JSON.stringify({reachable:true})),{verify:async()=>false});await page.monitor.check();assert.equal(page.recovered(),0);page.monitor.dispose();
});
