import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server.js';
const require=createRequire(import.meta.url);
export function load(file,overrides={}) {
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,name=>name in overrides?overrides[name]:require(name));return mod.exports;
}
export function database(resolve) {
 return {from(table){const q={table,op:'select',filters:[],columns:null,payload:null};const c={};for(const name of ['select','update','insert','upsert','delete','eq','is','neq','in','gte','gt','lt','lte','not','or','order','limit','range','returns','maybeSingle','single'])c[name]=(...args)=>{if(['update','insert','upsert','delete'].includes(name)){q.op=name;q.payload=args[0];}else if(name==='select')q.columns=args[0];else q.filters.push([name,...args]);return c;};c.then=(yes,no)=>Promise.resolve().then(()=>resolve(q)).then(yes,no);return c;}};
}
export const request=(path,method='GET',body,token='')=>new NextRequest('https://audit.example.test'+path,{method,headers:{Origin:'https://audit.example.test','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
export const guard={sameOrigin:()=>true,requestBudget:async()=>null,boundedJson:r=>r.json()};
