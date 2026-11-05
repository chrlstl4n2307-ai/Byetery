import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {operationPresentation,type StatusRow} from '../src/application/operation-status.ts';
import {ExecutionSupervisor} from '../src/application/execution-supervisor.ts';
import {canonical} from '../src/application/validation.ts';
import {submitAndObserveOperation} from '../src/d3/live-operator.ts';
import {activation,consumeBattery,HISTORICAL_NON_COUNTING_BATTERY,LIVE_TASK,runDecision} from '../src/d3/operator-control.ts';
import {INITIAL_OBSERVATION_MS,MAX_OBSERVATION_MS,type OperationReceipt} from '../src/d3/operation-polling.ts';
import {exportManifest,writeManifest,type RawRunEvidence} from '../src/d3/manifest.ts';
import {plan,sha} from '../src/d3/model.ts';
import {simulate} from '../src/d3/runner.ts';
import {d3Input} from './d3-fixtures.ts';
import {harness,localDb} from './testnet-fixtures.ts';

const id='10000000-0000-0000-0000-000000000013',hash='ab'.repeat(32);
const pending:StatusRow={id,state:'UNKNOWN',transport_state:'UNKNOWN',transaction_hash:hash,dispatch_attempts:1,review_required:false,interrupted:false};
const confirmed={...pending,state:'CONFIRMED',transport_state:'PROJECTED'};
function observation(read:(elapsed:number)=>Promise<OperationReceipt>|OperationReceipt,signal?:AbortSignal){
  let elapsed=0,posts=0,reads=0;
  const entries:{operationId:string;transactionHash:string}[]=[];
  const result=submitAndObserveOperation(async()=>{posts++;return {operationId:id,transactionHash:null};},async target=>{
    assert.equal(target,id);reads++;return read(elapsed);
  },async ack=>assert.equal(ack?.operationId,id),{
    now:()=>elapsed,sleep:async ms=>{elapsed+=ms;},signal,onReconciliation:identity=>{entries.push(identity);},
  });
  return {result,entries,elapsed:()=>elapsed,posts:()=>posts,reads:()=>reads};
}
test('D3-13 normal SUCCESS within the initial window stays observed',async()=>{
  const f=observation(t=>operationPresentation(t<1000?pending:confirmed));
  assert.equal((await f.result).confirmationMode,'OBSERVED');assert.equal(f.posts(),1);assert.deepEqual(f.entries,[]);
});
test('D3-13 late SUCCESS uses the original durable ID and hash despite a transient GET failure',async()=>{
  const f=observation(t=>{if(t===120_000)throw Error('synthetic transient read');return operationPresentation(t<121_000?pending:confirmed);});
  const done=await f.result;
  assert.equal(done.operationId,id);assert.equal(done.transactionHash,hash);assert.equal(done.result,'SUCCESS');
  assert.equal(done.confirmationMode,'RECONCILED_AFTER_OBSERVATION_EXPIRY');
  assert.deepEqual(f.entries,[{operationId:id,transactionHash:hash}]);assert.equal(f.posts(),1);
  assert.equal(f.elapsed(),INITIAL_OBSERVATION_MS+1000);
});
test('D3-13 chain SUCCESS does not advance until one durable collection projection, without preparing, signing or dispatching twice',async()=>{
  const db=await localDb();
  try{
    const f=await harness(db,false,undefined,true);
    f.transport.success=true;f.failProjection(true);
    let t=0,posts=0,projected=false;
    const receipt=await submitAndObserveOperation(async()=>{
      posts++;await assert.rejects(f.worker.run(f.op,'fixture-first'),/projection failure/);
      return {operationId:f.op,transactionHash:null};
    },async target=>{
      assert.equal(target,f.op);
      if(t===121_000){f.failProjection(false);await f.worker.run(f.op,'fixture-scheduled-reconcile');projected=true;}
      const w=await f.store.work(f.op),identity=await f.store.identity(f.op);
      if(t<121_000){assert.equal(w.state,'CONFIRMED_SUCCESS');assert.equal(f.projectionCount(),0);}
      return operationPresentation({...pending,id:f.op,transaction_hash:identity!.transactionHash,dispatch_attempts:w.dispatchAttempts,
        transport_state:w.state,state:projected?'CONFIRMED':'SUBMITTED'});
    },async()=>{}, {now:()=>t,sleep:async ms=>{t+=ms;}});
    assert.equal(receipt.result,'SUCCESS');assert.equal(receipt.confirmationMode,'RECONCILED_AFTER_OBSERVATION_EXPIRY');
    assert.equal(receipt.transactionHash,(await f.store.identity(f.op))!.transactionHash);
    assert.equal(posts,1);assert.equal(f.projectionCount(),1);assert.equal(f.transport.prepareCount,1);
    assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
    assert.equal((await f.store.work(f.op)).dispatchAttempts,1);
  }finally{await db.close();}
});
test('D3-13 definitive FAILED is terminal without conversion to SUCCESS or another POST',async()=>{
  const f=observation(t=>operationPresentation(t<121_000?pending:{...pending,state:'REJECTED',transport_state:'CONFIRMED_FAILED'}));
  const done=await f.result;assert.equal(done.result,'FAILED');assert.equal(done.terminal,true);assert.equal(f.posts(),1);
  assert.deepEqual(f.entries,[{operationId:id,transactionHash:hash}]);
});
test('D3-13 real uncertainty stops at the operational bound without inferring non-application',async()=>{
  const f=observation(()=>operationPresentation(pending));
  await assert.rejects(f.result,/UNCERTAIN_OPEN/);
  assert.equal(f.elapsed(),MAX_OBSERVATION_MS);assert.equal(f.reads(),MAX_OBSERVATION_MS/1000);assert.equal(f.posts(),1);assert.equal(f.entries.length,1);
});
for(const [label,row] of [
  ['missing hash',{...pending,transaction_hash:null,dispatch_attempts:0}],
  ['signed without dispatch',{...pending,state:'READY',transport_state:'READY',dispatch_attempts:0}],
] as const)test('D3-13 never extends '+label,async()=>{
  const f=observation(()=>operationPresentation(row));await assert.rejects(f.result,/OBSERVATION_WINDOW_EXPIRED/);
  assert.equal(f.elapsed(),INITIAL_OBSERVATION_MS);assert.equal(f.posts(),1);assert.deepEqual(f.entries,[]);
});
for(const change of [{transaction_hash:'cd'.repeat(32)},{id:'10000000-0000-0000-0000-000000000014'},{dispatch_attempts:0}])test('D3-13 fails closed on changed pinned '+Object.keys(change)[0],async()=>{
  const f=observation(t=>operationPresentation(t<120_000?pending:{...confirmed,...change}));
  await assert.rejects(f.result,/OriginalIdentityMismatch/);assert.equal(f.posts(),1);
});
test('D3-13 shutdown cancels the extended GET and supervisor drains without another action',async()=>{
  const controller=new AbortController(),supervisor=new ExecutionSupervisor();
  let started!:()=>void;const reading=new Promise<void>(resolve=>{started=resolve;});
  let t=0,posts=0,signalSeen:AbortSignal|undefined;
  const observer=supervisor.run(id,()=>submitAndObserveOperation(async()=>{posts++;return {operationId:id,transactionHash:null};},
    async (_id,signal)=>{
      if(t<120_000)return operationPresentation(pending);
      signalSeen=signal;started();
      return new Promise<OperationReceipt>(()=>{}); // even an uncooperative read cannot delay cancellation
    },async()=>{}, {now:()=>t,sleep:async ms=>{t+=ms;},signal:controller.signal}));
  const stopped=assert.rejects(observer,/OBSERVATION_ABORTED/);
  await reading;const drain=supervisor.drain(1000);controller.abort();await stopped;await drain;
  assert.equal(signalSeen?.aborted,true);assert.equal(supervisor.active,0);assert.equal(supervisor.accepting,false);assert.equal(posts,1);
});

const sim=simulate(d3Input());
async function fixture():Promise<RawRunEvidence>{
  const m=(await sim).manifests[0],r=structuredClone({source:m.source,operations:m.operations,
    records:m.records.map(({recomputedCommitment,match,...record})=>record),reward:m.reward,recovery:m.recovery}) as RawRunEvidence;
  r.source='TESTNET';r.operations.forEach((op,i)=>{op.transactionHash=String(i+1).repeat(64);op.ledger=10+i;op.timestamp='2026-11-04T18:00:00Z';});
  r.reward!.beforeLedger=13;r.reward!.afterLedger=15;return r;
}
function prefix(r:RawRunEvidence,length:number){
  return {...structuredClone(r),operations:r.operations.slice(0,length),records:r.records.filter(v=>v.kind==='REGISTRATION'||(v.kind==='COLLECTION'?length>=3:length>=4)),reward:length===5?r.reward:null};
}
function verifyDigest(m:ReturnType<typeof exportManifest>){
  const {integrityRelevantSha256,...body}=m;assert.equal(sha(canonical(body)),integrityRelevantSha256);
}
for(const position of [1,2,3,4,5])test('D3-13 manifest reconciliation at position '+position,async()=>{
  const r=await fixture();const op=r.operations[position-1];op.confirmationMode='RECONCILED_AFTER_OBSERVATION_EXPIRY';
  const input=d3Input(),before=exportManifest(input,'RUN1',prefix(r,Math.min(position,4)));
  const complete=exportManifest(input,'RUN1',r,before);
  assert.equal(complete.complete,true);assert.equal(complete.previousManifestSha256,before.integrityRelevantSha256);
  assert.deepEqual(complete.operations.slice(0,before.operations.length),before.operations);
  assert.deepEqual(complete.operations[position-1],op);assert.equal(complete.operations.filter(o=>o.confirmationMode==='RECONCILED_AFTER_OBSERVATION_EXPIRY').length,1);
  verifyDigest(before);verifyDigest(complete);
});
test('D3-13 collection legacy recovery stays bound to the third operation after recycle and reward',async()=>{
  const r=await fixture(),hash=r.operations[2].transactionHash;
  r.recovery={uncertainResponse:true,originalHash:hash,reconciledHash:hash,result:'SUCCESS',identityCount:1,broadcastCount:1};
  const input=d3Input(),before=exportManifest(input,'RUN1',prefix(r,3));
 r.operations[2]=structuredClone(before.operations[2]); // append the persisted entry verbatim
 const after=exportManifest(input,'RUN1',r,before);
  assert.equal(after.complete,true);assert.deepEqual(after.recovery,before.recovery);
  assert.deepEqual(after.operations[2],before.operations[2]);assert.equal(after.operations[2].confirmationMode,'RECONCILED_SAME_HASH');
  const changed=structuredClone(r);changed.operations[2].operationId='different-fixture';
  assert.throws(()=>exportManifest(input,'RUN1',changed,before),/HistoricalOperationChanged/);
  const dropped=structuredClone(r);dropped.recovery=(await fixture()).recovery;
  assert.throws(()=>exportManifest(input,'RUN1',dropped,before),/RecoveryIdentityMismatch|HistoricalOperationChanged|HistoricalRecoveryChanged/);
  const dir=await mkdtemp(join(tmpdir(),'byetery-d3-lineage-'));try{
    const first=await writeManifest(dir,before);const contents=await readFile(first,'utf8');
    await assert.rejects(writeManifest(dir,after),/EEXIST/);await writeManifest(join(dir,'successor'),after);
    assert.equal(await readFile(first,'utf8'),contents);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('D3-13 rejects duplicate identities and attempted rewrite of recorded terminal ledger',async()=>{
  const input=d3Input(),r=await fixture();r.operations[2].confirmationMode='RECONCILED_AFTER_OBSERVATION_EXPIRY';
  const before=exportManifest(input,'RUN1',prefix(r,3));
  for(const [field,error] of [['operationId','DuplicateOperation'],['transactionHash','DuplicateTransaction']] as const){
    const duplicate=structuredClone(r);duplicate.operations[3][field]=duplicate.operations[2][field]!;
    assert.throws(()=>exportManifest(input,'RUN1',duplicate,before),new RegExp(error));
  }
  r.operations[2].ledger=20;assert.throws(()=>exportManifest(input,'RUN1',r,before),/HistoricalOperationChanged/);
});
test('D3-13 exact historical ID fails live activation even without the local tombstone, and remains non-counting',async()=>{
  const input=d3Input();input.runs[0].batteryId=HISTORICAL_NON_COUNTING_BATTERY;
  const args={live:true,taskId:LIVE_TASK,expectedSha:input.gitSha},git={clean:true,sha:input.gitSha};
  assert.throws(()=>activation(plan(input),args,git,{}),/HistoricalBatteryPermanentlyNonCounting/);
  assert.equal(runDecision(HISTORICAL_NON_COUNTING_BATTERY,git.sha,git.sha,true,true,false).countable,false);
  const dir=await mkdtemp(join(tmpdir(),'byetery-d3-tombstone-'));
  try{
    await consumeBattery(dir,HISTORICAL_NON_COUNTING_BATTERY);
    await assert.rejects(consumeBattery(dir,HISTORICAL_NON_COUNTING_BATTERY),/EEXIST/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
