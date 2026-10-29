import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {reviewFixture,counts,lockWait} from './review-postgres-fixture.ts';
import {RegistrationIntents,OwnerRegistrationAdoption,REVIEW_DEPLOYMENT,type ReviewChainPrecheck} from '../src/review/registration-intents.ts';
import {adoptReviewRegistration} from '../src/review/adopt-owner.ts';
import {canonical} from '../src/application/validation.ts';
import {Repository} from '../src/application/repository.ts';
import {Coordinator} from '../src/application/coordinator.ts';
import {TestnetStellarService,PersistedContextGuard} from '../src/testnet/service.ts';
import {TestnetRpc} from '../src/testnet/rpc.ts';
import {PgTransportDatabase,TransportStore} from '../src/testnet/store.ts';
import {assertPersistedAuthority} from '../src/application/persisted-authority.ts';
import {disableMemberships} from '../src/application/revocation.ts';
import {invocation,ACTORS} from '../src/testnet/abi.ts';

const request={templateVersion:1};
const absent:ReviewChainPrecheck={getBattery:async()=> 'ABSENT'};
const hash=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
function repo(f:Awaited<ReturnType<typeof reviewFixture>>){return Object.assign(Object.create(Repository.prototype) as Repository,{pool:f.pool,deploymentId:f.d,mode:'TESTNET'});}
async function intent(f:Awaited<ReturnType<typeof reviewFixture>>,key=randomUUID(),principal=f.users.ADMIN){return new RegistrationIntents(f.review).create(principal,key,request);}
async function noFoundation(f:Awaited<ReturnType<typeof reviewFixture>>,i:{operationId:string;batteryId:string}){
 const c=await counts(f.pool,i.operationId,i.batteryId);assert.ok(Object.values(c).every(n=>n===0),JSON.stringify(c));
 assert.equal((await f.pool.query('select status from review_private.registration_intents where operation_id=$1',[i.operationId])).rows[0].status,'WAITING');
}

test('B1 WAITING freezes canonical synthetic bytes, reserves server UUID, creates zero Foundation/transport records',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f);assert.match(i.operationId,/^[0-9a-f-]{36}$/);assert.match(i.batteryId,/^BYE-REVIEW-[A-F0-9]{20}$/);assert.ok(i.batteryId.length<=32);
  assert.equal(i.status,'WAITING');assert.equal(i.transactionHash,null);assert.equal(i.adoptedAt,null);assert.equal(i.adoptedOperationId,null);
  const row=(await f.pool.query('select manifest_bytes,registration_hash from review_private.registration_intents where operation_id=$1',[i.operationId])).rows[0];
  assert.equal(row.manifest_bytes.toString('utf8'),canonical({version:1,batteryId:i.batteryId,metadata:{batch:'D2-REVIEW-V1',purpose:'D2.6 SYNTHETIC REVIEW',type:'SYNTHETIC AA'}}));
  assert.equal(hash(row.manifest_bytes),i.registrationHash);assert.equal(row.registration_hash.toString('hex'),i.registrationHash);
  assert.ok(!row.manifest_bytes.toString().includes(f.users.ADMIN));assert.ok(!row.manifest_bytes.toString().includes('@'));
  await noFoundation(f,i);
  const status=await new RegistrationIntents(f.review).status(f.users.ADMIN,i.operationId);assert.equal(status.operationId,i.operationId);assert.equal(status.status,'WAITING');
 }finally{await f.close();}
});

test('B1 same replay returns current UUID/status; changed bounded version conflicts; one WAITING per principal',async()=>{
 const f=await reviewFixture();try{
  const api=new RegistrationIntents(f.review),key=randomUUID(),i=await api.create(f.users.ADMIN,key,request);
  assert.equal((await api.create(f.users.ADMIN,key,request)).operationId,i.operationId);
  await assert.rejects(api.create(f.users.ADMIN,key,{templateVersion:2}),{status:409,code:'ReviewIdempotencyConflict'});
  await assert.rejects(api.create(f.users.ADMIN,randomUUID(),request),{status:409,code:'ReviewWaitingLimit'});
  assert.equal((await f.pool.query('select count(*) n from review_private.registration_intents')).rows[0].n,'1');
  await new OwnerRegistrationAdoption(f.pool,absent).adopt(i.operationId);
  assert.equal((await api.create(f.users.ADMIN,key,request)).status,'ADOPTED');
 }finally{await f.close();}
});

test('B1 concurrent identical creations converge on one UUID',async()=>{
 const f=await reviewFixture();try{
  const api=new RegistrationIntents(f.review),key=randomUUID();
  const a=await Promise.all([api.create(f.users.ADMIN,key,request),api.create(f.users.ADMIN,key,request)]);
  assert.equal(a[0].operationId,a[1].operationId);await noFoundation(f,a[0]);
 }finally{await f.close();}
});

for(const role of ['USER','COLLECTOR','RECYCLER'] as const)test('B1 review permission does not confer ADMIN: '+role,async()=>{
 const f=await reviewFixture();try{await assert.rejects(intent(f,randomUUID(),f.users[role]),{status:403,code:'ReviewAuthorityRequired'});assert.equal((await f.pool.query('select count(*) n from review_private.registration_intents')).rows[0].n,'0');}finally{await f.close();}
});
for(const denied of ['missing permission','disabled permission','disabled ADMIN','disabled principal'] as const)test('B1 current authority required: '+denied,async()=>{
 const f=await reviewFixture({adminPermission:denied!=='missing permission'});try{
  if(denied==='disabled permission')await f.pool.query('update review_private.permissions set enabled=false where principal=$1',[f.users.ADMIN]);
  if(denied==='disabled ADMIN')await f.pool.query("update api_private.memberships set enabled=false where user_id=$1 and role='ADMIN'",[f.users.ADMIN]);
  if(denied==='disabled principal')await f.pool.query("update app_private.users set status='DISABLED' where id=$1",[f.users.ADMIN]);
  await assert.rejects(intent(f),{status:403,code:'ReviewAuthorityRequired'});
 }finally{await f.close();}
});

test('B1 bounded function cannot accept IDs, metadata, manifest, commands or browser roles; no general queue',async()=>{
 const f=await reviewFixture();try{
  const api=new RegistrationIntents(f.review);
  for(const input of [{templateVersion:1,batteryId:'BYE-X'},{templateVersion:1,metadata:{}},{templateVersion:1,operationId:randomUUID()},
   {templateVersion:1,command:'set_role'},{templateVersion:1,role:'ADMIN'},{templateVersion:1,manifest:'arbitrary'},[],null,{templateVersion:2}]){
   await assert.rejects(api.create(f.users.ADMIN,randomUUID(),input),(e:any)=>e.status===400);
  }
  assert.equal((await f.pool.query('select count(*) n from review_private.registration_intents')).rows[0].n,'0');
 }finally{await f.close();}
});

test('B1 no automatic path can prepare/process a WAITING intent; explicit trips remain zero',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f),r=repo(f),calls={rpc:0,signer:0};
  const rpc=new TestnetRpc(async()=>{calls.rpc++;throw Error('No network allowed');});
  const signer={authorize:async()=>{calls.signer++;throw Error('No signing allowed');},signEnvelope:async()=>{calls.signer++;throw Error('No signing allowed');}};
  const service=new TestnetStellarService(r,rpc,signer),coordinator=new Coordinator(r,{},undefined,service),store=new TransportStore(new PgTransportDatabase(f.pool));
  await coordinator.reconcile();await coordinator.reconcile(); // same method as startup/periodic path
  await assert.rejects(service.process(i.operationId),{code:'OperationNotFound'});
  const command={kind:'register_battery' as const,batteryId:i.batteryId,registrationHash:i.registrationHash};
  await assert.rejects(service.prepare(f.d,command),{code:'DurableLogicalOperationRequired'});
  await assert.rejects(service.submit({deploymentId:f.d,preparationId:i.operationId,command,requiredSigners:[ACTORS.admin],expiresAt:Date.now()+1000},[]),{code:'TransportWorkMissing'});
  await assert.rejects(store.queue(f.d,i.operationId,ACTORS.admin,[]),{code:'TransportWorkMissing'});
  await assert.rejects(store.claim(i.operationId,'b1-denied-worker'),{code:'TransportWorkMissing'});
  await assert.rejects(service.worker.run(i.operationId,'b1-denied-worker'),{code:'TransportWorkMissing'});
  await noFoundation(f,i);assert.deepEqual(calls,{rpc:0,signer:0});
  for(const dir of ['../src/testnet/','../src/application/']){
   for(const name of (await readdir(new URL(dir,import.meta.url))).filter(n=>n.endsWith('.ts'))){
    const text=await readFile(new URL(dir+name,import.meta.url),'utf8');assert.ok(!text.includes('registration_intents'),name);
   }
  }
 }finally{await f.close();}
});

test('B1 adoption atomically creates exact original bytes, normal QUEUED operation, same UUID; tool never processes',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f);let chain=0;
  const local=new OwnerRegistrationAdoption(f.pool,{getBattery:async context=>{chain++;assert.equal(context.batteryId,i.batteryId);return 'ABSENT';}});
  const adopted=await adoptReviewRegistration([i.operationId],local);
  assert.equal(adopted.operationId,i.operationId);assert.equal(adopted.operationState,'QUEUED');assert.equal(chain,1);
  const c=await counts(f.pool,i.operationId,i.batteryId);assert.equal(c['app_private.battery_records'],1);assert.equal(c['app_private.evidence_versions'],1);assert.equal(c['app_private.stellar_operations'],1);
  for(const [key,n] of Object.entries(c))if(key.startsWith('api_private.'))assert.equal(n,0);
  const op=(await f.pool.query('select * from app_private.stellar_operations where id=$1',[i.operationId])).rows[0];
  assert.equal(op.state,'QUEUED');assert.equal(op.principal,f.users.ADMIN);assert.equal(op.parameters.registrationHash,i.registrationHash);assert.equal(hash(canonical(op.parameters)),op.parameters_hash.toString('hex'));
  const bytes=(await f.pool.query(`select i.manifest_bytes=i2.manifest_bytes identical,i.registration_hash=i2.payload_hash same_hash
   from review_private.registration_intents i join app_private.evidence_versions i2 using(deployment_id,battery_id) where i.operation_id=$1`,[i.operationId])).rows[0];
  assert.deepEqual(bytes,{identical:true,same_hash:true});
  const row=(await f.pool.query('select status,adopted_operation_id,adopted_at from review_private.registration_intents where operation_id=$1',[i.operationId])).rows[0];
  assert.equal(row.status,'ADOPTED');assert.equal(row.adopted_operation_id,i.operationId);assert.ok(row.adopted_at);
  const call=invocation(op.parameters),store=new TransportStore(new PgTransportDatabase(f.pool));
  await store.queue(f.d,i.operationId,call.signers[0],call.args.map(v=>v.toXDR('base64')));
  await new PersistedContextGuard(repo(f)).validate(await store.work(i.operationId));
  const seen:string[]=[];const coordinator=new Coordinator(repo(f),{},undefined,{process:async id=>{seen.push(id);return {status:202,body:{}};}});
  await coordinator.reconcile();assert.deepEqual(seen,[i.operationId]);
  await assert.rejects(local.adopt(i.operationId),{code:'ReviewIntentAlreadyAdopted'});
  await assert.rejects(adoptReviewRegistration([i.operationId,'--hash','override'],local),{code:'OneOperationIdRequired'});
 }finally{await f.close();}
});

for(const state of ['PRESENT','UNVERIFIED'] as const)test('B1 fake chain '+state+' stops adoption before any Foundation write',async()=>{
 const f=await reviewFixture();try{const i=await intent(f);await assert.rejects(new OwnerRegistrationAdoption(f.pool,{getBattery:async()=>state}).adopt(i.operationId),{code:state==='PRESENT'?'ReviewChainBatteryExists':'ReviewChainUnverified'});await noFoundation(f,i);}finally{await f.close();}
});

test('B1 corruption is rejected by CHECK/immutability and independently rehashed by adoption',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f);
  await assert.rejects(f.pool.query("update review_private.registration_intents set manifest_bytes=convert_to('tampered','UTF8') where operation_id=$1",[i.operationId]),{code:'23514'});
  // Deliberately corrupt ONLY this disposable test DB to test defense after storage damage.
  await f.pool.query('alter table review_private.registration_intents disable trigger review_intent_immutable; alter table review_private.registration_intents drop constraint review_manifest_hash');
  await f.pool.query("update review_private.registration_intents set manifest_bytes=convert_to('tampered','UTF8') where operation_id=$1",[i.operationId]);
  await assert.rejects(new OwnerRegistrationAdoption(f.pool,absent).adopt(i.operationId),{code:'ReviewMaterialMismatch'});
  await assert.rejects(f.pool.query('select review_private.adopt_registration_intent($1)',[i.operationId]),{code:'23514'});
  await noFoundation(f,i);
 }finally{await f.close();}
});

for(const collision of ['battery','operation','late failure'] as const)test('B1 '+collision+' rolls adoption back without partial Foundation',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f);
  if(collision==='battery')await f.pool.query('insert into app_private.battery_records(deployment_id,battery_id) values($1,$2)',[f.d,i.batteryId]);
  if(collision==='operation'){
   await f.pool.query('insert into app_private.battery_records(deployment_id,battery_id) values($1,\'ORDINARY-COLLISION\')',[f.d]);
   await f.pool.query("insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash) values($1,$2,$3,'collision-key','register_battery','ORDINARY-COLLISION','{}',decode($4,'hex'))",[i.operationId,f.d,f.users.ADMIN,'01'.repeat(32)]);
  }
  if(collision==='late failure')await f.pool.query(`create function public.b1_failure() returns trigger language plpgsql as $$ begin raise exception 'TEST_FAILURE_AT_FINAL_TRANSITION'; end $$;
   create trigger b1_test_failure before update on review_private.registration_intents for each row execute function public.b1_failure()`);
  const before=await counts(f.pool,i.operationId,i.batteryId);
  await assert.rejects(new OwnerRegistrationAdoption(f.pool,absent).adopt(i.operationId));
  assert.deepEqual(await counts(f.pool,i.operationId,i.batteryId),before);
  assert.equal((await f.pool.query('select status from review_private.registration_intents where operation_id=$1',[i.operationId])).rows[0].status,'WAITING');
 }finally{await f.close();}
});

test('B1 active battery uniqueness is stricter than WAITING/ADOPTED partial uniqueness',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f);
  await assert.rejects(f.pool.query(`insert into review_private.registration_intents(operation_id,deployment_id,principal,idempotency_key,input_hash,battery_id,manifest_bytes,registration_hash)
   select gen_random_uuid(),deployment_id,$2,'different-key',input_hash,battery_id,manifest_bytes,registration_hash from review_private.registration_intents where operation_id=$1`,[i.operationId,f.users.SECOND_ADMIN]),{code:'23505'});
 }finally{await f.close();}
});

test('B1 concurrent adoption: actual FOR UPDATE wait, exactly one committed winner',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f),client=await f.pool.connect(),b=f.connection('b1-competing-adopter');
  try{
   await client.query('begin isolation level read committed');
   await client.query('select operation_id from review_private.registration_intents where operation_id=$1 for update',[i.operationId]);
   const second=new OwnerRegistrationAdoption(b,absent).adopt(i.operationId).then(()=> 'UNEXPECTED_WIN',e=>e.code);
   await lockWait(f.pool,'b1-competing-adopter');
   const first=(await client.query('select review_private.adopt_registration_intent($1) result',[i.operationId])).rows[0].result;
   await client.query('commit');assert.equal(first.operationId,i.operationId);assert.equal(await second,'ReviewIntentAlreadyAdopted');
   const c=await counts(f.pool,i.operationId,i.batteryId);assert.equal(c['app_private.battery_records'],1);assert.equal(c['app_private.evidence_versions'],1);assert.equal(c['app_private.stellar_operations'],1);
  }finally{await client.query('rollback');client.release();}
 }finally{await f.close();}
});

for(const kind of ['ADMIN','permission','principal'] as const)test('B1 revocation while WAITING blocks adoption: '+kind,async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f);
  if(kind==='ADMIN')await f.pool.query("update api_private.memberships set enabled=false where user_id=$1 and role='ADMIN'",[f.users.ADMIN]);
  if(kind==='permission')await f.pool.query('update review_private.permissions set enabled=false where principal=$1',[f.users.ADMIN]);
  if(kind==='principal')await f.pool.query("update app_private.users set status='DISABLED' where id=$1",[f.users.ADMIN]);
  await assert.rejects(new OwnerRegistrationAdoption(f.pool,absent).adopt(i.operationId),{code:'ReviewAuthorityRequired'});await noFoundation(f,i);
 }finally{await f.close();}
});

test('B1 authority checked AFTER intent lock: revocation commits while adoption waits',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f),block=await f.pool.connect(),adopter=f.connection('b1-authority-after-intent');
  try{
   await block.query('begin');await block.query('select operation_id from review_private.registration_intents where operation_id=$1 for update',[i.operationId]);
   const attempt=new OwnerRegistrationAdoption(adopter,absent).adopt(i.operationId).then(()=> 'UNEXPECTED_WIN',e=>e.code);
   await lockWait(f.pool,'b1-authority-after-intent');
   await f.pool.query("update api_private.memberships set enabled=false where user_id=$1 and role='ADMIN'",[f.users.ADMIN]);
   await block.query('commit');assert.equal(await attempt,'ReviewAuthorityRequired');await noFoundation(f,i);
  }finally{await block.query('rollback');block.release();}
 }finally{await f.close();}
});

test('B1 ordinary registration cannot race a review reservation; no intent coupling in worker',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f),c=new Coordinator(repo(f),{},undefined,{process:async()=>{assert.fail('No processing permitted');}});
  const create=c.mutate({authUserId:f.users.ADMIN,sessionId:f.users.ADMIN},{kind:'register'},{batteryId:i.batteryId},randomUUID());
  const adopt=new OwnerRegistrationAdoption(f.pool,absent).adopt(i.operationId);
  const [reply,result]=await Promise.all([create,adopt]);assert.equal(reply.status,409);assert.equal((reply.body.error as {code:string}).code,'ReviewBatteryReserved');assert.equal(result.operationId,i.operationId);
  assert.equal((await counts(f.pool,i.operationId,i.batteryId))['app_private.stellar_operations'],1);
 }finally{await f.close();}
});

test('B1 adopted registration uses unchanged GAP2 authority: revoke before preparation and before first dispatch',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f);await new OwnerRegistrationAdoption(f.pool,absent).adopt(i.operationId);
  const op=(await f.pool.query('select parameters from app_private.stellar_operations where id=$1',[i.operationId])).rows[0].parameters;
  const store=new TransportStore(new PgTransportDatabase(f.pool)),call=invocation(op);
  await store.queue(f.d,i.operationId,call.signers[0],call.args.map(v=>v.toXDR('base64')));
  const w=await store.work(i.operationId);await new PersistedContextGuard(repo(f)).validate(w);
  await f.pool.query("update api_private.memberships set enabled=false where user_id=$1 and role='ADMIN'",[f.users.ADMIN]);
  await assert.rejects(new PersistedContextGuard(repo(f)).validate(w),{code:'AuthorizationRevoked'});
  await assert.rejects(assertPersistedAuthority(f.pool,w,true),{code:'AuthorizationRevoked'});
  assert.equal(await store.identity(i.operationId),null);assert.equal((await store.work(i.operationId)).dispatchAttempts,0);
 }finally{await f.close();}
});

test('B1 actual restricted LOGIN role: exact functions only; no raw data, writes, adoption, role or schema creation',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f);assert.equal((await f.review.query('select current_user u')).rows[0].u,'byetery_d2_review_app');
  const denied=[
   'select * from app_private.users','select * from api_private.memberships','select * from app_private.battery_records',
   'select * from app_private.stellar_operations','select * from api_private.testnet_work','select * from auth.sessions',
   'select * from api_private.testnet_envelopes','select * from review_private.registration_intents',
   "insert into app_private.battery_records(deployment_id,battery_id) values(null,'X')",
   "insert into app_private.stellar_operations(id) values(gen_random_uuid())",
   'update api_private.memberships set enabled=false',"update chain_private.batteries set state='REGISTERED'",
   "create role b1_forbidden_role",'create schema b1_forbidden_schema',
   'create table review_private.b1_forbidden_table(id int)',
   "select review_private.adopt_registration_intent('"+i.operationId+"')",
   "select review_private.require_authority('"+f.users.ADMIN+"')",
  ];
  for(const sql of denied)await assert.rejects(f.review.query(sql),{code:'42501'},sql);
  for(const role of ['anon','authenticated']){
   const client=await f.pool.connect();try{
    await client.query('begin');await client.query('set local role '+role);
    await assert.rejects(client.query('select review_private.create_registration_intent($1,$2,$3)',[f.users.ADMIN,randomUUID(),request]),{code:'42501'});
   }finally{await client.query('rollback');client.release();}
  }
  const funcs=(await f.pool.query(`select p.proname,p.prosecdef,p.proconfig,r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='review_private' and p.prosecdef`)).rows;
  assert.equal(funcs.length,4);assert.ok(funcs.every(r=>r.rolname==='byetery_d2_intent_owner'&&r.proconfig.includes('search_path=""')));
  const owners=(await f.pool.query("select rolcanlogin,rolbypassrls,rolsuper,rolinherit from pg_roles where rolname='byetery_d2_intent_owner'")).rows[0];assert.deepEqual(owners,{rolcanlogin:false,rolbypassrls:false,rolsuper:false,rolinherit:false});
  const app=(await f.pool.query("select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole,rolreplication from pg_roles where rolname='byetery_d2_review_app'")).rows[0];
  assert.deepEqual(app,{rolcanlogin:true,rolinherit:false,rolbypassrls:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false});
  assert.equal((await f.pool.query("select has_table_privilege('byetery_d2_intent_owner','auth.sessions','SELECT') allowed")).rows[0].allowed,false);
  assert.equal((await f.pool.query("select count(*) n from pg_class c join pg_roles r on r.oid=c.relowner where c.relkind='r' and r.rolname='byetery_d2_intent_owner'")).rows[0].n,'0');
  const grants=(await f.pool.query(`select grantee from information_schema.routine_privileges where routine_schema='review_private' and grantee='PUBLIC'`)).rows;assert.equal(grants.length,0);
  const tables=(await f.pool.query("select relrowsecurity,relforcerowsecurity from pg_class where relnamespace='review_private'::regnamespace and relkind='r'")).rows;assert.ok(tables.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
 }finally{await f.close();}
});

test('B1 post-adoption signed-READY fixture: actual dispatchIntent holds revoked ADMIN, original identity unchanged',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f);await new OwnerRegistrationAdoption(f.pool,absent).adopt(i.operationId);
  const command=(await f.pool.query('select parameters from app_private.stellar_operations where id=$1',[i.operationId])).rows[0].parameters;
  const store=new TransportStore(new PgTransportDatabase(f.pool)),call=invocation(command);
  await store.queue(f.d,i.operationId,call.signers[0],call.args.map(v=>v.toXDR('base64')));
  const claim=await store.claim(i.operationId,'b1-fixture-only');
  try{
   await store.preparing(claim);const w=await store.work(i.operationId);
   // Opaque fixture bytes exercise the SQL dispatch boundary only. They are NOT
   // XDR, not signed, cannot be broadcast, and never leave this disposable DB.
   const bytes=Buffer.from('B1_LOCAL_FIXTURE_NOT_A_TRANSACTION');
   const identity={deploymentId:f.d,operationId:i.operationId,networkId:w.networkId,contractAddress:w.contractAddress,
    sourceAccount:w.sourceAccount,sequence:'1',envelopeBytes:bytes,transactionHash:hash(bytes),contextHash:w.contextHash,
    minTime:'1000',maxTime:'1300',authorizationExpirations:[],preparedLedger:1};
   await store.persist(claim,identity);
   await f.pool.query("update api_private.memberships set enabled=false where user_id=$1 and role='ADMIN'",[f.users.ADMIN]);
   await assert.rejects(store.dispatchIntent(claim,false),{code:'AuthorizationRevoked'});
   assert.equal((await store.work(i.operationId)).dispatchAttempts,0);assert.equal((await store.work(i.operationId)).state,'READY');
   assert.equal(await store.authorizationRevoked(i.operationId),true);assert.deepEqual(await store.identity(i.operationId),identity);
   assert.equal((await counts(f.pool,i.operationId,i.batteryId))['api_private.testnet_envelopes'],1);
  }finally{await store.release(claim);}
 }finally{await f.close();}
});

test('B1 adoption holds current-authority locks until COMMIT; existing revocation waits without lock inversion',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f),owner=await f.pool.connect(),revoker=f.connection('b1-revocation-after-adoption');
  try{
   await owner.query('begin isolation level read committed');
   await owner.query('select review_private.adopt_registration_intent($1)',[i.operationId]);
   const revoke=(async()=>{const c=await revoker.connect();try{await c.query('begin');await disableMemberships(c,f.d,f.users.ADMIN,['ADMIN']);await c.query('commit');}catch(e){await c.query('rollback');throw e;}finally{c.release();}})();
   await lockWait(f.pool,'b1-revocation-after-adoption');await owner.query('commit');await revoke;
   assert.equal((await f.pool.query('select status from review_private.registration_intents where operation_id=$1',[i.operationId])).rows[0].status,'ADOPTED');
   assert.equal((await f.pool.query("select enabled from api_private.memberships where user_id=$1 and role='ADMIN'",[f.users.ADMIN])).rows[0].enabled,false);
  }finally{await owner.query('rollback');owner.release();}
 }finally{await f.close();}
});

test('B1 intent identity cannot be deleted or edited; adopted terminal state cannot go backward',async()=>{
 const f=await reviewFixture();try{
  const i=await intent(f);
  await assert.rejects(f.pool.query('delete from review_private.registration_intents where operation_id=$1',[i.operationId]),{code:'23514'});
  await assert.rejects(f.pool.query("update review_private.registration_intents set idempotency_key='changed-key' where operation_id=$1",[i.operationId]),{code:'23514'});
  await assert.rejects(f.pool.query("update review_private.registration_intents set status='ADOPTED',adopted_at=now() where operation_id=$1",[i.operationId]),{code:'23514'});
  await new OwnerRegistrationAdoption(f.pool,absent).adopt(i.operationId);
  await assert.rejects(f.pool.query("update review_private.registration_intents set status='WAITING',adopted_at=null,adopted_operation_id=null where operation_id=$1",[i.operationId]),{code:'23514'});
 }finally{await f.close();}
});
