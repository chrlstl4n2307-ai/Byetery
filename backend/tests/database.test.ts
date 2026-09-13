import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { config,collector,recycler,recipient,h,collect as collectionCommand,recycle as recyclingCommand } from './fixtures.ts';
import { MockStellarService } from '../src/mock-stellar-service.ts';
import type { Command } from '../src/domain.ts';

let db: PGlite;
const d=config.deploymentId,u='22222222-2222-4222-8222-222222222222',w='33333333-3333-4333-8333-333333333333';
const op='44444444-4444-4444-8444-444444444444';
const b='BYE-000001', r=`decode('${h(10)}','hex')`, hash=`decode('${h(1)}','hex')`;
const where=`deployment_id='${d}' and battery_id='${b}'`;
before(async()=>{
 db=new PGlite();
 // Test-only Supabase prerequisites. No production auth schema replacement.
 await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;');
 const dir=new URL('../../database/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file,dir),'utf8'));
});
after(async()=>{ await db?.close(); });
async function seed(){
 await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
 values($1,'MOCK',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,$8)`,[d,config.networkId,config.contractAddress,h(1),config.admin,config.service,config.rewardToken,config.rewardAmount.toString()]);
 await db.exec(`insert into auth.users values('${u}'); insert into app_private.users(id,auth_user_id) values('${u}','${u}');
 insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at) values('${w}','${d}',decode('${config.networkId}','hex'),'${u}','${recipient}','mock-proof-reference',now());
 insert into app_private.battery_records(deployment_id,battery_id,created_by) values('${d}','${b}','${u}');
 insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot) values('${d}',${r},'${b}','${u}','${w}','${recipient}');
 insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,reward_state,confirmed_ledger) values('${d}','${b}','REGISTERED',${hash},'NOT_ELIGIBLE',1);`);
}
function check(name:string,body:()=>Promise<void>){test(name,async()=>{await db.exec('begin');try{await seed();await body();await db.exec('set constraints all immediate');}finally{await db.exec('rollback');}});}
async function reject(sql:string,pattern:RegExp){
 await db.exec('savepoint expected_failure');
 try { await assert.rejects(db.exec(sql),pattern); } finally { await db.exec('rollback to savepoint expected_failure'); await db.exec('release savepoint expected_failure'); }
}
async function open(){await db.exec(`insert into chain_private.return_requests(deployment_id,request_id,battery_id,recipient,state,confirmed_ledger) values('${d}',${r},'${b}','${recipient}','OPEN',2);
 update chain_private.batteries set state='RETURNED',request_id=${r},confirmed_ledger=2 where ${where};`);}
async function collect(){await open();await db.exec(`update chain_private.return_requests set state='CONFIRMED',confirmed_ledger=3 where ${where};
 update chain_private.batteries set state='COLLECTED',collector='${collector}',collection_hash=${hash},confirmed_ledger=3 where ${where};
 update app_private.return_requests set reservation_state='CONSUMED',association_confirmed_at=now() where ${where};`);}
async function recycled(){await collect();await db.exec(`update chain_private.batteries set state='RECYCLED',recycler='${recycler}',recycling_hash=${hash},reward_state='PENDING',confirmed_ledger=4 where ${where};`);}
async function operation(){await db.exec(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
 values('${op}','${d}','worker','pay-1','pay_reward','${b}','{}',${hash});`);}
async function attempt(){await operation();await db.exec(`insert into app_private.reward_attempts(deployment_id,battery_id,request_id,operation_id,attempt_number) values('${d}','${b}',${r},'${op}',1);`);}

check('all eleven tables have enabled + forced RLS and restrictive browser deny',async()=>{
 const rows=await db.query<{n:number}>(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('app_private','chain_private') and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity`);
 assert.equal(rows.rows[0].n,11);
 const policies=await db.query<{n:number}>(`select count(*)::int n from pg_policies where schemaname in ('app_private','chain_private') and policyname='browser_deny' and permissive='RESTRICTIVE'`);assert.equal(policies.rows[0].n,11);
});
for(const role of ['anon','authenticated']) check(`${role}: grants deny read and writes on every table`,async()=>{
 const tables=await db.query<{schemaname:string;tablename:string}>(`select schemaname,tablename from pg_tables where schemaname in ('app_private','chain_private')`);
 for(const t of tables.rows){
  await reject(`set local role ${role}; select * from ${t.schemaname}.${t.tablename}`,/permission denied/);
  await reject(`set local role ${role}; delete from ${t.schemaname}.${t.tablename}`,/permission denied/);
  const privileges=await db.query<{allowed:boolean}>(`select has_table_privilege($1,$2,'INSERT') or has_table_privilege($1,$2,'UPDATE') allowed`,[role,`${t.schemaname}.${t.tablename}`]);assert.equal(privileges.rows[0].allowed,false);
 }
});
for(const role of ['anon','authenticated']) check(`${role}: restrictive RLS blocks even accidental grants and permissive policy`,async()=>{
 await db.exec(`grant usage on schema app_private,chain_private to ${role}; grant select,insert,update,delete on all tables in schema app_private,chain_private to ${role};
 create policy accidental_allow on chain_private.batteries for all to ${role} using(true) with check(true); set local role ${role};`);
 const rows=await db.query(`select * from chain_private.batteries`);assert.equal(rows.rows.length,0);
 const changed=await db.query(`update chain_private.batteries set reward_state='SENT' returning *`);assert.equal(changed.rows.length,0);
 await reject(`insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,reward_state,confirmed_ledger) values('${d}','EVIL','REGISTERED',${hash},'NOT_ELIGIBLE',1)`,/row-level security/);
 await db.exec('reset role');
});
check('duplicate battery and request identifiers rejected',async()=>{
 await reject(`insert into app_private.battery_records(deployment_id,battery_id) values('${d}','${b}')`,/duplicate key/);
 await reject(`insert into app_private.return_requests select * from app_private.return_requests`,/duplicate key/);
});
check('battery IDs reject lowercase, unicode and overlength; request requires 32 bytes',async()=>{
 for(const id of ['bye-1','BYÉ-1','A'.repeat(33),'']) await reject(`insert into app_private.battery_records(deployment_id,battery_id) values('${d}','${id}')`,/check constraint/);
 await reject(`update app_private.return_requests set request_id=decode('aa','hex')`,/check constraint/);
});
check('wallet owner and recipient cannot be substituted; revoked wallet cannot open request',async()=>{
 await reject(`update app_private.return_requests set recipient_snapshot='${collector}'`,/ImmutableField/);
 await reject(`update app_private.return_requests set user_id=gen_random_uuid()`,/ImmutableField/);
 await db.exec(`update app_private.return_requests set reservation_state='RELEASED'; update app_private.wallet_links set revoked_at=now();`);
 await reject(`insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot) values('${d}',decode('${h(11)}','hex'),'${b}','${u}','${w}','${recipient}')`,/InvalidWalletOrReservation/);
 await reject(`update app_private.wallet_links set revoked_at=null`,/RevocationImmutable/);
});
check('only one local reservation can occupy a battery',async()=>{
 await reject(`insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot) values('${d}',decode('${h(11)}','hex'),'${b}','${u}','${w}','${recipient}')`,/duplicate key/);
});
check('cancel returns REGISTERED and leaves immutable cancelled request',async()=>{
 await open(); await db.exec(`update chain_private.return_requests set state='CANCELLED',confirmed_ledger=3 where ${where}; update chain_private.batteries set state='REGISTERED',request_id=null,confirmed_ledger=3 where ${where}; update app_private.return_requests set reservation_state='RELEASED' where ${where};`);
 await reject(`update chain_private.return_requests set state='OPEN'`,/RequestTerminal/);
 await reject(`delete from chain_private.return_requests`,/HistoryDeletionForbidden/);
});
check('deferred constraint rejects detached live request at transaction boundary',async()=>{
 await open(); await reject(`update chain_private.batteries set state='REGISTERED',request_id=null where ${where}; set constraints all immediate;`,/DetachedLiveRequest/);
});
check('evidence cannot reference a different battery and finalized content is immutable',async()=>{
 await db.exec(`insert into app_private.battery_records(deployment_id,battery_id) values('${d}','BYE-OTHER')`);
 const insert=(battery:string,revision:number,path:string)=>`insert into app_private.evidence_versions(deployment_id,battery_id,request_id,kind,revision,format_version,manifest_bytes,payload_hash,commitment,object_path) values('${d}','${battery}',${r},'COLLECTION',${revision},1,decode('7b7d','hex'),sha256(decode('7b7d','hex')),${hash},'${path}')`;
 await reject(insert('BYE-OTHER',1,'bad'),/foreign key/);
 await db.exec(insert(b,1,'private/evidence/v1'));
 await reject(`update app_private.evidence_versions set manifest_bytes=decode('00','hex')`,/ImmutableField/);
 await db.exec(insert(b,2,'private/evidence/v2'));
});
check('cross-deployment wallet references rejected',async()=>{
 await db.exec(`insert into chain_private.deployments select '99999999-9999-4999-8999-999999999999','MOCK',network_id,'${config.rewardToken}',wasm_hash,schema_version,admin,service,'${config.contractAddress}',reward_amount,created_at from chain_private.deployments`);
 await reject(`insert into app_private.wallet_links(deployment_id,network_id,user_id,address,proof_reference,verified_at) values('99999999-9999-4999-8999-999999999999',${hash},'${u}','${recipient}','proof',now())`,/foreign key/);
});
check('backward transition, recipient rewrite, premature SENT and stale ledger rejected',async()=>{
 await recycled();
 await reject(`update chain_private.batteries set state='COLLECTED'`,/InvalidStateTransition/);
 await reject(`update chain_private.return_requests set recipient='${collector}'`,/ImmutableField/);
 await reject(`update chain_private.batteries set confirmed_ledger=1`,/StaleObservation/);
 await reject(`update chain_private.batteries set reward_state='FAILED'`,/check constraint/);
});
check('cannot jump from RETURNED to RECYCLED or collection straight to SENT',async()=>{
 await collect(); await reject(`update chain_private.batteries set state='RECYCLED',recycler='${recycler}',recycling_hash=${hash},reward_state='SENT'`,/MustBecomePending/);
});
check('operation parameters immutable; idempotency unique; UNKNOWN cannot be cancelled locally',async()=>{
 await operation(); await reject(`update app_private.stellar_operations set parameters='{"recipient":"other"}'`,/ImmutableField/);
 await reject(`insert into app_private.stellar_operations(deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash) values('${d}','worker','pay-1','pay_reward','${b}','{}',${hash})`,/duplicate key/);
 await db.exec(`update app_private.stellar_operations set state='READY'; update app_private.stellar_operations set state='SUBMITTED'; update app_private.stellar_operations set state='UNKNOWN';`);
 await reject(`update app_private.stellar_operations set state='CANCELLED_LOCAL'`,/InvalidOperationTransition/);
});
check('reward attempts require recycled battery and pay_reward operation',async()=>{
 await operation(); await reject(`insert into app_private.reward_attempts(deployment_id,battery_id,request_id,operation_id,attempt_number) values('${d}','${b}',${r},'${op}',1)`,/RewardNotEligible/);
});
check('full SQL projection flow reaches SENT with successful reward attempt',async()=>{
 await recycled(); await attempt();
 await reject(`update app_private.reward_attempts set state='SUCCEEDED'`,/PaymentNotConfirmed/);
 await db.exec(`update app_private.stellar_operations set state='READY'; update app_private.stellar_operations set state='SUBMITTED'; update app_private.reward_attempts set state='SUBMITTED';
 update chain_private.batteries set reward_state='SENT',confirmed_ledger=5; update app_private.stellar_operations set state='CONFIRMED'; update app_private.reward_attempts set state='SUCCEEDED';`);
 await reject(`update chain_private.batteries set reward_state='PENDING'`,/RewardTerminal/);
 await reject(`update app_private.return_requests set reservation_state='RELEASED',association_confirmed_at=null`,/TerminalReservation/);
});
check('failed payment attempt leaves chain Pending; no concurrent active attempt',async()=>{
 await recycled(); await attempt();
 await db.exec(`insert into app_private.stellar_operations(deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash) values('${d}','worker','pay-2','pay_reward','${b}','{}',${hash})`);
 const next=`insert into app_private.reward_attempts(deployment_id,battery_id,request_id,operation_id,attempt_number) select '${d}','${b}',${r},id,2 from app_private.stellar_operations where idempotency_key='pay-2'`;
 await reject(next,/duplicate key/);
 await db.exec(`update app_private.stellar_operations set state='REJECTED' where id='${op}'; update app_private.reward_attempts set state='FAILED'`);
 assert.equal((await db.query<{reward_state:string}>('select reward_state from chain_private.batteries')).rows[0].reward_state,'PENDING');
 await db.exec(next);
});
check('configuration, roles identity and evidence history cannot be rewritten or deleted',async()=>{
 await reject(`update chain_private.deployments set reward_amount=1`,/ImmutableField/);
 await reject(`delete from app_private.return_requests`,/HistoryDeletionForbidden/);
 await db.exec(`insert into chain_private.actor_roles values('${d}','${collector}','COLLECTOR',true,1)`);
 await reject(`update chain_private.actor_roles set actor_address='${recycler}'`,/ImmutableField/);
});
check('cannot mark association collected before on-chain confirmation',async()=>{
 await reject(`update app_private.return_requests set reservation_state='CONSUMED',association_confirmed_at=now(); set constraints all immediate`,/CollectionNotConfirmed/);
});
check('cannot release a claim while chain request remains OPEN',async()=>{
 await open(); await reject(`update app_private.return_requests set reservation_state='RELEASED'; set constraints all immediate`,/ClaimStateMismatch/);
});
check('chain claim cannot import a different recipient for a known local claim',async()=>{
 await reject(`insert into chain_private.return_requests(deployment_id,request_id,battery_id,recipient,state,confirmed_ledger) values('${d}',${r},'${b}','${collector}','OPEN',2);
 update chain_private.batteries set state='RETURNED',request_id=${r},confirmed_ledger=2; set constraints all immediate`,/ClaimBindingMismatch/);
});
check('manifest content must match its SHA-256',async()=>{
 await reject(`insert into app_private.evidence_versions(deployment_id,battery_id,kind,revision,format_version,manifest_bytes,payload_hash,object_path)
 values('${d}','${b}','REGISTRATION',1,1,decode('7b7d','hex'),${hash},'mismatch')`,/check constraint/);
});
check('integrated mock confirmations drive SQL projection through the complete reward flow',async()=>{
 const stellar=new MockStellarService(config);
 async function execute(command:Command){
  const prepared=await stellar.prepare(d,command);
  const submission=await stellar.submit(prepared,prepared.requiredSigners.map(a=>stellar.authorize(prepared,a)));
  assert.equal((await stellar.getTransactionResult(submission)).status,'PENDING');
  const result=stellar.settle(submission); assert.equal(result.status,'SUCCESS');
  if(command.kind==='set_role') return;
  const battery=await stellar.getBattery(d,b); assert.ok(battery);
  if('requestId' in command){
   const request=await stellar.getReturnRequest(d,command.requestId); assert.ok(request);
   await db.query(`insert into chain_private.return_requests(deployment_id,request_id,battery_id,recipient,state,confirmed_ledger)
    values($1,decode($2,'hex'),$3,$4,$5,$6) on conflict(deployment_id,request_id) do update set state=excluded.state,confirmed_ledger=excluded.confirmed_ledger`,
    [d,command.requestId,b,request.recipient,request.state,result.ledger]);
   if(request.state==='CONFIRMED') await db.exec(`update app_private.return_requests set reservation_state='CONSUMED',association_confirmed_at=coalesce(association_confirmed_at,now()) where ${where}`);
  }
  await db.query(`update chain_private.batteries set state=$1,request_id=decode($2,'hex'),collector=$3,collection_hash=decode($4,'hex'),recycler=$5,recycling_hash=decode($6,'hex'),reward_state=$7,confirmed_ledger=$8 where deployment_id=$9 and battery_id=$10`,
   [battery.state,battery.requestId,battery.collector,battery.collectionHash,battery.recycler,battery.recyclingHash,battery.rewardState,result.ledger,d,b]);
  await db.exec('set constraints all immediate; set constraints all deferred');
 }
 await execute({kind:'register_battery',batteryId:b,registrationHash:h(1)});
 await execute({kind:'set_role',actor:collector,role:'COLLECTOR',enabled:true});
 await execute({kind:'set_role',actor:recycler,role:'RECYCLER',enabled:true});
 await execute({kind:'open_return',batteryId:b,requestId:h(10),recipient});
 await execute(collectionCommand()); await execute(recyclingCommand());
 await attempt();await db.exec(`update app_private.stellar_operations set state='READY';update app_private.stellar_operations set state='SUBMITTED';update app_private.reward_attempts set state='SUBMITTED'`);
 stellar.fund(config.rewardAmount); await execute({kind:'pay_reward',batteryId:b});
 await db.exec(`update app_private.stellar_operations set state='CONFIRMED';update app_private.reward_attempts set state='SUCCEEDED'`);
 assert.equal((await db.query<{reward_state:string}>('select reward_state from chain_private.batteries')).rows[0].reward_state,'SENT');
 assert.equal(stellar.recipientBalance(recipient),config.rewardAmount);
});
