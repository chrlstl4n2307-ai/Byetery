/** VOL-004 bounded maintenance only. No application invocation or key export. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, open, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assess, rpcRead, NETWORK, RPC } from './vol-001-readiness.mts';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const {Address,Account,Operation,SorobanDataBuilder,TransactionBuilder,Transaction,Keypair,rpc,xdr}=require('@stellar/stellar-sdk');
export const ROOT=fileURLToPath(new URL('..',import.meta.url));
export const SOURCE='GCOEEZR6CA4TU2WK7ZNAS6AJGHQH7NGYWKO7HZ3HQIF7EJATGLBNKOUZ';
export const IDENTITY='byetery-tn20260926-recipient';
export const FEE_CAP=50_000_000n; // Existing application signer cap; never changed.
const CLI='C:\\Program Files (x86)\\Stellar CLI\\stellar.exe';
const PRIVATE=path.join(ROOT,'.tools','vol004-maintenance');
const STATE=path.join(PRIVATE,'state.json');
const EXTEND_TO=1_555_200; // 90 days at current 5-second target; capped by network config.
export async function account(address=SOURCE) {
  const key=xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:new Address(address).toScAddress().accountId}));
  const r=await rpcRead('getLedgerEntries',{keys:[key.toXDR('base64')]});
  if(r.entries.length!==1)throw Error('SourceAccountUnknown');
  const entry=xdr.LedgerEntryData.fromXDR(r.entries[0].xdr,'base64');
  if(entry.type!=='account')throw Error('UnexpectedAccountEntry');
  return {address,sequence:entry.account.seqNum.toString(),balanceStroops:entry.account.balance.toString(),
    observedLedger:r.latestLedger,numSubEntries:entry.account.numSubEntries};
}
function safe(v:any):any {
  if(typeof v==='bigint')return v.toString();
  if(v instanceof Uint8Array)return Buffer.from(v).toString('hex');
  if(Array.isArray(v))return v.map(safe);
  if(v && typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,a])=>[k,safe(a)]));
  return v;
}
async function networkCheck() {
  const network=await rpcRead('getNetwork');
  if(network.passphrase!==NETWORK)throw Error('WrongNetworkStop');
}
async function savePrivate(state:any) {
  await mkdir(PRIVATE,{recursive:true});
  const temporary=STATE+'.tmp';
  const handle=await open(temporary,'w',0o600);
  try { await handle.writeFile(JSON.stringify(state)+'\n');await handle.sync(); }finally{await handle.close();}
  await rename(temporary,STATE);
}
async function loadState():Promise<any> {
  try{return JSON.parse(await readFile(STATE,'utf8'));}
  catch(e:any){if(e.code==='ENOENT')return {version:1,steps:{}};throw e;}
}
export function sequenceMatches(current:string,transactionSequence:string) {
  return BigInt(current)+1n===BigInt(transactionSequence);
}
/** Fixed source/network/operation/footprint; cannot be used to sign business operations. */
export function guardMaintenance(transaction:any,kind:'restore'|'extend',expectedKeys:string[],maxFee:bigint) {
  const env=transaction.toEnvelope();
  if(env.type!=='envelopeTypeTx'||transaction.source!==SOURCE||BigInt(transaction.fee)>maxFee
    ||BigInt(transaction.fee)<=0n||!transaction.timeBounds||BigInt(transaction.timeBounds.maxTime)===0n)throw Error('InvalidMaintenanceEnvelope');
  const ops=env.v1.tx.operations;
  if(ops.length!==1||ops[0].sourceAccount!=null||ops[0].body.type!==(kind==='restore'?'restoreFootprint':'extendFootprintTtl'))throw Error('MaintenanceOperationOnly');
  if(kind==='extend'&&ops[0].body.extendFootprintTtlOp.extendTo!==EXTEND_TO)throw Error('UnexpectedTTLTarget');
  if(env.v1.tx.ext.type!=='sorobanData')throw Error('SorobanDataRequired');
  const data=env.v1.tx.ext.sorobanData,footprint=data.resources.footprint;
  const used=kind==='restore'?footprint.readWrite:footprint.readOnly;
  const empty=kind==='restore'?footprint.readOnly:footprint.readWrite;
  if(empty.length||used.length!==expectedKeys.length||JSON.stringify(used.map((k:any)=>k.toXDR('base64')).sort())!==JSON.stringify([...expectedKeys].sort()))throw Error('UnexpectedMaintenanceFootprint');
}
async function signOffline(unsigned:string):Promise<string> {
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('STELLAR_')&&!['RUST_LOG','RUST_BACKTRACE'].includes(name)));
  return new Promise((resolve,reject)=>{
    const child=spawn(CLI,['--no-cache','--quiet','tx','sign','--network-passphrase',NETWORK,'--sign-with-key',IDENTITY],
      {cwd:ROOT,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',size=0;const timer=setTimeout(()=>{child.kill();reject(Error('OfflineSignerTimeout'));},30000);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>131072){child.kill();reject(Error('OfflineSignerOutputLimit'));}else output+=chunk;});
    child.stderr.resume(); // Never log CLI signing data or diagnostics.
    child.on('error',()=>{clearTimeout(timer);reject(Error('OfflineSignerProcessError'));});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Error('OfflineSignerFailed'));else resolve(output.trim());});
    child.stdin.on('error',()=>{});child.stdin.end(unsigned+'\n');
  });
}
async function rpcMaintenance(method:'sendTransaction'|'getTransaction',params:object):Promise<any> {
  const response=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:4,method,params}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('MaintenanceRpcUnavailable');
  const body=await response.json() as any;
  if(body.error)throw Error('MaintenanceRpcError');return body.result;
}
async function recordReceipt(state:any,kind:string,result:any) {
  const step=state.steps[kind];
  if(result.status!=='SUCCESS'&&result.status!=='FAILED')return false;
  if(result.txHash && result.txHash!==step.hash)throw Error('ReceiptHashMismatch');
  const returned=result.envelopeXdr?new Transaction(result.envelopeXdr,NETWORK):null;
  if(returned && Buffer.from(returned.hash()).toString('hex')!==step.hash)throw Error('ReceiptEnvelopeMismatch');
  const txResult=xdr.TransactionResult.fromXDR(result.resultXdr,'base64');
  step.status=result.status;step.confirmationLedger=result.ledger;step.observationLedger=result.latestLedger;
  step.chargedFee=txResult.feeCharged.toString();
  // Signed receipt and complete meta stay private, not in the public report.
  step.receipt=result;await savePrivate(state);
  const sourceAfter=await account();
  const after=await assess();
  const afterFingerprints=await fingerprints(after.inventory);
  const original=JSON.parse(await readFile(path.join(ROOT,'docs/voluntary/VOL-004-before.json'),'utf8'));
  const unchanged=JSON.stringify(afterFingerprints.values)===JSON.stringify(original.fingerprints.values);
  const receipt={kind,hash:step.hash,source:SOURCE,identity:IDENTITY,preparedSource:step.preparedSource,
    preBroadcastSource:step.preBroadcastSource,transactionSequence:step.transactionSequence,
    status:step.status,confirmationLedger:step.confirmationLedger,observationLedger:step.observationLedger,
    simulatedResourceFee:step.simulatedResourceFee,offeredTotalFee:step.offeredTotalFee,chargedFee:step.chargedFee,
    targetLedgers:kind==='extend'?EXTEND_TO:null,affectedEntries:step.entryNames,
    beforeTTLs:step.beforeTTLs,afterTTLs:after.inventory.map((e:any)=>({name:e.name,status:e.status,liveUntilLedger:e.liveUntilLedger})),
    sourceAfter,afterFingerprints,businessAndCodeValuesUnchanged:unchanged,
    explorer:'https://stellar.expert/explorer/testnet/tx/'+step.hash,after};
  await writeFile(path.join(ROOT,'docs/voluntary/VOL-004-'+kind+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  if(!unchanged)throw Error('BusinessValueChangedStop');
  return true;
}
async function reconcile(state:any,kind:string) {
  const step=state.steps[kind];
  if(!step)throw Error('NoOriginalIdentity');
  if(['SUCCESS','FAILED'].includes(step.status))return step;
  for(let n=0;n<12;n++) {
    let result;
    try {result=await rpcMaintenance('getTransaction',{hash:step.hash});}catch{step.status='UNKNOWN';await savePrivate(state);break;}
    if(await recordReceipt(state,kind,result))break;
    step.status='UNKNOWN';step.lastObservation={status:result.status,latestLedger:result.latestLedger};await savePrivate(state);
    if(n<11)await new Promise(resolve=>setTimeout(resolve,2000));
  }
  return step;
}
export async function execute(kind:'restore'|'extend') {
  await networkCheck();
  const state=await loadState();
  if(state.steps[kind])throw Error('OriginalIdentityExistsUseReconcileNeverReprepare');
  if(kind==='extend'&&state.steps.restore?.status!=='SUCCESS')throw Error('RestorationMustBeConfirmedFirst');
  const approved=JSON.parse(await readFile(path.join(ROOT,'docs/voluntary/VOL-004-before.json'),'utf8'));
  const current=await assess();
  const currentFingerprints=await fingerprints(current.inventory);
  if(!approved.fingerprints||JSON.stringify(currentFingerprints.values)!==JSON.stringify(approved.fingerprints.values))throw Error('BusinessOrCodeChangedNeedsReview');
  if(current.inventory.some((e:any)=>!['LIVE','ARCHIVED'].includes(e.status)))throw Error('UnknownEntryStop');
  const selected=kind==='restore'?current.inventory.filter((e:any)=>e.status==='ARCHIVED'):current.inventory;
  if(kind==='extend'&&selected.some((e:any)=>e.status!=='LIVE'))throw Error('CannotExtendArchivedEntries');
  const expected=kind==='restore'?approved.before.inventory.filter((e:any)=>e.status==='ARCHIVED'):approved.before.inventory;
  if(JSON.stringify(selected.map((e:any)=>e.keyXdr).sort())!==JSON.stringify(expected.map((e:any)=>e.keyXdr).sort()))throw Error('MaintenancePlanChangedStop');
  const settings=await networkSettings();
  const archival=settings.entries.find((e:any)=>e.stateArchivalSettings)?.stateArchivalSettings;
  if(!archival||EXTEND_TO>=archival.maxEntryTtl)throw Error('NetworkTTLExceeded');
  // Actual fresh source sequence obtained immediately before preparation.
  const preparedSource=await account();
  const unsigned=maintenanceUnsigned(kind,preparedSource.sequence,selected.map((e:any)=>e.keyXdr),EXTEND_TO);
  const simulation=await rpcRead('simulateTransaction',{transaction:unsigned.toXDR()});
  if(simulation.error||simulation.restorePreamble)throw Error('MaintenanceSimulationNeedsReview');
  const quote=kind==='restore'?approved.restoration.minResourceFee:
    JSON.parse(await readFile(path.join(ROOT,'docs/voluntary/VOL-004-extension-plan.json'),'utf8')).minResourceFee;
  // Operation-specific quoted maintenance cost (+5% tolerance), not an app signer limit change.
  const maintenanceQuoteLimit=BigInt(quote)*105n/100n+10000n;
  const prepared=rpc.assembleTransaction(unsigned,simulation).build();
  guardMaintenance(prepared,kind,selected.map((e:any)=>e.keyXdr),maintenanceQuoteLimit);
  if(!sequenceMatches(preparedSource.sequence,prepared.sequence))throw Error('PreparedSequenceMismatch');
  const hash=Buffer.from(prepared.hash()).toString('hex'); // Hash BEFORE source envelope signature.
  const signedText=await signOffline(prepared.toXDR());
  const signed=new Transaction(signedText,NETWORK);
  guardMaintenance(signed,kind,selected.map((e:any)=>e.keyXdr),maintenanceQuoteLimit);
  if(Buffer.from(signed.hash()).toString('hex')!==hash||signed.toEnvelope().v1.tx.toXDR('base64')!==prepared.toEnvelope().v1.tx.toXDR('base64')
    ||signed.signatures.length!==1||!Keypair.fromPublicKey(SOURCE).verify(signed.hash(),Buffer.from(signed.signatures[0].signature.toBytes())))throw Error('MaintenanceSignatureMismatch');
  state.steps[kind]={status:'SIGNED',hash,signedEnvelopeBase64:signed.toXDR(),preparedSource,transactionSequence:signed.sequence,
    simulatedResourceFee:simulation.minResourceFee,offeredTotalFee:signed.fee,entryNames:selected.map((e:any)=>e.name),
    beforeTTLs:current.inventory.map((e:any)=>({name:e.name,status:e.status,liveUntilLedger:e.liveUntilLedger}))};
  await savePrivate(state); // fsync + atomic rename before any broadcast.
  const persisted=await loadState();const step=persisted.steps[kind];
  if(Buffer.from(new Transaction(step.signedEnvelopeBase64,NETWORK).hash()).toString('hex')!==hash)throw Error('DurableIdentityMismatch');
  await networkCheck();
  const latest=await rpcRead('getLatestLedger');
  if(BigInt(latest.closeTime)>=BigInt(signed.timeBounds.maxTime))throw Error('SignedIdentityExpiredNeedsReview');
  // Leases cannot fence manual/external transactions. Re-read immediately before broadcast.
  step.preBroadcastSource=await account();step.preBroadcastLedger=latest.sequence;
  if(!sequenceMatches(step.preBroadcastSource.sequence,signed.sequence)) {
    step.status='REVIEWED_RESOLUTION_REQUIRED';await savePrivate(persisted);
    throw Error('SourceSequenceChangedDoNotBroadcastDoNotReprepare');
  }
  step.status='DISPATCH_INTENT';await savePrivate(persisted);
  let reply;
  try{reply=await rpcMaintenance('sendTransaction',{transaction:step.signedEnvelopeBase64});}
  catch{step.status='UNKNOWN';await savePrivate(persisted);}
  if(reply){step.status='UNKNOWN';step.submitReply={status:reply.status,hash:reply.hash??null};await savePrivate(persisted);}
  const result=await reconcile(persisted,kind);
  if(result.status!=='SUCCESS')throw Error('MaintenanceNotConfirmedSuccessStopReconcileOriginalHash');
  return {kind,hash:result.hash,status:result.status,ledger:result.confirmationLedger,chargedFee:result.chargedFee};
}
export async function fingerprints(inventory:any[]) {
  const reply=await rpcRead('getLedgerEntries',{keys:inventory.map(e=>e.keyXdr)});
  const byKey=new Map(reply.entries.map((e:any)=>[e.key,e]));
  const values=Object.fromEntries(inventory.map(e=>{
    const entry:any=byKey.get(e.keyXdr);if(!entry)throw Error('MissingFingerprintEntry');
    const data=xdr.LedgerEntryData.fromXDR(entry.xdr,'base64');
    const bytes=data.type==='contractCode'?Buffer.from(data.contractCode.code):data.type==='contractData'?data.contractData.val.toXDR():null;
    if(!bytes)throw Error('UnexpectedFingerprintType');
    return [e.name,createHash('sha256').update(bytes).digest('hex')];
  }));
  return {ledger:reply.latestLedger,values};
}
export async function networkSettings() {
  const names=['configSettingStateArchival','configSettingScpTiming'];
  const keys=names.map(name=>xdr.LedgerKey.configSetting(new xdr.LedgerKeyConfigSetting({configSettingId:xdr.ConfigSettingId[name]})));
  const r=await rpcRead('getLedgerEntries',{keys:keys.map(k=>k.toXDR('base64'))});
  const entries=r.entries.map((e:any)=>safe(xdr.LedgerEntryData.fromXDR(e.xdr,'base64').configSetting.toXdrObject()));
  return {ledger:r.latestLedger,entries};
}
export function maintenanceUnsigned(kind:'restore'|'extend',sequence:string,keys:string[],extendTo?:number) {
  if(!keys.length||keys.length>8)throw Error('InvalidMaintenanceFootprint');
  const footprint=keys.map(k=>xdr.LedgerKey.fromXDR(k,'base64'));
  const data=kind==='restore'?new SorobanDataBuilder().setReadWrite(footprint).build()
    :new SorobanDataBuilder().setReadOnly(footprint).build();
  return new TransactionBuilder(new Account(SOURCE,sequence),{fee:'10000',networkPassphrase:NETWORK})
    .setSorobanData(data).addOperation(kind==='restore'?Operation.restoreFootprint({}):Operation.extendFootprintTtl({extendTo}))
    .setTimeout(180).build();
}
export async function plan() {
  const before=await assess();
  const [source,settings]=await Promise.all([account(),networkSettings()]);
  if(before.inventory.some((e:any)=>!['LIVE','ARCHIVED'].includes(e.status)))throw Error('UnknownEntryStop');
  const archived=before.inventory.filter((e:any)=>e.status==='ARCHIVED');
  let restoration=null;
  if(archived.length) {
    const tx=maintenanceUnsigned('restore',source.sequence,archived.map((e:any)=>e.keyXdr));
    const simulation=await rpcRead('simulateTransaction',{transaction:tx.toXDR()});
    const data=simulation.transactionData?xdr.SorobanTransactionData.fromXDR(simulation.transactionData,'base64'):null;
    restoration={entries:archived.map((e:any)=>e.name),simulationLedger:simulation.latestLedger,error:simulation.error??null,
      minResourceFee:simulation.minResourceFee??null,resourceFee:data?.resourceFee?.toString()??null,
      resources:data?safe(data.resources.toXdrObject()):null};
  }
  const publicPlan={task:'VOL-004',capturedAtUtc:new Date().toISOString(),source,sourceIdentity:IDENTITY,
    sourceUsage:{historical:'recipient trustline setup and reward receipt in 2026-09-26 CLI validation',
      applicationSigner:false,externalManualUse:'UNCONFIRMED; not protected by application SQL lease'},
    before,networkSettings:settings,restoration,fingerprints:await fingerprints(before.inventory),transactionsSubmitted:0};
  await mkdir(path.join(ROOT,'docs/voluntary'),{recursive:true});
  await writeFile(path.join(ROOT,'docs/voluntary/VOL-004-before.json'),JSON.stringify(publicPlan,null,2)+'\n');
  return publicPlan;
}
if(process.argv[2]==='plan') {
  const p=await plan();
  console.log(JSON.stringify({task:p.task,source:p.source,settings:p.networkSettings,
    entries:p.before.inventory.map((e:any)=>({name:e.name,status:e.status,liveUntilLedger:e.liveUntilLedger})),
    restore:p.restoration,fees:p.before.simulations.map((s:any)=>({method:s.method,minResourceFee:s.minResourceFee})),transactionsSubmitted:0},null,2));
}
if(process.argv[2]==='execute') {
  const kind=process.argv[3];if(kind!=='restore'&&kind!=='extend')throw Error('MaintenanceOperationOnly');
  console.log(JSON.stringify(await execute(kind)));
}
if(process.argv[2]==='reconcile') {
  const kind=process.argv[3];if(kind!=='restore'&&kind!=='extend')throw Error('MaintenanceOperationOnly');
  const state=await loadState();await networkCheck();const result=await reconcile(state,kind);
  console.log(JSON.stringify({kind,hash:result.hash,status:result.status,ledger:result.confirmationLedger??null}));
}
