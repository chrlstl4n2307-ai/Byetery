import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,realpath,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {Account,Contract,Networks,TransactionBuilder} from '@stellar/stellar-sdk';
import {incidentFixture,seedIncident,INCIDENT,sha} from './d3-close-fixture.ts';
import {harness,localDb} from './testnet-fixtures.ts';
import {TransportStore,type TransportDatabase,type Sql} from '../src/testnet/store.ts';
import {DurableTransactionWorker} from '../src/testnet/worker.ts';
import {closeReviewedRegistration,readClosureReceipt} from '../src/testnet/pre-dispatch-close.ts';
import {operationStatus,operationPresentation,type StatusRow} from '../src/application/operation-status.ts';
import {ExecutionSupervisor} from '../src/application/execution-supervisor.ts';
import {Coordinator} from '../src/application/coordinator.ts';
import {api,listen,close} from '../src/application/http.ts';
import {SupabaseAuth} from '../src/application/auth.ts';
import {observeOperation,timeoutClassification} from '../src/d3/operation-polling.ts';
import {incidentCloseManifest,writeIncidentCloseManifest} from '../src/d3/incident-close-manifest.ts';
import {consumeBattery} from '../src/d3/operator-control.ts';
import {LocalSecureStoreSigner} from '../src/local-secure-store-signer.ts';
import {ACTORS,CONTRACT,invocation} from '../src/testnet/abi.ts';
import {SIGNER_FEE_CAP} from '../src/testnet/identity.ts';
import {assertLocalRuntime} from '../src/d3/operator-guard.ts';
type Fixture=Awaited<ReturnType<typeof incidentFixture>>;
function planned(n:number,name:string,fn:()=>Promise<void>|void){test(`D3-9B-${String(n).padStart(2,'0')} ${name}`,fn);}
function withIncident(n:number,name:string,fn:(fixture:Fixture)=>Promise<void>){planned(n,name,async()=>{const fixture=await incidentFixture();try{await fn(fixture);}finally{await fixture.pg.close();}});}
function gate(){let open!:()=>void;const wait=new Promise<void>(resolve=>{open=resolve;});return {wait,open};}
async function addEnvelope(db:Sql,f:Awaited<ReturnType<typeof seedIncident>>){
  const i=f.identity;
  await db.query(`insert into api_private.testnet_envelopes(deployment_id,operation_id,network_id,contract_address,source_account,sequence,
    signed_envelope,transaction_hash,context_hash,min_time,max_time,authorization_expirations,prepared_ledger)
    values($1,$2,decode($3,'hex'),$4,$5,$6,decode('01','hex'),decode($7,'hex'),decode($8,'hex'),1,500,'{}',100)`,
    [i.deploymentId,i.operationId,i.networkId,i.contractAddress,i.sourceAccount,i.sequence,i.transactionHash,i.contextHash]);
}
async function receiptCount(db:Sql){return Number((await db.query<{n:number}>("select count(*) as n from api_private.testnet_observations where kind='PRE_DISPATCH_CLOSE'")).rows[0].n);}
const row:StatusRow={id:INCIDENT.operationId,state:'QUEUED',transport_state:'PREPARING',transaction_hash:null,dispatch_attempts:0,review_required:false,interrupted:false};
const status=(fields:Partial<StatusRow>={})=>operationPresentation({...row,...fields});

withIncident(1,'restart rejects interrupted preparation before work',async f=>{
  await assert.rejects(f.worker.run(f.op,'restart'),/ExplicitUnsignedResumeRequired/);
  assert.equal(f.transport.prepareCount+f.transport.signCount+f.transport.submitted.length,0);
});
withIncident(2,'durable envelope prevents closure',async f=>{await addEnvelope(f.db,f);await assert.rejects(f.close(),/ClosureIdentityOrDispatchExists/);assert.equal(await receiptCount(f.db),0);});
withIncident(3,'dispatch attempt counter prevents closure',async f=>{
  const claim=await f.store.claim(f.op,'fixture-dispatch');await f.store.persist(claim,f.identity);await f.store.dispatchIntent(claim,false);await f.store.release(claim);
  assert.equal((await f.store.work(f.op)).dispatchAttempts,1);await assert.rejects(f.close(),/ClosureStateMismatch/);
});
withIncident(4,'dispatch evidence with zero counter prevents closure',async f=>{
  await f.db.query("insert into api_private.testnet_observations(deployment_id,operation_id,kind,evidence) values($1,$2,'DISPATCH_INTENT','{}')",[f.d,f.op]);
  await assert.rejects(f.close(),/ClosureIdentityOrDispatchExists/);assert.equal(await receiptCount(f.db),0);
});
withIncident(5,'legacy transaction reference prevents closure',async f=>{
  await f.db.query('insert into api_private.operation_transport(deployment_id,operation_id,prepared,submission) values($1,$2,$3,$4)',[f.d,f.op,'{}',JSON.stringify({reference:f.identity.transactionHash})]);
  await assert.rejects(f.close(),/ClosureIdentityOrDispatchExists/);
});
withIncident(6,'source sequence drift and disagreement block proof',async f=>{
  const expected=await f.proofReader.accounts();
  await assert.rejects(f.getProof({accounts:async()=>({...expected,rpc:{...expected.rpc,sequence:'7'}})}),/ClosureSequenceMismatch/);
  await assert.rejects(f.getProof({accounts:async()=>({...expected,horizon:{...expected.horizon,balance:'101'}})}),/ClosureAccountDisagreement/);
});
withIncident(7,'nonempty or incomplete history blocks proof',async f=>{
  const expected=await f.proofReader.history();
  await assert.rejects(f.getProof({history:async()=>({...expected,transactions:[{fixture:true}]})}),/ClosureHistoryUnproven/);
  await assert.rejects(f.getProof({history:async()=>({...expected,throughLedger:199})}),/ClosureHistoryUnproven/);
});
withIncident(8,'present or unknown contract state blocks closure',async f=>{
  const expected=await f.proofReader.effect();
  for(const state of ['PRESENT','ARCHIVED_OR_UNKNOWN'] as const)await assert.rejects(f.getProof({effect:async()=>({...expected,status:state})}),/ClosureEffectUnproven/);
  await f.db.query("insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,reward_state,confirmed_ledger) values($1,$2,'REGISTERED',decode($3,'hex'),'NOT_ELIGIBLE',1)",[f.d,f.battery,f.command.registrationHash]);
  await assert.rejects(f.close(),/ClosureIdentityOrDispatchExists/);
});
withIncident(9,'lease, worker or helper blocks closure',async f=>{
  const quiet=await f.proofReader.quiescence();
  for(const field of ['workers','helpers','activeLeases'])await assert.rejects(f.getProof({quiescence:async()=>({...quiet,[field]:1})}),/ClosureNotQuiescent/);
  const claim=await f.store.claim(f.op,'still-running');try{await assert.rejects(f.close(),/ClosureLeaseActiveOrMissing/);}finally{await f.store.release(claim);}
});
withIncident(10,'owner and incident binding are mandatory',async f=>{
  for(const override of [{decisionId:''},{operationId:randomUUID()},{fixSha:INCIDENT.incidentSha},{deploymentId:randomUUID()}])
    await assert.rejects(f.getProof({},override),/ClosureReviewMismatch/);
  await assert.rejects(f.getProof({},{decisionId:'unapproved-review'}),/ClosureOwnerDecisionMismatch/);
  const contextHash='ab'.repeat(32);
  const wrong=await f.getProof({ownerDecision:async()=>({...f.review,contextHash})},{contextHash});
  await assert.rejects(closeReviewedRegistration(f.adapter,wrong),/ClosureContextMismatch/);
});
withIncident(11,'stale and unbranded proof fail closed',async f=>{
  const proof=await f.getProof();await assert.rejects(closeReviewedRegistration(f.adapter,proof,()=>proof.observedAt+5001),/FreshVerifiedClosureRequired/);
  await assert.rejects(closeReviewedRegistration(f.adapter,{...proof}),/FreshVerifiedClosureRequired/);
  const newer=await f.store.claim(f.op,'generation-drift');await f.store.release(newer);
  await assert.rejects(closeReviewedRegistration(f.adapter,proof),/ClosureLeaseGenerationChanged/);
});
withIncident(12,'failed independent read leaves the operation unchanged',async f=>{
  await assert.rejects(f.getProof({accounts:async()=>{throw Error('fixture read unavailable');}}),/unavailable/);
  assert.equal((await f.store.work(f.op)).state,'PREPARING');assert.equal(await receiptCount(f.db),0);
});
withIncident(13,'newly recovered envelope material blocks closure',async f=>{
  const quiet=await f.proofReader.quiescence();await assert.rejects(f.getProof({quiescence:async()=>({...quiet,artifacts:['fixture-envelope']})}),/ClosureNotQuiescent/);
});
withIncident(14,'clean proof commits one local receipt without execution',async f=>{
  const receipt=await f.close();assert.equal(receipt.operationId,f.op);assert.equal(await receiptCount(f.db),1);
  assert.equal(f.transport.prepareCount+f.transport.signCount+f.transport.submitted.length,0);
});
withIncident(15,'closed transport is immutable and has no identity',async f=>{
  await f.close();const work=await f.store.work(f.op);assert.equal(work.state,'ABORTED_PRE_DISPATCH');assert.equal(work.confirmation,null);
  assert.equal(await f.store.identity(f.op),null);await assert.rejects(f.db.query("update api_private.testnet_work set state='PREPARING' where operation_id=$1",[f.op]),/TransportTerminal/);
});
withIncident(16,'logical cancellation and original idempotency receipt commit together',async f=>{
  await f.close();const row=(await f.db.query<{state:string;error_code:string;key:string;response_body:Record<string,unknown>}>(`select o.state,o.error_code,i.key,i.response_body from app_private.stellar_operations o join api_private.idempotency i on i.operation_id=o.id`)).rows[0];
  assert.equal(row.state,'CANCELLED_LOCAL');assert.equal(row.error_code,'PreDispatchAborted');assert.equal(row.key,f.key);assert.equal(row.response_body.class,'TERMINAL_UNSIGNED');
});
withIncident(17,'local close removes all unresolved and active counters',async f=>{
  await f.close();const counts=(await f.db.query(`select
   (select count(*)::int from app_private.stellar_operations where state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN')) unresolved,
   (select count(*)::int from api_private.testnet_work where state not in ('PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','ABORTED_PRE_DISPATCH')) reconciliation,
   (select count(*)::int from api_private.testnet_work where state in ('READY','DISPATCH_INTENT','SUBMITTED_OR_UNKNOWN')) dispatch,
   (select count(*)::int from api_private.testnet_source_leases where lease_until>clock_timestamp()) leases`)).rows[0];
  assert.deepEqual(counts,{unresolved:0,reconciliation:0,dispatch:0,leases:0});
});
withIncident(18,'closed battery ID and tombstone cannot be reused',async f=>{
  const dir=fileURLToPath(new URL(`../../.tools/d3-9c/tombstone-${randomUUID()}/`,import.meta.url));await mkdir(dir);
  await consumeBattery(dir,f.battery);await f.close();await assert.rejects(consumeBattery(dir,f.battery),/EEXIST/);
  const result=await new Coordinator(f.repo).mutate({authUserId:f.user,sessionId:f.session},{kind:'register'},{batteryId:f.battery},'fixture-new-key');
  assert.equal(result.status,409);assert.match(JSON.stringify(result.body),/BatteryAlreadyExists/);
});
withIncident(19,'closure preserves the original registration bytes and simulation',async f=>{
  const evidence=()=>f.db.query(`select to_jsonb(e) as row from app_private.evidence_versions e union all select to_jsonb(x) from api_private.testnet_observations x where kind='STATE_READ'`);
  const before=(await evidence()).rows;await f.close();assert.deepEqual((await evidence()).rows,before);
});
withIncident(20,'scheduler/direct/reviewed resume cannot execute terminal work',async f=>{
  await f.close();let selected=0;
  await new Coordinator(f.repo,{},undefined,{process:async()=>{selected++;throw Error('must not process closed operation');}}).reconcile();
  assert.equal(selected,0);assert.equal(await f.worker.run(f.op,'restart'),'ABORTED_PRE_DISPATCH');
  await assert.rejects(f.worker.resumeUnsigned({operationId:f.op,contextHash:f.review.contextHash,decisionId:'fixture'},'restart'),/UnsignedRecoveryMismatch/);
  assert.equal(f.transport.prepareCount+f.transport.signCount+f.transport.observed.length+f.transport.submitted.length+f.projections(),0);
});
withIncident(21,'signed branches still require a durable envelope',async f=>{
  for(const state of ['SIGNED','READY','DISPATCH_INTENT','SUBMITTED_OR_UNKNOWN','CONFIRMED_SUCCESS','CONFIRMED_FAILED','PROJECTED','EXPIRED_NOT_APPLIED'])
    await assert.rejects(f.db.query('update api_private.testnet_work set state=$2 where operation_id=$1',[f.op,state]),/IdentityNotDurable/);
});
planned(22,'signed recovery reuses the original hash and never re-signs',async()=>{
  const db=await localDb();try{
    const f=await harness(db);f.transport.loseSubmit=true;await f.worker.run(f.op,'first');const id=await f.store.identity(f.op);assert.ok(id);
    f.transport.success=true;await f.worker.run(f.op,'restart');assert.equal((await f.store.identity(f.op))?.transactionHash,id.transactionHash);
    assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);assert.equal(f.projectionCount(),1);
  }finally{await db.close();}
});
planned(23,'pre-dispatch observation differs from lost acknowledgement',()=>{
  assert.equal(timeoutClassification(), 'REQUEST_ACK_UNKNOWN');assert.equal(timeoutClassification(status()),'REQUEST_TIMEOUT_PRE_DISPATCH');
  assert.equal(status().transactionHash,null);assert.equal(status().submissionEvidence,'NONE');
});
planned(24,'post-intent observation retains the same original hash',async()=>{
  const hash=sha('fixture same hash');const initial=status({state:'UNKNOWN',dispatch_attempts:1,transaction_hash:hash});let time=0,calls=0;
  assert.equal(timeoutClassification(initial),'SUBMITTED_RESPONSE_UNCERTAIN');
  const done=await observeOperation(async()=>++calls===1?initial:{...initial,class:'CONFIRMED',terminal:true,result:'SUCCESS'},{now:()=>time,sleep:async ms=>{time+=ms;}});
  assert.equal(done.transactionHash,hash);assert.equal(calls,2);
});
withIncident(25,'same-key replay does not process or replace durable work',async f=>{
  let calls=0;const coord=new Coordinator(f.repo,{},undefined,{process:async()=>{calls++;throw Error('no replay');}});
  const actor={authUserId:f.user,sessionId:f.session},act={kind:'register' as const},input={batteryId:'BYE-ASYNC-25'},key='fixture-key-25';
  const a=await coord.acknowledge(actor,act,input,key),b=await coord.acknowledge(actor,act,input,key);
  assert.equal(a.body.operationId,b.body.operationId);assert.equal(calls,0);
  await assert.rejects(coord.acknowledge(actor,act,{batteryId:'BYE-ASYNC-OTHER'},key),/IdempotencyConflict/);
});
withIncident(26,'HTTP202 precedes worker processing',async f=>{
  let calls=0;const actor={authUserId:f.user,sessionId:f.session};
  class AuthFixture extends SupabaseAuth {override async validate(){return actor;}}
  const coord=new Coordinator(f.repo,{},undefined,{process:async()=>{calls++;return {status:503,body:{}};}});
  const server=api(new AuthFixture({} as never),coord),url=await listen(server);
  try{
    const response=await fetch(url+'/api/batteries',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'fixture-async-26'},body:'{"batteryId":"BYE-ASYNC-26"}'});
    const body=await response.json();assert.equal(response.status,202);assert.equal(body.class,'ACCEPTED');assert.equal(calls,0);
    const observed=await fetch(url+body.statusUrl);assert.equal(observed.status,200);assert.equal(observed.headers.get('cache-control'),'no-store');
    assert.equal((await observed.json()).operationId,body.operationId);assert.equal(calls,0);
  }finally{await close(server);}
});
withIncident(27,'database rejects half-close and missing review receipt',async f=>{
  await assert.rejects(f.db.query("update api_private.testnet_work set state='ABORTED_PRE_DISPATCH' where operation_id=$1",[f.op]),/UnsignedClosureNotReviewed/);
  await assert.rejects(f.db.query("update app_private.stellar_operations set state='CANCELLED_LOCAL' where id=$1",[f.op]),/UnsignedClosePairRequired/);
  assert.equal((await f.store.work(f.op)).state,'PREPARING');
});
const migrationDir=new URL('../../database/migrations/',import.meta.url);
const migrations=async()=> (await readdir(migrationDir)).filter(name=>name.endsWith('.sql')).sort();
planned(28,'forward migration preserves existing rows, signed state, RLS and ACLs',async()=>{
  const db=new PGlite();try{
    await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;');
    const files=await migrations();for(const file of files.slice(0,-1))await db.exec(await readFile(new URL(file,migrationDir),'utf8'));
    const f=await harness(db);
    // The old schema did not have phase observations. Seed the previous writer's exact state sequence.
    const historical=new TransportStore({transaction:work=>f.adapter.transaction(sql=>work({query:<T>(statement:string,params?:unknown[])=>
      statement.startsWith('insert into api_private.testnet_observations')&&params?.[2]==='EXECUTION_PHASE'?Promise.resolve({rows:[]}):sql.query<T>(statement,params)}))});
    const worker=new DurableTransactionWorker(historical,f.transport,f.project);
    const phase=historical.phase.bind(historical);historical.phase=async(c,name)=>{if(name!=='IDENTITY_PERSIST_START')await phase(c,name);};
    f.transport.success=true;await worker.run(f.op,'fixture-historical');
    const snapshot=()=>db.query(`select (select jsonb_agg(to_jsonb(w)) from api_private.testnet_work w) work,
      (select jsonb_agg(to_jsonb(e)) from api_private.testnet_envelopes e) identity,
      (select jsonb_agg(to_jsonb(o)) from app_private.stellar_operations o) operations,
      (select jsonb_agg(jsonb_build_array(relname,relrowsecurity,relforcerowsecurity,relacl) order by relname) from pg_class where relnamespace='api_private'::regnamespace and relkind='r') policy`);
    const before=(await snapshot()).rows;await db.exec(await readFile(new URL(files.at(-1)!,migrationDir),'utf8'));assert.deepEqual((await snapshot()).rows,before);
  }finally{await db.close();}
});
withIncident(29,'fault at each close write rolls back the entire pair',async f=>{
  for(const prefix of ['update api_private.testnet_source_leases','insert into api_private.testnet_observations','update api_private.testnet_work','update app_private.stellar_operations','update api_private.idempotency']){
    const failing:TransportDatabase={transaction:work=>f.adapter.transaction(db=>work({query:async<T>(sql:string,p?:unknown[])=>{
      const value=await db.query<T>(sql,p);if(sql.startsWith(prefix))throw Error('fixture rollback');return value;
    }}))};
    await assert.rejects(closeReviewedRegistration(failing,await f.getProof()),/fixture rollback/);
    assert.equal((await f.store.work(f.op)).state,'PREPARING');assert.equal(await receiptCount(f.db),0);
    const lease=(await f.db.query<{generation:string}>('select generation::text from api_private.testnet_source_leases')).rows[0];assert.equal(lease.generation,f.claim.generation);
  }
});

function pgAdapter(pool:Pool,after?:(sql:string)=>Promise<void>):TransportDatabase{
  return {transaction:async work=>{
    const client=await pool.connect();try{
      await client.query('begin');await client.query("set local statement_timeout='5s'");
      const result=await work({query:async<T>(sql:string,params?:unknown[])=>{
        const value=await client.query(sql,params);await after?.(sql);return {rows:value.rows as T[]};
      }});await client.query('commit');return result;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }};
}
async function waiting(pool:Pool,name:string){
  const until=Date.now()+2200;
  while(Date.now()<until){
    if((await pool.query("select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock'",[name])).rowCount)return;
    await new Promise(resolve=>setTimeout(resolve,15));
  }
  assert.fail('Expected an actual two-session PostgreSQL lock wait');
}
async function realFixture(fn:(f:Awaited<ReturnType<typeof seedIncident>>,pool:Pool,a:Pool,b:Pool)=>Promise<void>){
  const raw=JSON.parse(await readFile(new URL('../../.tools/d2-gap2b/postgres-test.json',import.meta.url),'utf8'));
  assert.equal(raw.host,'127.0.0.1');assert.equal(raw.user,'byetery_gap2b');assert.equal(raw.database,'postgres');assert.ok(Number.isInteger(raw.port)&&raw.port>=49152&&raw.port<=65535);
  const config={host:raw.host as string,port:raw.port as number,user:raw.user as string,database:'postgres',connectionTimeoutMillis:3000,ssl:false};
  const admin=new Pool(config),name='byetery_gap2b_d39c_'+randomUUID().replaceAll('-','');let created=false;
  const pools:Pool[]=[];
  try{
    const path=(await admin.query<{path:string}>("select current_setting('data_directory') as path")).rows[0].path;
    assert.equal((await realpath(path)).toLowerCase(),(await realpath(new URL('../../.tools/d2-gap2b/pgdata',import.meta.url))).toLowerCase());
    await admin.query('create database '+name);created=true;
    const pool=(application_name:string)=>{const p=new Pool({...config,database:name,application_name});pools.push(p);return p;};
    const main=pool('d39c-main'),a=pool('d39c-a'),b=pool('d39c-b');
    await main.query('create schema auth; create table auth.users(id uuid primary key);');
    for(const file of await migrations())await main.query(await readFile(new URL(file,migrationDir),'utf8'));
    const f=await seedIncident({query:async<T>(s:string,p?:unknown[])=>({rows:(await main.query(s,p)).rows as T[]})},pgAdapter(main));
    await fn(f,main,a,b);
  }finally{for(const p of pools)await p.end();if(created)await admin.query('drop database '+name);await admin.end();}
}
function pauseAt(match:(sql:string)=>boolean){
  const locked=gate(),release=gate();let triggered=false;
  return {locked,release,after:async(sql:string)=>{if(!triggered&&match(sql)){triggered=true;locked.open();await release.wait;}}};
}
planned(30,'real PG close vs claim serializes in both orders',async()=>{
  for(const closeFirst of [true,false])await realFixture(async(f,pool,a,b)=>{
    const proof=await f.getProof(),pause=pauseAt(sql=>closeFirst?sql.includes('for update of w,o'):sql.includes('returning generation'));
    const first=pgAdapter(a,pause.after),second=pgAdapter(b);
    const left=closeFirst?closeReviewedRegistration(first,proof):new TransportStore(first).claim(f.op,'race-claim');
    await pause.locked.wait;
    const right=closeFirst?new TransportStore(second).claim(f.op,'race-claim'):closeReviewedRegistration(second,proof);
    const rejected=assert.rejects(right,closeFirst?/TransportResolved|TransportTerminal/:/ClosureLeaseActiveOrMissing/);
    try{await waiting(pool,'d39c-b');}finally{pause.release.open();}
    await left;await rejected;assert.equal(await receiptCount(f.db),closeFirst?1:0);
  });
});
planned(31,'real PG close vs envelope persistence serializes in both orders',async()=>{
  for(const closeFirst of [true,false])await realFixture(async(f,pool,a,b)=>{
    const proof=await f.getProof(),pause=pauseAt(sql=>closeFirst?sql.includes('for update of w,o'):sql.startsWith('insert into api_private.testnet_envelopes'));
    const first=pgAdapter(a,pause.after),second=pgAdapter(b);
    const left=closeFirst?closeReviewedRegistration(first,proof):first.transaction(db=>addEnvelope(db,f));await pause.locked.wait;
    const right=closeFirst?second.transaction(db=>addEnvelope(db,f)):closeReviewedRegistration(second,proof);
    const rejected=assert.rejects(right,closeFirst?/EnvelopeContextMismatch/:/ClosureIdentityOrDispatchExists/);
    try{await waiting(pool,'d39c-b');}finally{pause.release.open();}
    await left;await rejected;assert.equal(await receiptCount(f.db),closeFirst?1:0);assert.equal(!!await f.store.identity(f.op),!closeFirst);
  });
});
planned(32,'real PG simultaneous close commits only one receipt',async()=>{
  await realFixture(async(f,pool,a,b)=>{
    const proof=await f.getProof(),pause=pauseAt(sql=>sql.includes('for update of w,o'));
    const left=closeReviewedRegistration(pgAdapter(a,pause.after),proof);await pause.locked.wait;
    const right=closeReviewedRegistration(pgAdapter(b),proof);
    try{await waiting(pool,'d39c-b');}finally{pause.release.open();}
    const [one,two]=await Promise.all([left,right]);assert.deepEqual(one,two);assert.equal(await receiptCount(f.db),1);
  });
});
withIncident(33,'lost close commit acknowledgement is resolved by readback',async f=>{
  const lost:TransportDatabase={transaction:async work=>{await f.adapter.transaction(work);throw Error('fixture lost commit ack');}};
  await assert.rejects(closeReviewedRegistration(lost,await f.getProof()),/lost commit/);
  assert.ok(await readClosureReceipt(f.adapter,f.review.decisionId));assert.equal(await readClosureReceipt(f.adapter,'different-review'),null);assert.equal(await receiptCount(f.db),1);
});
withIncident(34,'closed row rejects raw envelope and stale execution calls',async f=>{
  await f.close();await assert.rejects(addEnvelope(f.db,f),/EnvelopeContextMismatch/);
  await assert.rejects(f.store.queue(f.d,f.op,INCIDENT.source,f.args),/TransportResolved/);
  await assert.rejects(f.store.persist(f.claim,f.identity),/StaleClaim/);await assert.rejects(f.store.dispatchIntent(f.claim,false),/StaleClaim/);
});
withIncident(35,'read-only status protects principal, deployment and session',async f=>{
  const actor={authUserId:f.user,sessionId:f.session};const result=await operationStatus(f.repo,actor,{key:f.key});assert.equal(result.operationId,f.op);
  assert.doesNotMatch(JSON.stringify(result),/parameters|envelope|auth_user|fixture-original-input/);
  await assert.rejects(operationStatus(f.repo,{authUserId:f.other,sessionId:f.otherSession},{id:f.op}),/OperationNotFound/);
  await assert.rejects(operationStatus(f.repo,{...actor,sessionId:randomUUID()},{key:f.key}),/OperationNotFound/);
  await assert.rejects(operationStatus(Object.assign(Object.create(f.repo),{deploymentId:randomUUID()}),actor,{id:f.op}),/OperationNotFound/);
});
planned(36,'lost acknowledgement has a fixed read budget despite missing row',async()=>{
  let time=0,reads=0;await assert.rejects(observeOperation(async()=>{reads++;throw Error('lookup404');},{now:()=>time,sleep:async ms=>{time+=ms;},budgetMs:3000}),/OBSERVATION_WINDOW_EXPIRED/);
  assert.equal(reads,3);assert.equal(timeoutClassification(),'REQUEST_ACK_UNKNOWN');
});
planned(37,'READY with signed identity and no intent is pre-dispatch',()=>{
  const value=status({state:'READY',transport_state:'READY',transaction_hash:sha('ready')});assert.equal(value.class,'READY');assert.equal(timeoutClassification(value),'SIGNED_PRE_DISPATCH');
});
planned(38,'durable intent without known send has no receipt',()=>{
  const value=status({state:'SUBMITTED',transport_state:'DISPATCH_INTENT',dispatch_attempts:1,transaction_hash:sha('intent')});
  assert.equal(value.terminal,false);assert.equal(value.result,null);assert.equal(timeoutClassification(value),'SUBMITTED_RESPONSE_UNCERTAIN');
});
function signingRequest(){
  const command={kind:'register_battery' as const,batteryId:'BYE-AUDIT-FIXTURE',registrationHash:sha('fixture registration')};
  const tx=new TransactionBuilder(new Account(ACTORS.admin,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET})
    .addOperation(new Contract(CONTRACT).call(command.kind,...invocation(command).args)).setTimebounds(1,100).build();
  return {transactionXdr:tx.toXDR(),networkPassphrase:Networks.TESTNET,currentLedger:1,expirationLedger:2,method:command.kind,expectedSigners:[ACTORS.admin]};
}
planned(39,'actual helper adapter requires START before invoking its fake process',async()=>{
  const request=signingRequest(),events:string[]=[];let called=0;
  const signer=new LocalSecureStoreSigner(async()=>{
    called++;assert.deepEqual(events,['AUTH_SIGN_START']);return {exitCode:0,stderr:'',stdout:JSON.stringify({version:2,status:'authorized',transaction_xdr:request.transactionXdr,method:request.method,signers:[ACTORS.admin]})};
  });
  await assert.rejects(signer.authorize({...request,audit:async()=>{throw Error('audit unavailable');}}),/audit unavailable/);assert.equal(called,0);
  await signer.authorize({...request,audit:async phase=>{events.push(phase);}});assert.deepEqual(events,['AUTH_SIGN_START','AUTH_SIGN_RETURNED']);
});
planned(40,'missing RETURNED event makes helper outcome unknown',async()=>{
  const events:string[]=[];const signer=new LocalSecureStoreSigner(async()=>{throw Error('fixture response lost');});
  await assert.rejects(signer.authorize({...signingRequest(),audit:async phase=>{events.push(phase);}}),/SignerProcessFailed/);assert.deepEqual(events,['AUTH_SIGN_START']);
});
withIncident(41,'identity commit event and durable identity survive lost readback',async f=>{
  const claim=await f.store.claim(f.op,'identity-commit');await f.store.phase(claim,'IDENTITY_PERSIST_START');
  const lost=new TransportStore({transaction:async work=>{await f.adapter.transaction(work);throw Error('fixture commit response lost');}});
  await assert.rejects(lost.persist(claim,f.identity),/fixture commit response lost/);
  assert.equal((await f.store.identity(f.op))?.transactionHash,f.identity.transactionHash);
  assert.deepEqual((await f.db.query("select evidence->>'phase' as phase from api_private.testnet_observations where kind='EXECUTION_PHASE' order by id")).rows,[{phase:'IDENTITY_PERSIST_START'},{phase:'IDENTITY_PERSIST_COMMITTED'}]);
});
planned(42,'shutdown during either signing phase fences every later send',async()=>{
  for(const phase of ['authorization','envelope']){
    const db=await localDb();try{
      const f=await harness(db),supervisor=new ExecutionSupervisor(),started=gate(),settle=gate();
      if(phase==='authorization')f.transport.attachSorobanAuthorization=async p=>{started.open();await settle.wait;return p;};
      else {const sign=f.transport.signEnvelope.bind(f.transport);f.transport.signEnvelope=async p=>{started.open();await settle.wait;return sign(p);};}
      const worker=new DurableTransactionWorker(f.store,f.transport,f.project,supervisor);
      const run=supervisor.run(f.op,()=>worker.run(f.op,'shutdown-fixture'));const reject=assert.rejects(run,/RuntimeStopping/);
      await started.wait;const drained=supervisor.drain(5000);settle.open();await reject;await drained;
      assert.equal(f.transport.submitted.length,0);assert.equal(!!await f.store.identity(f.op),phase==='envelope');
    }finally{await db.close();}
  }
});
planned(43,'shutdown drains identity persistence without dispatch',async()=>{
  const db=await localDb();try{
    const f=await harness(db),supervisor=new ExecutionSupervisor(),started=gate(),settle=gate();
    const persist=f.store.persist.bind(f.store);f.store.persist=async(c,i)=>{started.open();await settle.wait;return persist(c,i);};
    const worker=new DurableTransactionWorker(f.store,f.transport,f.project,supervisor);
    const run=supervisor.run(f.op,()=>worker.run(f.op,'persist-drain'));const reject=assert.rejects(run,/RuntimeStopping/);
    await started.wait;const drained=supervisor.drain(5000);settle.open();await reject;await drained;
    assert.ok(await f.store.identity(f.op));assert.equal(f.transport.submitted.length,0);
  }finally{await db.close();}
});
planned(44,'drain timeout remains fenced and cannot claim resource settlement',async()=>{
  const supervisor=new ExecutionSupervisor(),settle=gate();supervisor.childStarted(123);
  const pending=supervisor.run('fixture',()=>settle.wait);
  await assert.rejects(supervisor.drain(10),/SHUTDOWN_INCOMPLETE_REVIEW_REQUIRED/);assert.equal(supervisor.helperCount,1);
  assert.throws(()=>supervisor.run('late',async()=>{}),/RuntimeStopping/);settle.open();supervisor.childClosed(123);await pending;
});
withIncident(45,'incident addendum requires committed close and is create-only',async f=>{
  assert.throws(()=>incidentCloseManifest({operationId:f.op,batteryId:f.battery,incidentSha:INCIDENT.incidentSha,fixSha:f.review.fixSha,proofDigest:sha('fake')}),/CommittedClosureRequired/);
  const manifest=incidentCloseManifest(await f.close());assert.equal(manifest.counting,false);assert.equal(manifest.transactionHash,null);assert.equal(manifest.physicalSignerUse,'UNKNOWN');
  const path=fileURLToPath(new URL(`../../.tools/d3-9c/fixture-addendum-${randomUUID()}.json`,import.meta.url));
  await writeIncidentCloseManifest(path,manifest);await assert.rejects(writeIncidentCloseManifest(path,manifest),/EEXIST/);
});
withIncident(46,'closed source lease permits only a later different operation',async f=>{
  await f.close();const next=randomUUID();
  await f.db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
    select $1,deployment_id,principal,'fixture-next-key',command,battery_id,parameters,parameters_hash from app_private.stellar_operations where id=$2`,[next,f.op]);
  await f.store.queue(f.d,next,INCIDENT.source,f.args);const claim=await f.store.claim(next,'fixture-different');assert.equal(BigInt(claim.generation),BigInt(f.claim.generation)+2n);
  await assert.rejects(f.store.preparing(f.claim),/StaleClaim/);await f.store.release(claim);
});
withIncident(47,'closed display is local, with no chain or reward projection',async f=>{
  await f.close();const view=await f.repo.transaction(db=>f.repo.view(db,f.battery));
  assert.equal(view.pendingOperation,null);assert.equal(view.confirmedBatteryState,null);assert.equal(view.confirmedRewardState,null);
  const dto=await operationStatus(f.repo,{authUserId:f.user,sessionId:f.session},{id:f.op});
  assert.equal(dto.class,'TERMINAL_UNSIGNED');assert.equal(dto.result,'NOT_SUBMITTED');assert.equal(dto.transactionHash,null);
});
planned(48,'fee ceiling and host guard remain active',()=>{
  assert.equal(SIGNER_FEE_CAP,50_000_000n);assert.throws(()=>assertLocalRuntime({VERCEL:'1'}));assert.throws(()=>assertLocalRuntime({CI:'true'}));
});
