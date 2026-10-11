import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { localDb,harness } from './testnet-fixtures.ts';
let db:PGlite;
before(async()=>{db=await localDb();});after(async()=>{await db.close();});
test('VOL-003 all four private tables have forced RLS and browser grants denied',async()=>{
  const tables=['testnet_work','testnet_source_leases','testnet_envelopes','testnet_observations'];
  for(const table of tables){
    const r=await db.query<{relrowsecurity:boolean;relforcerowsecurity:boolean}>(`select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass`,['api_private.'+table]);
    assert.deepEqual(r.rows[0],{relrowsecurity:true,relforcerowsecurity:true});
    for(const role of ['anon','authenticated']){
      const p=await db.query<{allowed:boolean}>(`select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed`,[role,'api_private.'+table]);
      assert.equal(p.rows[0].allowed,false);
    }
  }
  assert.equal((await db.query(`select * from pg_proc where pronamespace='api_private'::regnamespace and prosecdef`)).rows.length,0);
});
for(const role of ['anon','authenticated'])test(`VOL-003 ${role}: RLS survives accidental grants/policies`,async()=>{
  await db.exec('begin');
  try{
    for(const table of ['testnet_work','testnet_source_leases','testnet_envelopes','testnet_observations'])await db.exec(`grant usage on schema api_private to ${role}; grant all on api_private.${table} to ${role}; create policy accidental_allow on api_private.${table} for all to ${role} using(true) with check(true);`);
    await db.exec(`grant usage,select on all sequences in schema api_private to ${role}; set local role ${role}`);
    for(const table of ['testnet_work','testnet_source_leases','testnet_envelopes','testnet_observations']){
      assert.equal((await db.query(`select * from api_private.${table}`)).rows.length,0);
      assert.equal((await db.query(`delete from api_private.${table} returning *`)).rows.length,0);
    }
    await db.exec('savepoint denied_insert');
    await assert.rejects(db.exec(`insert into api_private.testnet_observations(deployment_id,operation_id,kind,evidence)
      values('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','NOT_FOUND','{}')`),/row-level security/);
  }finally{await db.exec('rollback');}
});
test('VOL-003 identity bytes/hash/all fields and observation history are immutable',async()=>{
  const f=await harness(db);await f.worker.run(f.op,'worker');
  for(const column of ['signed_envelope','transaction_hash','network_id','context_hash']){
    await assert.rejects(db.query(`update api_private.testnet_envelopes set ${column}=decode(repeat('02',32),'hex') where operation_id=$1`,[f.op]),/ImmutableField/);
  }
  await assert.rejects(db.query('delete from api_private.testnet_envelopes where operation_id=$1',[f.op]),/HistoryDeletionForbidden/);
  await assert.rejects(db.query('delete from api_private.testnet_observations where operation_id=$1',[f.op]),/HistoryDeletionForbidden/);
  await assert.rejects(db.query("update api_private.testnet_work set state='CLAIMED' where operation_id=$1",[f.op]),/InvalidTransportTransition/);
  for(const column of ['deployment_id','operation_id','contract_address','source_account','sequence','min_time','max_time','authorization_expirations','prepared_ledger','created_at']) {
    const expression=column.endsWith('_id')?'gen_random_uuid()':column==='contract_address'||column==='source_account'?"'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'":column==='authorization_expirations'?"array[90]::bigint[]":column==='created_at'?"created_at+interval '1 second'":`${column}+1`;
    await assert.rejects(db.query(`update api_private.testnet_envelopes set ${column}=${expression} where operation_id=$1`,[f.op]),/ImmutableField|check constraint/);
  }
});
test('VOL-003 database rejects a ready state without an immutable envelope',async()=>{
  const f=await harness(db);await assert.rejects(db.query("update api_private.testnet_work set state='READY' where operation_id=$1",[f.op]),/IdentityNotDurable/);
});
test('VOL-003 stale lease generation cannot persist or dispatch; unresolved source cannot be stolen',async()=>{
  const f=await harness(db),c1=await f.store.claim(f.op,'one');
  await assert.rejects(f.store.claim(f.op,'two'),/SourceAccountBusy/);
  await f.store.release(c1);const c2=await f.store.claim(f.op,'two');
  assert.equal(BigInt(c2.generation),BigInt(c1.generation)+1n);
  await assert.rejects(f.store.preparing(c1),/StaleClaim/);
  await assert.rejects(f.store.dispatchIntent(c1,false),/StaleClaim/);
  await assert.rejects(db.query('update api_private.testnet_source_leases set generation=generation-1 where operation_id=$1',[f.op]),/InvalidLeaseGeneration/);
  await f.store.release(c2);
});
test('VOL-003 queue is idempotent but immutable operation context cannot change',async()=>{
  const f=await harness(db);await f.store.queue(f.d,f.op,f.key.publicKey(),f.args);
  await assert.rejects(f.store.queue(f.d,f.op,f.key.publicKey(),[]),/QueueContextConflict/);
  await assert.rejects(db.query('update api_private.testnet_work set context_hash=decode(repeat(\'02\',32),\'hex\') where operation_id=$1',[f.op]),/ImmutableField/);
  await assert.rejects(f.store.queue(f.d,randomUUID(),f.key.publicKey(),[]),/TransportWorkMissing/);
});
