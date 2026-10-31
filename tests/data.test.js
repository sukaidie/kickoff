import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadAllRows} from '../src/data.js';
test('history includes records beyond a single Supabase response and preserves errors',async()=>{
 const source=Array.from({length:1101},(_,i)=>({id:String(i),name:'Player '+i}));
 const reads=[];const client={from:table=>({select:()=>({order:()=>({order:()=>({range:async(a,b)=>{reads.push([table,a,b]);return {data:source.slice(a,b+1),error:null};}})})})})};
 const rows=await loadAllRows(client,'players','created_at');assert.equal(rows.length,1101);assert.equal(rows.at(-1).name,'Player 1100');assert.equal(reads.length,3);
 const failure=new Error('Read denied');const bad={from:()=>({select:()=>({order:()=>({order:()=>({range:async()=>({data:null,error:failure})})})})})};await assert.rejects(loadAllRows(bad,'players','created_at'),/Read denied/);
});
