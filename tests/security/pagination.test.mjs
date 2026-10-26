import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers.mjs';
const {readPages}=load('src/lib/paged-query.ts');
test('reports include rows beyond one API page and reject truncated limits',async()=>{
 const rows=Array.from({length:1201},(_,id)=>({id}));
 const query=async(from,to)=>({data:rows.slice(from,to+1),error:null});
 assert.equal((await readPages(query)).length,1201);
 await assert.rejects(readPages(query,1000),/Persempit/);
 await assert.rejects(readPages(async()=>({data:null,error:{message:'fixture database failure'}})),/fixture database failure/);
});
