import test from 'node:test';
import assert from 'node:assert/strict';
import {localDb,harness} from './testnet-fixtures.ts';
import {signedReady} from './d2-dispatch-fixture.ts';
import {disableMemberships} from '../src/application/revocation.ts';

for(const [label,reward,collection] of [['ADMIN',false,false],['USER reward',true,false],['COLLECTOR',false,true]] as const){
 test('GAP2B signed but revoked '+label+': durable hold, no first dispatch or replacement',async()=>{
  const db=await localDb();try{
   const f=await harness(db,reward,undefined,collection);let sourceChecks=0;
   Object.assign(f.transport,{assertSourceSequence:async()=>{sourceChecks++;}});
   const persist=f.store.persist.bind(f.store);
   // The original principal is obtained before entering the revocation transaction.
   const principal=(await f.store.work(f.op)).principal;
   f.store.persist=async(c,i)=>{await persist(c,i);await f.adapter.transaction(sql=>disableMemberships(sql,f.d,principal));};
   await assert.rejects(f.worker.run(f.op,'gap2b-original'),{code:'AuthorizationRevoked'});
   const identity=await f.store.identity(f.op);assert.ok(identity);
   const w=await f.store.work(f.op);assert.equal(w.state,'READY');assert.equal(w.dispatchAttempts,0);
   assert.equal(await f.store.requiresReview(f.op),true);assert.equal(await f.store.authorizationRevoked(f.op),true);
   assert.equal((await db.query<{state:string}>('select state from app_private.stellar_operations where id=$1',[f.op])).rows[0].state,'READY');
   if(reward)assert.equal((await db.query<{state:string}>('select state from app_private.reward_attempts where operation_id=$1',[f.op])).rows[0].state,'QUEUED');
   assert.equal(await f.worker.run(f.op,'gap2b-restart'),'READY');
   await assert.rejects(f.worker.retrySameHash({operationId:f.op,transactionHash:identity.transactionHash,decisionId:'must-not-dispatch'},'gap2b-review'),{code:'AuthorizationRevoked'});
   assert.deepEqual(await f.store.identity(f.op),identity);
   assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,0);assert.equal(sourceChecks,0);
   const other=await harness(db,false,f.key);
   await assert.rejects(other.store.claim(other.op,'gap2b-no-replacement'),{code:'SourceAccountBusy'});
   assert.equal((await db.query('select * from api_private.testnet_envelopes')).rows.length,1);
  }finally{await db.close();}
 });
}

test('GAP2B raw SQL revocation is caught atomically at first dispatch; hold survives rollback boundary',async()=>{
 const db=await localDb();try{
  const f=await harness(db),identity=await signedReady(f),w=await f.store.work(f.op);
  await db.query('update api_private.memberships set enabled=false where deployment_id=$1 and user_id=$2',[f.d,w.principal]);
  assert.equal(await f.store.authorizationRevoked(f.op),false);
  const claim=await f.store.claim(f.op,'gap2b-dispatch');
  try{await assert.rejects(f.store.dispatchIntent(claim,true,'first-reviewed-dispatch'),{code:'AuthorizationRevoked'});}
  finally{await f.store.release(claim);}
  assert.equal(await f.store.authorizationRevoked(f.op),true);
  assert.equal((await f.store.work(f.op)).dispatchAttempts,0);assert.deepEqual(await f.store.identity(f.op),identity);
  // Re-enabling authority cannot erase a signed-revoked hold or grant a retry.
  await db.query('update api_private.memberships set enabled=true where deployment_id=$1 and user_id=$2',[f.d,w.principal]);
  await assert.rejects(f.worker.retrySameHash({operationId:f.op,transactionHash:identity.transactionHash,decisionId:'still-held'},'gap2b-no-clear'),{code:'AuthorizationRevoked'});
  assert.equal(f.transport.submitted.length,0);
 }finally{await db.close();}
});

test('GAP2B post-dispatch revocation reconciles chain truth under the same hash',async()=>{
 const db=await localDb();try{
  const f=await harness(db);f.transport.loseSubmit=true;
  assert.equal(await f.worker.run(f.op,'gap2b-dispatch'),'SUBMITTED_OR_UNKNOWN');
  const identity=await f.store.identity(f.op),w=await f.store.work(f.op);assert.ok(identity);assert.equal(w.dispatchAttempts,1);
  await f.adapter.transaction(sql=>disableMemberships(sql,f.d,w.principal));
  assert.equal(await f.store.authorizationRevoked(f.op),false);
  assert.equal((await f.store.work(f.op)).state,'SUBMITTED_OR_UNKNOWN');
  f.transport.success=true;assert.equal(await f.worker.run(f.op,'gap2b-reconcile'),'PROJECTED');
  assert.deepEqual(await f.store.identity(f.op),identity);assert.equal(f.transport.submitted.length,1);assert.equal(f.transport.signCount,1);
  assert.ok(f.transport.observed.every(hash=>hash===identity.transactionHash));
 }finally{await db.close();}
});

test('GAP2B proactive hold uses the original required role, not every revoked sibling role',async()=>{
 const db=await localDb();try{
  const f=await harness(db,true);await signedReady(f);const w=await f.store.work(f.op);
  await db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'ADMIN')",[f.d,w.principal]);
  await f.adapter.transaction(sql=>disableMemberships(sql,f.d,w.principal,['ADMIN']));
  assert.equal(await f.store.authorizationRevoked(f.op),false,'Owner reward still has its USER authority');
  await f.adapter.transaction(sql=>disableMemberships(sql,f.d,w.principal,['USER']));
  assert.equal(await f.store.authorizationRevoked(f.op),true);
 }finally{await db.close();}
});

test('GAP2B reviewed first-dispatch NOT_FOUND remains pre-boundary and can resolve revoked',async()=>{
 const db=await localDb();try{
  const f=await harness(db),identity=await signedReady(f),w=await f.store.work(f.op);
  await db.query('update api_private.memberships set enabled=false where deployment_id=$1 and user_id=$2',[f.d,w.principal]);
  await assert.rejects(f.worker.retrySameHash({operationId:f.op,transactionHash:identity.transactionHash,decisionId:'reviewed-first'},'gap2b-first'),{code:'AuthorizationRevoked'});
  assert.equal((await f.store.work(f.op)).state,'SUBMITTED_OR_UNKNOWN');
  assert.equal((await f.store.work(f.op)).dispatchAttempts,0);assert.equal(f.transport.submitted.length,0);
  f.transport.closeTime='1301';f.transport.ledger=31;f.transport.effect='NOT_APPLIED';
  assert.equal(await f.worker.run(f.op,'gap2b-reviewed-terminal'),'EXPIRED_NOT_APPLIED');
  assert.deepEqual((await db.query('select state,error_code from app_private.stellar_operations where id=$1',[f.op])).rows[0],{state:'REJECTED',error_code:'AuthorizationRevoked'});
  assert.deepEqual(await f.store.identity(f.op),identity);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,0);
 }finally{await db.close();}
});

test('GAP2B signed-revoked terminal proof requires time AND every auth ledger AND NOT_FOUND AND absent effect',async()=>{
 const db=await localDb();try{
  const f=await harness(db,true),identity=await signedReady(f,[25,30]),w=await f.store.work(f.op);
  await f.adapter.transaction(sql=>disableMemberships(sql,f.d,w.principal));
  for(const [time,ledger,effect] of [['1301',25,'NOT_APPLIED'],['1300',31,'NOT_APPLIED'],['1301',30,'NOT_APPLIED'],['1301',31,'UNRESOLVED'],['1301',31,'APPLIED']] as const){
   f.transport.closeTime=time;f.transport.ledger=ledger;f.transport.effect=effect;
   assert.equal(await f.worker.run(f.op,'gap2b-insufficient-proof'),'READY');assert.equal((await f.store.work(f.op)).dispatchAttempts,0);
  }
  f.transport.outage=true;assert.equal(await f.worker.run(f.op,'gap2b-observation-outage'),'READY');f.transport.outage=false;
  f.transport.success=true;assert.equal(await f.worker.run(f.op,'gap2b-external-receipt'),'READY');f.transport.success=false;
  const stateRead=f.transport.inspectExpiredEffect.bind(f.transport);
  f.transport.inspectExpiredEffect=async()=>({...await stateRead(),outcome:'NOT_APPLIED',stateReadLedger:30});
  assert.equal(await f.worker.run(f.op,'gap2b-stale-state'),'READY');
  f.transport.inspectExpiredEffect=stateRead;f.transport.effect='NOT_APPLIED';
  assert.equal(await f.worker.run(f.op,'gap2b-complete-proof'),'EXPIRED_NOT_APPLIED');
  const row=(await db.query<{state:string;error_code:string}>('select state,error_code from app_private.stellar_operations where id=$1',[f.op])).rows[0];
  assert.deepEqual(row,{state:'REJECTED',error_code:'AuthorizationRevoked'});
  assert.deepEqual((await db.query('select state,error_code from app_private.reward_attempts where operation_id=$1',[f.op])).rows[0],{state:'FAILED',error_code:'AuthorizationRevoked'});
  assert.deepEqual(await f.store.identity(f.op),identity);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,0);
  const forbidden=await db.query("select kind from api_private.testnet_observations where operation_id=$1 and (kind='RPC_OUTAGE' or kind='FAILED')",[f.op]);assert.equal(forbidden.rows.length,0);
  const other=await harness(db,false,f.key);const next=await other.store.claim(other.op,'gap2b-after-terminal');await other.store.release(next);
 }finally{await db.close();}
});
