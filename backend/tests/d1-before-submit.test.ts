import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { localDb, FakeTransport } from './testnet-fixtures.ts';
import { Repository } from '../src/application/repository.ts';
import { Coordinator } from '../src/application/coordinator.ts';
import { canonical } from '../src/application/validation.ts';
import { TestnetStellarService } from '../src/testnet/service.ts';
import { TestnetRpc } from '../src/testnet/rpc.ts';
import { DurableTransactionWorker } from '../src/testnet/worker.ts';
import { NETWORK_ID, type Observation, type TransactionIdentity, type FinalizedBody } from '../src/testnet/identity.ts';
import type { Work } from '../src/testnet/store.ts';
import { CONTRACT, WASM, TOKEN, ACTORS, invocation } from '../src/testnet/abi.ts';
import type { Battery, Command } from '../src/domain.ts';

/** Real Repository/pg transaction API over an independently reopenable PGlite database. */
function repository(db:PGlite,deploymentId:string){
  let ended=false;
  const pool=Object.assign(new EventEmitter(),{connect:async()=>{
    assert.equal(ended,false,'Old pool cannot survive restart');
    return Object.assign(new EventEmitter(),{query:async(s:string,p?:unknown[])=>{
      const sql=s.replace(/\$(\d+)\b/g,(v,n)=>p?.[Number(n)-1] instanceof Uint8Array?`decode(${v},'hex')`:v);
      const result=await db.query<Record<string,unknown>>(sql,p?.map(v=>v instanceof Uint8Array?Buffer.from(v).toString('hex'):v));
      return {...result,rows:result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])))};
    },release:()=>{}});
  },end:async()=>{ended=true;}}) as unknown as Pool;
  return Object.assign(Object.create(Repository.prototype) as Repository,{pool,deploymentId,mode:'TESTNET' as const});
}
type LedgerRow={hash:string;battery_id:string;battery:Battery;ledger:number};
/** Controlled authority, NOT a Soroban executor. Only this one registration fixture is supported. */
class ControlledLedger {
  readonly db:PGlite;
  constructor(db:PGlite){this.db=db;}
  async record(phase:string,hash:string|null=null){await this.db.query('insert into trace(phase,hash) values($1,$2)',[phase,hash]);}
  async read(batteryId:string){
    const row=(await this.db.query<LedgerRow>('select * from applied where battery_id=$1',[batteryId])).rows[0];
    return {mode:'CONTROLLED_AUTHORITY',ledger:row?.ledger??11,battery:row?.battery??null,effects:row?1:0};
  }
  async receipt(hash:string){return (await this.db.query<LedgerRow>('select * from applied where hash=$1',[hash])).rows[0];}
  async apply(i:TransactionIdentity,w:Work){
    assert.equal(w.command.kind,'register_battery');
    const command=w.command as Extract<Command,{kind:'register_battery'}>;
    const tx=new Transaction(Buffer.from(i.envelopeBytes).toString('base64'),Networks.TESTNET);
    assert.equal(Buffer.from(tx.hash()).toString('hex'),i.transactionHash);
    assert.equal(tx.signatures.length,1);
    assert.ok(Keypair.fromPublicKey(i.sourceAccount).verify(tx.hash(),tx.signatures[0].signature.toBytes()));
    const battery:Battery={state:'REGISTERED',registrationHash:command.registrationHash,requestId:null,collector:null,collectionHash:null,recycler:null,recyclingHash:null,rewardState:'NOT_ELIGIBLE'};
    await this.db.query('insert into applied(hash,battery_id,battery,ledger) values($1,$2,$3,12)',[i.transactionHash,command.batteryId,JSON.stringify(battery)]);
  }
}
class ControlledTransport extends FakeTransport {
  readonly authority:ControlledLedger;readonly work:(id:string)=>Promise<Work>;readonly restarted:boolean;readonly lostResponse:boolean;
  constructor(key:Keypair,authority:ControlledLedger,work:(id:string)=>Promise<Work>,restarted:boolean,lostResponse:boolean){
    super(key,()=>{});this.authority=authority;this.work=work;this.restarted=restarted;this.lostResponse=lostResponse;
  }
  override async prepareAndSimulate(w:Work){
    assert.equal(this.restarted,false,'Restart cannot prepare again');await this.authority.record('prepare');return super.prepareAndSimulate(w);
  }
  override async signEnvelope(p:FinalizedBody){
    assert.equal(this.restarted,false,'Restart cannot sign again');await this.authority.record('sign');return super.signEnvelope(p);
  }
  async assertSourceSequence(i:TransactionIdentity){
    assert.equal(await this.authority.receipt(i.transactionHash),undefined);
    await this.authority.record('final-source-check',i.transactionHash);
    return {sequence:(BigInt(i.sequence)-1n).toString(),balance:'100000000',ledger:11};
  }
  override async submit(i:TransactionIdentity){
    const w=await this.work(i.operationId);
    assert.equal(w.state,'DISPATCH_INTENT');assert.equal(w.dispatchAttempts,1);
    await this.authority.record('submit',i.transactionHash);await this.authority.apply(i,w);
    if(this.lostResponse)throw Error('Controlled lost response after effect');
    return {transactionHash:i.transactionHash};
  }
  override async observe(i:TransactionIdentity):Promise<Observation>{
    await this.authority.record('lookup',i.transactionHash);const row=await this.authority.receipt(i.transactionHash);
    return row?{status:'SUCCESS',confirmation:{transactionHash:i.transactionHash,confirmationLedger:row.ledger,observationLedger:15,
      resultXdr:'CONTROLLED_RESULT_NOT_NETWORK',resultMetaXdr:'CONTROLLED_META_NOT_NETWORK',events:[],sorobanResult:null,
      correlationId:'BYE-W1-005-CONTROLLED',facts:{battery:row.battery,request:null,stateReadLedger:15}}}
      :{status:'NOT_FOUND',observationLedger:11,ledgerCloseTime:'1100',correlationId:'BYE-W1-005-CONTROLLED'};
  }
}
function service(repo:Repository,authority:ControlledLedger,key:Keypair,restarted:boolean,lostResponse:boolean){
  let deniedExternalAttempts=0;
  const deny=async():Promise<never>=>{deniedExternalAttempts++;throw Error('Real RPC / signer prohibited by BYE-W1-005');};
  const s=new TestnetStellarService(repo,new TestnetRpc(deny),{authorize:deny,signEnvelope:deny});
  // Keep actual service processing/projection and durable worker; substitute ONLY the external fixture transport.
  const transport=new ControlledTransport(key,authority,id=>s.store.work(id),restarted,lostResponse);
  Object.assign(s,{worker:new DurableTransactionWorker(s.store,transport,s.worker.project)});
  return Object.assign(s,{deniedExternalAttempts:()=>deniedExternalAttempts});
}
async function snapshot(db:PGlite,s:TestnetStellarService,id:string){
  const i=(await s.store.identity(id))!,w=await s.store.work(id);
  return {operationId:id,identityId:id,identityIdDefinition:'testnet_envelopes primary key = operation_id',network:i.networkId,contract:i.contractAddress,
    method:w.command.kind,source:i.sourceAccount,sequence:i.sequence,hash:i.transactionHash,envelopeSha256:createHash('sha256').update(i.envelopeBytes).digest('hex'),
    state:w.state,dispatches:w.dispatchAttempts,operations:(await db.query('select id from app_private.stellar_operations')).rows.length,
    identities:(await db.query('select operation_id from api_private.testnet_envelopes')).rows.length};
}
for(const lostResponse of [false,true])test(`D1.7 durable READY before-submit restart, reviewed same identity first dispatch${lostResponse?' with lost response':''}`,async()=>{
  const location=new URL('../../.tools/bye-w1-005/controlled-'+randomUUID()+'/',import.meta.url);
  await mkdir(location,{recursive:true});const appPath=fileURLToPath(new URL('application/',location)),ledgerPath=fileURLToPath(new URL('authority/',location));
  let db=await localDb(appPath),ledgerDb=new PGlite(ledgerPath),closed=false;
  const deploymentId=randomUUID(),admin=randomUUID(),sessionId=randomUUID(),batteryId='BYE-W1-005-LOCAL-FIXTURE',key=randomUUID();
  const input={batteryId,metadata:{fixture:true,task:'BYE-W1-005',mode:'CONTROLLED_INTEGRATION'}},identity={authUserId:admin,sessionId};
  let repo=repository(db,deploymentId),s:ReturnType<typeof service>|undefined;
  try{
    await ledgerDb.exec('create table trace(id bigint generated always as identity,phase text,hash text); create table applied(hash text primary key,battery_id text unique,battery jsonb,ledger int);');
    await db.exec('create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
    await db.query('insert into auth.users values($1)',[admin]);await db.query('insert into auth.sessions values($1,$2,null)',[sessionId,admin]);
    await db.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[admin]);
    await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
      values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[deploymentId,NETWORK_ID,CONTRACT,WASM,ACTORS.admin,ACTORS.service,TOKEN]);
    await db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'ADMIN')",[deploymentId,admin]);
    let authority=new ControlledLedger(ledgerDb);const sourceKey=Keypair.random(),source=sourceKey.publicKey();
    s=service(repo,authority,sourceKey,false,lostResponse);const initialService=s;
    let operationId='',atInterruption:Awaited<ReturnType<typeof snapshot>>|undefined;
    const persist=s.store.persist.bind(s.store);
    s.store.persist=async(claim,i)=>{
      await persist(claim,i); // actual SQL transaction COMMIT
      assert.deepEqual((await initialService.store.identity(i.operationId))!.envelopeBytes,i.envelopeBytes); // committed readback
      assert.equal((await initialService.store.work(i.operationId)).state,'READY');
      assert.equal((await initialService.store.work(i.operationId)).dispatchAttempts,0);
      atInterruption=await snapshot(db,initialService,i.operationId);
      assert.equal((await authority.read(batteryId)).effects,0);
      throw Error('CONTROLLED_INTERRUPTION_AFTER_COMMIT_READBACK_BEFORE_INTENT');
    };
    const firstCoordinator=new Coordinator(repo,{},undefined,{process:async id=>{
      operationId=id;const row=(await db.query<{parameters:Command}>('select parameters from app_private.stellar_operations where id=$1',[id])).rows[0];
      // Fixture source key only; production source allowlists and signer are not exercised or changed.
      await initialService.store.queue(deploymentId,id,source,invocation(row.parameters).args.map(a=>a.toXDR('base64')));
      return initialService.process(id);
    }});
    assert.equal((await firstCoordinator.mutate(identity,{kind:'register'},input,key)).status,503);
    const before=await snapshot(db,s,operationId),preSubmit=await authority.read(batteryId);
    assert.deepEqual(before,atInterruption);assert.equal(s.deniedExternalAttempts(),0);
    assert.equal(before.state,'READY');assert.equal(before.dispatches,0);assert.equal(before.identities,1);assert.equal(before.operations,1);
    assert.equal(preSubmit.battery,null);assert.equal(preSubmit.effects,0);
    assert.equal((await db.query('select * from chain_private.batteries')).rows.length,0);
    const bytes=Buffer.from((await s.store.identity(operationId))!.envelopeBytes);
    // No old connection/service/worker is used after closing BOTH durable authorities.
    await repo.pool.end();await db.close();await ledgerDb.close();closed=true;s=undefined;
    db=new PGlite(appPath);ledgerDb=new PGlite(ledgerPath);closed=false;repo=repository(db,deploymentId);authority=new ControlledLedger(ledgerDb);
    s=service(repo,authority,Keypair.fromPublicKey(source),true,lostResponse);
    const restarted=await snapshot(db,s,operationId);assert.deepEqual(restarted,before);
    assert.deepEqual((await s.store.identity(operationId))!.envelopeBytes,bytes);
    assert.equal((await authority.read(batteryId)).effects,0);
    assert.equal((await s.process(operationId)).status,503); // unreviewed READY entry remains denied
    assert.equal((await snapshot(db,s,operationId)).dispatches,0);
    await assert.rejects(s.worker.retrySameHash({operationId,transactionHash:before.hash,decisionId:''},'invalid-review'),/RetryReviewRequired/);
    await assert.rejects(s.worker.retrySameHash({operationId,transactionHash:'00'.repeat(32),decisionId:'fixture'},'wrong-hash'),/RetryIdentityMismatch/);
    const recovered=s;
    const resumedCoordinator=new Coordinator(repo,{},undefined,{process:async id=>{
      assert.equal(id,operationId);
      assert.equal(await recovered.worker.retrySameHash({operationId:id,transactionHash:before.hash,decisionId:'BYE-W1-005-CONTROLLED-REVIEW'},'reconstructed-reviewed-worker'),'PROJECTED');
      return recovered.process(id);
    }});
    const response=await resumedCoordinator.mutate(identity,{kind:'register'},input,key);
    assert.equal(response.status,201);assert.equal(response.body.operationId,operationId);assert.equal(response.body.transactionHash,before.hash);
    const after=await snapshot(db,s,operationId),finalState=await authority.read(batteryId);
    assert.equal(after.state,'PROJECTED');assert.equal(after.dispatches,1);assert.equal(after.operations,1);assert.equal(after.identities,1);
    assert.equal(after.hash,before.hash);assert.equal(after.envelopeSha256,before.envelopeSha256);assert.equal(after.identityId,before.identityId);
    assert.equal(s.deniedExternalAttempts(),0);
    assert.equal(finalState.effects,1);assert.equal(finalState.battery!.state,'REGISTERED');
    const trace=(await ledgerDb.query<{phase:string;hash:string|null}>('select phase,hash from trace order by id')).rows;
    for(const phase of ['prepare','sign','submit','final-source-check'])assert.equal(trace.filter(t=>t.phase===phase).length,1,phase);
    assert.ok(trace.filter(t=>t.phase==='lookup').every(t=>t.hash===before.hash));
    const observations=(await db.query<{kind:string;evidence:unknown}>('select kind,evidence from api_private.testnet_observations where operation_id=$1 order by id',[operationId])).rows;
    assert.equal(observations.filter(o=>o.kind==='DISPATCH_INTENT').length,1);
    assert.equal((await resumedCoordinator.mutate(identity,{kind:'register'},input,key)).body.operationId,operationId);
    await assert.rejects(resumedCoordinator.mutate(identity,{kind:'register'},{...input,metadata:{...input.metadata,task:'BYE-W1-005-CHANGED'}},key),/IdempotencyConflict/);
    await assert.rejects(s.worker.retrySameHash({operationId,transactionHash:before.hash,decisionId:'second-review'},'duplicate'),/TransportResolved/);
    assert.deepEqual(await snapshot(db,s,operationId),after);assert.deepEqual(await authority.read(batteryId),finalState);
    const projected=(await db.query<{state:string;registration_hash:Uint8Array}>('select state,registration_hash from chain_private.batteries')).rows[0];
    assert.equal(projected.state,'REGISTERED');assert.equal(Buffer.from(projected.registration_hash).toString('hex'),finalState.battery!.registrationHash);
    await writeFile(new URL('trace.json',location),JSON.stringify({task:'BYE-W1-005',observedAt:new Date().toISOString(),evidenceMode:'CONTROLLED_INTEGRATION_NOT_LIVE_TESTNET',lostResponse,
      before,preSubmit,afterRestart:restarted,after,finalAuthority:finalState,trace,observations,prepareCount:1,signCount:1,firstDispatchCount:1,
      restartBoundary:'Closed and reopened both on-disk PGlite databases; new Repository/pool/TestnetStellarService/worker/transport; restart key public-only',
      sourceSelection:'Fixture source injected at durable service queue; production source allowlists/simulation/helper not exercised',
      reviewedEntryPoint:'Existing DurableTransactionWorker.retrySameHash; NOT_FOUND precedes reviewed first dispatch; reviewedSameHashRetry flag retained truthfully',
      liveRpcCalls:0,liveBroadcasts:0,secureStoreCalls:0,rawSignedEnvelopePublished:false},null,2)+'\n');
  }finally{if(!closed){await repo.pool.end();await db.close();await ledgerDb.close();}}
});

test('D1.5 retired principal cache cannot be borrowed by another authenticated user or rebound',async()=>{
  const db=await localDb(),deploymentId=randomUUID(),retired=randomUUID(),active=randomUUID(),session=randomUUID(),op=randomUUID(),key=randomUUID();
  const repo=repository(db,deploymentId),input={batteryId:'BYE-W1-005-RETIRED-FIXTURE',metadata:{fixture:true}};
  let processed=0;
  try{
    await db.exec('create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
    await db.query('insert into auth.users values($1)',[active]);await db.query('insert into auth.sessions values($1,$2,null)',[session,active]);
    await db.query("insert into app_private.users(id,auth_user_id,status) values($1,null,'DISABLED'),($2,$2,'ACTIVE')",[retired,active]);
    await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
      values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[deploymentId,NETWORK_ID,CONTRACT,WASM,ACTORS.admin,ACTORS.service,TOKEN]);
    const command={kind:'register_battery',batteryId:input.batteryId,registrationHash:'11'.repeat(32)};
    await db.query('insert into app_private.battery_records(deployment_id,battery_id,metadata,created_by) values($1,$2,$3,$4)',[deploymentId,input.batteryId,JSON.stringify(input.metadata),retired]);
    await db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
      values($1,$2,$3,$4,'register_battery',$5,$6,decode($7,'hex'))`,[op,deploymentId,retired,key,input.batteryId,JSON.stringify(command),createHash('sha256').update(canonical(command)).digest('hex')]);
    await db.query(`insert into api_private.idempotency(deployment_id,user_id,key,input_hash,operation_id,response_status,response_body)
      values($1,$2,$3,decode($4,'hex'),$5,201,$6)`,[deploymentId,retired,key,createHash('sha256').update(canonical({action:{kind:'register'},input})).digest('hex'),op,JSON.stringify({operationId:op,source:'TESTNET'})]);
    const coordinator=new Coordinator(repo,{},undefined,{process:async()=>{processed++;throw Error('Processor must never run');}});
    await assert.rejects(coordinator.mutate({authUserId:retired,sessionId:randomUUID()},{kind:'register'},input,key),/SessionRevoked/);
    const reply=await coordinator.mutate({authUserId:active,sessionId:session},{kind:'register'},input,key);
    assert.equal(reply.status,403);assert.notEqual(reply.body.operationId,op);
    await assert.rejects(db.query('update app_private.users set auth_user_id=$1 where id=$2',[active,retired]),/IdentityImmutable/);
    assert.equal(processed,0);assert.equal((await db.query('select id from app_private.stellar_operations')).rows.length,1);
    assert.equal((await db.query('select operation_id from api_private.testnet_envelopes')).rows.length,0);
    assert.equal((await db.query<{response_status:number}>('select response_status from api_private.idempotency where user_id=$1',[retired])).rows[0].response_status,201);
  }finally{await repo.pool.end();await db.close();}
});
