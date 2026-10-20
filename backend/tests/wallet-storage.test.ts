import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID,randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Keypair } from '@stellar/stellar-sdk';
import { config,h } from './fixtures.ts';
import { WalletService } from '../src/application/wallet.ts';
import type { Repository,Db } from '../src/application/repository.ts';

test('wallet migration preserves issued legacy and forbids new legacy at storage and API',async t=>{
  const db=new PGlite(),key=Keypair.random(),user=randomUUID(),legacy=randomUUID(),expired=randomUUID();
  // PGlite's domain parameters need PostgreSQL bytea text; normalize its byte arrays
  // to pg Buffers so the production service sees the same driver representation.
  const query=db.query.bind(db);
  db.query=(async (sql:string,params?:unknown[])=>{
    const converted=params?.map((v,i)=>{if(!Buffer.isBuffer(v))return v;sql=sql.replace(new RegExp('\\$'+(i+1)+'(?![0-9])','g'),`decode($${i+1},'hex')`);return v.toString('hex');});
    const result=await query(sql,converted);
    for(const row of result.rows as Record<string,unknown>[])for(const [k,v] of Object.entries(row))if(v instanceof Uint8Array)row[k]=Buffer.from(v);
    return result;
  }) as typeof db.query;
  const dir=new URL('../../database/migrations/',import.meta.url);
  const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();
  const upgrade=files.find(f=>f.endsWith('_wallet_sep53.sql'))!;
  try {
    await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;');
    for(const file of files.filter(f=>f<upgrade))await db.exec(await readFile(new URL(file,dir),'utf8'));
    await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
      values($1,'MOCK',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,$8)`,[config.deploymentId,config.networkId,config.contractAddress,h(1),config.admin,config.service,config.rewardToken,config.rewardAmount.toString()]);
    await db.query('insert into auth.users values($1)',[user]);
    await db.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[user]);
    const raw=Buffer.from(JSON.stringify({domain:'byetery-dev',version:1,address:key.publicKey()}));
    for(const [id,offset] of [[legacy,0],[expired,-1200]] as const) await db.query(`insert into api_private.wallet_challenges(id,deployment_id,user_id,network_id,address,nonce,purpose,message_bytes,created_at,expires_at)
      values($1,$2,$3,decode($4,'hex'),$5,$6,'LINK_WALLET',$7,statement_timestamp()+$8*interval '1 second',statement_timestamp()+($8+600)*interval '1 second')`,[id,config.deploymentId,user,config.networkId,key.publicKey(),randomBytes(32),raw,offset]);
    await db.exec(await readFile(new URL(upgrade,dir),'utf8'));
    for(const file of files.filter(f=>f>upgrade))await db.exec(await readFile(new URL(file,dir),'utf8'));
    const service=new WalletService({deploymentId:config.deploymentId,config:async()=>config} as unknown as Repository);
    const sql=db as unknown as Db;
    await t.test('migration assigns legacy scheme only to old rows',async()=>{
      const rows=await db.query<{signing_scheme:string}>('select signing_scheme from api_private.wallet_challenges');
      assert.deepEqual(rows.rows.map(r=>r.signing_scheme),['RAW_ED25519_V1','RAW_ED25519_V1']);
    });
    await t.test('unexpired legacy accepts only raw, consumes once',async()=>{
      assert.equal((await service.verify(sql,user,{challengeId:legacy,signature:Buffer.from(key.signMessage(raw)).toString('base64')})).status,422);
      assert.equal((await service.verify(sql,user,{challengeId:legacy,signature:Buffer.from(key.sign(raw)).toString('base64')})).status,200);
      assert.equal((await service.verify(sql,user,{challengeId:legacy,signature:Buffer.from(key.sign(raw)).toString('base64')})).status,409);
    });
    await t.test('expired legacy is never revived',async()=>assert.equal((await service.verify(sql,user,{challengeId:expired,signature:Buffer.from(key.sign(raw)).toString('base64')})).status,409));
    let issued:Record<string,any>;
    await t.test('new issuance always uses v2 SEP53 and canonical text',async()=>{
      const response=await service.challenge(sql,user,{address:key.publicKey()});issued=response.body;
      assert.equal(issued.version,2);assert.equal(issued.signingScheme,'SEP53_V2');
      assert.match(Buffer.from(issued.messageBase64,'base64').toString('utf8'),/^Byetery - Verify wallet control\nDomain: byetery-dev\n/);
    });
    await t.test('client cannot request downgrade or choose verification algorithm',async()=>{
      await assert.rejects(service.challenge(sql,user,{address:key.publicKey(),signingScheme:'RAW_ED25519_V1'}));
      await assert.rejects(service.verify(sql,user,{challengeId:issued.challengeId,signature:Buffer.from(key.sign(raw)).toString('base64'),version:1}));
    });
    await t.test('database rejects legacy insert and persisted scheme mutation',async()=>{
      await assert.rejects(db.query(`insert into api_private.wallet_challenges(id,deployment_id,user_id,network_id,address,nonce,purpose,message_bytes,created_at,expires_at,signing_scheme)
        select $1,deployment_id,user_id,network_id,address,$2,purpose,message_bytes,created_at,expires_at,'RAW_ED25519_V1' from api_private.wallet_challenges where id=$3`,[randomUUID(),randomBytes(32),issued.challengeId]),/LegacyChallengeIssuanceForbidden/);
      await assert.rejects(db.query("update api_private.wallet_challenges set signing_scheme='RAW_ED25519_V1' where id=$1",[issued.challengeId]));
    });
    await t.test('SEP53 challenge rejects raw signature then accepts real SEP53 and rejects replay',async()=>{
      const message=Buffer.from(issued.messageBase64,'base64');
      assert.equal((await service.verify(sql,user,{challengeId:issued.challengeId,signature:Buffer.from(key.sign(message)).toString('base64')})).status,422);
      const input={challengeId:issued.challengeId,signature:Buffer.from(key.signMessage(message)).toString('base64')};
      assert.equal((await service.verify(sql,user,input)).status,200);
      assert.equal((await service.verify(sql,user,input)).status,409);
    });
  } finally {await db.close();}
});
