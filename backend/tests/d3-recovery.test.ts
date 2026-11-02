import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileOriginal} from '../src/d3/negatives.ts';
import {localDb,harness} from './testnet-fixtures.ts';
import {TransportStore} from '../src/testnet/store.ts';
import {LocalTransactionWorker} from '../src/testnet/worker.ts';
test('D3 recovery wraps original D1 worker after lost reward response, NOT_FOUND and restart without replacement',async()=>{
 const db=await localDb();try{
  const f=await harness(db,true);f.transport.loseSubmit=true;
  assert.equal(await f.worker.run(f.op,'d3-local-fixture'),'SUBMITTED_OR_UNKNOWN');
  const original=(await f.store.identity(f.op))!;assert.ok(original);
  const restarted=new LocalTransactionWorker(new TransportStore(f.adapter),f.transport,f.project);
  const port={identity:async()=>{const v=(await f.store.identity(f.op))!;return {operationId:f.op,transactionHash:v.transactionHash};},reconcileOriginalOperation:async(id:string)=>{const s=await restarted.run(id,'d3-recovery-fixture');return s==='PROJECTED'?'SUCCESS' as const:'UNRESOLVED' as const;}};
  assert.equal((await reconcileOriginal(port)).result,'UNRESOLVED');f.transport.outage=true;assert.equal((await reconcileOriginal(port)).result,'UNRESOLVED');
  f.transport.outage=false;f.transport.success=true;const result=await reconcileOriginal(port);assert.equal(result.result,'SUCCESS');assert.equal(result.originalHash,original.transactionHash);assert.equal(result.reconciledHash,original.transactionHash);
  await reconcileOriginal(port);assert.equal(f.projectionCount(),1);assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);assert.equal((await f.store.work(f.op)).dispatchAttempts,1);assert.deepEqual((await f.store.identity(f.op))!.envelopeBytes,original.envelopeBytes);
 }finally{await db.close();}
});
test('D3 recovery refuses an adapter that changes the original operation/hash',async()=>{
 let n=0;await assert.rejects(reconcileOriginal({identity:async()=>({operationId:'original',transactionHash:(++n===1?'ab':'cd').repeat(32)}),reconcileOriginalOperation:async()=> 'SUCCESS'}),/RecoveryIdentityMismatch/);
});
