import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID,randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import {localDb} from './testnet-fixtures.ts';
import {contract} from './fixtures.ts';
import {Repository} from '../src/application/repository.ts';
import {Coordinator} from '../src/application/coordinator.ts';
import {WalletService} from '../src/application/wallet.ts';
import {SupabaseAuth,type Identity} from '../src/application/auth.ts';
import {AppError} from '../src/application/errors.ts';
import {api,listen,close} from '../src/application/http.ts';
import {ACTORS,CONTRACT,TOKEN,WASM} from '../src/testnet/abi.ts';
import {NETWORK_ID} from '../src/testnet/identity.ts';
import {HISTORY_DEPLOYMENT_ID} from '../src/history/model.ts';

test('D2-004 GAP1 exact USER authority at real local HTTP and direct service boundaries',async t=>{
 const db=await localDb(),d=HISTORY_DEPLOYMENT_ID,otherDeployment=randomUUID();
 const users={owner:randomUUID(),other:randomUUID(),admin:randomUUID(),collector:randomUUID(),recycler:randomUUID()};
 const wallet=randomUUID(),otherWallet=randomUUID();
 let processed=0,verified=0,chainReads=0;
 await db.exec('create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
 for(const id of [d,otherDeployment])await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
  values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[id,NETWORK_ID,id===d?CONTRACT:contract(25),WASM,ACTORS.admin,ACTORS.service,TOKEN]);
 for(const [alias,id] of Object.entries(users)){
  await db.query('insert into auth.users values($1)',[id]);
  await db.query('insert into auth.sessions values($1,$1,null)',[id]);
  await db.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[id]);
  await db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'USER')",[d,id]);
  if(['admin','collector','recycler'].includes(alias))await db.query('insert into api_private.memberships(deployment_id,user_id,role,actor_address) values($1,$2,$3,$4)',
   [d,id,alias.toUpperCase(),alias==='collector'?ACTORS.collector:alias==='recycler'?ACTORS.recycler:null]);
 }
 await db.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
  values($1,$2,decode($3,'hex'),$4,$5,'ISOLATED-GAP1',now()),($6,$2,decode($3,'hex'),$7,$8,'ISOLATED-GAP1',now())`,
  [wallet,d,NETWORK_ID,users.owner,ACTORS.admin,otherWallet,users.other,ACTORS.service]);
 const pool=Object.assign(new EventEmitter(),{connect:async()=>Object.assign(new EventEmitter(),{query:async(sql:string,p?:unknown[])=>{
  const encoded=sql.replace(/\$(\d+)\b/g,(v,n)=>p?.[Number(n)-1] instanceof Uint8Array?`decode(${v},'hex')`:v);
  const r=await db.query<Record<string,unknown>>(encoded,p?.map(v=>v instanceof Uint8Array?Buffer.from(v).toString('hex'):v));
  return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])))};
 },release:()=>{}})}) as unknown as Pool;
 const repo=Object.assign(Object.create(Repository.prototype) as Repository,{pool,deploymentId:d,mode:'TESTNET' as const});
 const wallets=new WalletService(repo,{verify:async c=>{verified++;return {verified:true,challengeId:c.id,address:c.address,networkId:c.networkId};}});
 const coordinator=new Coordinator(repo,{},wallets,{process:async id=>{processed++;return {status:202,body:{source:'TESTNET',operationId:id,testOnly:true}};}});
 class Auth extends SupabaseAuth{override async validate(header:string|undefined):Promise<Identity>{
  const user=users[header?.replace('Bearer ','') as keyof typeof users];if(!user)throw new AppError(401,'AuthenticationRequired');return {authUserId:user,sessionId:user};
 }}
 const server=api(new Auth({} as never),coordinator,{network:async()=>{chainReads++;throw Error('No network');},transaction:async()=>{chainReads++;throw Error('No network');}});
 const url=await listen(server);
 const call=async(alias:keyof typeof users,path:string,body?:unknown,key=randomUUID())=>{
  const r=await fetch(url+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+alias,...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key}},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json() as Record<string,any>};
 };
 const enabled=async(user:string,value:boolean)=>db.query("update api_private.memberships set enabled=$3 where deployment_id=$1 and user_id=$2 and role='USER'",[d,user,value]);
 const counts=async()=> (await db.query(`select (select count(*)::int from app_private.stellar_operations) operations,
  (select count(*)::int from app_private.return_requests) requests,(select count(*)::int from app_private.reward_attempts) rewards,
  (select count(*)::int from api_private.wallet_challenges) challenges,(select count(*)::int from app_private.wallet_links) wallets,
  (select count(*)::int from api_private.idempotency where operation_id is not null or response_status between 200 and 299) accepted`)).rows[0];
 const seed=async(suffix:string,state='REGISTERED')=>{
  const batteryId='BYE-D2-G1-'+suffix,requestId=randomBytes(32).toString('hex'),linked=state!=='REGISTERED',collected=state==='COLLECTED'||state==='RECYCLED';
  await db.exec('begin');
  await db.query('insert into app_private.battery_records(deployment_id,battery_id,created_by) values($1,$2,$3)',[d,batteryId,users.owner]);
  if(linked)await db.query(`insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot)
   values($1,decode($2,'hex'),$3,$4,$5,$6)`,[d,requestId,batteryId,users.owner,wallet,ACTORS.admin]);
  await db.query(`insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,request_id,collector,collection_hash,recycler,recycling_hash,reward_state,confirmed_ledger)
   values($1,$2,$3,decode($4,'hex'),decode($5,'hex'),$6,decode($7,'hex'),$8,decode($9,'hex'),$10,1)`,
   [d,batteryId,state,'01'.repeat(32),linked?requestId:null,collected?ACTORS.collector:null,collected?'02'.repeat(32):null,state==='RECYCLED'?ACTORS.recycler:null,state==='RECYCLED'?'03'.repeat(32):null,state==='RECYCLED'?'PENDING':'NOT_ELIGIBLE']);
  if(linked)await db.query(`insert into chain_private.return_requests values($1,decode($2,'hex'),$3,$4,$5,1)`,[d,requestId,batteryId,ACTORS.admin,collected?'CONFIRMED':'OPEN']);
  if(collected)await db.query("update app_private.return_requests set reservation_state='CONSUMED',association_confirmed_at=now() where deployment_id=$1 and request_id=decode($2,'hex')",[d,requestId]);
  await db.exec('commit');return {batteryId,requestId};
 };
 try{
  const registration=await seed('RETURN'),cancel=await seed('CANCEL','RETURNED'),reward=await seed('REWARD','RECYCLED');
  const collection=await seed('COLLECT','RETURNED'),recycling=await seed('RECYCLE','COLLECTED');
  const challenge=(await repo.transaction(sql=>wallets.challenge(sql,users.owner,{address:ACTORS.admin}))).body;
  const proof={challengeId:challenge.challengeId,signature:Buffer.alloc(64,1).toString('base64')};
  await enabled(users.owner,false);
  await t.test('disabled USER blocks return/cancel/owner reward/wallet writes with zero accepted side effects',async()=>{
   const before=await counts(),requestBefore=(await db.query('select * from app_private.return_requests order by battery_id')).rows;
   for(const [path,body] of [
    [`batteries/${registration.batteryId}/returns`,{walletLinkId:wallet}],
    [`returns/${cancel.requestId}/cancel`,{}],
    [`batteries/${reward.batteryId}/reward`,{}],
    ['wallet/challenge',{address:ACTORS.admin}],['wallet/verify',proof],
   ] as const)assert.equal((await call('owner',path,body)).status,403,path);
   assert.deepEqual(await counts(),before);assert.equal(processed,0);assert.equal(verified,0);
   assert.deepEqual((await db.query('select * from app_private.return_requests order by battery_id')).rows,requestBefore);
   const row=(await db.query<{attempts:number;consumed_at:unknown}>('select attempts,consumed_at from api_private.wallet_challenges where id=$1',[challenge.challengeId])).rows[0];
   assert.equal(row.attempts,0);assert.equal(row.consumed_at,null);
   assert.equal((await db.query<{enabled:boolean}>("select enabled from api_private.memberships where deployment_id=$1 and user_id=$2 and role='USER'",[d,users.owner])).rows[0].enabled,false);
  });
  await t.test('direct wallet helpers reject disabled USER before nonce/verifier changes',async()=>{
   const before=await counts();
   await assert.rejects(repo.transaction(sql=>wallets.challenge(sql,users.owner,{address:ACTORS.admin})),{status:403});
   await assert.rejects(repo.transaction(sql=>wallets.verify(sql,users.owner,proof)),{status:403});
   assert.deepEqual(await counts(),before);assert.equal(verified,0);
  });
  await t.test('protected detail/get/history require USER even with another enabled role; me is sanitized',async()=>{
   await db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'ADMIN')",[d,users.owner]);
   for(const path of [`batteries/${registration.batteryId}`,`batteries/${registration.batteryId}/history`])assert.equal((await call('owner',path)).status,403);
   await assert.rejects(coordinator.get({authUserId:users.owner,sessionId:users.owner},registration.batteryId),{status:403});
   const me=await call('owner','me');assert.equal(me.status,200);assert.equal(me.body.membershipStatus,'DISABLED');
   assert.deepEqual(me.body.requests,[]);assert.deepEqual(me.body.wallets,[]);assert.equal(me.body.hasMoreRequests,false);
   assert.ok(!JSON.stringify(me.body).includes(registration.batteryId));assert.equal(chainReads,0);
   // Being both owner and ADMIN must still use the owner USER gate.
   assert.equal((await call('owner',`batteries/${reward.batteryId}/reward`,{})).status,403);
   await db.query("update api_private.memberships set enabled=false where deployment_id=$1 and user_id=$2 and role='ADMIN'",[d,users.owner]);
  });
  await t.test('enabled USER preserves wallet, reads, ownership, eligibility, queue and idempotency',async()=>{
   await enabled(users.owner,true);
   assert.equal((await call('owner','wallet/challenge',{address:ACTORS.admin})).status,201);
   assert.equal((await call('owner','wallet/verify',proof)).status,200);
   assert.equal((await call('owner',`batteries/${registration.batteryId}`)).status,200);
   assert.equal((await call('owner',`batteries/${registration.batteryId}/history`)).status,200);
   assert.equal((await call('other',`returns/${cancel.requestId}/cancel`,{})).status,403);
   assert.equal((await call('owner',`batteries/${registration.batteryId}/returns`,{walletLinkId:otherWallet})).status,409);
   assert.equal((await call('owner',`batteries/${cancel.batteryId}/reward`,{})).status,409);
   assert.equal((await call('owner',`returns/${cancel.requestId}/cancel`,{})).status,202);
   assert.equal((await call('owner',`batteries/${reward.batteryId}/reward`,{})).status,202);
   const key=randomUUID(),body={walletLinkId:wallet},path=`batteries/${registration.batteryId}/returns`;
   const first=await call('owner',path,body,key);assert.equal(first.status,202);
   const before=await counts(),calls=processed;
   await enabled(users.owner,false);
   assert.equal((await call('owner',path,body,key)).status,403);assert.equal(processed,calls);assert.deepEqual(await counts(),before);
   await db.query('update api_private.idempotency set response_status=202,response_body=$4 where deployment_id=$1 and user_id=$2 and key=$3',[d,users.owner,key,JSON.stringify(first.body)]);
   assert.equal((await call('owner',path,body,key)).status,403);assert.equal(processed,calls);
   await enabled(users.owner,true);
   assert.deepEqual(await call('owner',path,body,key),first);
   assert.equal((await call('owner',path,{walletLinkId:otherWallet},key)).status,409);assert.equal(processed,calls);
  });
  await t.test('privileged routes and ADMIN reward override retain their own roles without USER',async()=>{
   const ev=(f:{batteryId:string;requestId:string},kind:string)=>({evidence:{...f,kind,manifestBase64:Buffer.from(JSON.stringify({...f,kind})).toString('base64')}});
   for(const a of ['admin','collector','recycler'] as const)await enabled(users[a],false);
   for(const [a,path,body] of [
    ['admin','batteries',{batteryId:'BYE-D2-G1-ADMIN'}],
    ['collector',`returns/${collection.requestId}/collection`,ev(collection,'COLLECTION')],
    ['recycler',`returns/${recycling.requestId}/recycling`,ev(recycling,'RECYCLING')],
   ] as const){
    assert.equal((await call(a,path,body)).status,202);
    await db.query('update api_private.memberships set enabled=false where deployment_id=$1 and user_id=$2 and role=$3',[d,users[a],a.toUpperCase()]);
    assert.equal((await call(a,path,body)).status,403);
   }
   await db.query("update api_private.memberships set enabled=true where deployment_id=$1 and user_id=$2 and role='ADMIN'",[d,users.admin]);
   const f=await seed('OVERRIDE','RECYCLED');assert.equal((await call('admin',`batteries/${f.batteryId}/reward`,{})).status,202);
  });
  await t.test('wrong deployment/unknown role fail closed; provisioning/session/ACTIVE checks remain',async()=>{
   const otherRepo=Object.assign(Object.create(Repository.prototype) as Repository,{pool,deploymentId:otherDeployment,mode:'TESTNET' as const});
   await assert.rejects(otherRepo.transaction(sql=>otherRepo.role(sql,users.owner,'USER')),{status:403});
   await assert.rejects(repo.transaction(sql=>repo.role(sql,users.owner,'UNKNOWN')),{status:403});
   const firstTime=randomUUID();await db.query('insert into auth.users values($1)',[firstTime]);await db.query('insert into auth.sessions values($1,$1,null)',[firstTime]);
   const id=await repo.transaction(sql=>repo.principal(sql,{authUserId:firstTime,sessionId:firstTime}));
   await repo.transaction(sql=>repo.role(sql,id,'USER'));
   await db.query("update app_private.users set status='DISABLED' where id=$1",[users.owner]);
   assert.equal((await call('owner','me')).status,403);
   await db.query('delete from auth.sessions where id=$1',[users.other]);assert.equal((await call('other','me')).status,401);
  });
 }finally{await close(server);await db.close();}
});
