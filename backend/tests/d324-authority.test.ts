import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes,randomUUID,sign} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {Pool} from 'pg';
import {Keypair,Networks} from '@stellar/stellar-sdk';
import {D324_COMMANDS,D324_TIME,D324Authority} from '../src/application/d324-authority.ts';
import {D324} from '../src/application/d324-scope.ts';
import {prepareD324Sessions,type PreparedD324Sessions} from '../src/application/d324-sessions.ts';
import {Coordinator,type Action} from '../src/application/coordinator.ts';
import {SupabaseAuth} from '../src/application/auth.ts';
import {api} from '../src/application/http.ts';
import {Repository,type Db} from '../src/application/repository.ts';
import {canonical} from '../src/application/validation.ts';
import {ACTORS,CONTRACT,TOKEN,WASM,invocation} from '../src/testnet/abi.ts';
import {PgTransportDatabase,TransportStore,type Work} from '../src/testnet/store.ts';
import {LocalTransactionWorker} from '../src/testnet/worker.ts';
import {DomainError,type Battery,type ReturnRequest} from '../src/domain.ts';
import {PersistedContextGuard} from '../src/testnet/service.ts';
import {TestnetRpc} from '../src/testnet/rpc.ts';
import {LocalSecureStoreSigner,signerProcess} from '../src/local-secure-store-signer.ts';
import {resolve} from 'node:path';
import {permissionFixture} from './d2-authority-fixture.ts';
import {FakeTransport} from './testnet-fixtures.ts';

const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const json=(v:unknown)=>Buffer.from(canonical(v)+'\n');
const wire=(domain:string,v:unknown)=>Buffer.concat([Buffer.from(domain+'\n'),json(v)]);
const nonce=()=>randomBytes(32).toString('hex');
const owner=generateKeyPairSync('ed25519'),runner=generateKeyPairSync('ed25519'),other=generateKeyPairSync('ed25519');
const signOwner=(b:Buffer)=>sign(null,b,owner.privateKey).toString('base64url');
const signRunner=(b:Buffer)=>sign(null,b,runner.privateKey).toString('base64url');
const compositionSha='a'.repeat(40),operatorSha='b'.repeat(40),planHash='c'.repeat(64);
const register={kind:'register'} as const;
const body={batteryId:D324.batteryId};
const roles=['ADMIN','USER','COLLECTOR','RECYCLER'] as const;
type Role=typeof roles[number];
type Users=Record<Role,string>;
const fixedScope={taskId:D324.taskId,runId:D324.runId,businessSha:operatorSha,planHash,batteryId:D324.batteryId,recipient:D324.recipient};
const reservedBudget={historicalConfirmed:5,limitWithoutContingency:19,remaining:14,runCap:5,tx20Authorized:false};
type Identities=Awaited<ReturnType<typeof setupSessions>>;
// Only fixtures can synthesize validated Auth identities. Product admission
// requires the opaque receipt produced by the server's trusted validator.
class FixtureAuthority extends D324Authority {
  readonly sessionChallenge:string;
  constructor(...args:ConstructorParameters<typeof D324Authority>){super(...args);this.sessionChallenge=args[0].challenge;}
  override async admit(repo:Repository,input:Parameters<D324Authority['admit']>[1],identities:Identities|PreparedD324Sessions){
    const prepared='preparationId' in identities?identities:await prepareD324Sessions(repo,
      {validate:async header=>identities[header!.slice(7) as Role]},
      {ADMIN:'Bearer ADMIN',USER:'Bearer USER',COLLECTOR:'Bearer COLLECTOR',RECYCLER:'Bearer RECYCLER'},
      this.instanceId,this.sessionChallenge,()=>input.execution? (input.execution as {issuedAt:number}).issuedAt+1:Date.now());
    return super.admit(repo,input,prepared);
  }
}
function fixtureApproval(identities:Identities,{grantIssuedAt=Date.now()-1000,windowMs=300_000,now=Date.now,manifestSchema='BYETERY_D324_FINAL_ACTIVATION_V3'}={}) {
  const instanceId=nonce(),challenge=nonce(),wallNow=now(),grantNonce=nonce();
  const manifest=json({schema:manifestSchema,networkId:D324.networkId,deploymentId:D324.deploymentId,
    target:{sha:compositionSha},operator:{sha:operatorSha},identity:fixedScope,budget:reservedBudget,ledgerSha256:'d'.repeat(64),
    artifacts:{},k5Sha256:'e'.repeat(64),sessionControlSha256:'f'.repeat(64),binaries:{},operatorRoot:'fixture'});
  const manifestSha256=sha(manifest);
  const grant={schemaVersion:1,action:'AUTHORIZE_D3_24_RUN1_EXECUTION',...fixedScope,jwtExpirySeconds:5400,
    jwtObservedAt:grantIssuedAt-1,compositionRootSha:compositionSha,nonce:grantNonce,issuedAt:grantIssuedAt,expiresAt:grantIssuedAt+900000};
  const grantBytes=Buffer.from('BYETERY-D3-RUN1-OWNER-GRANT-V1\n'+Object.entries(grant).map(([k,v])=>k+'='+v).join('\n')+'\n');
  const execution={schema:'BYETERY_D324_EXECUTION_V1',...fixedScope,deploymentId:D324.deploymentId,networkId:D324.networkId,
    compositionSha,instanceId,challenge,runnerPublicKey:runner.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex'),
    issuedAt:wallNow-1,executionNotAfter:wallNow-1+windowMs,sessions:roles.map(role=>({role,...identities[role]}))};
  const executionBytes=wire('BYETERY-D324-EXECUTION-V1',execution);
  const live={schema:'BYETERY_D324_ONE_LIVE_APPROVAL_V3',taskId:D324.taskId,runId:D324.runId,deploymentId:D324.deploymentId,
    manifestSha256,grantSha256:sha(grantBytes),executionSha256:sha(executionBytes),instanceId,challenge,runnerPublicKey:runner.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex'),
    issuedAt:wallNow-1,expiresAt:wallNow+200000};
  const liveBytes=wire('BYETERY-D324-ONE-LIVE-APPROVAL-V3',live),liveHash=sha(liveBytes);
  const admissionProof=signRunner(wire('BYETERY-D324-ADMISSION-PROOF-V1',{liveHash,challenge,instanceId}));
  return {authority:new FixtureAuthority({compositionSha,operatorSha,planHash,manifestSha256,ownerPublicKey:owner.publicKey,
    ownerKeyFingerprint:sha(owner.publicKey.export({type:'spki',format:'der'})),instanceId,challenge},async()=>{},now),
  input:{manifest,manifestApproval:signOwner(Buffer.from('BYETERY-D324-MANIFEST-APPROVAL-V3\n'+manifestSha256+'\n')),
    grant,grantSignature:signOwner(grantBytes),live,liveSignature:signOwner(liveBytes),admissionProof,execution,executionSignature:signOwner(executionBytes)},liveHash};
}
function prove(a:{id:string;liveHash:string},identity:{authUserId:string;sessionId:string},ordinal:number,action:Action,input:unknown,key:string,
  signingKey=runner.privateKey,expiresAt=Date.now()+55000) {
  const requestId=['cancel','collection','recycling'].includes(action.kind)?action.resource!:null;
  const payload={schema:'BYETERY_D324_WRITE_PROOF_V1',admissionId:a.id,liveHash:a.liveHash,deploymentId:D324.deploymentId,
    batteryId:D324.batteryId,ordinal,command:D324_COMMANDS[ordinal-1],method:'POST',requestId,principal:identity.authUserId,
    sessionId:identity.sessionId,idempotencyKey:key,inputHash:sha(canonical({action,input})),expiresAt};
  return json({payload,signature:sign(null,wire('BYETERY-D324-WRITE-PROOF-V1',payload),signingKey).toString('base64url')}).toString('base64url');
}
async function setupSessions(repo:Repository,users:Users){
  const identities={} as Record<Role,{authUserId:string;sessionId:string;tokenExpiresAt:number}>;
  await repo.transaction(async db=>{
    for(const role of roles){
      identities[role]={authUserId:users[role],sessionId:randomUUID(),tokenExpiresAt:Date.now()+5_400_000};
      await db.query('insert into auth.sessions values($1,$2,null)',[identities[role].sessionId,users[role]]);
    }
  });
  return identities;
}
async function local() {
  const f=await permissionFixture('TESTNET',D324.deploymentId);
  return {...f,identities:await setupSessions(f.repo,f.users)};
}
async function count(repo:Repository,table:'stellar_operations'|'d324_step'|'d324_admission'){
  const schema=table==='stellar_operations'?'app_private':'api_private';
  return repo.transaction(async db=>Number((await db.query('select count(*) from '+schema+'.'+table)).rows[0].count));
}

const sessionHeaders={ADMIN:'Bearer ADMIN',USER:'Bearer USER',COLLECTOR:'Bearer COLLECTOR',RECYCLER:'Bearer RECYCLER'} as const;
function prepareFixtureSessions(f:Awaited<ReturnType<typeof local>>,a:ReturnType<typeof fixtureApproval>,identities=f.identities){
  return prepareD324Sessions(f.repo,{validate:async header=>identities[header!.slice(7) as Role]},sessionHeaders,
    a.authority.instanceId,a.authority.sessionChallenge);
}
test('four verified sessions prepare without business writes, bind once and cannot survive forged restart',async()=>{
  const f=await local(),a=fixtureApproval(f.identities);
  try{
    const receipt=await prepareFixtureSessions(f,a);
    assert.equal(receipt.sessions.length,4);
    assert.equal(await count(f.repo,'d324_admission'),0);
    assert.equal(await count(f.repo,'d324_step'),0);
    assert.equal(await count(f.repo,'stellar_operations'),0);
    await assert.rejects(a.authority.admit(f.repo,a.input,structuredClone(receipt)),/D324SessionPreparationRequired/);
    const other=fixtureApproval(f.identities);
    await assert.rejects(other.authority.admit(f.repo,other.input,receipt),/D324SessionPreparationRequired/);
    const id=await a.authority.admit(f.repo,a.input,receipt);
    assert.equal(typeof id,'string');
    await assert.rejects(a.authority.admit(f.repo,a.input,receipt),/D324SessionPreparationRequired/);
    await assert.rejects(a.authority.admit(f.repo,a.input,await prepareFixtureSessions(f,a)),/D324AdmissionUnavailable/);
    const {rows:[persisted]}=await f.db.query<{sessions:unknown}>('select sessions from api_private.d324_admission where id=$1',[id]);
    assert.deepEqual(persisted.sessions,a.input.execution.sessions);
  }finally{await f.db.close();}
});
test('session preparation rejects missing, wrong role, expired, revoked and substituted sessions',async()=>{
  for(const fault of ['missing','role','expired','revoked','different-session'] as const){
    const f=await local(),a=fixtureApproval(f.identities);
    try{
      const headers={...sessionHeaders} as Record<Role,string>;
      if(fault==='missing')delete (headers as Partial<typeof headers>).RECYCLER;
      if(fault==='role')headers.RECYCLER='Bearer USER';
      if(fault==='expired')f.identities.RECYCLER.tokenExpiresAt=Date.now();
      if(fault==='revoked')await f.db.query('delete from auth.sessions where id=$1',[f.identities.RECYCLER.sessionId]);
      if(fault==='different-session')f.identities.RECYCLER.sessionId=randomUUID();
      await assert.rejects(prepareD324Sessions(f.repo,{validate:async header=>f.identities[header!.slice(7) as Role]},headers,
        a.authority.instanceId,a.authority.sessionChallenge),/D324SessionScopeRejected/);
      assert.equal(await count(f.repo,'stellar_operations'),0);
      assert.equal(await count(f.repo,'d324_admission'),0);
    }finally{await f.db.close();}
  }
});
test('prepared sessions cannot bypass missing LIVE, manifest, revoked membership or revoked session',async()=>{
  for(const fault of ['live','manifest','membership','session'] as const){
    const f=await local(),a=fixtureApproval(f.identities);
    try{
      const receipt=await prepareFixtureSessions(f,a);
      if(fault==='membership')await f.db.query("update api_private.memberships set enabled=false where user_id=$1 and role='RECYCLER'",[f.users.RECYCLER]);
      if(fault==='session')await f.db.query('delete from auth.sessions where id=$1',[f.identities.RECYCLER.sessionId]);
      const input={...a.input,...(fault==='live'?{live:undefined}:{}),...(fault==='manifest'?{manifestApproval:a.input.liveSignature}:{})};
      await assert.rejects(a.authority.admit(f.repo,input,receipt),/D324/);
      assert.equal(await count(f.repo,'d324_admission'),0);
      assert.equal(await count(f.repo,'stellar_operations'),0);
    }finally{await f.db.close();}
  }
});
test('session preparation clips to the shortest SQL or JWT deadline with the unchanged 120-second margin',async()=>{
  const f=await local();
  try{
    const tokenCutoff=Date.now()+240_000;
    f.identities.COLLECTOR.tokenExpiresAt=tokenCutoff;
    const sqlCutoff=tokenCutoff-30_000;
    await f.db.query('update auth.sessions set not_after=$2 where id=$1',[f.identities.RECYCLER.sessionId,new Date(sqlCutoff)]);
    const a=fixtureApproval(f.identities),prepared=await prepareFixtureSessions(f,a);
    assert.equal(prepared.effectiveNotAfter,sqlCutoff-120_000);
    assert(Object.isFrozen(prepared)&&Object.isFrozen(prepared.sessions));
    assert(prepared.sessions.every(Object.isFrozen));
    assert.doesNotMatch(JSON.stringify(prepared),/Bearer|password|email|refresh_token/);
    await assert.rejects(a.authority.admit(f.repo,a.input,prepared),/D324ExecutionScopeRejected|D324SessionScopeRejected/);
    assert.equal(await count(f.repo,'d324_admission'),0);
  }finally{await f.db.close();}
});

test('reserved registration requires independent proof before queue while ordinary ADMIN and auth behavior survive',async()=>{
  const f=await local();
  try{
    const c=new Coordinator(f.repo);
    class FixtureAuth extends SupabaseAuth {
      override async validate(header:string|undefined){
        if(header==='Bearer admin')return f.identities.ADMIN;
        if(header==='Bearer user')return f.identities.USER;
        return super.validate(undefined);
      }
    }
    const server=api(new FixtureAuth({} as never),c);
    const post=(input:unknown,authorization?:string)=>new Promise<number>(resolve=>{
      const req=Object.assign(Readable.from([Buffer.from(JSON.stringify(input))]),{url:'/api/batteries',method:'POST',
        headers:{authorization,'idempotency-key':randomUUID(),'content-type':'application/json'}});
      let status=0;
      server.emit('request',req,{writeHead:(value:number)=>{status=value;},end:()=>resolve(status)});
    });
    assert.equal(await post(body),401);
    assert.equal(await post(body,'Bearer user'),403);
    assert.equal(await post(body,'Bearer admin'),403);
    await assert.rejects(c.mutate(f.identities.ADMIN,register,body,'mutate-bypass'),/D324AuthorityRequired/);
    const alias=Object.assign(Object.create(Repository.prototype) as Repository,f.repo,{deploymentId:D324.deploymentId.replaceAll('-','')});
    await assert.rejects(new Coordinator(alias).acknowledge(f.identities.ADMIN,register,body,'alias-bypass'),/D324AuthorityRequired/);
    await assert.rejects(f.db.query('insert into app_private.battery_records(deployment_id,battery_id) values($1,$2)',
      [D324.deploymentId,D324.batteryId]),/D324AdmissionRequired/);
    assert.equal(await count(f.repo,'stellar_operations'),0);
    assert.equal(await post({batteryId:'BYE-D324-ORDINARY'},'Bearer admin'),202);
    assert.equal(await count(f.repo,'stellar_operations'),1);
    assert.equal(server.listening,false);
  }finally{await f.db.close();}
});

test('independent signed domains, expiry, reservation presence, role and PoP fail closed',async()=>{
  const f=await local(),a=fixtureApproval(f.identities);
  const c=new Coordinator(f.repo,{},undefined,undefined,a.authority);
  try {
    const draft=a.input;
    for(const mutation of [
      {manifest:Buffer.concat([draft.manifest,Buffer.from(' ')])},
      {manifestApproval:draft.grantSignature},
      {grant:{...draft.grant,taskId:'D3-23-RUN1'}},
      {live:undefined},
      {execution:undefined},
      {executionSignature:draft.liveSignature},
      {execution:{...draft.execution,planHash:'0'.repeat(64)}},
      {execution:{...draft.execution,runnerPublicKey:nonce()}},
      {liveSignature:draft.manifestApproval},
      {live:{...draft.live,instanceId:nonce()}},
      {admissionProof:sign(null,Buffer.from('wrong'),other.privateKey).toString('base64url')},
    ]) await assert.rejects(a.authority.admit(f.repo,{...draft,...mutation},f.identities),/D324/);
    const retired=fixtureApproval(f.identities,{manifestSchema:'BYETERY_D324_FINAL_ACTIVATION_V2'});
    await assert.rejects(retired.authority.admit(f.repo,retired.input,f.identities),/D324ManifestMismatch/);
    const expired=fixtureApproval(f.identities,{grantIssuedAt:Date.now()-1000000});
    await assert.rejects(expired.authority.admit(f.repo,expired.input,f.identities),/D324GrantExpired/);
    const tooLong=fixtureApproval(f.identities,{windowMs:D324_TIME.executionMs+1});
    await assert.rejects(tooLong.authority.admit(f.repo,tooLong.input,f.identities),/D324ExecutionScopeRejected/);
    const shortSessions={...f.identities,RECYCLER:{...f.identities.RECYCLER,tokenExpiresAt:Date.now()+150_000}};
    const invalid=fixtureApproval(shortSessions,{windowMs:60_000});
    await assert.rejects(invalid.authority.admit(f.repo,invalid.input,shortSessions),/D324ExecutionScopeRejected/);
    await f.db.query("update auth.sessions set not_after=clock_timestamp()+interval '150 seconds' where id=$1",[f.identities.RECYCLER.sessionId]);
    await assert.rejects(a.authority.admit(f.repo,draft,f.identities),/D324SessionScopeRejected/);
    await f.db.query('update auth.sessions set not_after=null where id=$1',[f.identities.RECYCLER.sessionId]);
    assert.equal(await count(f.repo,'d324_admission'),0);
    const id=await a.authority.admit(f.repo,draft,f.identities),grant={...a,id};
    await assert.rejects(a.authority.admit(f.repo,draft,f.identities),/D324AdmissionUnavailable/);
    const key='fixture-register';
    await assert.rejects(c.acknowledge(f.identities.USER,register,body,key,prove(grant,f.identities.USER,1,register,body,key)),/D324SessionScopeRejected/);
    await assert.rejects(c.acknowledge(f.identities.ADMIN,register,body,key,prove(grant,f.identities.ADMIN,1,register,body,key,other.privateKey)),
      /D324SignatureRejected/);
    await assert.rejects(c.acknowledge(f.identities.ADMIN,register,{...body,metadata:{changed:true}},key,
      prove(grant,f.identities.ADMIN,1,register,body,key)),/D324WriteScopeRejected/);
    await f.db.exec("create schema review_private; create table review_private.registration_intents(deployment_id uuid,battery_id text,status text)");
    await f.db.query("insert into review_private.registration_intents values($1,'BYE-REVIEW-SYNTHETIC','WAITING')",[D324.deploymentId]);
    await assert.rejects(c.acknowledge(f.identities.ADMIN,register,body,key,prove(grant,f.identities.ADMIN,1,register,body,key)),
      /SQL_QUIESCENCE_REJECTED/);
    await f.db.exec('drop table review_private.registration_intents');
    assert.equal(await count(f.repo,'stellar_operations'),0);
    // Fixture-only corruption of the durable anchor. No production maintenance role can do this via HTTP.
    await f.db.exec('alter table api_private.d324_step drop constraint d324_step_admission_id_deployment_id_battery_id_fkey; '+
      'alter table api_private.d324_admission drop constraint d324_admission_deployment_id_battery_id_fkey; '+
      'alter table api_private.d324_reservation disable trigger d324_reservation_immutable; delete from api_private.d324_reservation');
    await assert.rejects(c.acknowledge(f.identities.ADMIN,register,body,key,prove(grant,f.identities.ADMIN,1,register,body,key)),/D324ReservationRequired/);
    assert.equal(await count(f.repo,'d324_step'),0);
  }finally{await f.db.close();}
});

function transportFixture(repo:Repository,instanceId?:string){
  return new TransportStore(new PgTransportDatabase(repo.pool),instanceId);
}
class D324FixtureTransport extends FakeTransport {
  override async submit(identity:Parameters<FakeTransport['submit']>[0],beforeSend?:()=>void){
    beforeSend?.();
    return super.submit(identity);
  }
}
async function queueFake(store:TransportStore,op:string,repo:Repository,key=Keypair.random()) {
  const {rows:[row]}=await repo.pool.connect().then(async client=>{
    try{return await client.query("select parameters from app_private.stellar_operations where id=$1",[op]);}
    finally{client.release();}
  });
  const fake=new D324FixtureTransport(key,()=>{});
  await store.queue(D324.deploymentId,op,fake.key.publicKey(),invocation(row.parameters).args.map(x=>x.toXDR('base64')));
  return fake;
}

async function verifyFiveSteps(expireDuring?:number,closeBefore?:number){
  const f=await local(),origin=Date.now();
  let now=origin;
  const a=fixtureApproval(f.identities,{grantIssuedAt:origin-1000,windowMs:D324_TIME.executionMs,now:()=>now});
  try{
    // Advance a fixture-only clock in both the repository query path and
    // candidate expiry triggers. No production clock is replaced.
    await f.db.exec(`create function pg_temp.d324_fixture_clock() returns timestamptz language sql as
      $$select current_setting('byetery.fixture_clock')::timestamptz$$`);
    const {rows:definitions}=await f.db.query<{definition:string}>(`select pg_get_functiondef(oid) as definition
      from pg_proc where pronamespace='api_private'::regnamespace
      and proname in ('d324_enqueue_window','d324_guard_dispatch','d324_unsigned_close_proof','guard_testnet_close_pair','guard_testnet_lease')`);
    assert.equal(definitions.length,5);
    for(const {definition} of definitions)await f.db.exec(definition.replaceAll('clock_timestamp()','pg_temp.d324_fixture_clock()'));
    wrapPool(f.repo,(query,sql,params)=>query(sql.replaceAll('clock_timestamp()','pg_temp.d324_fixture_clock()'),params));
    const advance=async(t:number)=>{now=t;await f.db.query("select set_config('byetery.fixture_clock',$1,false)",[new Date(t).toISOString()]);};
    await advance(origin);
    const id=await a.authority.admit(f.repo,a.input,f.identities),grant={...a,id};
    const c=new Coordinator(f.repo,{},undefined,undefined,a.authority);
    const store=transportFixture(f.repo,a.authority.instanceId);
    const wallet=randomUUID();
    await f.db.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
      values($1,$2,decode($3,'hex'),$4,$5,'d324-synthetic',now())`,[wallet,D324.deploymentId,D324.networkId,f.users.USER,D324.recipient]);
    let battery:Battery={state:'REGISTERED',registrationHash:'01'.repeat(32),requestId:null,collector:null,collectionHash:null,
      recycler:null,recyclingHash:null,rewardState:'NOT_ELIGIBLE'};
    let request:ReturnRequest|null=null;
    let requestId:string|null=null;
    const run=async(ordinal:number,role:Role,action:Action,input:unknown)=>{
      const key='fixture-d324-step-'+ordinal,identity=f.identities[role];
      await advance(expireDuring===ordinal?a.input.execution.executionNotAfter-10_000:origin+[0,10,25,45,68][ordinal-1]*60_000);
      const proofFor=(idempotencyKey:string)=>prove(grant,identity,ordinal,action,input,idempotencyKey,runner.privateKey,now+55_000);
      const proof=proofFor(key);
      const reply=await c.acknowledge(identity,action,input,key,proof);
      assert.equal(reply.status,202);
      const op=String(reply.body.operationId);
      assert.equal((await c.acknowledge(identity,action,input,key,proof)).body.operationId,op);
      await assert.rejects(c.acknowledge(identity,action,input,key+'x',proofFor(key+'x')),
        ordinal===5?/D324BudgetExhausted/:/D324ReplayConflict/);
      const fake=await queueFake(store,op,f.repo);
      if(closeBefore===ordinal){
        const claim=await store.claim(op,'fixture-domain-close'),work=await store.work(op);
        await store.release(claim);
        await advance(a.input.execution.executionNotAfter);
        const decision={schema:'BYETERY_D324_PRE_DISPATCH_CLOSE_V1',taskId:D324.taskId,deploymentId:D324.deploymentId,batteryId:D324.batteryId,
          compositionSha,operatorSha,planHash,instanceId:a.authority.instanceId,admissionId:id,operationId:op,sourceAccount:claim.sourceAccount,
          leaseGeneration:claim.generation,contextHash:work.contextHash,decisionId:'fixture-domain-close-'+ordinal,reason:'D324ExecutionExpired'};
        await a.authority.closeExpiredUnsigned(f.repo,decision,signOwner(wire('BYETERY-D324-PRE-DISPATCH-CLOSE-V1',decision)));
        await assert.rejects(a.authority.closeExpiredUnsigned(f.repo,decision,
          signOwner(wire('BYETERY-D324-PRE-DISPATCH-CLOSE-V1',decision))),/D324CloseStateRejected/);
        assert.equal((await store.work(op)).state,'ABORTED_PRE_DISPATCH');
        assert.equal((await store.work(op)).dispatchAttempts,0);
        assert.equal(await store.identity(op),null);
        assert.equal(fake.submitted.length,0);
        if(ordinal===2){
          const {rows:[request]}=await f.db.query<{reservation_state:string}>(
            'select reservation_state from app_private.return_requests where deployment_id=$1 and request_id=decode($2,\'hex\')',
            [D324.deploymentId,work.command.kind==='open_return'?work.command.requestId:null]);
          assert.equal(request.reservation_state,'RELEASED');
        }else{
          const {rows:[reward]}=await f.db.query<{state:string;error_code:string}>(
            'select state,error_code from app_private.reward_attempts where operation_id=$1',[op]);
          assert.deepEqual(reward,{state:'FAILED',error_code:'D324ExecutionExpired'});
        }
        assert.equal(Number((await f.db.query<{count:number}>(`select count(*) from app_private.return_requests
          where deployment_id=$1 and reservation_state='HELD'`,[D324.deploymentId])).rows[0].count),0);
        assert.equal(Number((await f.db.query<{count:number}>(`select count(*) from app_private.reward_attempts
          where deployment_id=$1 and state='QUEUED'`,[D324.deploymentId])).rows[0].count),0);
        const ordinary=String((await c.acknowledge(f.identities.ADMIN,register,{batteryId:'BYE-D324-DOMAIN-CLOSE'},
          'ordinary-after-domain-close-'+ordinal)).body.operationId);
        await queueFake(store,ordinary,f.repo,fake.key);
        const freshClaim=await store.claim(ordinary,'ordinary-after-close');
        await store.release(freshClaim);
        assert.equal(await count(f.repo,'d324_step'),ordinal);
        assert.equal(await count(f.repo,'stellar_operations'),ordinal+1);
        return false;
      }
      await assert.rejects(f.db.query("update api_private.testnet_work set state='PREPARING' where operation_id=$1",[op]),
        /D324PreparationAuthorityRequired/);
      const worker=new LocalTransactionWorker(store,fake,async(db,w:Work)=>{
        const cmd=w.command;
        switch(cmd.kind){
          case 'register_battery': battery.registrationHash=cmd.registrationHash;break;
          case 'open_return':
            requestId=cmd.requestId;
            request={batteryId:D324.batteryId,recipient:D324.recipient,state:'OPEN'};
            battery={...battery,state:'RETURNED',requestId};break;
          case 'confirm_collection':
            request={...request!,state:'CONFIRMED'};
            battery={...battery,state:'COLLECTED',collector:cmd.collector,collectionHash:cmd.evidence.payloadHash};break;
          case 'confirm_recycling':
            battery={...battery,state:'RECYCLED',recycler:cmd.recycler,recyclingHash:cmd.evidence.payloadHash,rewardState:'PENDING'};break;
          case 'pay_reward':
            battery={...battery,rewardState:'SENT'};
        }
        await f.repo.project(db as Db,{getBattery:async()=>battery,getReturnRequest:async()=>request},cmd,12);
        if(cmd.kind==='pay_reward')await db.query("update app_private.reward_attempts set state='SUCCEEDED' where operation_id=$1",[op]);
      },()=>Number(fake.closeTime));
      if(expireDuring===ordinal){
        Object.assign(fake,{assertSourceSequence:()=>advance(a.input.execution.executionNotAfter)});
        assert.equal(await worker.run(op,'d324-fixture'),'SUBMITTED_OR_UNKNOWN');
        const original=await store.identity(op);
        assert(original);
        assert.equal(fake.submitted.length,0);
        assert(fake.observed.includes(original.transactionHash));
        assert.equal((await store.work(op)).dispatchAttempts,1);
        await assert.rejects(c.acknowledge(identity,action,input,key,proofFor(key)),/D324AdmissionUnavailable/);
        return false;
      }
      fake.success=true;
      assert.equal(await worker.run(op,'d324-fixture'), 'PROJECTED');
      assert.equal(fake.submitted.length,1);
      assert.equal(await worker.run(op,'d324-restarted'),'PROJECTED');
      assert.equal(fake.submitted.length,1);
      return true;
    };
    const verifyStop=async(ordinal:number)=>{
      assert.equal(expireDuring??closeBefore,ordinal);
      assert.equal(await count(f.repo,'d324_step'),ordinal);
      assert.equal(await count(f.repo,'stellar_operations'),ordinal+(closeBefore?1:0));
      const {rows:[confirmed]}=await f.db.query<{count:number}>("select count(*) from app_private.stellar_operations where state='CONFIRMED'");
      assert.equal(Number(confirmed.count),ordinal-1);
    };
    if(!await run(1,'ADMIN',register,body))return await verifyStop(1);
    if(!await run(2,'USER',{kind:'return',resource:D324.batteryId},{walletLinkId:wallet}))return await verifyStop(2);
    assert(requestId);
    const evidence=(kind:string)=>({evidence:{batteryId:D324.batteryId,requestId,kind,manifestBase64:Buffer.from(JSON.stringify({batteryId:D324.batteryId,requestId,kind})).toString('base64')}});
    await assert.rejects(c.acknowledge(f.identities.COLLECTOR,{kind:'collection',resource:requestId},evidence('COLLECTION'),'no-proof'),/D324/);
    await assert.rejects(c.acknowledge(f.identities.USER,{kind:'cancel',resource:requestId},{},'cancel-d324',
      prove(grant,f.identities.USER,3,{kind:'cancel',resource:requestId},{},'cancel-d324')),/D324OperationForbidden/);
    if(!await run(3,'COLLECTOR',{kind:'collection',resource:requestId},evidence('COLLECTION')))return await verifyStop(3);
    if(!await run(4,'RECYCLER',{kind:'recycling',resource:requestId},evidence('RECYCLING')))return await verifyStop(4);
    if(!await run(5,'USER',{kind:'reward',resource:D324.batteryId},{}))return await verifyStop(5);
    assert.equal(now-origin,68*60_000);
    assert(now>a.input.grant.expiresAt&&now<a.input.execution.executionNotAfter);
    assert.equal(await count(f.repo,'d324_step'),5);
    assert.equal(await count(f.repo,'stellar_operations'),5);
    assert.equal(battery.rewardState,'SENT');
    await assert.rejects(f.db.query(`insert into api_private.d324_step(admission_id,deployment_id,battery_id,ordinal,command,principal,session_id,idempotency_key,input_hash,operation_id,proof_expires_at)
      values($1,$2,$3,6,'pay_reward',$4,$5,'sixth',decode($6,'hex'),$7,clock_timestamp()+interval '60 seconds')`,
      [id,D324.deploymentId,D324.batteryId,f.users.USER,f.identities.USER.sessionId,'cd'.repeat(32),randomUUID()]),/check constraint/);
  }finally{await f.db.close();}
}
test('five synthetic steps project by minute 68 with the launch grant expired; budget and idempotency preserved',()=>verifyFiveSteps());
for(const ordinal of [1,2,3,4,5])
  test('execution deadline during step '+ordinal+' blocks transport with the confirmed prefix intact',()=>verifyFiveSteps(ordinal));
for(const ordinal of [2,5])
  test('reviewed close resolves exact domain effects and preserves budget '+ordinal,()=>verifyFiveSteps(undefined,ordinal));

test('expired/revoked or restarted worker cannot sign; revocation during source check prevents send and preserves original identity',async()=>{
  for(const scenario of ['different-instance','revoked','expired','before-send','membership-before-send','history-before-send'] as const){
    const f=await local(),a=fixtureApproval(f.identities,{windowMs:scenario==='expired'?2000:300000});
    try{
      const input=a.input;
      const id=await a.authority.admit(f.repo,input,f.identities),grant={...a,id,liveHash:sha(wire('BYETERY-D324-ONE-LIVE-APPROVAL-V3',input.live))};
      const c=new Coordinator(f.repo,{},undefined,undefined,a.authority),key='fixture-worker-guard';
      const op=String((await c.acknowledge(f.identities.ADMIN,register,body,key,prove(grant,f.identities.ADMIN,1,register,body,key))).body.operationId);
      const store=transportFixture(f.repo,scenario==='different-instance'?nonce():a.authority.instanceId);
      const fake=await queueFake(store,op,f.repo);
      const revoke=()=>f.db.query('update api_private.d324_admission set revoked_at=clock_timestamp() where id=$1',[id]);
      const worker=new LocalTransactionWorker(store,fake,async()=>{},()=>Number(fake.closeTime));
      if(scenario==='revoked')await revoke();
      if(scenario==='expired')await f.db.query('select pg_sleep(2.1)');
      if(scenario.endsWith('before-send')){
        Object.assign(fake,{assertSourceSequence:async()=>{
          if(scenario==='before-send')await revoke();
          else if(scenario==='membership-before-send')
            await f.db.query("update api_private.memberships set enabled=false where user_id=$1 and role='ADMIN'",[f.users.ADMIN]);
          else assert.equal((await c.acknowledge(f.identities.ADMIN,register,{batteryId:'BYE-D3-SYNTHETIC-EXTRA'},'unplanned-d3')).status,202);
        }});
        await worker.run(op,'fixture');
        const original=await store.identity(op);
        assert(original);
        assert.equal((await store.work(op)).dispatchAttempts,1);
        await worker.run(op,'fixture-restarted');
        assert.equal((await store.identity(op))?.transactionHash,original.transactionHash);
        assert(fake.observed.includes(original.transactionHash));
        assert.equal(fake.signCount,1);
      }else{
        await assert.rejects(worker.run(op,'fixture'),/D324DispatchAuthorityRequired/);
        assert.equal((await store.work(op)).dispatchAttempts,0);
        assert.equal(fake.signCount,0);
        if(scenario!=='different-instance')
          await assert.rejects(c.acknowledge(f.identities.ADMIN,register,body,key,prove(grant,f.identities.ADMIN,1,register,body,key)),/D324AdmissionUnavailable/);
      }
      assert.equal(fake.submitted.length,0);
    }finally{await f.db.close();}
  }
});
test('D3-24 lost acknowledgement preserves one durable dispatch and blocks new steps until reconciliation',async()=>{
  const f=await local(),a=fixtureApproval(f.identities);
  try {
    const id=await a.authority.admit(f.repo,a.input,f.identities),grant={...a,id};
    const c=new Coordinator(f.repo,{},undefined,undefined,a.authority),key='fixture-lost-response';
    const op=String((await c.acknowledge(f.identities.ADMIN,register,body,key,prove(grant,f.identities.ADMIN,1,register,body,key))).body.operationId);
    const store=transportFixture(f.repo,a.authority.instanceId),fake=await queueFake(store,op,f.repo);
    fake.loseSubmit=true;
    const worker=new LocalTransactionWorker(store,fake,async()=>{},()=>Number(fake.closeTime));
    assert.equal(await worker.run(op,'fixture-initial'),'SUBMITTED_OR_UNKNOWN');
    const original=await store.identity(op);
    assert(original);
    assert.equal(fake.submitted.length,1);
    const next={kind:'return',resource:D324.batteryId} as const,nextKey='fixture-next-uncertain';
    await assert.rejects(c.acknowledge(f.identities.USER,next,{},nextKey,prove(grant,f.identities.USER,2,next,{},nextKey)),
      /D324UnconfirmedPrefix/);
    const restarted=new LocalTransactionWorker(transportFixture(f.repo,nonce()),fake,async()=>{},()=>Number(fake.closeTime));
    assert.equal(await restarted.run(op,'fixture-restarted'),'SUBMITTED_OR_UNKNOWN');
    fake.success=true;
    assert.equal(await restarted.run(op,'fixture-observed'),'PROJECTED');
    assert.equal((await store.identity(op))?.transactionHash,original.transactionHash);
    assert.equal(fake.submitted.length,1);
    assert.equal(fake.signCount,1);
    assert.equal(await count(f.repo,'stellar_operations'),1);
  }finally{await f.db.close();}
});


type Local=Awaited<ReturnType<typeof local>>;
function wrapPool(repo:Repository,wrap:(query:(sql:string,params?:unknown[])=>Promise<{rows:unknown[]}>,sql:string,params?:unknown[])=>Promise<{rows:unknown[]}>) {
  const connect=repo.pool.connect.bind(repo.pool);
  const patched=async()=>{
    const client=await connect();
    const query=client.query.bind(client);
    client.query=((sql:string,params?:unknown[])=>wrap(query,sql,params)) as typeof client.query;
    const release=client.release.bind(client);
    client.release=(error)=>{client.query=query;release(error);};
    return client;
  };
  repo.pool.connect=patched as typeof repo.pool.connect;
}
async function enqueueFixture(f:Local,windowMs=300_000,publicSource?:string){
  const a=fixtureApproval(f.identities,{windowMs}),id=await a.authority.admit(f.repo,a.input,f.identities);
  const c=new Coordinator(f.repo,{},undefined,undefined,a.authority),key='fixture-guard-d324';
  const op=String((await c.acknowledge(f.identities.ADMIN,register,body,key,prove({...a,id},f.identities.ADMIN,1,register,body,key))).body.operationId);
  const store=transportFixture(f.repo,a.authority.instanceId);
  const fake=publicSource?new FakeTransport(Keypair.random(),()=>{}):await queueFake(store,op,f.repo);
  if(publicSource){
    const {rows:[row]}=await f.db.query<{parameters:Work['command']}>('select parameters from app_private.stellar_operations where id=$1',[op]);
    await store.queue(D324.deploymentId,op,publicSource,invocation(row.parameters).args.map(x=>x.toXDR('base64')));
  }
  return {a,id,c,key,op,store,fake};
}
async function projectOrdinary(repo:Repository,db:Db,w:Work){
  assert.equal(w.command.kind,'register_battery');
  const battery:Battery={state:'REGISTERED',registrationHash:w.command.registrationHash,requestId:null,
    collector:null,collectionHash:null,recycler:null,recyclingHash:null,rewardState:'NOT_ELIGIBLE'};
  await repo.project(db,{getBattery:async()=>battery,getReturnRequest:async()=>null},w.command,12);
}
async function until(f:Local,time:number){
  await f.db.query('select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp()))))',[new Date(time)]);
}

test('PostgreSQL clock consumes PoP at step reservation and rolls back queue, evidence and idempotency at commit expiry',async()=>{
  const f=await local();
  try {
    const a=fixtureApproval(f.identities),id=await a.authority.admit(f.repo,a.input,f.identities);
    const c=new Coordinator(f.repo,{},undefined,undefined,a.authority);
    let stage:'reserve'|'commit'='reserve',expiresAt=0,hit=false;
    wrapPool(f.repo,async(query,sql,params)=>{
      if((stage==='reserve'&&sql.startsWith('insert into api_private.d324_step'))
        ||(stage==='commit'&&sql==='commit')){
        hit=true;
        await query('select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp()))))',[new Date(expiresAt+5)]);
      }
      return query(sql,params);
    });
    for(const next of ['reserve','commit'] as const){
      stage=next;hit=false;
      expiresAt=Date.now()+350;
      const key='expired-pop-'+stage;
      const proof=prove({...a,id},f.identities.ADMIN,1,register,body,key,runner.privateKey,expiresAt);
      class FixtureAuth extends SupabaseAuth{override async validate(){return f.identities.ADMIN;}}
      const server=api(new FixtureAuth({} as never),c);
      const reply=await new Promise<{status:number;code:string}>(resolve=>{
        const req=Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]),{url:'/api/batteries',method:'POST',
          headers:{'idempotency-key':key,'content-type':'application/json','x-byetery-d324-proof':proof}});
        let status=0;
        server.emit('request',req,{writeHead:(value:number)=>{status=value;},end:(raw:string)=>resolve({status,code:JSON.parse(raw).error?.code})});
      });
      assert.deepEqual(reply,{status:403,code:'D324WriteProofExpired'});
      assert(hit);
      const {rows:[row]}=await f.db.query<Record<string,number>>(`select
        (select count(*) from api_private.d324_step) as steps,(select count(*) from app_private.stellar_operations) as operations,
        (select count(*) from app_private.battery_records) as batteries,(select count(*) from app_private.evidence_versions) as evidence,
        (select count(*) from api_private.idempotency) as idempotency`);
      assert.deepEqual(Object.values(row),[0,0,0,0,0]);
    }
  }finally{await f.db.close();}
});

test('H1 exact SQL boundary denies late signing and expiry while PostgreSQL response is delayed',async()=>{
  for(const scenario of ['before','equal','delay-history','delay-clock-reply','revoked','revoked-session','deferred-spawn'] as const){
    const f=await local();
    try{
      const {a,id,op,store}=await enqueueFixture(f,1600);
      const claim=await store.claim(op,'fixture-sign'),work=await store.work(op);
      await store.preparing(claim);
      work.signingClaim=claim;
      const expiresAt=a.input.execution.executionNotAfter;
      if(scenario==='revoked')await f.db.query('update api_private.d324_admission set revoked_at=clock_timestamp() where id=$1',[id]);
      if(scenario==='revoked-session')await f.db.query('delete from auth.sessions where id=$1',[f.identities.RECYCLER.sessionId]);
      if(scenario==='equal')await until(f,expiresAt);
      let hit=false;
      if(scenario==='delay-history'||scenario==='delay-clock-reply'){
        wrapPool(f.repo,async(query,sql,params)=>{
          if(scenario==='delay-history'&&sql.includes("battery_id like 'BYE-D3-%'")){
            hit=true;await query('select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp()))))',[new Date(expiresAt)]);
          }
          const result=await query(sql,params);
          if(scenario==='delay-clock-reply'&&sql.includes('as remaining_ms')){
            hit=true;await query('select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp()))))',[new Date(expiresAt)]);
          }
          return result;
        });
      }
      let started=0;
      const guard=new PersistedContextGuard(f.repo,a.authority.instanceId);
      const launch=()=>guard.startD324Signing(work,async beforeSpawn=>{
        if(scenario==='deferred-spawn')await Promise.resolve();
        beforeSpawn();
        started++;
      });
      if(scenario==='before')await launch();
      else await assert.rejects(launch(),/D324DispatchAuthorityRequired/);
      assert.equal(started,scenario==='before'?1:0);
      if(scenario.startsWith('delay-'))assert(hit);
      await store.release(claim);
    }finally{await f.db.close();}
  }
});

test('H1 expiry after durable intent, and after entering an asynchronous transport, never calls the network or replaces identity',async()=>{
  for(const scenario of ['delay-history','deferred-transport'] as const){
    const f=await local();
    try {
      const {a,op,store,fake}=await enqueueFixture(f,2200);
      const expiresAt=a.input.execution.executionNotAfter;
      let armed=false,hit=false;
      if(scenario==='delay-history')wrapPool(f.repo,async(query,sql,params)=>{
        if(armed&&sql.includes("battery_id like 'BYE-D3-%'")){
          hit=true;await query('select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp()))))',[new Date(expiresAt)]);
        }
        return query(sql,params);
      });
      Object.assign(fake,{assertSourceSequence:async()=>{armed=true;}});
      if(scenario==='deferred-transport'){
        const send=fake.submit.bind(fake);
        Object.assign(fake,{submit:async(i:Parameters<typeof send>[0],beforeSend:()=>void)=>{
          await Promise.resolve();hit=true;beforeSend();return send(i);
        }});
      }
      const worker=new LocalTransactionWorker(store,fake,async()=>{},()=>Number(fake.closeTime));
      await worker.run(op,'fixture-live-start');
      assert(hit);
      const original=await store.identity(op);
      assert(original);
      assert.equal((await store.work(op)).dispatchAttempts,1);
      assert.equal(fake.submitted.length,0);
      assert(fake.observed.includes(original.transactionHash));
      await worker.run(op,'fixture-restarted');
      assert.equal(fake.submitted.length,0);
      assert.equal(fake.signCount,1);
      assert.equal((await store.identity(op))?.transactionHash,original.transactionHash);
    }finally{await f.db.close();}
  }
});

test('real entry boundaries check the synchronous permission before spawn and fetch',async()=>{
  const refuse=()=>{throw new DomainError('D324DispatchAuthorityRequired');};
  const notExecutable=resolve('local-fixture-never-executed.exe');
  await assert.rejects(signerProcess(notExecutable)('{}',undefined,refuse),/D324DispatchAuthorityRequired/);
  let requests=0;
  const rpc=new TestnetRpc(async()=>{requests++;throw Error('FixtureFetchMustNotStart');});
  await assert.rejects(rpc.send('synthetic',refuse),/D324DispatchAuthorityRequired/);
  assert.equal(requests,0);
});


test('H2 permits reviewed closure when real signer audit recorded START but the final fence proves spawn never started',async()=>{
  const f=await local();
  try{
    const {a,id,op,store,fake}=await enqueueFixture(f,2000,ACTORS.admin);
    const claim=await store.claim(op,'synthetic-final-sign'),work=await store.work(op);
    await store.preparing(claim);work.signingClaim=claim;
    const {finalizedBody}=await import('../src/testnet/identity.ts');
    const prepared=finalizedBody(work,await fake.prepareAndSimulate(work));
    const guard=new PersistedContextGuard(f.repo,a.authority.instanceId);
    let spawns=0;
    const signer=new LocalSecureStoreSigner(async()=>{spawns++;throw Error('FixtureSpawnMustNotStart');});
    await assert.rejects(signer.signEnvelope({transactionXdr:prepared.transactionXdr,method:'register_battery',
      expectedSigners:[ACTORS.admin],networkPassphrase:Networks.TESTNET,currentLedger:1,expirationLedger:2,
      audit:phase=>store.phase(claim,phase),
      withKeyUse:async use=>{
        await until(f,a.input.execution.executionNotAfter);
        return guard.withD324KeyUse(work,use);
      }},prepared.transactionHash),/D324DispatchAuthorityRequired/);
    assert.equal(spawns,0);
    const {rows}=await f.db.query<{phase:string}>("select evidence->>'phase' as phase from api_private.testnet_observations where operation_id=$1 order by id",[op]);
    assert.deepEqual(rows.map(row=>row.phase),['ENVELOPE_SIGN_START','ENVELOPE_SIGN_NOT_STARTED']);
    await store.release(claim);
    const decision={schema:'BYETERY_D324_PRE_DISPATCH_CLOSE_V1',taskId:D324.taskId,deploymentId:D324.deploymentId,batteryId:D324.batteryId,
      compositionSha,operatorSha,planHash,instanceId:a.authority.instanceId,admissionId:id,operationId:op,sourceAccount:claim.sourceAccount,
      leaseGeneration:claim.generation,contextHash:work.contextHash,decisionId:'audit-not-spawned-close',reason:'D324ExecutionExpired'};
    await a.authority.closeExpiredUnsigned(f.repo,decision,signOwner(wire('BYETERY-D324-PRE-DISPATCH-CLOSE-V1',decision)));
    assert.equal((await store.work(op)).state,'ABORTED_PRE_DISPATCH');
  }finally{await f.db.close();}
});

test('signed work without intent survives restart and expiry as original-hash observation only',async()=>{
  const f=await local();
  try{
    const {a,op,store,fake}=await enqueueFixture(f,1700);
    const claim=await store.claim(op,'synthetic-before-crash'),work=await store.work(op);
    await store.preparing(claim);
    const {finalizedBody,signedIdentity}=await import('../src/testnet/identity.ts');
    const prepared=finalizedBody(work,await fake.prepareAndSimulate(work));
    const identity=signedIdentity(work,prepared,await fake.signEnvelope(prepared));
    await store.persist(claim,identity);
    await store.release(claim);
    await until(f,a.input.execution.executionNotAfter);
    const restarted=new LocalTransactionWorker(transportFixture(f.repo,nonce()),fake,async()=>assert.fail('Must not project'),()=>Number(fake.closeTime));
    assert.equal(await restarted.run(op,'synthetic-restart'),'READY');
    assert.deepEqual(fake.observed,[identity.transactionHash]);
    assert.equal(fake.submitted.length,0);
    assert.equal(fake.signCount,1);
    assert.equal((await store.work(op)).dispatchAttempts,0);
    assert.equal((await store.identity(op))?.transactionHash,identity.transactionHash);
    fake.success=true;
    assert.equal(await restarted.run(op,'synthetic-external-receipt'),'READY');
    const {rows}=await f.db.query<{evidence:{observation:{status:string;confirmation:{transactionHash:string}}}}>(
      "select evidence from api_private.testnet_observations where operation_id=$1 and evidence->>'classification'='D324_SIGNED_WITHOUT_INTENT' order by id",
      [op]);
    assert.equal(rows[1].evidence.observation.status,'SUCCESS');
    assert.equal(rows[1].evidence.observation.confirmation.transactionHash,identity.transactionHash);
    assert.equal(fake.submitted.length,0);
    await assert.rejects(restarted.retrySameHash({operationId:op,transactionHash:identity.transactionHash,decisionId:'fixture-review'},'synthetic-restart'),/D3ReplayForbidden/);
  }finally{await f.db.close();}
});
test('H2 only reviewed expired zero-dispatch closes; same-source ordinary battery can then project',async()=>{
  for(const scenario of ['unsigned','unsigned-preparing','unexplained-hash','envelope','dispatch-intent'] as const){
    const f=await local();
    try {
      const {a,id,c,op,store,fake}=await enqueueFixture(f,1900);
      const claim=await store.claim(op,'fixture-source');
      const work=await store.work(op);
      const unsigned=scenario==='unsigned'||scenario==='unsigned-preparing';
      if(scenario!=='unsigned')await store.preparing(claim);
      if(scenario==='unsigned-preparing'){
        const tx=await fake.prepareAndSimulate(work);
        const {finalizedBody}=await import('../src/testnet/identity.ts');
        await store.signingIdentity(claim,'ENVELOPE',finalizedBody(work,tx));
      }
      if(scenario==='unexplained-hash'){
        await f.db.query("insert into api_private.testnet_observations(deployment_id,operation_id,kind,evidence) values($1,$2,'STATE_READ',$3)",
          [D324.deploymentId,op,JSON.stringify({transactionHash:'01'.repeat(32)})]);
      }
      if(scenario==='envelope'||scenario==='dispatch-intent'){
        const {finalizedBody,signedIdentity}=await import('../src/testnet/identity.ts');
        const prepared=finalizedBody(work,await fake.prepareAndSimulate(work));
        const identity=signedIdentity(work,prepared,await fake.signEnvelope(prepared));
        await store.persist(claim,identity);
        if(scenario==='dispatch-intent')await store.dispatchIntent(claim,false,null,{identity,ledger:fake.ledger});
      }
      await store.release(claim);
      const decision={schema:'BYETERY_D324_PRE_DISPATCH_CLOSE_V1',taskId:D324.taskId,deploymentId:D324.deploymentId,batteryId:D324.batteryId,
        compositionSha,operatorSha,planHash,instanceId:a.authority.instanceId,admissionId:id,operationId:op,sourceAccount:claim.sourceAccount,
        leaseGeneration:claim.generation,contextHash:work.contextHash,decisionId:'fixture-reviewed-close-'+scenario,reason:'D324ExecutionExpired'};
      const bytes=wire('BYETERY-D324-PRE-DISPATCH-CLOSE-V1',decision);
      await assert.rejects(a.authority.closeExpiredUnsigned(f.repo,decision,signRunner(bytes)),/D324SignatureRejected/);
      await assert.rejects(a.authority.closeExpiredUnsigned(f.repo,decision,signOwner(bytes)),/D324CloseStateRejected/);
      await until(f,a.input.execution.executionNotAfter);
      const ordinaryBody={batteryId:'BYE-D324-SAME-SOURCE'};
      const ordinary=String((await c.acknowledge(f.identities.ADMIN,register,ordinaryBody,'fixture-ordinary-close')).body.operationId);
      const ordinaryTransport=await queueFake(store,ordinary,f.repo,fake.key);
      await assert.rejects(store.claim(ordinary,'fixture-ordinary'),/SourceAccountBusy/);
      if(unsigned){
        await a.authority.closeExpiredUnsigned(f.repo,decision,signOwner(bytes));
        assert.equal((await store.work(op)).state,'ABORTED_PRE_DISPATCH');
        const {rows:[receipt]}=await f.db.query<{evidence:{budgetReleased:boolean;reviewDigest:string}}>(
          "select evidence from api_private.testnet_observations where operation_id=$1 and kind='PRE_DISPATCH_CLOSE'",[op]);
        assert.equal(receipt.evidence.budgetReleased,false);
        assert.equal(receipt.evidence.reviewDigest,sha(bytes));
        ordinaryTransport.success=true;
        const worker=new LocalTransactionWorker(store,ordinaryTransport,(db,w)=>projectOrdinary(f.repo,db as Db,w),()=>Number(ordinaryTransport.closeTime));
        assert.equal(await worker.run(ordinary,'fixture-ordinary'),'PROJECTED');
        assert.equal(ordinaryTransport.submitted.length,1);
        assert.equal(fake.submitted.length,0);
        assert.equal((await f.db.query<{state:string}>('select state from chain_private.batteries where battery_id=$1',
          [ordinaryBody.batteryId])).rows[0]?.state,'REGISTERED');
      }else{
        await assert.rejects(a.authority.closeExpiredUnsigned(f.repo,decision,signOwner(bytes)),/D324CloseStateRejected|D324UnsignedClosureNotReviewed/);
        await assert.rejects(store.claim(ordinary,'fixture-ordinary'),/SourceAccountBusy/);
        const {rows}=await f.db.query("select 1 from api_private.testnet_observations where operation_id=$1 and kind='PRE_DISPATCH_CLOSE'",[op]);
        assert.equal(rows.length,0);
      }
      assert.equal(await count(f.repo,'d324_step'),1);
      assert.equal(await count(f.repo,'stellar_operations'),2);
    }finally{await f.db.close();}
  }
});

const pgPort=process.env.BYETERY_D324_TEST_PG_PORT;
test('PostgreSQL protects both sides of the install race and serializes admission and enqueues', {skip:!pgPort},async()=>{
  const port=Number(pgPort);
  assert(Number.isInteger(port)&&port>=49152&&port<=65535);
  const config={host:'127.0.0.1',port,user:'byetery_d324_fixture',database:'postgres',connectionTimeoutMillis:5000};
  const admin=new Pool(config),files=new URL('../../database/migrations/',import.meta.url);
  const migrations=await Promise.all((await readdir(files)).filter(f=>f.endsWith('.sql')).sort().map(f=>readFile(new URL(f,files),'utf8')));
  const security=migrations.pop()!;
  assert.match(security,/d324_reservation/);
  await admin.query(`do $$
  begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  end $$;
  create role d324_fixture_owner login bypassrls`);
  const databases=['d324_migration_conflict','d324_migration_protected'] as const;
  try {
    for(const database of databases){
      await admin.query('create database '+database+' owner d324_fixture_owner');
      const opts={...config,database,user:'d324_fixture_owner'};
      const pool=new Pool(opts);
      const repo=new Repository({database:opts,deploymentId:D324.deploymentId,mode:'TESTNET',url:'',publicKey:'',serverKey:''});
      try{
        await pool.query('create schema auth; create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
        for(const sql of migrations)await pool.query(sql);
        await pool.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
          values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[D324.deploymentId,D324.networkId,CONTRACT,WASM,ACTORS.admin,ACTORS.service,TOKEN]);
        const legacy=await pool.connect(),install=await pool.connect();
        try{
          const insert=()=>legacy.query('insert into app_private.battery_records(deployment_id,battery_id) values($1,$2)',
            [D324.deploymentId,D324.batteryId]);
          const migrationBody=security.replace(/^([\s\S]*?)\bbegin;\s*/,'$1').replace(/\bcommit;\s*$/,'');
          if(database==='d324_migration_conflict'){
            await legacy.query('begin');
            await insert();
            await install.query('begin');
            const pid=(await install.query('select pg_backend_pid() as pid')).rows[0].pid;
            const check=assert.rejects(install.query(migrationBody),/D324ReservationConflict/);
            await waitForLock(pool,pid);
            await legacy.query('commit');
            await check;
            await install.query('rollback');
            assert.equal((await pool.query("select to_regclass('api_private.d324_reservation') as found")).rows[0].found,null);
            continue;
          }
          await install.query('begin');
          await install.query(migrationBody);
          const pid=(await legacy.query('select pg_backend_pid() as pid')).rows[0].pid;
          const oldWriter=assert.rejects(insert(),/D324AdmissionRequired/);
          await waitForLock(pool,pid);
          await install.query('commit');
          await oldWriter;
        }finally{
          await legacy.query('rollback');legacy.release();
          await install.query('rollback');install.release();
        }
        const users=Object.fromEntries(roles.map(role=>[role,randomUUID()])) as Users;
        for(const role of roles){
          const user=users[role];
          await pool.query('insert into auth.users values($1)',[user]);
          await pool.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[user]);
          const actor=role==='COLLECTOR'?ACTORS.collector:role==='RECYCLER'?ACTORS.recycler:null;
          await pool.query('insert into api_private.memberships(deployment_id,user_id,role,actor_address) values($1,$2,$3,$4)',
            [D324.deploymentId,user,role,actor]);
        }
        const identities=await setupSessions(repo,users),a=fixtureApproval(identities,{windowMs:6500});
        const admission=await Promise.allSettled([a.authority.admit(repo,a.input,identities),a.authority.admit(repo,a.input,identities)]);
        const success=admission.filter(r=>r.status==='fulfilled');
        assert.equal(success.length,1);assert.equal(await count(repo,'d324_admission'),1);
        const grant={...a,id:success[0].value},c=new Coordinator(repo,{},undefined,undefined,a.authority);
        const shortProofKey='postgres-proof-expires-at-commit',expiry=Date.now()+700;
        let delayCommit=true,hit=false;
        wrapPool(repo,async(query,sql,params)=>{
          if(delayCommit&&sql==='commit'){
            hit=true;await query('select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp()))))',[new Date(expiry+5)]);
          }
          return query(sql,params);
        });
        await assert.rejects(c.acknowledge(identities.ADMIN,register,body,shortProofKey,
          prove(grant,identities.ADMIN,1,register,body,shortProofKey,runner.privateKey,expiry)),/D324WriteProofExpired/);
        delayCommit=false;
        assert(hit);
        assert.equal(await count(repo,'stellar_operations'),0);
        assert.equal(await count(repo,'d324_step'),0);
        const key='concurrent-enqueue',proof=prove(grant,identities.ADMIN,1,register,body,key);
        const results=await Promise.all([c.acknowledge(identities.ADMIN,register,body,key,proof),
          c.acknowledge(identities.ADMIN,register,body,key,proof)]);
        assert.equal(results[0].status,202);
        assert.equal(results[0].body.operationId,results[1].body.operationId);
        assert.equal(await count(repo,'stellar_operations'),1);
        assert.equal(await count(repo,'d324_step'),1);
        const acl=await pool.query(`select has_table_privilege('authenticated','api_private.d324_reservation','INSERT') as browser,
          (select relrowsecurity and relforcerowsecurity from pg_class where oid='api_private.d324_step'::regclass) as rls`);
        assert.deepEqual(acl.rows,[{browser:false,rls:true}]);
        const op=String(results[0].body.operationId),store=transportFixture(repo,a.authority.instanceId),fake=await queueFake(store,op,repo);
        const claim=await store.claim(op,'postgres-guard');
        await store.preparing(claim);
        const work=await store.work(op);work.signingClaim=claim;
        const guard=new PersistedContextGuard(repo,a.authority.instanceId);
        let releaseKeyUse!:()=>void,entered!:()=>void;
        const keyUseBlocked=new Promise<void>(resolve=>{releaseKeyUse=resolve;});
        const keyUseEntered=new Promise<void>(resolve=>{entered=resolve;});
        const use=guard.withD324KeyUse(work,async(fence,valid)=>{
          assert.equal(fence.operationId,op);assert.equal(fence.leaseGeneration,String(claim.generation));
          valid();entered();await keyUseBlocked;valid();return 'SYNTHETIC_KEY_USE';
        });
        await keyUseEntered;
        const otherConnection=await pool.connect();
        try{
          for(const [query,params] of [
            ['delete from auth.sessions where id=$1',[identities.ADMIN.sessionId]],
            ['update api_private.d324_admission set revoked_at=clock_timestamp() where id=$1',[grant.id]],
            ["update api_private.memberships set enabled=false where user_id=$1 and role='ADMIN'",[users.ADMIN]],
            ['update api_private.testnet_source_leases set lease_until=clock_timestamp() where operation_id=$1',[op]],
          ] as const){
            await otherConnection.query('begin');await otherConnection.query("set local lock_timeout='100ms'");
            await assert.rejects(otherConnection.query(query,[...params]),(error:unknown)=>(error as {code?:string}).code==='55P03');
            await otherConnection.query('rollback');
          }
        }finally{otherConnection.release();releaseKeyUse();}
        assert.equal(await use,'SYNTHETIC_KEY_USE');
        assert.equal(await guard.startD324Signing(work,async before=>{before();return 'SYNTHETIC_START';}),'SYNTHETIC_START');
        let signingConnection=0,syntheticKeyUses=0;
        wrapPool(repo,async(query,sql,params)=>{
          if(sql==='select 1'){
            const fact=await query('select pg_backend_pid() as connection');
            signingConnection=Number((fact.rows[0] as {connection:number}).connection);
          }
          return query(sql,params);
        });
        await assert.rejects(guard.withD324KeyUse(work,async(_fence,_valid,revalidate)=>{
          await revalidate(); // Child LOAD acknowledgement, before loading its synthetic key.
          assert(signingConnection>0);
          await pool.query('select pg_terminate_backend($1)',[signingConnection]);
          await pool.query('update api_private.d324_admission set revoked_at=clock_timestamp() where id=$1',[grant.id]);
          await revalidate(); // Child SIGN acknowledgement must fail before Ed25519 use.
          syntheticKeyUses++;
          return 'MUST_NOT_SIGN';
        }),/DatabaseConnectionInterrupted/);
        assert.equal(syntheticKeyUses,0);
        const deadline=a.input.execution.executionNotAfter;
        await pool.query('select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp()))))',[new Date(deadline+5)]);
        await assert.rejects(guard.startD324Signing(work,async()=>assert.fail('Expired signer callback executed')),
          /D324DispatchAuthorityRequired/);
        await store.release(claim);
        const decision={schema:'BYETERY_D324_PRE_DISPATCH_CLOSE_V1',taskId:D324.taskId,deploymentId:D324.deploymentId,
          batteryId:D324.batteryId,compositionSha,operatorSha,planHash,instanceId:a.authority.instanceId,
          admissionId:grant.id,operationId:op,sourceAccount:work.sourceAccount,leaseGeneration:claim.generation,
          contextHash:work.contextHash,decisionId:'postgres-reviewed-close',reason:'D324ExecutionExpired'};
        const closures=await Promise.allSettled([1,2].map(()=>a.authority.closeExpiredUnsigned(repo,decision,
          signOwner(wire('BYETERY-D324-PRE-DISPATCH-CLOSE-V1',decision)))));
        assert.equal(closures.filter(r=>r.status==='fulfilled').length,1);
        assert.equal((await store.work(op)).state,'ABORTED_PRE_DISPATCH');
        const ordinary=String((await c.acknowledge(identities.ADMIN,register,{batteryId:'BYE-PG-SAME-SOURCE'},'postgres-ordinary-close')).body.operationId);
        const localTransport=await queueFake(store,ordinary,repo,fake.key);
        localTransport.success=true;
        const worker=new LocalTransactionWorker(store,localTransport,(db,w)=>projectOrdinary(repo,db as Db,w),()=>Number(localTransport.closeTime));
        assert.equal(await worker.run(ordinary,'postgres-same-source'),'PROJECTED');
        assert.equal((await pool.query("select state from chain_private.batteries where battery_id='BYE-PG-SAME-SOURCE'")).rows[0]?.state,'REGISTERED');
        assert.equal(await count(repo,'d324_step'),1);

      }finally{await repo.pool.end();await pool.end();}
    }
  }finally{await admin.end();}
});
async function waitForLock(pool:Pool,pid:number){
  const limit=Date.now()+3500;
  while(Date.now()<limit){
    const {rows:[fact]}=await pool.query("select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1",[pid]);
    if(fact?.waiting)return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail('The old writer/migration never waited for the conflicting lock');
}
