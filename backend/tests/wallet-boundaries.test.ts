import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { PGlite } from '@electric-sql/pglite';
import { config,h,contract } from './fixtures.ts';
import { WalletService } from '../src/application/wallet.ts';
import type { Repository,Db } from '../src/application/repository.ts';

test('SEP53 application wallet boundaries and transaction rollback',async t=>{
  const db=new PGlite(),user=randomUUID(),other=randomUUID(),key=Keypair.random();
  const second=randomUUID();
  const original=db.query.bind(db);
  db.query=(async(sql:string,params?:unknown[])=>{
    const values=params?.map((v,i)=>{if(!Buffer.isBuffer(v))return v;sql=sql.replace(new RegExp('\\$'+(i+1)+'(?![0-9])','g'),`decode($${i+1},'hex')`);return v.toString('hex');});
    const result=await original(sql,values);
    for(const row of result.rows as Record<string,unknown>[])for(const [k,v] of Object.entries(row))if(v instanceof Uint8Array)row[k]=Buffer.from(v);
    return result;
  }) as typeof db.query;
  const sql=db as unknown as Db;
  const service=(deploymentId=config.deploymentId)=>new WalletService({deploymentId,mode:'TESTNET',config:async()=>({...config,mode:'TESTNET',deploymentId})} as unknown as Repository);
  const count=async()=>{
    const r=await db.query<{links:number;consumed:number}>(`select (select count(*)::int from app_private.wallet_links) links,(select count(*)::int from api_private.wallet_challenges where consumed_at is not null) consumed`);
    return r.rows[0];
  };
  const issue=async()=> (await service().challenge(sql,user,{address:key.publicKey()})).body as Record<string,any>;
  const input=(c:Record<string,any>)=>({challengeId:c.challengeId,signature:Buffer.from(key.signMessage(Buffer.from(c.messageBase64,'base64'))).toString('base64')});
  try{
    await db.exec('create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;');
    const dir=new URL('../../database/migrations/',import.meta.url);
    for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
    for(const [id,c] of [[config.deploymentId,config.contractAddress],[second,contract(25)]])await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
      values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,$8)`,[id,config.networkId,c,h(1),config.admin,config.service,config.rewardToken,config.rewardAmount.toString()]);
    for(const u of [user,other]){await db.query('insert into auth.users values($1)',[u]);await db.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[u]);}
    await t.test('issuance binds exact deployment/user/address/network/nonce/expiry and source',async()=>{
      const a=await issue(),b=await issue();assert.equal(a.source,'TESTNET');assert.equal(a.signingScheme,'SEP53_V2');assert.equal(a.version,2);
      const rows=await db.query<Record<string,any>>('select * from api_private.wallet_challenges where id in ($1,$2)',[a.challengeId,b.challengeId]);
      assert.equal(rows.rows.length,2);assert.notDeepEqual(rows.rows[0].nonce,rows.rows[1].nonce);
      for(const row of rows.rows){const text=row.message_bytes.toString('utf8');assert.equal(row.nonce.length,32);
        for(const line of [`Deployment: ${config.deploymentId}`,`User: ${user}`,`Address: ${key.publicKey()}`,`Network ID: ${config.networkId}`,`Nonce: ${row.nonce.toString('hex')}`])assert.ok(text.split('\n').includes(line));
        assert.equal(row.expires_at.getTime()-row.created_at.getTime(),600000);}
    });
    await t.test('wrong user or deployment cannot consume or create a link',async()=>{
      const c=await issue(),before=await count();
      await assert.rejects(service().verify(sql,other,input(c)),{code:'ChallengeNotFound'});
      await assert.rejects(service(second).verify(sql,user,input(c)),{code:'ChallengeNotFound'});
      assert.deepEqual(await count(),before);
    });
    await t.test('wrong signer and modified bytes reject without successful consumption',async()=>{
      const c=await issue(),before=await count(),message=Buffer.from(c.messageBase64,'base64');
      for(const signature of [Keypair.random().signMessage(message),key.signMessage(Buffer.concat([message,Buffer.from(' ')]))]){
        assert.equal((await service().verify(sql,user,{challengeId:c.challengeId,signature:Buffer.from(signature).toString('base64')})).status,422);
        assert.deepEqual(await count(),before);
      }
    });
    await t.test('address/version injection and malformed proof rejected before consumption',async()=>{
      const c=await issue(),before=await count();
      for(const extra of [{address:Keypair.random().publicKey()},{version:1},{signingScheme:'RAW_ED25519_V1'}])await assert.rejects(service().verify(sql,user,{...input(c),...extra}),{code:'UnexpectedField'});
      await assert.rejects(service().verify(sql,user,{challengeId:c.challengeId,signature:'bad'}));
      assert.deepEqual(await count(),before);
    });
    await t.test('stored payload/context and scheme cannot be changed',async()=>{
      const c=await issue();
      for(const statement of ["message_bytes=decode('01','hex')",`address='${Keypair.random().publicKey()}'`,`deployment_id='${second}'`,"signing_scheme='RAW_ED25519_V1'"])
        await assert.rejects(db.query('update api_private.wallet_challenges set '+statement+' where id=$1',[c.challengeId]));
    });
    await t.test('rollback undoes both consumption and wallet link',async()=>{
      const c=await issue(),before=await count();await db.exec('begin');
      try{assert.equal((await service().verify(sql,user,input(c))).status,200);}finally{await db.exec('rollback');}
      assert.deepEqual(await count(),before);
      assert.equal((await service().verify(sql,user,input(c))).status,200);
      assert.deepEqual(await count(),{links:before.links+1,consumed:before.consumed+1});
      assert.equal((await service().verify(sql,user,input(c))).status,409);
    });
    await t.test('a second legitimate proof reuses the existing active link',async()=>{
      const c=await issue(),before=await count();assert.equal((await service().verify(sql,user,input(c))).status,200);
      assert.deepEqual(await count(),{links:before.links,consumed:before.consumed+1});
    });
  }finally{await db.close();}
});
