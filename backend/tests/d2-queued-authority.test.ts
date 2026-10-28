import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {permissionFixture} from './d2-authority-fixture.ts';
import {Coordinator,type Action} from '../src/application/coordinator.ts';
import {PersistedContextGuard,TestnetStellarService} from '../src/testnet/service.ts';
import {PgTransportDatabase,TransportStore,type Work} from '../src/testnet/store.ts';
import {TestnetTransport} from '../src/testnet/transport.ts';
import {TestnetRpc} from '../src/testnet/rpc.ts';
import {ACTORS,invocation} from '../src/testnet/abi.ts';
import {NETWORK_ID} from '../src/testnet/identity.ts';
import {canonical} from '../src/application/validation.ts';
import type {Command} from '../src/domain.ts';
import {requiredAuthority} from '../src/application/authority.ts';

// All writes are isolated migrated PGlite fixtures. RPC and signer are tripwires.
type Fixture=Awaited<ReturnType<typeof permissionFixture>>;
// Adversarial data corruption in this disposable PGlite instance ONLY. First
// prove the ordinary immutable-membership trigger rejects rebinding/deletion.
// No migration/production constraint, RLS or remote database is changed.
async function corruptMembership(f:Fixture,sql:string,params:unknown[]){
 await assert.rejects(f.db.query(sql,params),/ImmutableField|HistoryDeletionForbidden/);
 await f.db.exec('begin; alter table api_private.memberships disable trigger immutable_membership;');
 try{await f.db.query(sql,params);await f.db.exec('alter table api_private.memberships enable trigger immutable_membership; commit;');}
 catch(error){await f.db.exec('rollback');throw error;}
}
async function scenario(f:Fixture,kind:Exclude<Command['kind'],'set_role'>,adminReward=false){
 const batteryId='BYE-GAP2A-'+randomBytes(7).toString('hex').toUpperCase();
 const requestId=randomBytes(32).toString('hex'),owner=f.users.USER;
 const existingWallet=(await f.db.query<{id:string}>('select id from app_private.wallet_links where deployment_id=$1 and user_id=$2 and address=$3 and revoked_at is null',[f.deploymentId,owner,ACTORS.admin])).rows[0];
 const wallet=existingWallet?.id??randomUUID();
 const actor=kind==='register_battery'||adminReward?f.users.ADMIN:kind==='confirm_collection'?f.users.COLLECTOR:kind==='confirm_recycling'?f.users.RECYCLER:owner;
 const state=kind==='open_return'?'REGISTERED':kind==='confirm_recycling'?'COLLECTED':kind==='pay_reward'?'RECYCLED':'RETURNED';
 if(kind!=='register_battery'){
  await f.db.exec('begin');
  await f.db.query('insert into app_private.battery_records(deployment_id,battery_id,created_by) values($1,$2,$3)',[f.deploymentId,batteryId,owner]);
  if(!existingWallet)await f.db.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
   values($1,$2,decode($3,'hex'),$4,$5,'ISOLATED-GAP2A',now())`,[wallet,f.deploymentId,NETWORK_ID,owner,ACTORS.admin]);
  const linked=state!=='REGISTERED',collected=state==='COLLECTED'||state==='RECYCLED';
  if(linked)await f.db.query(`insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot)
   values($1,decode($2,'hex'),$3,$4,$5,$6)`,[f.deploymentId,requestId,batteryId,owner,wallet,ACTORS.admin]);
  await f.db.query(`insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,request_id,collector,collection_hash,recycler,recycling_hash,reward_state,confirmed_ledger)
   values($1,$2,$3,decode($4,'hex'),decode($5,'hex'),$6,decode($7,'hex'),$8,decode($9,'hex'),$10,1)`,
   [f.deploymentId,batteryId,state,'01'.repeat(32),linked?requestId:null,collected?ACTORS.collector:null,collected?'02'.repeat(32):null,state==='RECYCLED'?ACTORS.recycler:null,state==='RECYCLED'?'03'.repeat(32):null,state==='RECYCLED'?'PENDING':'NOT_ELIGIBLE']);
  if(linked)await f.db.query('insert into chain_private.return_requests values($1,decode($2,\'hex\'),$3,$4,$5,1)',[f.deploymentId,requestId,batteryId,ACTORS.admin,collected?'CONFIRMED':'OPEN']);
  if(collected)await f.db.query("update app_private.return_requests set reservation_state='CONSUMED',association_confirmed_at=now() where deployment_id=$1 and request_id=decode($2,'hex')",[f.deploymentId,requestId]);
  await f.db.exec('commit');
 }
 const actions:Record<Exclude<Command['kind'],'set_role'>,Action>={register_battery:{kind:'register'},open_return:{kind:'return',resource:batteryId},cancel_return:{kind:'cancel',resource:requestId},confirm_collection:{kind:'collection',resource:requestId},confirm_recycling:{kind:'recycling',resource:requestId},pay_reward:{kind:'reward',resource:batteryId}};
 const evidenceKind=kind==='confirm_collection'?'COLLECTION':'RECYCLING';
 const manifest=Buffer.from(JSON.stringify({batteryId,requestId,kind:evidenceKind,fixture:'GAP2A'}));
 const input=kind==='register_battery'?{batteryId}:kind==='open_return'?{walletLinkId:wallet}:kind==='confirm_collection'||kind==='confirm_recycling'?{evidence:{batteryId,requestId,kind:evidenceKind,manifestBase64:manifest.toString('base64')}}:{};
 const c=new Coordinator(f.repo,{},undefined,{process:async id=>({status:202,body:{operationId:id,testOnly:true}})});
 const response=await c.mutate({authUserId:actor,sessionId:actor},actions[kind],input,randomUUID());
 const id=String(response.body.operationId),op=(await f.db.query<{parameters:Command}>('select parameters from app_private.stellar_operations where id=$1',[id])).rows[0];
 assert.ok(op);const call=invocation(op.parameters),store=new TransportStore(new PgTransportDatabase(f.repo.pool));
 await store.queue(f.deploymentId,id,call.signers[0],call.args.map(v=>v.toXDR('base64')));
 return {id,actor,batteryId,requestId,store,work:await store.work(id)};
}

test('GAP2A actual queued authority matrix: positive controls, revocation and actor binding',async t=>{
 const f=await permissionFixture();
 const counts={rpc:0,authorize:0,sign:0,prepare:0};
 const rpc=new TestnetRpc(async()=>{counts.rpc++;throw Error('No live RPC permitted');});
 const signer={authorize:async()=>{counts.authorize++;throw Error('No signer permitted');},signEnvelope:async()=>{counts.sign++;throw Error('No signer permitted');}};
 try{
  for(const user of Object.values(f.users))await f.db.query('insert into auth.sessions values($1,$1,null)',[user]);
  const cases=[['register_battery','ADMIN',false],['open_return','USER',false],['cancel_return','USER',false],['confirm_collection','COLLECTOR',false],['confirm_recycling','RECYCLER',false],['pay_reward','USER',false],['pay_reward','ADMIN',true]] as const;
  for(const [kind,role,adminReward] of cases)await t.test(kind+' '+role+' passes unchanged, then rejects revoked authority before any RPC or signer',async()=>{
   const s=await scenario(f,kind,adminReward),guard=new PersistedContextGuard(f.repo);
   await guard.validate(s.work);
   if(kind==='pay_reward'&&!adminReward)await f.db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'ADMIN') on conflict do nothing",[f.deploymentId,s.actor]);
   await f.db.query('update api_private.memberships set enabled=false where deployment_id=$1 and user_id=$2 and role=$3',[f.deploymentId,s.actor,role]);
   await assert.rejects(guard.validate(s.work),{code:'AuthorizationRevoked'});
   const transport=new TestnetTransport(rpc,signer,guard,id=>s.store.work(id),f.deploymentId);
   transport.preflight=async()=>{counts.prepare++;throw Error('No Stellar preparation permitted');};
   await assert.rejects(transport.prepareAndSimulate(s.work),{code:'AuthorizationRevoked'});
   if(kind==='register_battery'){
    const service=new TestnetStellarService(f.repo,rpc,signer);
    const reply=await service.process(s.id);assert.equal(reply.status,403);assert.equal((reply.body.error as {code:string}).code,'AuthorizationRevoked');
    const replay=await service.process(s.id);assert.equal((replay.body.error as {code:string}).code,'ExplicitUnsignedResumeRequired');
    assert.equal(await s.store.identity(s.id),null);assert.equal((await s.store.work(s.id)).dispatchAttempts,0);
   }
   assert.deepEqual(counts,{rpc:0,authorize:0,sign:0,prepare:0});
   assert.equal((await f.db.query('select id from app_private.stellar_operations where id=$1',[s.id])).rows.length,1);
   await f.db.query('update api_private.memberships set enabled=true where deployment_id=$1 and user_id=$2 and role=$3',[f.deploymentId,s.actor,role]);
  });
  for(const [kind,role,field,wrong] of [['confirm_collection','COLLECTOR','collector',ACTORS.recycler],['confirm_recycling','RECYCLER','recycler',ACTORS.collector]] as const)await t.test(role+' current enabled actor must match original command',async()=>{
   const s=await scenario(f,kind),guard=new PersistedContextGuard(f.repo);await guard.validate(s.work);
   await corruptMembership(f,'update api_private.memberships set actor_address=$3 where deployment_id=$1 and user_id=$2 and role=$4',[f.deploymentId,s.actor,wrong,role]);
   assert.notEqual((s.work.command as unknown as Record<string,string>)[field],wrong);
   await assert.rejects(guard.validate(s.work),{code:'AuthorizationRevoked'});
   await corruptMembership(f,'update api_private.memberships set actor_address=$3 where deployment_id=$1 and user_id=$2 and role=$4',[f.deploymentId,s.actor,role==='COLLECTOR'?ACTORS.collector:ACTORS.recycler,role]);
  });
  await t.test('missing/changed durable principal, inactive principal, removed or wrong-deployment membership fail closed',async()=>{
   const s=await scenario(f,'register_battery'),guard=new PersistedContextGuard(f.repo);await guard.validate(s.work);
   await assert.rejects(guard.validate({...s.work,principal:f.users.USER} as Work),{code:'AuthorizationRevoked'});
   await assert.rejects(guard.validate({...s.work,principal:undefined} as unknown as Work),{code:'AuthorizationRevoked'});
   await assert.rejects(guard.validate({...s.work,deploymentId:randomUUID()}));
   await f.db.query("update app_private.users set status='DISABLED' where id=$1",[s.actor]);
   await assert.rejects(guard.validate(s.work),{code:'AuthorizationRevoked'});
   await f.db.query("update app_private.users set status='ACTIVE' where id=$1",[s.actor]);
   await corruptMembership(f,"delete from api_private.memberships where deployment_id=$1 and user_id=$2 and role='ADMIN'",[f.deploymentId,s.actor]);
   await assert.rejects(guard.validate(s.work),{code:'AuthorizationRevoked'});
   await f.db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'ADMIN')",[f.deploymentId,s.actor]);
  });
  await t.test('cancel ownership and reward authority class cannot change after enqueue',async()=>{
   const s=await scenario(f,'cancel_return');
   const original=(await f.db.query<{parameters:Command}>("select parameters from app_private.stellar_operations where id=$1",[s.id])).rows[0].parameters;
   const id=randomUUID(),hash=createHash('sha256').update(canonical(original)).digest('hex');
   await f.db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,request_id,parameters,parameters_hash)
    values($1::uuid,$2,$3,$1::text,$4,$5,decode($6,'hex'),$7,decode($8,'hex'))`,[id,f.deploymentId,f.users.ADMIN,original.kind,s.batteryId,s.requestId,original,hash]);
   const call=invocation(original);await s.store.queue(f.deploymentId,id,call.signers[0],call.args.map(a=>a.toXDR('base64')));
   await assert.rejects(new PersistedContextGuard(f.repo).validate(await s.store.work(id)),{code:'AuthorizationRevoked'});
   const reward=await scenario(f,'pay_reward',true);
   const binding=()=>f.db.query("select o.principal,r.user_id,encode(a.request_id,'hex') request_id from app_private.stellar_operations o join app_private.reward_attempts a on a.operation_id=o.id join app_private.return_requests r on r.deployment_id=a.deployment_id and r.request_id=a.request_id where o.id=$1",[reward.id]);
   const before=await binding();
   await assert.rejects(f.db.query('update app_private.stellar_operations set principal=$2 where id=$1',[reward.id,f.users.USER]),{code:'23514'});
   await assert.rejects(f.db.query('update app_private.return_requests set user_id=$3 where deployment_id=$1 and request_id=decode($2,\'hex\')',[f.deploymentId,reward.requestId,f.users.ADMIN]),{code:'23514'});
   await assert.rejects(f.db.query('update app_private.reward_attempts set request_id=decode($2,\'hex\') where operation_id=$1',[reward.id,s.requestId]),{code:'23514'});
   assert.deepEqual((await binding()).rows,before.rows);
  });
  assert.deepEqual(counts,{rpc:0,authorize:0,sign:0,prepare:0});
 }finally{await f.db.close();}
});

test('GAP2A exhaustive authority policy denies unknown commands and role fallback',()=>{
 const fixed={register_battery:'ADMIN',open_return:'USER',cancel_return:'USER',confirm_collection:'COLLECTOR',confirm_recycling:'RECYCLER'} as const;
 for(const [kind,role] of Object.entries(fixed))assert.equal(requiredAuthority(kind as Command['kind'],'owner','owner').role,role);
 assert.equal(requiredAuthority('pay_reward','owner','owner').role,'USER');
 assert.equal(requiredAuthority('pay_reward','admin','owner').role,'ADMIN');
 for(const kind of ['set_role','unknown','constructor','toString'])assert.throws(()=>requiredAuthority(kind as Command['kind'],'owner','owner'),{code:'AuthorizationRevoked'});
});
