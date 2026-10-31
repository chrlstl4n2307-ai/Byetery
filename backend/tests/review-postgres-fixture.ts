import assert from 'node:assert/strict';
import {readFile,readdir,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {REVIEW_DEPLOYMENT as d} from '../src/review/registration-intents.ts';
import {ACTORS,CONTRACT,TOKEN,WASM} from '../src/testnet/abi.ts';
import {NETWORK_ID} from '../src/testnet/identity.ts';

/** Explicit loopback disposable DB only, never reads root .env or a DB URL. */
export async function reviewFixture(options:{adminPermission?:boolean}={}){
 const config=JSON.parse(await readFile(new URL('../../.tools/d2-gap2b/postgres-test.json',import.meta.url),'utf8'));
 assert.equal(config.host,'127.0.0.1');assert.equal(config.user,'byetery_gap2b');assert.equal(config.database,'postgres');
 assert.ok(Number.isInteger(config.port)&&config.port>=49152);
 // Legacy GAP2B keeps its config alias; review SQL requires a direct postgres
 // NOSUPERUSER login. Never inherit/bootstrap via SET ROLE or silently fall back.
 assert.equal(config.reviewUser,'postgres','Run scripts/instaward/local-postgres-fixture.py');
 const executionConfig={...config,user:config.reviewUser};
 const admin=new Pool({...executionConfig,max:2,connectionTimeoutMillis:3000});
 const identity=(await admin.query("select current_user,session_user,(select rolsuper from pg_roles where rolname=current_user) rolsuper,current_setting('server_version_num') version,current_setting('createrole_self_grant') self_grant")).rows[0];
 assert.equal(identity.current_user,'postgres');assert.equal(identity.session_user,'postgres');
 assert.equal(identity.rolsuper,false);assert.equal(identity.version,'170006');assert.equal(identity.self_grant,'');
 const data=(await admin.query("select current_setting('data_directory') directory")).rows[0].directory;
 assert.equal((await realpath(data)).toLowerCase(),(await realpath(new URL('../../.tools/d2-gap2b/pgdata',import.meta.url))).toLowerCase());
 const database='byetery_b1_'+randomUUID().replaceAll('-',''),pools:Pool[]=[];
 await admin.query('create database '+database);
 const connection=(name='b1-test',user=executionConfig.user)=>{
  const p=new Pool({...executionConfig,database,user,max:4,application_name:name,connectionTimeoutMillis:3000});pools.push(p);return p;
 };
 const pool=connection(),review=connection('b1-restricted','byetery_d2_review_app');
 const users={ADMIN:randomUUID(),USER:randomUUID(),COLLECTOR:randomUUID(),RECYCLER:randomUUID(),SECOND_ADMIN:randomUUID()};
 const close=async()=>{await Promise.all(pools.map(p=>p.end()));await admin.query('drop database '+database+' with (force)');await admin.end();};
 try{
  await pool.query('create schema auth; create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
  await pool.query('do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$;');
  const dir=new URL('../../database/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(new URL(file,dir),'utf8'));
  await pool.query(await readFile(new URL('../../database/review/d2-008b1-registration-intents.sql',import.meta.url),'utf8'));
  await pool.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
   values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[d,NETWORK_ID,CONTRACT,WASM,ACTORS.admin,ACTORS.service,TOKEN]);
  for(const [role,user] of Object.entries(users)){
   await pool.query('insert into auth.users values($1)',[user]);
   await pool.query('insert into auth.sessions values($1,$1,null)',[user]);
   await pool.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[user]);
   await pool.query('insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,\'USER\')',[d,user]);
   if(role!=='USER')await pool.query('insert into api_private.memberships(deployment_id,user_id,role,actor_address) values($1,$2,$3,$4)',
    [d,user,role==='SECOND_ADMIN'?'ADMIN':role,role==='COLLECTOR'?ACTORS.collector:role==='RECYCLER'?ACTORS.recycler:null]);
   if(role!=='ADMIN'||options.adminPermission!==false)
    await pool.query('insert into review_private.permissions(deployment_id,principal,capability) values($1,$2,\'CREATE_D2_REGISTRATION_INTENT\')',[d,user]);
  }
  return {pool,review,users,d,connection,close};
 }catch(error){await close();throw error;}
}
export function gate(){let open!:()=>void;const wait=new Promise<void>(resolve=>{open=resolve;});return {wait,open};}
export async function lockWait(pool:Pool,name:string){
 const deadline=Date.now()+4000;
 while(Date.now()<deadline){
  if((await pool.query("select 1 from pg_stat_activity where datname=current_database() and application_name=$1 and wait_event_type='Lock'",[name])).rows.length)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 assert.fail('Actual PostgreSQL lock wait not observed: '+name);
}
export async function counts(pool:Pool,id:string,battery:string){
 const result:Record<string,number>={};
 for(const table of ['app_private.battery_records','app_private.evidence_versions','app_private.stellar_operations','api_private.testnet_work','api_private.testnet_envelopes','api_private.testnet_source_leases','api_private.testnet_observations']){
  const column=table.endsWith('stellar_operations')?'id':table.endsWith('battery_records')||table.endsWith('evidence_versions')?'battery_id':'operation_id';
  const value=column==='battery_id'?battery:id;
  result[table]=Number((await pool.query(`select count(*) n from ${table} where ${column}=$1`,[value])).rows[0].n);
 }
 return result;
}
