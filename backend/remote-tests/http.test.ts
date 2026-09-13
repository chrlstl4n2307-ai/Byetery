import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { fixture,evidence,authRequest } from '../src/application/dev-fixture.ts';
import { Coordinator } from '../src/application/coordinator.ts';
import { Ed25519WalletVerifier } from '../src/application/wallet.ts';
test('remote-dev HTTP integration (Supabase DEV + real loopback HTTP + durable MOCK)',async t=>{
  let omitted:'service'|'collector'|null=null,holdReward=false;
  const f=await fixture({omitSigner:(signer,c)=>c.kind==='confirm_collection' && (omitted==='service'?signer===f.deployment.service:omitted==='collector'?signer===f.users.collector.key.publicKey():false),hold:c=>holdReward&&c.kind==='pay_reward'});
  const {a,b,admin,collector,recycler,rogue}=f.users;
  const id='BYE-'+randomBytes(8).toString('hex').toUpperCase(),regKey=randomUUID();
  const responses:unknown[]=[];
  const secrets=[f.config.publicKey,f.config.serverKey,...Object.values(f.users).map(u=>u.token)];
  const call:typeof f.call=async(...args)=>{const r=await f.call(...args);responses.push(r);return r;};
  let rid='';
  try {
    await t.test('missing session returns uniform 401',async()=>{
      const r=await call(null,'GET',`/api/batteries/${id}`);assert.equal(r.status,401);assert.ok(r.body.error.code);assert.ok(r.body.error.requestId);assert.equal(typeof r.body.error.message,'string');
    });
    await t.test('normal USER cannot register',async()=>assert.equal((await call(a,'POST','/api/batteries',{batteryId:id})).status,403));
    await t.test('user-editable metadata cannot grant ADMIN',async()=>{
      await authRequest(f.config,'/user','PUT',{data:{role:'ADMIN',admin:true}},a.token);
      assert.equal((await call(a,'POST','/api/batteries',{batteryId:id})).status,403);
    });
    await t.test('ADMIN registers confirmed battery',async()=>{
      const r=await call(admin,'POST','/api/batteries',{batteryId:id,metadata:{dev:true}},regKey);assert.equal(r.status,201);assert.equal(r.body.confirmedBatteryState,'REGISTERED');assert.equal(r.body.source,'MOCK');
    });
    await t.test('registration idempotency returns same logical result',async()=>{
      const r=await call(admin,'POST','/api/batteries',{metadata:{dev:true},batteryId:id},regKey);assert.equal(r.status,201);assert.equal(r.body.confirmedBatteryState,'REGISTERED');
    });
    await t.test('same idempotency key with changed input conflicts',async()=>assert.equal((await call(admin,'POST','/api/batteries',{batteryId:id,metadata:{dev:false}},regKey)).status,409));
    await t.test('duplicate battery is rejected',async()=>assert.equal((await call(admin,'POST','/api/batteries',{batteryId:id})).status,409));
    await t.test('client identity/role fields are rejected',async()=>assert.equal((await call(admin,'POST','/api/batteries',{batteryId:id,user_id:a.id,role:'ADMIN',admin:true})).status,400));
    await t.test('verified wallet is required',async()=>assert.equal((await call(a,'POST',`/api/batteries/${id}/returns`,{})).status,409));
    await t.test('real Ed25519 challenge, owner binding, nonce consumption and idempotency',async()=>{
      const key=randomUUID();const c=await call(a,'POST','/api/wallet/challenge',{address:a.key.publicKey()},key);assert.equal(c.status,201);
      assert.equal((await call(a,'POST','/api/wallet/challenge',{address:a.key.publicKey()},key)).body.challengeId,c.body.challengeId);
      const message=Buffer.from(c.body.messageBase64,'base64'),signature=Buffer.from(a.key.sign(message)).toString('base64');
      assert.equal((await call(b,'POST','/api/wallet/verify',{challengeId:c.body.challengeId,signature})).status,404);
      assert.equal((await call(a,'POST','/api/wallet/verify',{challengeId:c.body.challengeId,signature:Buffer.from(b.key.sign(message)).toString('base64')})).status,422);
      const vk=randomUUID();assert.equal((await call(a,'POST','/api/wallet/verify',{challengeId:c.body.challengeId,signature},vk)).status,200);
      assert.equal((await call(a,'POST','/api/wallet/verify',{challengeId:c.body.challengeId,signature},vk)).status,200);
      assert.equal((await call(a,'POST','/api/wallet/verify',{challengeId:c.body.challengeId,signature})).status,409);
      const row=await f.repo.transaction(async db=>(await db.query('select attempts,consumed_at from api_private.wallet_challenges where id=$1',[c.body.challengeId])).rows[0]);
      assert.equal(row.attempts,2);assert.ok(row.consumed_at);
    });
    await t.test('wallet nonce has a five-attempt limit and atomic single consumption',async()=>{
      const c=await call(a,'POST','/api/wallet/challenge',{address:a.key.publicKey()});assert.equal(c.status,201);
      const message=Buffer.from(c.body.messageBase64,'base64');
      for(let i=0;i<5;i++)assert.equal((await call(a,'POST','/api/wallet/verify',{challengeId:c.body.challengeId,signature:Buffer.from(b.key.sign(message)).toString('base64')})).status,422);
      assert.equal((await call(a,'POST','/api/wallet/verify',{challengeId:c.body.challengeId,signature:Buffer.from(a.key.sign(message)).toString('base64')})).status,409);
      const other=await call(a,'POST','/api/wallet/challenge',{address:a.key.publicKey()});const payload={challengeId:other.body.challengeId,signature:Buffer.from(a.key.sign(Buffer.from(other.body.messageBase64,'base64'))).toString('base64')};
      const pair=await Promise.all([call(a,'POST','/api/wallet/verify',payload),call(a,'POST','/api/wallet/verify',payload)]);
      assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);
    });
    await t.test('Ed25519 verifier rejects an expired challenge',async()=>{
      const message=Buffer.from('expired');const verifier=new Ed25519WalletVerifier();
      const r=await verifier.verify({id:randomUUID(),userId:a.id,networkId:f.deployment.networkId,address:a.key.publicKey(),domain:'byetery-dev',nonce:'00',message,expiresAt:new Date(0)},a.key.sign(message),new Date());assert.equal(r.verified,false);
    });
    await t.test('A creates return with CSPRNG request ID',async()=>{
      const r=await call(a,'POST',`/api/batteries/${id}/returns`,{});assert.equal(r.status,201);rid=r.body.requestId;assert.match(rid,/^[a-f0-9]{64}$/);assert.equal(r.body.confirmedBatteryState,'RETURNED');
    });
    await t.test('B cannot cancel A request',async()=>assert.equal((await call(b,'POST',`/api/returns/${rid}/cancel`,{})).status,403));
    await t.test('second active return rejected',async()=>assert.equal((await call(a,'POST',`/api/batteries/${id}/returns`,{})).status,409));
    await t.test('valid cancellation and new non-reused claim',async()=>{
      const c=await call(a,'POST',`/api/returns/${rid}/cancel`,{});assert.equal(c.status,200);assert.equal(c.body.confirmedBatteryState,'REGISTERED');
      const r=await call(a,'POST',`/api/batteries/${id}/returns`,{});assert.equal(r.status,201);assert.notEqual(r.body.requestId,rid);rid=r.body.requestId;
    });
    await t.test('unauthorized application collector rejected',async()=>assert.equal((await call(a,'POST',`/api/returns/${rid}/collection`,evidence(id,rid,'COLLECTION'))).status,403));
    await t.test('application role alone cannot replace Stellar role',async()=>assert.equal((await call(rogue,'POST',`/api/returns/${rid}/collection`,evidence(id,rid,'COLLECTION'))).status,403));
    for(const missing of ['service','collector'] as const) await t.test(`collection rejects missing ${missing} authorization`,async()=>{
      omitted=missing;try{assert.equal((await call(collector,'POST',`/api/returns/${rid}/collection`,evidence(id,rid,'COLLECTION'))).status,403);}finally{omitted=null;}
    });
    await t.test('evidence from another battery rejected',async()=>assert.equal((await call(collector,'POST',`/api/returns/${rid}/collection`,evidence('BYE-WRONG',rid,'COLLECTION'))).status,422));
    await t.test('recycling before collection rejected by mock',async()=>assert.equal((await call(recycler,'POST',`/api/returns/${rid}/recycling`,evidence(id,rid,'RECYCLING'))).status,409));
    await t.test('collection succeeds with both bound authorizations',async()=>{
      const r=await call(collector,'POST',`/api/returns/${rid}/collection`,evidence(id,rid,'COLLECTION'));assert.equal(r.status,200);assert.equal(r.body.confirmedBatteryState,'COLLECTED');
    });
    await t.test('cancel after collection rejected',async()=>assert.equal((await call(a,'POST',`/api/returns/${rid}/cancel`,{})).status,409));
    await t.test('premature reward rejected',async()=>assert.equal((await call(a,'POST',`/api/batteries/${id}/reward`,{})).status,409));
    await t.test('unauthorized recycler rejected',async()=>assert.equal((await call(a,'POST',`/api/returns/${rid}/recycling`,evidence(id,rid,'RECYCLING'))).status,403));
    await t.test('recycling confirms RECYCLED + PENDING',async()=>{
      const r=await call(recycler,'POST',`/api/returns/${rid}/recycling`,evidence(id,rid,'RECYCLING'));assert.equal(r.status,200);assert.equal(r.body.confirmedBatteryState,'RECYCLED');assert.equal(r.body.confirmedRewardState,'PENDING');
    });
    await t.test('client cannot override reward recipient, token or amount',async()=>assert.equal((await call(a,'POST',`/api/batteries/${id}/reward`,{recipient:b.key.publicKey(),amount:999,token:'OTHER'})).status,400));
    await t.test('UNKNOWN survives retry and a new coordinator restores the same submission',async()=>{
      holdReward=true;const key=randomUUID();const first=await call(a,'POST',`/api/batteries/${id}/reward`,{},key);
      assert.equal(first.status,202);assert.equal(first.body.confirmedRewardState,'PENDING');assert.equal(first.body.pendingOperation.state,'UNKNOWN');
      const retry=await call(a,'POST',`/api/batteries/${id}/reward`,{},key);assert.equal(retry.status,202);assert.equal(retry.body.operationId,first.body.operationId);
      assert.equal((await call(a,'POST',`/api/batteries/${id}/reward`,{})).status,409);
      const restarted=new Coordinator(f.repo);const finished=await restarted.process(first.body.operationId);assert.equal(finished.status,200);assert.equal(finished.body.confirmedRewardState,'SENT');
      holdReward=false;const replay=await call(a,'POST',`/api/batteries/${id}/reward`,{},key);assert.equal(replay.status,200);assert.equal(replay.body.operationId,first.body.operationId);
      const actual=await f.repo.transaction(async db=>{
        const mock=await f.repo.mock(db);const row=(await db.query('select count(*)::int n from app_private.reward_attempts where deployment_id=$1 and battery_id=$2',[f.config.deploymentId,id])).rows[0];
        return {n:row.n,balance:mock.recipientBalance(a.key.publicKey())};
      });assert.equal(actual.n,1);assert.equal(actual.balance,100000000n);
    });
    await t.test('second reward rejected',async()=>assert.equal((await call(a,'POST',`/api/batteries/${id}/reward`,{})).status,409));
    await t.test('safe GET distinguishes confirmed, pending and last attempt',async()=>{
      const r=await call(a,'GET',`/api/batteries/${id}`);assert.equal(r.status,200);assert.equal(r.body.confirmedBatteryState,'RECYCLED');assert.equal(r.body.confirmedRewardState,'SENT');assert.equal(r.body.pendingOperation,null);assert.equal(r.body.lastAttempt.state,'SUCCEEDED');
    });
    await t.test('new private tables have forced restrictive RLS and no browser grants',async()=>{
      await f.repo.transaction(async db=>{
        const tables=(await db.query(`select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='api_private' and c.relkind='r'`)).rows;
        assert.equal(tables.length,5);
        for(const row of tables){assert.ok(row.relrowsecurity&&row.relforcerowsecurity);for(const role of ['anon','authenticated']){
          const privileges=(await db.query("select has_table_privilege($1,$2::oid,'SELECT,INSERT,UPDATE,DELETE') allowed",[role,row.oid])).rows[0];assert.equal(privileges.allowed,false);
        }}
      });
    });
    await t.test('revoked Auth session is rejected even if its JWT has not expired',async()=>{
      const old={...b};await authRequest(f.config,'/logout?scope=global','POST',{},b.token);b.token='';
      assert.equal((await call(old,'GET','/api/batteries/'+id)).status,401);
    });
    await t.test('HTTP responses never expose keys, JWTs, SQL or private manifests',async()=>{
      const all=JSON.stringify(responses);for(const secret of secrets)assert.ok(!all.includes(secret),'Response exposed a secret');
      assert.ok(!all.includes('manifest_bytes'));assert.ok(!all.includes('stack'));assert.ok(!all.includes('parameters_hash'));
    });
  } finally {await f.cleanup();}
});
