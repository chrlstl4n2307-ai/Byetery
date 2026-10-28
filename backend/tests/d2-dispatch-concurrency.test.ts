import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PGlite} from '@electric-sql/pglite';
import {harness} from './testnet-fixtures.ts';
import {signedReady} from './d2-dispatch-fixture.ts';
import {disableMemberships} from '../src/application/revocation.ts';
import {TransportStore,type TransportDatabase,type Sql} from '../src/testnet/store.ts';

const configFile=new URL('../../.tools/d2-gap2b/postgres-test.json',import.meta.url);
let config:{host:string;port:number;user:string;database:string}|null=null;
try{config=JSON.parse(await readFile(configFile,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
function gate(){let open!:()=>void;const wait=new Promise<void>(resolve=>{open=resolve;});return {wait,open};}
function adapter(pool:Pool,afterQuery:((sql:string)=>Promise<void>)=async()=>{}):TransportDatabase{
 return {transaction:async work=>{
  const client=await pool.connect();try{
   await client.query('begin');await client.query("set local statement_timeout='5s'");
   const sql:Sql={query:async<R>(s:string,p?:unknown[])=>{const r=await client.query(s,p);await afterQuery(s);return {rows:r.rows as R[]};}};
   const result=await work(sql);await client.query('commit');return result;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 }};
}
async function actualLockWait(pool:Pool,name:string){
 const deadline=Date.now()+3000;
 while(Date.now()<deadline){
  const r=await pool.query("select wait_event_type from pg_stat_activity where application_name=$1 and wait_event_type='Lock'",[name]);
  if(r.rows.length)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 assert.fail('Expected actual PostgreSQL row-lock wait: '+name);
}

for(const winner of ['revocation','dispatch'] as const)test('GAP2B real PostgreSQL serialization: '+winner+' wins membership lock',{
 skip:config?false:'Portable local PostgreSQL not provisioned; PGlite cannot prove concurrent row locks',
},async()=>{
 assert.ok(config);assert.equal(config.host,'127.0.0.1');assert.equal(config.database,'postgres');assert.equal(config.user,'byetery_gap2b');assert.ok(config.port>=49152);
 const admin=new Pool({...config,max:2,connectionTimeoutMillis:3000}),database='byetery_gap2b_'+randomUUID().replaceAll('-','');
 const pools:Pool[]=[];let created=false;
 try{
  const directory=(await admin.query("select current_setting('data_directory') directory")).rows[0].directory as string;
  assert.equal((await realpath(directory)).toLowerCase(),(await realpath(new URL('../../.tools/d2-gap2b/pgdata',import.meta.url))).toLowerCase());
  await admin.query("do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$;");
  await admin.query('create database '+database);created=true;
  const pool=(name:string)=>{const p=new Pool({...config,database,max:4,application_name:name,connectionTimeoutMillis:3000});pools.push(p);return p;};
  const seed=pool('gap2b-monitor'),a=pool('gap2b-dispatch-A'),b=pool('gap2b-revocation-B');
  await seed.query('create schema auth; create table auth.users(id uuid primary key);');
  const migrations=new URL('../../database/migrations/',import.meta.url);
  for(const file of (await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort())await seed.query(await readFile(new URL(file,migrations),'utf8'));
  const seedAdapter=adapter(seed);
  // Explicit test facade: the existing fixture seeder uses query/exec/transaction
  // only; every statement here runs in real PostgreSQL, not PGlite.
  const fixtureDb={query:(s:string,p?:unknown[])=>seed.query(s,p),exec:(s:string)=>seed.query(s),transaction:seedAdapter.transaction.bind(seedAdapter)} as unknown as PGlite;
  const f=await harness(fixtureDb),identity=await signedReady(f),work=await f.store.work(f.op);
  const locked=gate(),release=gate();let intercepted=false;
  const pause=async(s:string)=>{
   if(!intercepted&&s.includes('api_private.memberships')&&s.includes(winner==='dispatch'?'and enabled for share':'order by role for update')){
    intercepted=true;locked.open();await release.wait;
   }
  };
  const dispatch=new TransportStore(adapter(a,winner==='dispatch'?pause:undefined));
  const revocation=adapter(b,winner==='revocation'?pause:undefined);
  const claim=await dispatch.claim(f.op,'gap2b-race');
  let first:Promise<unknown>|undefined,second:Promise<unknown>|undefined;
  try{
   if(winner==='revocation'){
    first=revocation.transaction(sql=>disableMemberships(sql,f.d,work.principal));
    await Promise.race([locked.wait,first.then(()=>assert.fail('Revocation did not reach lock gate'))]);
    second=dispatch.dispatchIntent(claim,false).then(()=> 'DISPATCHED',error=>error.code);
    await actualLockWait(seed,'gap2b-dispatch-A');release.open();await first;
    assert.equal(await second,'AuthorizationRevoked');
    assert.equal((await dispatch.work(f.op)).dispatchAttempts,0);assert.equal(await dispatch.authorizationRevoked(f.op),true);
   }else{
    first=dispatch.dispatchIntent(claim,false);await Promise.race([locked.wait,first.then(()=>assert.fail('Dispatch did not reach lock gate'))]);
    second=revocation.transaction(sql=>disableMemberships(sql,f.d,work.principal));
    await actualLockWait(seed,'gap2b-revocation-B');release.open();await first;await second;
    const after=await dispatch.work(f.op);assert.equal(after.state,'DISPATCH_INTENT');assert.equal(after.dispatchAttempts,1);
    assert.equal(await dispatch.authorizationRevoked(f.op),false);
   }
  }finally{release.open();await Promise.allSettled([first,second].filter(Boolean));await dispatch.release(claim);}
  assert.equal((await seed.query('select enabled from api_private.memberships where deployment_id=$1 and user_id=$2',[f.d,work.principal])).rows[0].enabled,false);
  assert.deepEqual(await f.store.identity(f.op),identity);assert.equal(f.transport.submitted.length,0);assert.equal(f.transport.signCount,1);
  if(winner==='dispatch'){
   f.transport.success=true;assert.equal(await f.worker.run(f.op,'gap2b-post-boundary'),'PROJECTED');
   assert.deepEqual(await f.store.identity(f.op),identity);
  }
 }finally{
  await Promise.all(pools.map(p=>p.end()));
  if(created)await admin.query('drop database '+database+' with (force)');
  await admin.end();
 }
});
