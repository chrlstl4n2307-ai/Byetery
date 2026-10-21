import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type {Pool,PoolClient} from 'pg';
import type {PGlite} from '@electric-sql/pglite';
import {databaseHealth,databaseTransaction} from '../src/application/database.ts';
import {PgTransportDatabase,TransportStore} from '../src/testnet/store.ts';
import {LocalTransactionWorker,recoveryClassification} from '../src/testnet/worker.ts';
import {localDb,harness} from './testnet-fixtures.ts';
import {Account,Address,Contract,Networks,Operation,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {TestnetRpc} from '../src/testnet/rpc.ts';
import {TestnetTransport} from '../src/testnet/transport.ts';
import {ACTORS,CONTRACT,invocation} from '../src/testnet/abi.ts';
import type {Command} from '../src/domain.ts';
import type {Work} from '../src/testnet/store.ts';
import {DomainError} from '../src/domain.ts';

/** Real SQL/rollback with pg's independent pool/client EventEmitter contract. No TCP. */
function faultPool(db:PGlite){
 let armed=false,destroyed=0;
 const emitter=new EventEmitter();
 const pool=Object.assign(emitter,{connect:async()=>{
  const client=Object.assign(new EventEmitter(),{query:async(sql:string,params?:unknown[])=>{
   const binary=sql.replace(/\$(\d+)\b/g,(v,n)=>params?.[Number(n)-1] instanceof Uint8Array?`decode(${v},'hex')`:v);
   const result=await db.query<Record<string,unknown>>(binary,params?.map(v=>v instanceof Uint8Array?Buffer.from(v).toString('hex'):v));
   if(armed&&sql==='select 1 as before_helper'){
    armed=false;await db.query('rollback');
    client.emit('error',new Error('Connection terminated unexpectedly'));
   }
   return {...result,rows:result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])))};
  },release:(remove?:boolean)=>{if(remove)destroyed++;}});
  emitter.emit('connect',client);return client;
 }}) as unknown as Pool;
 return {pool,arm:()=>{armed=true;},destroyed:()=>destroyed};
}
test('pool/client error events are bounded and connection loss cannot return successful COMMIT',async()=>{
 const db=await localDb();try{
  const p=faultPool(db),health=databaseHealth(p.pool),guard=health.guard();p.arm();
  await assert.rejects(databaseTransaction(p.pool,client=>client.query('select 1 as before_helper'),'5s'),/DatabaseConnectionInterrupted/);
  assert.equal(p.destroyed(),1);assert.throws(guard,/DatabaseConnectionInterrupted/);
  assert.doesNotThrow(()=>p.pool.emit('error',new Error('sensitive payload must not be logged'),undefined));
  assert.equal((await databaseTransaction(p.pool,c=>c.query('select 1 as healthy'),'5s')).rows[0].healthy,1);
 }finally{await db.close();}
});
test('collection PREPARING disconnect before helper signs/sends nothing; reconnect requires explicit same-operation recovery',async()=>{
 const db=await localDb();try{
  const f=await harness(db,false,undefined,true),p=faultPool(db),store=new TransportStore(new PgTransportDatabase(p.pool));
  const originalEvidence=(await db.query("select encode(manifest_bytes,'hex') bytes,encode(payload_hash,'hex') hash,encode(commitment,'hex') commitment from app_private.evidence_versions")).rows;
  let helperCalls=0;
  const attach=f.transport.attachSorobanAuthorization.bind(f.transport);
  f.transport.attachSorobanAuthorization=async body=>{
   const healthy=databaseHealth(p.pool).guard();
   await databaseTransaction(p.pool,c=>c.query('select 1 as before_helper'),'5s');healthy();
   helperCalls++;return attach(body);
  };
  const worker=new LocalTransactionWorker(store,f.transport,f.project);p.arm();
  await assert.rejects(worker.run(f.op,'fault-before-helper'),/DatabaseConnectionInterrupted/);
  assert.equal(helperCalls,0);assert.equal(f.transport.signCount,0);assert.equal(f.transport.submitted.length,0);
  assert.equal(await store.identity(f.op),null);assert.equal((await store.work(f.op)).dispatchAttempts,0);
  assert.equal(recoveryClassification(await store.work(f.op),null),'UNSIGNED_PREPARATION_INTERRUPTED');
  assert.equal((await db.query<{n:number}>('select count(*)::int n from app_private.stellar_operations')).rows[0].n,1);
  assert.equal((await db.query<{n:number}>('select count(*)::int n from api_private.testnet_envelopes')).rows[0].n,0);
  assert.equal((await db.query<{state:string}>('select state from chain_private.batteries')).rows[0].state,'RETURNED');
  assert.equal((await db.query<{state:string}>('select state from chain_private.return_requests')).rows[0].state,'OPEN');
  assert.deepEqual((await db.query("select encode(manifest_bytes,'hex') bytes,encode(payload_hash,'hex') hash,encode(commitment,'hex') commitment from app_private.evidence_versions")).rows,originalEvidence);
  // Reconnected reads succeed; normal worker/API recovery is still not permission to sign.
  await assert.rejects(worker.run(f.op,'after-reconnect'),/ExplicitUnsignedResumeRequired/);
  assert.equal(helperCalls,0);assert.equal(f.transport.submitted.length,0);
  const review={operationId:f.op,contextHash:(await store.work(f.op)).contextHash,decisionId:'review-original-collection-only'};
  await assert.rejects(worker.resumeUnsigned({...review,contextHash:'99'.repeat(32)},'wrong-context'),/UnsignedRecoveryMismatch/);
  f.transport.success=true;
  assert.equal(await worker.resumeUnsigned(review,'reviewed-owner-resume'),'PROJECTED');
  assert.equal(helperCalls,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
  assert.equal((await db.query<{n:number}>('select count(*)::int n from api_private.testnet_envelopes')).rows[0].n,1);
  assert.equal((await db.query<{n:number}>('select count(*)::int n from app_private.stellar_operations')).rows[0].n,1);
  assert.equal((await db.query<{state:string}>('select state from chain_private.batteries')).rows[0].state,'COLLECTED');
  assert.equal((await db.query<{state:string}>('select state from chain_private.return_requests')).rows[0].state,'CONFIRMED');
  await worker.run(f.op,'duplicate');assert.equal(f.transport.submitted.length,1);assert.equal(f.transport.signCount,1);
  assert.deepEqual((await db.query("select encode(manifest_bytes,'hex') bytes,encode(payload_hash,'hex') hash,encode(commitment,'hex') commitment from app_private.evidence_versions")).rows,originalEvidence);
 }finally{await db.close();}
});
test('signed identity and dispatched uncertainty never enter unsigned recovery',async()=>{
 const db=await localDb();try{
  const f=await harness(db),claim=await f.store.claim(f.op,'fixture');
  await f.store.preparing(claim);await f.store.release(claim);
  await f.worker.resumeUnsigned({operationId:f.op,contextHash:(await f.store.work(f.op)).contextHash,decisionId:'fixture-review'},'resume');
  const identity=await f.store.identity(f.op);assert.ok(identity);
  assert.equal(recoveryClassification({...await f.store.work(f.op),dispatchAttempts:0},identity),'SIGNED_IDENTITY_EXISTS');
  assert.equal(recoveryClassification(await f.store.work(f.op),identity),'SUBMITTED_OR_UNKNOWN');
  await assert.rejects(f.worker.resumeUnsigned({operationId:f.op,contextHash:(await f.store.work(f.op)).contextHash,decisionId:'not-unsigned'},'forbidden'),/UnsignedRecoveryMismatch/);
  assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
 }finally{await db.close();}
});
test('real transport checks connection epoch after async signing gates and before either helper phase',async()=>{
 const db=await localDb();try{
  const p=faultPool(db),health=databaseHealth(p.pool);let helperCalls=0;
  const command:Command={kind:'confirm_collection',batteryId:'BYE-CONNECTION-FAULT',requestId:'11'.repeat(32),collector:ACTORS.collector,
   evidence:{version:1,batteryId:'BYE-CONNECTION-FAULT',requestId:'11'.repeat(32),kind:'COLLECTION',payloadHash:'22'.repeat(32)}};
  const call=new Contract(CONTRACT).call(command.kind,...invocation(command).args);
  if(call.body.type!=='invokeHostFunction')throw Error();const func=call.body.invokeHostFunctionOp.hostFunction;
  if(func.type!=='hostFunctionTypeInvokeContract')throw Error();
  const root=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(func.invokeContract),subInvocations:[]});
  const auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:root}),new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddressV2(new xdr.SorobanAddressCredentials({address:new Address(ACTORS.collector).toScAddress(),nonce:1n,signatureExpirationLedger:0,signature:xdr.ScVal.scvVoid()})),rootInvocation:root})];
  const tx=new TransactionBuilder(new Account(ACTORS.service,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeHostFunction({func,auth})).setTimebounds(0,1100).build();
  class Rpc extends TestnetRpc {
   override async network(){return {passphrase:Networks.TESTNET,protocolVersion:'29'};}
   override async latest(){p.pool.emit('error',new Error('Connection terminated unexpectedly'),undefined);return {id:'fixture',sequence:10,closeTime:'1000',protocolVersion:'29'};}
  }
  const transport=new TestnetTransport(new Rpc(),{authorize:async()=>{helperCalls++;throw Error('UnexpectedHelper');},signEnvelope:async()=>{helperCalls++;throw Error('UnexpectedHelper');}},
   {validate:async()=>{await databaseTransaction(p.pool,c=>c.query('select 1'),'5s');},connectionGuard:()=>health.guard()},async()=>{throw Error();},'fixture');
  const body={transactionXdr:tx.toXDR(),preparedLedger:10};const work={command} as Work;
  await assert.rejects(transport.attachSorobanAuthorization(body,work),/DatabaseConnectionInterrupted/);
  await assert.rejects(transport.signEnvelope({...body,transactionHash:Buffer.from(tx.hash()).toString('hex')},work),/DatabaseConnectionInterrupted/);
  assert.equal(helperCalls,0);assert.equal(tx.signatures.length,0);
 }finally{await db.close();}
});
test('lost COMMIT acknowledgement leaves one signed identity and reconnect cannot dispatch or reprepare it',async()=>{
 const db=await localDb();try{
  const f=await harness(db);let failOnce=true;
  const store=new TransportStore({transaction:async work=>{
   let identityWritten=false;
   const result=await f.adapter.transaction(sql=>work({query:async <R>(text:string,params?:unknown[])=>{
    if(text.includes('insert into api_private.testnet_envelopes'))identityWritten=true;
    return sql.query<R>(text,params);
   }}));
   if(identityWritten&&failOnce){failOnce=false;throw new DomainError('DatabaseConnectionInterrupted');}
   return result;
  }});
  const worker=new LocalTransactionWorker(store,f.transport,f.project);
  await assert.rejects(worker.run(f.op,'uncertain-commit'),/DatabaseConnectionInterrupted/);
  const identity=await store.identity(f.op);assert.ok(identity);assert.equal(await store.requiresReview(f.op),true);
  assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,0);
  assert.equal(recoveryClassification(await store.work(f.op),identity),'SIGNED_IDENTITY_EXISTS');
  await assert.rejects(worker.run(f.op,'after-reconnect'),/SignedIdentityRequiresReviewedDispatch/);
  await assert.rejects(worker.resumeUnsigned({operationId:f.op,contextHash:(await store.work(f.op)).contextHash,decisionId:'cannot-use-unsigned-recovery'},'wrong-recovery'),/UnsignedRecoveryMismatch/);
  assert.equal(f.transport.signCount,1);assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.submitted.length,0);
  assert.equal((await db.query<{n:number}>('select count(*)::int n from api_private.testnet_envelopes')).rows[0].n,1);
 }finally{await db.close();}
});
