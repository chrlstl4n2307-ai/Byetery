import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { localDb } from './testnet-fixtures.ts';
import { Repository } from '../src/application/repository.ts';
import { Coordinator } from '../src/application/coordinator.ts';
import { SupabaseAuth,type Identity } from '../src/application/auth.ts';
import { api,listen,close } from '../src/application/http.ts';
import { AppError } from '../src/application/errors.ts';
import { PersistedContextGuard,TestnetStellarService } from '../src/testnet/service.ts';
import { TestnetRpc } from '../src/testnet/rpc.ts';
import { NETWORK_ID } from '../src/testnet/identity.ts';
import { ACTORS,CONTRACT,TOKEN,WASM,invocation } from '../src/testnet/abi.ts';
import { canonical } from '../src/application/validation.ts';
import type { Work } from '../src/testnet/store.ts';
import type { Command } from '../src/domain.ts';

async function appFixture(){
  const db=await localDb(),deploymentId=randomUUID(),admin=randomUUID(),user=randomUUID(),session=randomUUID();
  await db.exec('create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
  await db.query('insert into auth.users values($1),($2)',[admin,user]);
  await db.query('insert into auth.sessions values($1,$2,null)',[session,admin]);
  await db.query('insert into app_private.users(id,auth_user_id) values($1,$1),($2,$2)',[admin,user]);
  await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
    values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[deploymentId,NETWORK_ID,CONTRACT,WASM,ACTORS.admin,ACTORS.service,TOKEN]);
  await db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'ADMIN')",[deploymentId,admin]);
  const pool={connect:async()=>({query:async(s:string,p?:unknown[])=>{
    // PGlite lacks pg's binary parameter encoding for custom bytea domains.
    const sql=s.replace(/\$(\d+)\b/g,(v,n)=>p?.[Number(n)-1] instanceof Uint8Array?`decode(${v},'hex')`:v);
    const result=await db.query<Record<string,unknown>>(sql,p?.map(v=>v instanceof Uint8Array?Buffer.from(v).toString('hex'):v));
    return {...result,rows:result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])))};
  },release:()=>{}})} as unknown as Pool;
  const repo=Object.assign(Object.create(Repository.prototype) as Repository,{pool,deploymentId,mode:'TESTNET' as const});
  return {db,repo,admin,user,session,deploymentId};
}
test('actual persisted recipient guard rejects substitution and logical-operation tampering',async()=>{
  const f=await appFixture();try{
    const id='BYE-W1-002-CONTEXT',rid='01'.repeat(32),wallet=randomUUID(),operationId=randomUUID();
    await f.db.query('insert into app_private.battery_records(deployment_id,battery_id,created_by) values($1,$2,$3)',[f.deploymentId,id,f.user]);
    await f.db.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
      values($1,$2,decode($3,'hex'),$4,$5,'TEST-ONLY',now())`,[wallet,f.deploymentId,NETWORK_ID,f.user,ACTORS.admin]);
    await f.db.query(`insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot)
      values($1,decode($2,'hex'),$3,$4,$5,$6)`,[f.deploymentId,rid,id,f.user,wallet,ACTORS.admin]);
    const command:Command={kind:'open_return',batteryId:id,requestId:rid,recipient:ACTORS.service};
    const h=createHash('sha256').update(canonical(command)).digest('hex');
    await f.db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,request_id,parameters,parameters_hash)
      values($1::uuid,$2,'TEST-ONLY',$1::text,'open_return',$3,decode($4,'hex'),$5,decode($6,'hex'))`,[operationId,f.deploymentId,id,rid,JSON.stringify(command),h]);
    const w:Work={deploymentId:f.deploymentId,operationId,networkId:NETWORK_ID,contractAddress:CONTRACT,sourceAccount:ACTORS.service,command,contextHash:h,
      argumentsXdr:invocation(command).args.map(a=>a.toXDR('base64')),state:'CLAIMED',dispatchAttempts:0,confirmation:null,stateEvidence:null};
    await assert.rejects(new PersistedContextGuard(f.repo).validate(w),/RecipientSnapshotMismatch/);
    // An authorized body cannot change the immutable logical operation to make it pass.
    await assert.rejects(new PersistedContextGuard(f.repo).validate({...w,command:{...command,recipient:ACTORS.admin}}),/OperationContextMismatch/);
  }finally{await f.db.close();}
});
test('real HTTP path queues authenticated Testnet operation and preserves it across RPC outage without MOCK fallback',async()=>{
  const f=await appFixture();let launched=0;
  class UnavailableRpc extends TestnetRpc {override async network():ReturnType<TestnetRpc['network']>{throw new Error('RPC unavailable');}}
  const service=new TestnetStellarService(f.repo,new UnavailableRpc(),{authorize:async()=>{launched++;throw Error();},signEnvelope:async()=>{launched++;throw Error();}});
  class Auth extends SupabaseAuth {override async validate(header:string|undefined):Promise<Identity>{if(header!=='Bearer fixture')throw new AppError(401,'AuthenticationRequired');return {authUserId:f.admin,sessionId:f.session};}}
  const coordinator=new Coordinator(f.repo,{},undefined,service),server=api(new Auth({} as never),coordinator),url=await listen(server);
  try{
    const id='BYE-W1-002-HTTP-LOCAL',key=randomUUID();
    const call=(token:boolean)=>fetch(url+'/api/batteries',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,...token?{Authorization:'Bearer fixture'}:{}},
      body:JSON.stringify({batteryId:id,metadata:{fixture:true}})});
    assert.equal((await call(false)).status,401);
    const response=await call(true);const firstBody=await response.json();assert.equal(response.status,503,JSON.stringify(firstBody));assert.equal(firstBody.source,'TESTNET');
    const rows=await f.db.query<{id:string}>("select id from app_private.stellar_operations where deployment_id=$1",[f.deploymentId]);assert.equal(rows.rows.length,1);
    await call(true);assert.equal((await f.db.query('select * from app_private.stellar_operations')).rows.length,1);
    assert.equal((await f.db.query('select * from api_private.mock_runtime')).rows.length,0);
    assert.equal((await f.db.query('select * from api_private.testnet_envelopes')).rows.length,0);
    assert.equal(launched,0);
  }finally{await close(server);await f.db.close();}
});
