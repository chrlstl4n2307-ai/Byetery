import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileOfflineOriginal } from './controller.mjs';
import { projectD324Journal } from '../d3-24-ratification/readiness.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';

const origin=process.env.OFFLINE_ORIGIN;
assert.match(origin??'',/^http:\/\/127\.0\.0\.1:\d+$/);
const directory=process.env.OFFLINE_CASE_DIR;
const output=fileURLToPath(new URL('../../.test-output/',import.meta.url));
assert.equal(resolve(directory,'..'),resolve(output));
const control=join(directory,'operator','.git','byetery-d3-operator');
const file=join(control,RUN1.taskId+'-'+RUN1.businessSha+'.jsonl'),before=await readFile(file);
const uncertain=process.env.OFFLINE_SCENARIO==='uncertain-retry';
const entry=uncertain?JSON.parse(before.toString('utf8').trimEnd().split('\n').at(-1)):projectD324Journal(before)[0];
if(uncertain)assert.equal(entry.phase,'UNKNOWN');
const original={operationId:entry.operationId,transactionHash:entry.transactionHash};
const optionsFor=(options={})=>({...options,redirect:'error',signal:AbortSignal.timeout(10_000),
  headers:{'content-type':'application/json','x-fixture-capability':process.env.OFFLINE_CAPABILITY}});
const state=async()=>(await fetch(origin+'/state',optionsFor())).json();
const s=await state();assert.equal(s.operations,1);assert.equal(s.admissions,1);assert.equal(s.sends,1);
const read=async identity=>{
  // Fixture POST is a parameterized SELECT, never an app POST or dispatch.
  const r=await fetch(origin+'/receipt',optionsFor({method:'POST',body:JSON.stringify(identity)}));
  assert.equal(r.status,200);const row=await r.json();
  return {operationId:row.operationId,transactionHash:row.transactionHash,confirmed:row.applicationState==='CONFIRMED'&&row.status==='SUCCESS'};
};
const options={classification:'OFFLINE_SYNTHETIC',read};
let unauthorizedReads=0;
await assert.rejects(reconcileOfflineOriginal(original,{classification:'LIVE',read:async()=>{unauthorizedReads++;}}),
  /OFFLINE_ORIGINAL_IDENTITY_REQUIRED/);
assert.equal(unauthorizedReads,0);
const denied=await fetch(origin+'/receipt',{method:'POST',redirect:'error',body:JSON.stringify(original),signal:AbortSignal.timeout(10000)});
assert.equal(denied.status,403);
await denied.body?.cancel();
if(uncertain){
  assert.equal(await reconcileOfflineOriginal(original,options),'UNRESOLVED');
  // A worker re-entry after durable dispatch may only observe the original.
  const response=await fetch(origin+'/dispatch',optionsFor({method:'POST',body:JSON.stringify(original)}));
  assert.equal(response.status,200);
  await response.json();
  const again=await state();
  assert.deepEqual(again.identities,s.identities);
  assert.equal(again.sends,1);assert.equal(again.signatures,1);assert.equal(again.leases,0);
}else{
  assert.equal(await reconcileOfflineOriginal(original,options),'CONFIRMED');
}
await assert.rejects(reconcileOfflineOriginal(original,{...options,read:async x=>({...await read(x),transactionHash:'0'.repeat(64)})}),/OFFLINE_OPERATION_IDENTITY_REJECTED/);
assert.equal(await reconcileOfflineOriginal(original,{...options,read:async x=>({...await read(x),confirmed:false})}),'UNRESOLVED');
if(!uncertain)assert.deepEqual(await state(),s);
assert.deepEqual(await readFile(file),before);
console.log(JSON.stringify({scenario:process.env.OFFLINE_SCENARIO,result:'PASS',freshRecoveryProcess:true,admissions:1,sends:1,
  duplicateSends:0,journalPreserved:true,realTransactions:0}));
