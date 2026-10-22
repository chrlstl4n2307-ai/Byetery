import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {localDb} from './testnet-fixtures.ts';
import {Repository} from '../src/application/repository.ts';
import {Coordinator} from '../src/application/coordinator.ts';
import {SupabaseAuth} from '../src/application/auth.ts';
import {api,listen,close} from '../src/application/http.ts';
import {NETWORK_ID} from '../src/testnet/identity.ts';
import {ACTORS,CONTRACT,TOKEN,WASM} from '../src/testnet/abi.ts';
import {SingleRegistrationScope,payloads,sha} from '../validation/registration-idempotency.ts';

test('D1.5 actual HTTP/Coordinator cache replay bypasses processor; one changed metadata leaf conflicts',async()=>{
 const db=await localDb(),deploymentId=randomUUID(),user=randomUUID(),session=randomUUID();
 await db.exec('create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
 await db.query('insert into auth.users values($1)',[user]);await db.query('insert into auth.sessions values($1,$2,null)',[session,user]);
 await db.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[user]);
 await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
 values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[deploymentId,NETWORK_ID,CONTRACT,WASM,ACTORS.admin,ACTORS.service,TOKEN]);
 await db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'ADMIN')",[deploymentId,user]);
 const pool=Object.assign(new EventEmitter(),{connect:async()=>Object.assign(new EventEmitter(),{query:async(s:string,p?:unknown[])=>{
  const sql=s.replace(/\$(\d+)\b/g,(v,n)=>p?.[Number(n)-1] instanceof Uint8Array?`decode(${v},'hex')`:v);
  const r=await db.query<Record<string,unknown>>(sql,p?.map(v=>v instanceof Uint8Array?Buffer.from(v).toString('hex'):v));
  return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])))};
 },release:()=>{}})}) as unknown as Pool;
 const repo=Object.assign(Object.create(Repository.prototype) as Repository,{pool,deploymentId,mode:'TESTNET' as const});
 let calls=0;
 // This local test supplies a final reply only. It makes NO claim to execute Soroban.
 const processor={process:async(id:string)=>{calls++;const reply={status:201,body:{source:'TESTNET',operationId:id,transactionHash:'ab'.repeat(32)}};
  await db.query('update api_private.idempotency set response_status=201,response_body=$2::jsonb where operation_id=$1',[id,JSON.stringify(reply.body)]);return reply;}};
 const auth=Object.assign(Object.create(SupabaseAuth.prototype) as SupabaseAuth,{validate:async()=>({authUserId:user,sessionId:session})});
 const server=api(auth,new Coordinator(repo,{},undefined,processor)),url=await listen(server),key=randomUUID(),p=payloads('BYE-D1-IDEMP-LOCAL');
 const call=async(body:unknown)=>{const r=await fetch(url+'/api/batteries',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});return {status:r.status,body:await r.json() as any};};
 try{
  const a=await call(p.original),b=await call(p.original),c=await call(p.changed);
  assert.equal(a.status,201);assert.deepEqual(b,a);assert.equal(c.status,409);assert.equal(c.body.error.code,'IdempotencyConflict');assert.equal(calls,1);
  assert.equal((await db.query('select * from app_private.stellar_operations')).rows.length,1);
  assert.equal((await db.query('select * from api_private.testnet_envelopes')).rows.length,0);
  assert.equal((await db.query('select * from app_private.evidence_versions')).rows.length,1);
  assert.equal((await db.query('select * from api_private.idempotency')).rows.length,1);
  assert.notEqual(p.inputHash,p.changedInputHash);
  assert.deepEqual(p.changed,{...p.original,metadata:{...p.original.metadata,caseLabel:'CONFLICT_PROBE'}});
 }finally{await close(server);await db.close();}
});
test('D1.5 operator denies replay capabilities, duplicate sends and out-of-scope lifecycle before invocation',()=>{
 const p=payloads('BYE-D1-IDEMP-LOCAL'),s=new SingleRegistrationScope(p.original.batteryId,sha(p.manifest));
 assert.throws(()=>s.capability('authorize'),/CapabilityScopeViolation/);
 s.processor(randomUUID());assert.throws(()=>s.processor(randomUUID()),/ProcessorScopeViolation/);
 assert.throws(()=>s.command({kind:'pay_reward',batteryId:p.original.batteryId},ACTORS.admin),/RegistrationScopeViolation/);
 assert.throws(()=>s.command({kind:'register_battery',batteryId:'OTHER',registrationHash:sha(p.manifest)},ACTORS.admin),/RegistrationScopeViolation/);
 assert.throws(()=>s.command({kind:'register_battery',batteryId:p.original.batteryId,registrationHash:sha(p.manifest)},ACTORS.service),/RegistrationScopeViolation/);
 assert.throws(()=>s.capability('envelope'),/AuthorizationPhaseMissing/);
 s.capability('authorize');s.capability('envelope');s.capability('broadcast');
 assert.throws(()=>s.capability('broadcast'),/CapabilityScopeViolation/);
 for(const phase of ['B','C'] as const){s.phase=phase;for(const kind of ['authorize','envelope','broadcast'] as const)assert.throws(()=>s.capability(kind),/CapabilityScopeViolation/);assert.throws(()=>s.processor(randomUUID()),/ProcessorScopeViolation/);}
 assert.deepEqual(s.counts,{processor:1,authorize:1,envelope:1,broadcast:1});
});
