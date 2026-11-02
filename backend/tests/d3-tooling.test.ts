import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical} from '../src/application/validation.ts';
import {CASES,plan,executionPreflight,noSecrets} from '../src/d3/model.ts';
import {simulate,execute,NEGATIVES} from '../src/d3/runner.ts';
import {exportManifest,writeManifest,type RawRunEvidence} from '../src/d3/manifest.ts';
import {d3Input,executionContext,walletA,walletB} from './d3-fixtures.ts';
const simulation=simulate(d3Input());
async function raw(){const m=(await simulation).manifests[0];return JSON.parse(JSON.stringify({source:m.source,operations:m.operations,records:m.records.map(({recomputedCommitment,match,...record})=>record),reward:m.reward,recovery:m.recovery})) as RawRunEvidence;}
test('D3 plan represents three unique runs, two wallets, six negatives and exactly 15 future writes',()=>{
 const p=plan(d3Input());assert.equal(p.input.runs.length,3);assert.equal(p.txBudget.totalSuccessful,15);assert.equal(p.txBudget.negativeBroadcasts,0);assert.equal(p.executionEnabled,false);assert.deepEqual(p.blockers,[]);
});
test('D3 unresolved wallet is explicit in plan and cannot be simulated',async()=>{
 const x=d3Input();x.runs[1].recipient=null;assert.deepEqual(plan(x).blockers,['RUN2:RECIPIENT_OWNER_DECISION_REQUIRED']);await assert.rejects(simulate(x),/RecipientDecisionRequired/);
});
for(const [key,value,code] of [['network','MAINNET','TestnetOnly'],['contractId','unexpected','ContractMismatch'],['wasmSha256','00','WasmMismatch'],['issuer',walletA,'AssetMismatch'],['assetCode','OTHER','AssetMismatch'],['sac','other','AssetMismatch'],['rewardBaseUnits','99999999','RewardAmountMismatch'],['gitSha','no','InvalidGitSha']] as const){
 test('D3 plan rejects '+key,()=>assert.throws(()=>plan({...d3Input(),[key]:value}),new RegExp(code)));
}
test('D3 rejects duplicate batteries, single recipient, invalid public keys and unexpected fields',()=>{
 const x=d3Input();x.runs[1].batteryId=x.runs[0].batteryId;assert.throws(()=>plan(x),/DuplicateRunOrBattery/);
 const y=d3Input();y.runs.forEach(r=>r.recipient=walletA);assert.throws(()=>plan(y),/TwoRecipientsRequired/);
 const z=d3Input();z.runs[1].recipient='not-an-address';assert.throws(()=>plan(z),/InvalidRecipient/);
 assert.throws(()=>plan({...d3Input(),password:'not-a-real-credential'}),/UnexpectedField/);
});
test('D3 cannot execute without owner context; even complete review data cannot activate a signer',()=>{
 assert.throws(()=>execute(d3Input()),/FutureOwnerAuthorizationRequired/);assert.throws(()=>execute(d3Input(),executionContext()),/LiveExecutionBindingNotEnabled/);
});
for(const [key,value,code] of [['network','MAINNET','TestnetOnly'],['contractId','other','ContractMismatch'],['wasmSha256','other','WasmMismatch'],['rewardBaseUnits','200000000','RewardAmountMismatch'],['reviewedGitSha','0'.repeat(40),'ReviewedShaMismatch'],['signerAvailable',false,'SignerUnavailable'],['uniqueBatteryIdsVerified',false,'BatteryUniquenessNotVerified'],['recipientTrustlinesReady',false,'TrustlineNotReady'],['expectedInitialStates',false,'UnexpectedLifecycle'],['rewardAlreadySent',true,'RewardAlreadySent'],['unresolvedOperation',true,'UncertaintyNotReconciled'],['sourceSequenceStable',false,'SourceSequenceChanged']] as const){
 test('D3 execution preflight fails closed for '+key,()=>assert.throws(()=>executionPreflight(plan(d3Input()),{...executionContext(),[key]:value}),new RegExp(code)));
}
test('D3 offline simulation reuses mock and completes fifteen operations and six rejection/recovery controls',async()=>{
 const s=await simulation;assert.equal(s.source,'OFFLINE_MOCK');assert.equal(s.notTestnetCompletion,true);assert.equal(s.manifests.length,3);assert.equal(s.manifests.flatMap(m=>m.operations).length,15);
 assert.ok(s.manifests.every(m=>m.complete&&m.reward?.amountBaseUnits==='100000000'&&m.operations.every(o=>o.transactionHash===null&&o.ledger===null)));
 assert.deepEqual(new Set(s.negativeResults.map(n=>n.case)),new Set(CASES));assert.ok(s.negativeResults.every(n=>n.result==='PASS'&&n.broadcasts===0));assert.equal(s.networkCalls,0);assert.equal(s.operationalSignatures,0);
 assert.equal(s.manifests[2].recovery.uncertainResponse,true);assert.equal(s.manifests[2].recovery.originalHash,null);assert.equal(s.manifests[2].recovery.broadcastCount,0);
});
test('D3 manifest determinism is independent of raw object-property ordering and input run order',async()=>{
 const a=await raw(),b=Object.fromEntries(Object.entries(a).reverse());
 assert.equal(canonical(exportManifest(d3Input(),'RUN1',a)),canonical(exportManifest(d3Input(),'RUN1',b)));
 const x=d3Input();x.runs.reverse();assert.equal(plan(x).planHash,plan(d3Input()).planHash);
 assert.deepEqual(await simulate(x),await simulation);
});
test('D3 writer atomically refuses all overwrites, including identical completed manifests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byetery-d3-'));
 try{const m=(await simulation).manifests[0];const file=await writeManifest(dir,m);const before=await readFile(file,'utf8');await assert.rejects(writeManifest(dir,m),/EEXIST/);assert.equal(await readFile(file,'utf8'),before);
 const altered=structuredClone(m);altered.batteryId='OTHER';await assert.rejects(writeManifest(dir,altered),/ManifestChangedAfterValidation/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('D3 reward rejects wrong amount, duplicate success, recipient, state, transfer and other activity',async()=>{
 for(const [key,value] of [['amountBaseUnits','200000000'],['successfulPayments',2],['recipient',walletB],['stateBefore','NOT_ELIGIBLE'],['stateAfter','PENDING'],['transferMatched',false],['receiptMatched',false],['otherActivity',true]] as const){const r=await raw();(r.reward as unknown as Record<string,unknown>)[key]=value;assert.throws(()=>exportManifest(d3Input(),'RUN1',r));}
});
test('D3 exact recipient and payer balance deltas are both required',async()=>{
 for(const key of ['recipientAfter','payerAfter'] as const){const r=await raw();r.reward![key]=String(BigInt(r.reward![key])+1n);assert.throws(()=>exportManifest(d3Input(),'RUN1',r),/BalanceCorrelationMismatch/);}
});
test('D3 SENT cannot be exported without separate successful SERVICE payment and Pending after recycling',async()=>{
 const r=await raw();r.reward=null;assert.throws(()=>exportManifest(d3Input(),'RUN1',r),/SentWithoutSuccessfulPayment/);
 const q=await raw();q.operations[4].result='UNKNOWN';assert.throws(()=>exportManifest(d3Input(),'RUN1',q),/SentWithoutSuccessfulPayment/);
 const t=await raw();t.operations[3].after.reward='SENT';assert.throws(()=>exportManifest(d3Input(),'RUN1',t));
});
test('D3 recomputes exact bytes and existing context-bound XDR commitments',async()=>{
 const r=await raw();const m=exportManifest(d3Input(),'RUN1',r);assert.ok(m.records.every(v=>v.match&&v.commitment===v.recomputedCommitment));
 r.records[1].commitment='aa'.repeat(32);assert.throws(()=>exportManifest(d3Input(),'RUN1',r),/CommitmentMismatch/);
 const t=await raw();const b=Buffer.from(t.records[1].manifestBase64,'base64');b[0]^=1;t.records[1].manifestBase64=b.toString('base64');assert.throws(()=>exportManifest(d3Input(),'RUN1',t),/PayloadHashMismatch/);
});
test('D3 unavailable references stay null and mock data cannot be relabelled confirmed Testnet',async()=>{
 const r=await raw();r.source='TESTNET';assert.throws(()=>exportManifest(d3Input(),'RUN1',r),/ConfirmedReferenceRequired/);
 const x=await raw();x.operations[0].transactionHash='aa'.repeat(32);assert.throws(()=>exportManifest(d3Input(),'RUN1',x),/MockCannotClaimTestnetReceipt/);
});
test('D3 preserves submitted hash bytes exactly and requires all authorizers',async()=>{
 const r=await raw();r.source='TESTNET';r.operations.forEach((o,i)=>{o.transactionHash=String(i+1).repeat(64);o.ledger=i+10;o.timestamp='2026-11-02T00:00:00Z'});r.reward!.beforeLedger=13;r.reward!.afterLedger=15;
 const m=exportManifest(d3Input(),'RUN1',r);assert.equal(m.operations[2].transactionHash,'3'.repeat(64));
 r.operations[2].authorizers.pop();assert.throws(()=>exportManifest(d3Input(),'RUN1',r),/AuthorizerMismatch/);
});
test('D3 six definitions retain policy and require successful lifecycle only where necessary',()=>{
 assert.equal(NEGATIVES.length,6);assert.equal(new Set(NEGATIVES.map(n=>n.id)).size,6);assert.ok(NEGATIVES.every(n=>n.precondition&&n.attempt&&n.expected&&n.evidenceFields.length));assert.equal(NEGATIVES.find(n=>n.id==='uncertain_response')!.simulationSupported,false);
});
test('D3 unknown evidence fields and decoded sensitive disclosure are rejected without echo',async()=>{
 assert.throws(()=>noSecrets('password=not-a-real-credential'),/SensitiveMaterialRejected/);
 const r=await raw();assert.throws(()=>exportManifest(d3Input(),'RUN1',{...r,access_token:'dummy'}),/UnexpectedField/);
 const s=canonical((await simulation));assert.ok(!s.includes('mock-proof:'));assert.ok(!s.includes('signed_xdr'));assert.ok(!s.includes('password'));noSecrets(s);
});
test('D3 CLI execute refuses before file access and never echoes arguments',()=>{
 const marker='DO-NOT-ECHO-UNTRUSTED-INPUT';const p=spawnSync(process.execPath,['--experimental-strip-types','src/d3/cli.ts','execute',marker,'--output-dir',marker],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
 assert.equal(p.status,1);assert.match(p.stderr,/FutureOwnerAuthorizationRequired/);assert.ok(!(p.stdout+p.stderr).includes(marker));
});
test('D3 complete Testnet recovery requires the original non-null hash and rejects unresolved success',async()=>{
 const r=await raw();r.source='TESTNET';r.operations.forEach((o,i)=>{o.transactionHash=String(i+1).repeat(64);o.ledger=i+10;});r.reward!.beforeLedger=13;r.reward!.afterLedger=15;
 r.recovery={uncertainResponse:true,originalHash:null,reconciledHash:null,result:'SUCCESS',identityCount:1,broadcastCount:1};assert.throws(()=>exportManifest(d3Input(),'RUN1',r),/RecoveryIdentityMissing/);
 r.recovery.originalHash='5'.repeat(64);r.recovery.reconciledHash='6'.repeat(64);assert.throws(()=>exportManifest(d3Input(),'RUN1',r),/RecoveryIdentityMismatch/);
 r.recovery.reconciledHash=r.recovery.originalHash;assert.equal(exportManifest(d3Input(),'RUN1',r).recovery.result,'SUCCESS');
 r.recovery.result='UNRESOLVED';assert.throws(()=>exportManifest(d3Input(),'RUN1',r),/UncertaintyNotReconciled/);
});
test('D3 balance observations must surround the actual payment ledger',async()=>{
 const r=await raw();r.source='TESTNET';r.operations.forEach((o,i)=>{o.transactionHash=String(i+1).repeat(64);o.ledger=i+10;});r.reward!.beforeLedger=20;r.reward!.afterLedger=21;assert.throws(()=>exportManifest(d3Input(),'RUN1',r),/PaymentOutsideBalanceObservations/);
});
