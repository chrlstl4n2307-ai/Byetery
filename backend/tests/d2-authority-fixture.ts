import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {localDb} from './testnet-fixtures.ts';
import {Repository} from '../src/application/repository.ts';
import {ACTORS,CONTRACT,TOKEN,WASM} from '../src/testnet/abi.ts';
import {NETWORK_ID} from '../src/testnet/identity.ts';
// All writes below are ephemeral PGlite fixtures. No RPC, signer or remote database.
export async function permissionFixture(){
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
