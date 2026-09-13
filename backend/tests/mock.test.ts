import test from 'node:test';
import assert from 'node:assert/strict';
import vector from './contract-evidence-vector.json' with { type: 'json' };
import { newRequestId, type Command } from '../src/domain.ts';
import { MockStellarService } from '../src/mock-stellar-service.ts';
import { evidenceCommitment } from '../src/evidence.ts';
import { address,bid,collect,collector,config,evidence,h,opened,recipient,recycle,recycler,rid,run } from './fixtures.ts';

test('full REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT, exact fixed payment',async()=>{
 const s=await opened(); assert.equal((await s.getBattery(config.deploymentId,bid))?.state,'RETURNED');
 assert.equal((await run(s,collect())).status,'SUCCESS'); assert.equal((await run(s,recycle())).status,'SUCCESS');
 s.fund(config.rewardAmount); assert.equal(await s.getRewardBalance(config.deploymentId),config.rewardAmount);
 assert.equal((await run(s,{kind:'pay_reward',batteryId:bid})).status,'SUCCESS');
 assert.equal((await s.getBattery(config.deploymentId,bid))?.rewardState,'SENT');
 assert.equal(s.recipientBalance(recipient),config.rewardAmount); assert.equal(await s.getRewardBalance(config.deploymentId),0n);
});
test('submission is pending and duplicate submission settles only once',async()=>{
 const s=new MockStellarService(config), p=await s.prepare(config.deploymentId,{kind:'register_battery',batteryId:bid,registrationHash:h(1)});
 const auth=[s.authorize(p,config.admin)], a=await s.submit(p,auth), b=await s.submit(p,auth);
 assert.deepEqual(a,b); assert.equal(await s.getBattery(config.deploymentId,bid),null);
 assert.equal((await s.getTransactionResult(a)).status,'PENDING'); assert.equal(s.settle(a).status,'SUCCESS'); assert.deepEqual(s.settle(a),s.settle(b));
});
test('cancel resets physical state, retains request and prevents request reuse',async()=>{
 const s=await opened(); assert.equal((await run(s,{kind:'cancel_return',batteryId:bid,requestId:rid})).status,'SUCCESS');
 assert.equal((await s.getBattery(config.deploymentId,bid))?.state,'REGISTERED');
 assert.equal((await s.getReturnRequest(config.deploymentId,rid))?.state,'CANCELLED');
 assert.deepEqual(await run(s,{kind:'open_return',batteryId:bid,requestId:rid,recipient}),{status:'FAILED',error:'RequestIdAlreadyUsed'});
 assert.equal((await run(s,{kind:'open_return',batteryId:bid,requestId:h(11),recipient})).status,'SUCCESS');
});
for (const signers of [[collector],[config.service],[]]) test(`collection rejects missing authorization: ${signers.length ? signers[0] : 'both'}`,async()=>{
 const s=await opened(); await assert.rejects(run(s,collect(),signers),/Unauthorized/);
 assert.equal((await s.getBattery(config.deploymentId,bid))?.state,'RETURNED');
});
test('collector with both proofs but no role is rejected',async()=>{
 const s=await opened(); await run(s,{kind:'set_role',actor:collector,role:'COLLECTOR',enabled:false});
 assert.deepEqual(await run(s,collect()),{status:'FAILED',error:'RoleNotGranted'});
});
test('administrator has no implicit recycler role',async()=>{
 const s=await opened(); await run(s,collect()); const c=recycle(); assert.equal(c.kind,'confirm_recycling');
 assert.deepEqual(await run(s,{...c,recycler:config.admin}),{status:'FAILED',error:'RoleNotGranted'});
});
for(const [change,error] of [
 [{batteryId:'BYE-OTHER'},'EvidenceBatteryMismatch'],[{requestId:h(99)},'EvidenceRequestMismatch'],
 [{version:2},'InvalidEvidence'],[{kind:'RECYCLING'},'InvalidEvidence'],[{payloadHash:h(0)},'InvalidEvidence'],
] as const) test(`bad evidence: ${error} ${JSON.stringify(change)}`,async()=>{
 const s=await opened(); const c=collect(); assert.equal(c.kind,'confirm_collection');
 assert.deepEqual(await run(s,{...c,evidence:{...evidence(),...change}}),{status:'FAILED',error});
 assert.equal((await s.getReturnRequest(config.deploymentId,rid))?.state,'OPEN');
});
test('duplicate battery rejected',async()=>{
 const s=await opened(); assert.deepEqual(await run(s,{kind:'register_battery',batteryId:bid,registrationHash:h(1)}),{status:'FAILED',error:'BatteryAlreadyExists'});
});
test('collection freezes claim; cancellation and backward transition rejected',async()=>{
 const s=await opened(); await run(s,collect());
 assert.deepEqual(await run(s,{kind:'cancel_return',batteryId:bid,requestId:rid}),{status:'FAILED',error:'RequestNotOpen'});
 await run(s,recycle()); assert.deepEqual(await run(s,collect()),{status:'FAILED',error:'RequestNotOpen'});
});
test('insufficient funds and token rejection leave Pending and balances unchanged',async()=>{
 const s=await opened(); await run(s,collect()); await run(s,recycle());
 assert.deepEqual(await run(s,{kind:'pay_reward',batteryId:bid}),{status:'FAILED',error:'InsufficientRewardBalance'});
 s.fund(config.rewardAmount); s.failTransfers(true);
 assert.deepEqual(await run(s,{kind:'pay_reward',batteryId:bid}),{status:'FAILED',error:'TokenTransferFailed'});
 assert.equal((await s.getBattery(config.deploymentId,bid))?.rewardState,'PENDING');
 assert.equal(await s.getRewardBalance(config.deploymentId),config.rewardAmount); assert.equal(s.recipientBalance(recipient),0n);
 s.failTransfers(false); assert.equal((await run(s,{kind:'pay_reward',batteryId:bid})).status,'SUCCESS');
});
test('second reward rejected even when prefunded again',async()=>{
 const s=await opened(); await run(s,collect()); await run(s,recycle()); s.fund(config.rewardAmount*2n);
 await run(s,{kind:'pay_reward',batteryId:bid});
 assert.deepEqual(await run(s,{kind:'pay_reward',batteryId:bid}),{status:'FAILED',error:'RewardAlreadySent'});
 assert.equal(s.recipientBalance(recipient),config.rewardAmount);
});
test('archived records are unavailable, not nonexistent; restore prevents reuse and repayment',async()=>{
 const s=await opened(); await run(s,collect()); await run(s,recycle()); s.fund(config.rewardAmount*2n); await run(s,{kind:'pay_reward',batteryId:bid});
 s.archiveBattery(bid); s.archiveRequest(rid);
 await assert.rejects(s.getBattery(config.deploymentId,bid),/RestorationRequired/); await assert.rejects(s.getReturnRequest(config.deploymentId,rid),/RestorationRequired/);
 assert.deepEqual(await run(s,{kind:'register_battery',batteryId:bid,registrationHash:h(1)}),{status:'FAILED',error:'RestorationRequired'});
 s.restoreAll(); assert.deepEqual(await run(s,{kind:'pay_reward',batteryId:bid}),{status:'FAILED',error:'RewardAlreadySent'});
 assert.deepEqual(await run(s,{kind:'open_return',batteryId:bid,requestId:rid,recipient}),{status:'FAILED',error:'RequestIdAlreadyUsed'});
});
test('proof cannot authorize another preparation or tampered evidence',async()=>{
 const s=await opened(), p=await s.prepare(config.deploymentId,collect()), auth=p.requiredSigners.map(a=>s.authorize(p,a));
 const other=await s.prepare(config.deploymentId,collect()); await assert.rejects(s.submit(other,auth),/Unauthorized/);
 const tampered=structuredClone(p); (tampered.command as Extract<Command,{kind:'confirm_collection'}>).evidence.payloadHash=h(77);
 await assert.rejects(s.submit(tampered,auth),/PreparationMismatch/);
});
test('expired authorization rejected; wrong deployment rejected; mock refuses real mode',async()=>{
 let now=0; const s=new MockStellarService(config,()=>now), p=await s.prepare(config.deploymentId,{kind:'set_role',actor:collector,role:'COLLECTOR',enabled:true});
 const auth=[s.authorize(p,config.admin)]; now=400_000; await assert.rejects(s.submit(p,auth),/AuthorizationExpired/);
 await assert.rejects(s.getConfig('other'),/DeploymentMismatch/); assert.throws(()=>new MockStellarService({...config,mode:'TESTNET'}),/MockOnly/);
});
test('returned snapshots cannot mutate service state or fixed recipient',async()=>{
 const s=await opened(), r=await s.getReturnRequest(config.deploymentId,rid); r!.recipient=address(90);
 assert.equal((await s.getReturnRequest(config.deploymentId,rid))?.recipient,recipient);
});
test('server request ids are 32 random bytes',()=>{
 const ids=Array.from({length:1000},()=>newRequestId()); assert.equal(new Set(ids).size,1000); assert.ok(ids.every(x=>/^[a-f0-9]{64}$/.test(x)));
});
test('commitment binds network, contract, battery and request',()=>{
 const original=evidenceCommitment(config,evidence());
 assert.notEqual(original,evidenceCommitment({...config,networkId:h(50)},evidence()));
 assert.notEqual(original,evidenceCommitment({...config,contractAddress:config.rewardToken},evidence()));
 assert.notEqual(original,evidenceCommitment(config,{...evidence(),batteryId:'BYE-OTHER'}));
 assert.notEqual(original,evidenceCommitment(config,{...evidence(),requestId:h(50)}));
});
test('TypeScript evidence commitment exactly matches frozen Rust/WASM vector',()=>{
 assert.equal(evidenceCommitment({...config,networkId:vector.networkId,contractAddress:vector.contractAddress},
 {version:1,kind:'COLLECTION',batteryId:vector.batteryId,requestId:vector.requestId,payloadHash:vector.payloadHash}),vector.commitment);
});
