import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { localDb,harness } from './testnet-fixtures.ts';
import { LocalTransactionWorker } from '../src/testnet/worker.ts';
import { TransportStore } from '../src/testnet/store.ts';
import { finalizedBody,signedIdentity } from '../src/testnet/identity.ts';
let db:PGlite;
before(async()=>{db=await localDb();});after(async()=>{await db.close();});
test('VOL-003 commit failure prevents broadcast and persisted identity exists before submit',async()=>{
  const f=await harness(db);
  const failingStore=new TransportStore({transaction:work=>f.adapter.transaction(async sql=>{
    let identityWritten=false;
    const result=await work({query:async <R>(s:string,p?:unknown[])=>{
      if(s.includes('insert into api_private.testnet_envelopes'))identityWritten=true;
      return sql.query<R>(s,p);
    }});
    if(identityWritten)throw Error('synthetic commit failure');return result;
  })});
  const failingWorker=new LocalTransactionWorker(failingStore,f.transport,f.project);
  await assert.rejects(failingWorker.run(f.op,'worker'),/commit failure/);assert.equal(f.transport.submitted.length,0);
  assert.equal(await f.store.identity(f.op),null);assert.equal((await f.store.work(f.op)).state,'PREPARING');
  const submit=f.transport.submit.bind(f.transport);
  f.transport.submit=async i=>{const saved=await f.store.identity(f.op);assert.ok(saved);assert.deepEqual(saved.envelopeBytes,i.envelopeBytes);assert.equal((await f.store.work(f.op)).state,'DISPATCH_INTENT');return submit(i);};
  await f.worker.run(f.op,'worker');assert.equal(f.transport.submitted.length,1);
});
test('VOL-003 same source single-flight spans different deployments and unresolved expiry',async()=>{
  const f=await harness(db);await f.worker.run(f.op,'first');f.transport.closeTime='1301';
  await f.worker.run(f.op,'expired');assert.equal((await f.store.work(f.op)).state,'EXPIRED_UNRESOLVED');
  const other=await harness(db,false,f.key);
  await assert.rejects(other.worker.run(other.op,'different-deployment'),/SourceAccountBusy/);
  assert.equal(other.transport.prepareCount,0);
});
test('VOL-003 trusted confirmation hash mismatch does not project or replace identity',async()=>{
  const f=await harness(db);f.transport.success=true;const observe=f.transport.observe.bind(f.transport);
  f.transport.observe=async i=>{const o=await observe(i);assert.equal(o.status,'SUCCESS');if(o.status==='SUCCESS')o.confirmation.transactionHash='01'.repeat(32);return o;};
  await assert.rejects(f.worker.run(f.op,'worker'),/ConfirmationMismatch/);
  assert.equal(f.projectionCount(),0);assert.equal(f.transport.submitted.length,1);
});
test('VOL-003 READY envelope expired before first dispatch never submits',async()=>{
  const f=await harness(db);f.transport.closeTime='1301';f.transport.effect='NOT_APPLIED';
  assert.equal(await f.worker.run(f.op,'worker'),'EXPIRED_NOT_APPLIED');assert.equal(f.transport.submitted.length,0);
});
test('VOL-003 restart after READY or dispatch intent uses original hash, never prepares again',async()=>{
  const f=await harness(db),c=await f.store.claim(f.op,'first');await f.store.preparing(c);
  const w=await f.store.work(f.op),p=await f.transport.prepareAndSimulate(w),final=finalizedBody(w,p);
  const i=signedIdentity(w,final,await f.transport.signEnvelope(final));await f.store.persist(c,i);
  await f.store.dispatchIntent(c,false);await f.store.release(c); // simulated crash before send/response
  const restarted=new LocalTransactionWorker(new TransportStore(f.adapter),f.transport,f.project);
  await restarted.run(f.op,'restart');
  assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.submitted.length,0);
  assert.deepEqual(f.transport.observed,[i.transactionHash]);
});
test('VOL-003 lost submit response and valid NOT_FOUND stay UNKNOWN across restart',async()=>{
  const f=await harness(db);f.transport.loseSubmit=true;
  assert.equal(await f.worker.run(f.op,'one'),'SUBMITTED_OR_UNKNOWN');const i=await f.store.identity(f.op);
  await f.worker.run(f.op,'restart');assert.equal(f.transport.submitted.length,1);assert.equal(f.transport.signCount,1);
  assert.ok(f.transport.observed.every(h=>h===i!.transactionHash));
});
test('VOL-003 RPC outage preserves identity and later confirmed success projects once',async()=>{
  const f=await harness(db);f.transport.outage=true;await f.worker.run(f.op,'one');
  f.transport.outage=false;f.transport.success=true;
  assert.equal(await f.worker.run(f.op,'recovery'),'PROJECTED');await f.worker.run(f.op,'repeat');
  assert.equal(f.projectionCount(),1);assert.equal(f.transport.submitted.length,1);
});
for(const effect of ['APPLIED','NOT_APPLIED','UNRESOLVED'] as const)test(`VOL-003 expired NOT_FOUND + state evidence ${effect}`,async()=>{
  const f=await harness(db,true);await f.worker.run(f.op,'first');
  f.transport.closeTime='1301';f.transport.effect=effect;
  const expected=effect==='APPLIED'?'PROJECTED':effect==='NOT_APPLIED'?'EXPIRED_NOT_APPLIED':'EXPIRED_UNRESOLVED';
  assert.equal(await f.worker.run(f.op,'reconcile'),expected);
  await f.worker.run(f.op,'again');assert.equal(f.transport.submitted.length,1);assert.equal(f.transport.prepareCount,1);
  assert.equal(f.projectionCount(),effect==='APPLIED'?1:0);
  const observations=await db.query<{confirmation_ledger:number|null;state_read_ledger:number}>("select * from api_private.testnet_observations where operation_id=$1 and kind='STATE_READ'",[f.op]);
  assert.equal(observations.rows[0].confirmation_ledger,null);assert.equal(observations.rows[0].state_read_ledger,16);
});
test('VOL-003 confirmed failure is terminal, unlike timeout or NOT_FOUND',async()=>{
  const f=await harness(db);f.transport.failChain=true;
  assert.equal(await f.worker.run(f.op,'one'),'CONFIRMED_FAILED');await f.worker.run(f.op,'again');
  assert.equal(f.projectionCount(),0);assert.equal(f.transport.submitted.length,1);
});
test('VOL-003 competing workers and same-source operations cannot prepare two envelopes',async()=>{
  const f=await harness(db);
  const results=await Promise.allSettled([f.worker.run(f.op,'one'),f.worker.run(f.op,'two')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.transport.prepareCount,1);
  const op=randomUUID();
  await db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
    select $1::uuid,deployment_id,principal,$1::text,command,battery_id,parameters,parameters_hash from app_private.stellar_operations where id=$2`,[op,f.op]);
  await f.store.queue(f.d,op,f.key.publicKey(),f.args);
  await assert.rejects(f.worker.run(op,'competitor'),/SourceAccountBusy/);
  assert.equal(f.transport.prepareCount,1);
});
test('VOL-003 projection failure after SUCCESS retries SQL only, preserving confirmation ledger',async()=>{
  const f=await harness(db);f.transport.success=true;f.failProjection(true);
  await assert.rejects(f.worker.run(f.op,'first'),/projection failure/);
  assert.equal((await f.store.work(f.op)).state,'CONFIRMED_SUCCESS');f.failProjection(false);
  assert.equal(await f.worker.run(f.op,'recovery'),'PROJECTED');
  assert.equal(f.projectionCount(),1);assert.equal(f.transport.submitted.length,1);assert.equal(f.transport.observed.length,1);
  const w=await f.store.work(f.op);assert.equal(w.confirmation!.observationLedger,15);assert.equal(w.confirmation!.confirmationLedger,12);
});
test('VOL-003 reviewed same-hash retry uses identical bytes with bounded attempts',async()=>{
  const f=await harness(db);await f.worker.run(f.op,'first');const i=(await f.store.identity(f.op))!;
  await assert.rejects(f.worker.retrySameHash({operationId:f.op,transactionHash:i.transactionHash,decisionId:''},'retry'),/RetryReviewRequired/);
  await f.worker.retrySameHash({operationId:f.op,transactionHash:i.transactionHash,decisionId:'synthetic-owner-review'},'retry');
  assert.equal(f.transport.submitted.length,2);assert.deepEqual(f.transport.submitted[0].envelopeBytes,f.transport.submitted[1].envelopeBytes);
  assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);
  await assert.rejects(f.worker.retrySameHash({operationId:f.op,transactionHash:i.transactionHash,decisionId:'review'},'again'),/RetryLimit/);
});
test('VOL-003 reward projection is atomic and duplicate reward work remains prohibited',async()=>{
  const f=await harness(db,true);f.transport.success=true;f.failProjection(true);
  await assert.rejects(f.worker.run(f.op,'first'),/projection failure/);f.failProjection(false);
  await f.worker.run(f.op,'recovery');await f.worker.run(f.op,'repeat');
  assert.equal((await db.query<{state:string}>('select state from app_private.reward_attempts where operation_id=$1',[f.op])).rows[0].state,'SUCCEEDED');
  assert.equal(f.projectionCount(),1);const op=randomUUID();
  await db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
    select $1::uuid,deployment_id,principal,$1::text,command,battery_id,parameters,parameters_hash from app_private.stellar_operations where id=$2`,[op,f.op]);
  await assert.rejects(f.store.queue(f.d,op,f.key.publicKey(),f.args),/testnet_reward_single_effect/);
});
test('VOL-003 expiry proving nonpayment still does not authorize a new reward identity',async()=>{
  const f=await harness(db,true);await f.worker.run(f.op,'first');f.transport.closeTime='1301';f.transport.effect='NOT_APPLIED';
  assert.equal(await f.worker.run(f.op,'expired'),'EXPIRED_NOT_APPLIED');const op=randomUUID();
  await db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
    select $1::uuid,deployment_id,principal,$1::text,command,battery_id,parameters,parameters_hash from app_private.stellar_operations where id=$2`,[op,f.op]);
  await assert.rejects(f.store.queue(f.d,op,f.key.publicKey(),f.args),/testnet_reward_single_effect/);
  assert.equal(f.transport.submitted.length,1);
});
test('VOL-003 dispatch reloads committed bytes after external preflight',async()=>{
  const f=await harness(db);const validity=f.transport.validity.bind(f.transport);
  f.transport.validity=async(identity)=>{identity.envelopeBytes.fill(0);return validity(identity);};
  await f.worker.run(f.op,'worker');const persisted=(await f.store.identity(f.op))!;
  assert.deepEqual(f.transport.submitted[0].envelopeBytes,persisted.envelopeBytes);
  assert.notEqual(Buffer.from(persisted.envelopeBytes).toString('hex'),'00'.repeat(persisted.envelopeBytes.length));
});
