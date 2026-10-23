import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {localDb} from './testnet-fixtures.ts';
import {Repository} from '../src/application/repository.ts';
import {Coordinator} from '../src/application/coordinator.ts';
import {PersistedContextGuard} from '../src/testnet/service.ts';
import {ACTORS,CONTRACT,TOKEN,WASM,invocation} from '../src/testnet/abi.ts';
import {NETWORK_ID} from '../src/testnet/identity.ts';
import type {Work} from '../src/testnet/store.ts';

// All writes below are ephemeral PGlite fixtures. No RPC, signer or remote database.
async function fixture(){
 const db=await localDb(),deploymentId=randomUUID(),session=randomUUID();
 const users={USER:randomUUID(),ADMIN:randomUUID(),COLLECTOR:randomUUID(),RECYCLER:randomUUID()};
 await db.exec('create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
 await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
  values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[deploymentId,NETWORK_ID,CONTRACT,WASM,ACTORS.admin,ACTORS.service,TOKEN]);
 for(const [role,user] of Object.entries(users)){
  await db.query('insert into auth.users values($1)',[user]);
  await db.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[user]);
  await db.query('insert into api_private.memberships(deployment_id,user_id,role,actor_address) values($1,$2,$3,$4)',
   [deploymentId,user,role,role==='COLLECTOR'?ACTORS.collector:role==='RECYCLER'?ACTORS.recycler:null]);
 }
 const pool=Object.assign(new EventEmitter(),{connect:async()=>Object.assign(new EventEmitter(),{
  query:async(sql:string,params?:unknown[])=>{
   const encoded=sql.replace(/\$(\d+)\b/g,(v,n)=>params?.[Number(n)-1] instanceof Uint8Array?`decode(${v},'hex')`:v);
   const result=await db.query<Record<string,unknown>>(encoded,params?.map(v=>v instanceof Uint8Array?Buffer.from(v).toString('hex'):v));
   return {...result,rows:result.rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])))};
  },release:()=>{}})}) as unknown as Pool;
 const repo=Object.assign(Object.create(Repository.prototype) as Repository,{pool,deploymentId,mode:'TESTNET' as const});
 return {db,repo,users,deploymentId,session};
}

test('D2-004 SQL role matrix: explicit roles, missing/disabled/unknown and wrong deployment',async()=>{
 const f=await fixture();try{
  for(const [role,user] of Object.entries(f.users))for(const wanted of Object.keys(f.users)){
   if(role===wanted)await f.repo.transaction(db=>f.repo.role(db,user,wanted));
   else await assert.rejects(f.repo.transaction(db=>f.repo.role(db,user,wanted)),/RoleRequired/);
  }
  await assert.rejects(f.repo.transaction(db=>f.repo.role(db,randomUUID(),'ADMIN')),/RoleRequired/);
  await assert.rejects(f.repo.transaction(db=>f.repo.role(db,f.users.ADMIN,'UNKNOWN')),/RoleRequired/);
  const other=Object.assign(Object.create(Repository.prototype) as Repository,{pool:f.repo.pool,deploymentId:randomUUID(),mode:'TESTNET' as const});
  await assert.rejects(other.transaction(db=>other.role(db,f.users.ADMIN,'ADMIN')),/RoleRequired/);
  await f.db.query('update api_private.memberships set enabled=false where user_id=$1',[f.users.COLLECTOR]);
  await assert.rejects(f.repo.transaction(db=>f.repo.role(db,f.users.COLLECTOR,'COLLECTOR')),/RoleRequired/);
 }finally{await f.db.close();}
});

test('D2-004 BLOCKER characterization: disabled USER membership still queues open_return (not acceptance)',async()=>{
 const f=await fixture();try{
  const user=f.users.USER,batteryId='BYE-D2-004-ISOLATED',wallet=randomUUID();
  await f.db.query('insert into auth.sessions values($1,$2,null)',[f.session,user]);
  await f.db.query('update api_private.memberships set enabled=false where user_id=$1',[user]);
  await f.db.query('insert into app_private.battery_records(deployment_id,battery_id,created_by) values($1,$2,$3)',[f.deploymentId,batteryId,user]);
  await f.db.query(`insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,reward_state,confirmed_ledger)
   values($1,$2,'REGISTERED',decode($3,'hex'),'NOT_ELIGIBLE',1)`,[f.deploymentId,batteryId,'01'.repeat(32)]);
  await f.db.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
   values($1,$2,decode($3,'hex'),$4,$5,'D2-004-ISOLATED',now())`,[wallet,f.deploymentId,NETWORK_ID,user,ACTORS.admin]);
  let processed=0;
  const c=new Coordinator(f.repo,{},undefined,{process:async()=>{processed++;return {status:202,body:{testOnly:true}};}});
  const reply=await c.mutate({authUserId:user,sessionId:f.session},{kind:'return',resource:batteryId},{walletLinkId:wallet},randomUUID());
  // Records the existing defect. This assertion MUST NOT be described as fail-closed PASS.
  assert.equal(reply.status,202);assert.equal(processed,1);
  assert.equal((await f.db.query('select * from app_private.stellar_operations')).rows.length,1);
  assert.equal((await f.db.query<{enabled:boolean}>('select enabled from api_private.memberships where user_id=$1',[user])).rows[0].enabled,false);
 }finally{await f.db.close();}
});

test('D2-004 BLOCKER characterization: persisted pre-sign guard accepts queued registration after ADMIN revocation',async()=>{
 const f=await fixture();try{
  const user=f.users.ADMIN,batteryId='BYE-D2-004-REVOKED';
  await f.db.query('insert into auth.sessions values($1,$2,null)',[f.session,user]);
  const c=new Coordinator(f.repo,{},undefined,{process:async()=>({status:202,body:{testOnly:true}})});
  await c.mutate({authUserId:user,sessionId:f.session},{kind:'register'},{batteryId},randomUUID());
  const op=(await f.db.query<{id:string;parameters:Work['command'];hash:string}>("select id,parameters,encode(parameters_hash,'hex') as hash from app_private.stellar_operations")).rows[0];
  await f.db.query('update api_private.memberships set enabled=false where user_id=$1',[user]);
  await assert.rejects(f.repo.transaction(db=>f.repo.role(db,user,'ADMIN')),/RoleRequired/);
  const w:Work={deploymentId:f.deploymentId,operationId:op.id,networkId:NETWORK_ID,contractAddress:CONTRACT,sourceAccount:ACTORS.admin,
   command:op.parameters,contextHash:op.hash,argumentsXdr:invocation(op.parameters).args.map(a=>a.toXDR('base64')),
   state:'CLAIMED',dispatchAttempts:0,confirmation:null,stateEvidence:null};
  // Only this actual guard is invoked; no preparation, signer, worker or dispatch.
  await new PersistedContextGuard(f.repo).validate(w);
 }finally{await f.db.close();}
});
