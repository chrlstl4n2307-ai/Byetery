import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {roleQrFixture} from './d2-role-qr-fixture.ts';
import {ACTORS} from '../src/testnet/abi.ts';
import {address,h} from './fixtures.ts';

test('D2-005 actual local HTTP: role and QR adversarial acceptance',async t=>{
 const f=await roleQrFixture();
 const {db,users,d,foreign,ownerWallet,otherWallet,trace,call,reject,ready,register,snapshot}=f;
 const evidence=(batteryId:string,requestId:string,kind:'COLLECTION'|'RECYCLING')=>({evidence:{batteryId,requestId,kind,
  manifestBase64:Buffer.from(JSON.stringify({batteryId,requestId,kind,fixture:'D2-005'})).toString('base64')}});
 try{
  const known=await ready('QR'),returned=await ready('RETURNED','RETURNED'),collected=await ready('COLLECTED','COLLECTED');
  await t.test('known production QR payload resolves exact record with correct MOCK source',async()=>{
   const payload='/battery/BYE-D2-005-QR';assert.equal(payload,'/battery/'+known.batteryId);
   const id=decodeURIComponent(payload.slice('/battery/'.length)),r=await call('USER','/api/batteries/'+id);
   assert.equal(r.status,200);assert.equal(r.body.batteryId,known.batteryId);assert.equal(r.body.source,'MOCK');
   trace.push({case:'Known QR lookup',payload,batteryId:r.body.batteryId,source:r.body.source,actual:r.status});
  });
  await t.test('USER can read only own wallets/requests and perform eligible return/cancel/reward',async()=>{
   const p=await call('USER','/api/me');assert.equal(p.status,200);
   assert.deepEqual(p.body.wallets.map((w:{id:string})=>w.id),[ownerWallet]);assert.ok(p.body.requests.some((r:{requestId:string})=>r.requestId===returned.requestId));
   const other=await call('OTHER','/api/me');assert.equal(other.body.requests.length,0);assert.deepEqual(other.body.wallets.map((w:{id:string})=>w.id),[otherWallet]);
   assert.equal((await call('OTHER',`/api/batteries/${returned.batteryId}`)).body.ownRequest,null);
   const cancel=await ready('CANCEL','RETURNED');assert.equal((await call('USER',`/api/returns/${cancel.requestId}/cancel`,{})).status,200);
   const reward=await ready('OWNER-REWARD','RECYCLED');const r=await call('USER',`/api/batteries/${reward.batteryId}/reward`,{});
   assert.equal(r.status,200);assert.equal(r.body.confirmedRewardState,'SENT');assert.equal(r.body.source,'MOCK');
  });
  for(const [name,alias,path,body,status] of [
   ['USER cannot register','USER','/api/batteries',{batteryId:'BYE-D2-005-ATTACK'},403],
   ['USER cannot collect','USER',`/api/returns/${returned.requestId}/collection`,evidence(returned.batteryId,returned.requestId,'COLLECTION'),403],
   ['USER cannot recycle','USER',`/api/returns/${collected.requestId}/recycling`,evidence(collected.batteryId,collected.requestId,'RECYCLING'),403],
   ['ADMIN does not inherit collector','ADMIN',`/api/returns/${returned.requestId}/collection`,evidence(returned.batteryId,returned.requestId,'COLLECTION'),403],
   ['ADMIN does not inherit recycler','ADMIN',`/api/returns/${collected.requestId}/recycling`,evidence(collected.batteryId,collected.requestId,'RECYCLING'),403],
   ['COLLECTOR cannot register','COLLECTOR','/api/batteries',{batteryId:'BYE-D2-005-ATTACK'},403],
   ['COLLECTOR cannot recycle','COLLECTOR',`/api/returns/${collected.requestId}/recycling`,evidence(collected.batteryId,collected.requestId,'RECYCLING'),403],
   ['RECYCLER cannot register','RECYCLER','/api/batteries',{batteryId:'BYE-D2-005-ATTACK'},403],
   ['RECYCLER cannot collect','RECYCLER',`/api/returns/${returned.requestId}/collection`,evidence(returned.batteryId,returned.requestId,'COLLECTION'),403],
   ['USER cannot cancel another claim','OTHER',`/api/returns/${returned.requestId}/cancel`,{},403],
   ['USER cannot use another wallet','USER',`/api/batteries/${known.batteryId}/returns`,{walletLinkId:otherWallet},409],
  ] as const)await t.test(name,()=>reject(name,alias,path,body,status));
  const adminReward=await ready('ADMIN-REWARD','RECYCLED');
  await t.test('non-owner USER reward rejected; ADMIN override remains valid',async()=>{
   await reject('Non-owner USER cannot reward','OTHER',`/api/batteries/${adminReward.batteryId}/reward`,{},403);
   assert.equal((await call('ADMIN',`/api/batteries/${adminReward.batteryId}/reward`,{})).status,200);
  });
  for(const alias of ['USER','ADMIN','COLLECTOR','RECYCLER'] as const)await t.test(alias+' has no public role-management route',async()=>{
   for(const path of ['/api/set_role','/api/roles','/api/batteries/'+known.batteryId+'/set_role'])
    await reject('No role route '+alias,alias,path,{role:'ADMIN',enabled:true},404);
  });
  await t.test('anonymous QR knowledge creates no session and authorizes nothing',async()=>{
   for(const [path,body] of [[`/api/batteries/${known.batteryId}`,undefined],['/api/batteries',{batteryId:known.batteryId}],
    [`/api/batteries/${known.batteryId}/returns`,{}],[`/api/returns/${known.batteryId}/collection`,{}],
    [`/api/returns/${known.batteryId}/recycling`,{}],[`/api/batteries/${known.batteryId}/reward`,{}]] as const)
    await reject('Anonymous + QR '+path,null,path,body,401);
   assert.equal((await db.query('select * from auth.sessions')).rows.length,Object.values(users).length);
  });
  for(const [alias,part,kind,target] of [['COLLECTOR','collection','COLLECTION',returned],['RECYCLER','recycling','RECYCLING',collected]] as const){
   await t.test(alias+' cannot select another actor or bind evidence to another battery',async()=>{
    await reject('Injected actor '+alias,alias,`/api/returns/${target.requestId}/${part}`,{...evidence(target.batteryId,target.requestId,kind),actor_address:address(99)},400);
    await reject('Foreign evidence '+alias,alias,`/api/returns/${target.requestId}/${part}`,evidence(known.batteryId,target.requestId,kind),422);
    await reject('Unknown request '+alias,alias,`/api/returns/${h(99)}/${part}`,evidence(target.batteryId,h(99),kind),404);
    await reject('Foreign deployment request '+alias,alias,`/api/returns/${foreign.requestId}/${part}`,evidence(foreign.batteryId,foreign.requestId,kind),404);
   });
  }
  await t.test('eligible privileged commands use exact server membership actor and do not require USER sibling',async()=>{
   for(const role of ['ADMIN','COLLECTOR','RECYCLER'] as const)await db.query("update api_private.memberships set enabled=false where deployment_id=$1 and user_id=$2 and role='USER'",[d,users[role]]);
   await register('BYE-D2-005-ROLE-ONLY');
   const c=await call('COLLECTOR',`/api/returns/${returned.requestId}/collection`,evidence(returned.batteryId,returned.requestId,'COLLECTION'));assert.equal(c.status,200);
   const r=await call('RECYCLER',`/api/returns/${collected.requestId}/recycling`,evidence(collected.batteryId,collected.requestId,'RECYCLING'));assert.equal(r.status,200);
   for(const [id,field,actor] of [[c.body.operationId,'collector',ACTORS.collector],[r.body.operationId,'recycler',ACTORS.recycler]] as const){
    const command=(await db.query<{parameters:Record<string,string>}>('select parameters from app_private.stellar_operations where id=$1',[id])).rows[0].parameters;assert.equal(command[field],actor);
   }
   for(const role of ['ADMIN','COLLECTOR','RECYCLER'] as const)await db.query("update api_private.memberships set enabled=true where deployment_id=$1 and user_id=$2 and role='USER'",[d,users[role]]);
  });
  await t.test('disabled USER and revoked privileged roles fail through actual HTTP',async()=>{
   const c=await ready('REVOKE-C','RETURNED'),r=await ready('REVOKE-R','COLLECTED');
   for(const [alias,role,path,body] of [['USER','USER',`/api/batteries/${known.batteryId}`,undefined],['ADMIN','ADMIN','/api/batteries',{batteryId:'BYE-D2-005-REVOKED'}],
    ['COLLECTOR','COLLECTOR',`/api/returns/${c.requestId}/collection`,evidence(c.batteryId,c.requestId,'COLLECTION')],
    ['RECYCLER','RECYCLER',`/api/returns/${r.requestId}/recycling`,evidence(r.batteryId,r.requestId,'RECYCLING')]] as const){
    await db.query('update api_private.memberships set enabled=false where deployment_id=$1 and user_id=$2 and role=$3',[d,users[alias],role]);
    await reject('Disabled '+role,alias,path,body,403);
    await db.query('update api_private.memberships set enabled=true where deployment_id=$1 and user_id=$2 and role=$3',[d,users[alias],role]);
   }
  });
  await t.test('malformed IDs reject; query parameters cannot substitute battery or role',async()=>{
   for(const value of ['bye-d2-005-qr','A'.repeat(33),'BYE_000001','..%2Fadmin','BYE%2F..%2Fadmin','BYE%3Frole%3DADMIN'])
    await reject('Malformed '+value,'USER','/api/batteries/'+value,undefined,400);
   await reject('Unknown identifier','USER','/api/batteries/BYE-D2-005-MISSING',undefined,404);
   const before=await snapshot(),r=await call('USER',`/api/batteries/${known.batteryId}?role=ADMIN&batteryId=OTHER`);
   assert.equal(r.status,200);assert.equal(r.body.batteryId,known.batteryId);assert.deepEqual(await snapshot(),before);
  });
  await t.test('client cannot select a principal or role in the return body',async()=>{
   await reject('Forged principal and role','USER',`/api/batteries/${known.batteryId}/returns`,{user_id:users.OTHER,role:'ADMIN',walletLinkId:ownerWallet},400);
  });
  await t.test('cancelled old claim cannot authorize collection or recycling of a later request',async()=>{
   const target=await ready('STALE','RETURNED');
   assert.equal((await call('USER',`/api/returns/${target.requestId}/cancel`,{})).status,200);
   const next=await call('USER',`/api/batteries/${target.batteryId}/returns`,{walletLinkId:ownerWallet});assert.equal(next.status,201);
   const requestId=String(next.body.requestId);assert.notEqual(requestId,target.requestId);
   await reject('Stale collection claim','COLLECTOR',`/api/returns/${target.requestId}/collection`,evidence(target.batteryId,target.requestId,'COLLECTION'),409);
   assert.equal((await call('COLLECTOR',`/api/returns/${requestId}/collection`,evidence(target.batteryId,requestId,'COLLECTION'))).status,200);
   await reject('Stale recycling claim','RECYCLER',`/api/returns/${target.requestId}/recycling`,evidence(target.batteryId,target.requestId,'RECYCLING'),409);
   assert.equal((await call('RECYCLER',`/api/returns/${requestId}/recycling`,evidence(target.batteryId,requestId,'RECYCLING'))).status,200);
  });
  await t.test('already-collected request cannot be collected again before durable work',async()=>{
   const target=await ready('ALREADY-COLLECTED','COLLECTED');
   await reject('Collector cannot repeat collected request','COLLECTOR',`/api/returns/${target.requestId}/collection`,evidence(target.batteryId,target.requestId,'COLLECTION'),409);
  });
  await t.test('ineligible recycling is rejected before durable work or mock preparation',async()=>{
   const target=await ready('NOT-COLLECTED','RETURNED');
   await reject('Recycler cannot skip collection','RECYCLER',`/api/returns/${target.requestId}/recycling`,evidence(target.batteryId,target.requestId,'RECYCLING'),409);
  });
  assert.equal(f.externalCalls(),0);
 }finally{
  await mkdir(new URL('../../.tools/d2-005/',import.meta.url),{recursive:true});
  await writeFile(new URL('../../.tools/d2-005/backend-results.json',import.meta.url),JSON.stringify({task:'D2-005',mode:'ISOLATED_MOCK_HTTP',fixture:'BYE-D2-005-QR',trace,liveRpcCalls:f.externalCalls(),operationalSignatures:0,broadcasts:0},null,2)+'\n');
  await f.close();
 }
});
