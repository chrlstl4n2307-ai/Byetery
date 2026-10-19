/** BYE-W1-001: standalone evidence probe. Fixed Testnet, unsigned simulation only. */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rpcRead, RPC, NETWORK, restorationIndices } from './vol-001-readiness.mts';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const {Address,Asset,Account,Contract,TransactionBuilder,nativeToScVal,scValToNative,xdr,contract}=require('@stellar/stellar-sdk');
export const ROOT=fileURLToPath(new URL('..',import.meta.url));
export const CONTRACT='CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON';
export const TOKEN='CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G';
export const ISSUER='GCHROKHXHL4L635J6Y6DWFFD5DDHABOAF4BP5TEUZDZQMW4XYS6DIDL7';
export const WASM='c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6';
export const SPRINT='349ee3fd78104f3c249b3052b1cca402c9d99ff3';
export const FROZEN='450c21b151a0973064986327f09d55e4f36c43e0';
export const CAP=50_000_000n;
const OUT=path.join(ROOT,'docs/instaward/week1/BYE-W1-001-results.json');
const sha=(b:any)=>createHash('sha256').update(b).digest('hex');
const git=(...args:string[])=>execFileSync('git',['--no-optional-locks',...args],{cwd:ROOT,encoding:'utf8'}).trim();
const str=(s:string)=>nativeToScVal(s,{type:'string'});
const bytes=(s:string)=>xdr.ScVal.scvBytes(Buffer.from(s,'hex'));
const sym=(s:string)=>xdr.ScVal.scvSymbol(s);
const vec=(s:string)=>xdr.ScVal.scvVec([sym(s)]);
export function safe(v:any):any {
 if(typeof v==='bigint')return v.toString();
 if(v instanceof Uint8Array)return Buffer.from(v).toString('hex');
 if(Array.isArray(v))return v.map(safe);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,a])=>[k,safe(a)]));
 return v;
}
export function classify(e:any,ledger:number){
 if(!e)return 'UNKNOWN'; // Omission is not proof of absence or permission to recreate.
 if(typeof e.liveUntilLedgerSeq!=='number')return 'UNKNOWN';
 return e.liveUntilLedgerSeq>=ledger?'LIVE':'ARCHIVED';
}
export function networkSummary(latest:any,network:any,version:any){
 // Recent RPCs may include full ledger metadata containing unrelated transactions.
 // Retain only required public identifiers/timing, never raw metadata/envelopes.
 return {id:latest.id,protocolVersion:latest.protocolVersion,sequence:latest.sequence,closeTime:latest.closeTime,
  passphrase:network.passphrase,protocol:network.protocolVersion,rpcVersion:version.version,capturedAtUtc:new Date().toISOString()};
}
export function ttlCoverage(ledger:number,closeTime:number,cadenceMs:number,liveUntil:number){
 if(!Number.isFinite(cadenceMs)||cadenceMs<=0)throw Error('UnknownCadence');
 // Covers the entire owner deadline day plus seven entire buffer days in Santiago.
 const requiredThrough='2026-11-21T00:00:00-03:00';
 const needed=Math.max(0,Math.ceil((Date.parse(requiredThrough)-closeTime*1000)/cadenceMs));
 const targetLedger=ledger+needed;
 return {deadline:'2026-11-13',bufferDays:7,requiredThroughExclusive:requiredThrough,
   cadenceMilliseconds:cadenceMs,targetLedger,earliestLiveUntil:liveUntil,
   remainingLedgers:liveUntil-ledger,adequate:liveUntil>=targetLedger,
   estimatedLiveUntilUtc:new Date(closeTime*1000+(liveUntil-ledger)*cadenceMs).toISOString(),
   estimateLimit:'Projection at on-chain target cadence, not a guarantee; actual cadence, resets and future settings can differ.'};
}
export function synthetic(){return {batteryId:'BYE-SPRINT-PREFLIGHT-'+randomBytes(5).toString('hex').toUpperCase(),
 requestId:randomBytes(32).toString('hex'),registrationHash:randomBytes(32).toString('hex'),payloadHash:randomBytes(32).toString('hex')};}
export function evidence(bid:string,rid:string,kind:string,hash:string){
 return xdr.ScVal.scvMap([
  ['battery_id',str(bid)],['kind',vec(kind)],['payload_hash',bytes(hash)],['request_id',bytes(rid)],['version',xdr.ScVal.scvU32(1)],
 ].map(([k,v])=>new xdr.ScMapEntry({key:sym(k as string),val:v})));
}
export function businessCalls(ids:any,actors:any){
 const a=(role:string)=>actors[role].address;
 return [
  {method:'register_battery',source:a('admin'),requiredActors:[a('admin')],args:[str(ids.batteryId),bytes(ids.registrationHash)]},
  {method:'open_return',source:a('service'),requiredActors:[a('service')],args:[str(ids.batteryId),bytes(ids.requestId),new Address(a('recipient')).toScVal()]},
  {method:'confirm_collection',source:a('service'),requiredActors:[a('service'),a('collector')],args:[str(ids.batteryId),bytes(ids.requestId),new Address(a('collector')).toScVal(),evidence(ids.batteryId,ids.requestId,'Collection',ids.payloadHash)]},
  {method:'confirm_recycling',source:a('recycler'),requiredActors:[a('recycler')],args:[str(ids.batteryId),bytes(ids.requestId),new Address(a('recycler')).toScVal(),evidence(ids.batteryId,ids.requestId,'Recycling',ids.payloadHash)]},
  {method:'pay_reward',source:a('service'),requiredActors:[a('service')],args:[str(ids.batteryId)]},
 ];
}
export function unsigned(call:any,sequence:string){
 const tx=new TransactionBuilder(new Account(call.source,sequence),{fee:'10000',networkPassphrase:NETWORK})
  .addOperation(new Contract(call.contract??CONTRACT).call(call.method,...call.args)).setTimeout(120).build();
 if(tx.signatures.length||tx.operations.length!==1||tx.operations[0].type!=='invokeHostFunction')throw Error('UnsignedSingleInvokeRequired');
 return tx;
}
export function summarizeSimulation(sim:any){
 const data=sim.transactionData?xdr.SorobanTransactionData.fromXDR(sim.transactionData,'base64'):null;
 const auth=(sim.results??[]).flatMap((r:any)=>r.auth??[]).map((s:string)=>{
  const e=xdr.SorobanAuthorizationEntry.fromXDR(s,'base64');
  const type=e.credentials.type;
  const credentials=type==='sorobanCredentialsAddress'?e.credentials.address:
   type==='sorobanCredentialsAddressV2'?e.credentials.addressV2:null;
  // Never retain signatures, credentials XDR, envelopes or nonces, even recording-mode placeholders.
  return {type,address:credentials?Address.fromScAddress(credentials.address).toString():null,
   function:e.rootInvocation.function.type,subInvocations:e.rootInvocation.subInvocations.length};
 });
 return {ledger:sim.latestLedger,status:sim.error?'SIMULATION_ERROR':'SIMULATION_SUCCESS',error:sim.error??null,
  minResourceFee:sim.minResourceFee??null,classicFeeAssumption:'10000',
  totalFeeAssumption:sim.minResourceFee?(BigInt(sim.minResourceFee)+10000n).toString():null,
  belowCap:sim.minResourceFee?BigInt(sim.minResourceFee)+10000n<=CAP:null,
  restorePreamblePresent:!!sim.restorePreamble,restorePreambleFee:sim.restorePreamble?.minResourceFee??null,
  restoreList:restorationIndices(data),resourceFee:data?.resourceFee?.toString()??null,
  resources:data?safe(data.resources.toXdrObject()):null,cost:safe(sim.cost??null),
  authorizationEntryCount:sim.results?auth.length:null,authorizationEntries:auth,
  values:(sim.results??[]).map((r:any)=>safe(scValToNative(xdr.ScVal.fromXDR(r.xdr,'base64')))),
  stateChanges:safe((sim.stateChanges??[]).map((c:any)=>({type:c.type,keySha256:c.key?sha(Buffer.from(c.key,'base64')):null}))),
  signed:false,submitted:false};
}
function safety(){
 const state={branch:git('branch','--show-current'),head:git('rev-parse','HEAD'),status:git('status','--short'),
  log:git('log','--oneline','--decorate','-10'),sprintTag:git('rev-parse','instaward-sprint-start-v1^{commit}'),
  sprintTagObject:git('rev-parse','refs/tags/instaward-sprint-start-v1'),
  historicalTag:git('rev-parse','pre-instaward-baseline-v1^{commit}'),historicalTagObject:git('rev-parse','refs/tags/pre-instaward-baseline-v1')};
 if(state.branch!=='instaward/d1-testnet-integration'||state.sprintTag!==SPRINT||state.historicalTag!==FROZEN
  ||state.sprintTagObject!=='8d87621b3c24fefaab4ea44771445007ba46e9a1'||state.historicalTagObject!=='de9c9c284427aa339cb775a56ee5c3a27cb324fe')throw Error('GitBoundaryMismatchStop');
 const allowed=['tools/sync_obsidian.py','scripts/bye-w1-001-readiness.mts','scripts/bye-w1-001-readiness.test.mts','docs/instaward/week1/'];
 for(const line of state.status.split('\n').filter(Boolean)){
  const name=line.trim().slice(3).trim();
  if(!allowed.some(p=>name===p||name.startsWith(p)))throw Error('UnexplainedWorktreeChangeStop:'+name);
 }
 if(git('diff',FROZEN,'--','contracts'))throw Error('FrozenContractDiffStop');
 return state;
}
export async function run(){
 const start=safety();
 const syncHash=sha(await readFile(path.join(ROOT,'tools/sync_obsidian.py')));
 if(syncHash!=='48404b9431a9d955fc4af0b2eeaf9a59bb2fb0e9457eed73b4f2f66132a5e2da')throw Error('ProtectedSyncUtilityChangedStop');
 const previous=JSON.parse(await readFile(path.join(ROOT,'docs/voluntary/VOL-004-final-verification.json'),'utf8'));
 const historic=JSON.parse(await readFile(path.join(ROOT,'docs/testnet/validation-2026-09-26.json'),'utf8'));
 const report:any={task:'BYE-W1-001',classification:'OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT',date:'2026-10-19',timezone:'America/Santiago',
  capturedAtUtc:new Date().toISOString(),git:start,protectedSyncSha256:syncHash,network:'Stellar Testnet',rpc:RPC,contract:CONTRACT,token:TOKEN,
  issuer:ISSUER,signerCapStroops:CAP.toString(),maintenanceTransactionsSubmitted:0,businessTransactionsSubmitted:0,rewardTransactionsSubmitted:0,
  signaturesCreated:0,productCodeChanged:false,contractModified:false,officialAcceptance:{D1:'0/12',D2:'0/6',D3:'0/5',total:'0/23'},
  historicalComparison:{task:'VOL-004',classification:'VOLUNTARY PRE-SPRINT DEVELOPMENT',date:'2026-10-12',ledger:previous.latestLedger,
   path:'docs/voluntary/VOL-004-final-verification.json'},readSimulations:[],businessPreflights:[],stopReasons:[]};
 async function save(){await mkdir(path.dirname(OUT),{recursive:true});await writeFile(OUT,JSON.stringify(safe(report),null,2)+'\n');}
 try {
 const [network,latest,version]=await Promise.all(['getNetwork','getLatestLedger','getVersionInfo'].map(m=>rpcRead(m)));
 if(network.passphrase!==NETWORK)throw Error('WrongNetworkStop');
 report.networkState=networkSummary(latest,network,version);
 const settingsKeys=['configSettingStateArchival','configSettingScpTiming'].map(n=>xdr.LedgerKey.configSetting(new xdr.LedgerKeyConfigSetting({configSettingId:xdr.ConfigSettingId[n]})));
 const settings=await rpcRead('getLedgerEntries',{keys:settingsKeys.map(k=>k.toXDR('base64'))});
 report.networkSettings={ledger:settings.latestLedger,entries:settings.entries.map((e:any)=>safe(xdr.LedgerEntryData.fromXDR(e.xdr,'base64').configSetting.toXdrObject()))};
 const items=previous.assessment.inventory;
 const inventoryReply=await rpcRead('getLedgerEntries',{keys:items.map((e:any)=>e.keyXdr)});
 const byKey=new Map(inventoryReply.entries.map((e:any)=>[e.key,e]));
 const fingerprintValues:any={};let deployedCode:any=null;let instance:any=null;
 report.inventory=items.map((old:any)=>{
  const e:any=byKey.get(old.keyXdr);const data=e?xdr.LedgerEntryData.fromXDR(e.xdr,'base64'):null;
  if(data?.type==='contractCode')deployedCode=Buffer.from(data.contractCode.code);
  if(old.name==='byetery_instance')instance=data?.contractData.val.instance;
  const valueBytes=data?.type==='contractCode'?Buffer.from(data.contractCode.code):data?.type==='contractData'?data.contractData.val.toXDR():null;
  fingerprintValues[old.name]=valueBytes?sha(valueBytes):null;
  return {name:old.name,status:classify(e,inventoryReply.latestLedger),observedLedger:inventoryReply.latestLedger,
   liveUntilLedger:e?.liveUntilLedgerSeq??null,remainingLedgers:typeof e?.liveUntilLedgerSeq==='number'?e.liveUntilLedgerSeq-inventoryReply.latestLedger:null,
   lastModifiedLedger:e?.lastModifiedLedgerSeq??null,fingerprint:fingerprintValues[old.name],
   historicalFingerprint:previous.fingerprints.values[old.name],unchanged:fingerprintValues[old.name]===previous.fingerprints.values[old.name],
   value:data?.type==='contractData'&&!old.name.endsWith('_instance')?safe(scValToNative(data.contractData.val)):null};
 });
 report.fingerprints={ledger:inventoryReply.latestLedger,values:fingerprintValues};
 const nonlive=report.inventory.filter((e:any)=>e.status!=='LIVE');
 if(nonlive.length){report.overall='BLOCKED';report.stopReasons.push('Required entries not all LIVE: '+nonlive.map((e:any)=>e.name+':'+e.status));await save();return report;}
 report.wasmSha256=sha(deployedCode);report.wasmMatches=report.wasmSha256===WASM;
 if(!report.wasmMatches)throw Error('WasmHashMismatchStop');
 if(instance.executable.type!=='contractExecutableWasm'||Buffer.from(instance.executable.wasmHash.toBytes()).toString('hex')!==WASM)throw Error('InstanceExecutableMismatchStop');
 report.assetIdentity={code:'GREENTEST',issuer:ISSUER,derivedSac:new Asset('GREENTEST',ISSUER).contractId(NETWORK),matches:false};
 report.assetIdentity.matches=report.assetIdentity.derivedSac===TOKEN;
 if(!report.assetIdentity.matches)throw Error('AssetIdentityMismatchStop');
 report.businessStateUnchanged=report.inventory.every((e:any)=>e.unchanged);
 if(!report.businessStateUnchanged)throw Error('HistoricalBusinessStateChangedStop');
 const balance=report.inventory.find((e:any)=>e.name==='reward_contract_balance');
 report.contractBalance={observedLedger:inventoryReply.latestLedger,baseUnits:balance.value.amount,decimals:7,greentest:(BigInt(balance.value.amount)/10000000n).toString()};
 if(balance.value.amount!=='900000000')throw Error('UnexpectedGREENTESTBalanceStop');
 report.config=safe(scValToNative(instance.storage.find((e:any)=>JSON.stringify(safe(scValToNative(e.key))).includes('Config')).val));
 if(report.config.admin!==historic.actors.admin.address||report.config.service!==historic.actors.service.address||report.config.reward_token!==TOKEN)throw Error('ConfigIdentityMismatchStop');
 const timing=report.networkSettings.entries.find((e:any)=>e.contractScpTiming)?.contractScpTiming;
 const cadenceMs=timing?.ledgerTargetCloseTimeMilliseconds;
 const earliest=Math.min(...report.inventory.map((e:any)=>e.liveUntilLedger));
 report.ttl=ttlCoverage(latest.sequence,Number(latest.closeTime),Number(cadenceMs),earliest);
 if(!report.ttl.adequate)throw Error('TTLInsufficientStop');
 report.accounts=[];
 for(const role of ['admin','service','collector','recycler','recipient']){
  const address=historic.actors[role].address;
  const key=xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:new Address(address).toScAddress().accountId}));
  const reply=await rpcRead('getLedgerEntries',{keys:[key.toXDR('base64')]});
  if(reply.entries.length!==1)throw Error('AccountUnknownStop:'+role);
  const e=xdr.LedgerEntryData.fromXDR(reply.entries[0].xdr,'base64').account;
  report.accounts.push({role,address,sequence:e.seqNum.toString(),balanceStroops:e.balance.toString(),observedLedger:reply.latestLedger,
   purpose:role==='recipient'?'Historical recipient and VOL-004 maintenance payer; not configured app signer':'Existing documented '+role+' signer; source for corresponding methods where applicable',
   dedicated:false,externalManualUse:'UNCONFIRMED; SQL lease cannot fence external/manual Stellar submissions'});
 }
 report.sourceSafety='Future dispatch rereads authoritative sequence immediately before broadcast. Drift from persisted envelope => NO BROADCAST / NO auto reprepare / reviewed resolution. This probe assumes no sequence reservation and sends nothing.';
 const service=historic.actors.service.address;
 const reads=[{method:'get_config',args:[]},{method:'get_battery',args:[str(historic.batteryId)]},
  {method:'get_request',args:[bytes(historic.requestId)]},{method:'has_role',args:[new Address(historic.actors.collector.address).toScVal(),vec('Collector')]},
  {method:'balance',contract:TOKEN,args:[new Address(CONTRACT).toScVal()]}];
 for(const call of reads){
  const tx=unsigned({...call,source:service},report.accounts.find((a:any)=>a.address===service).sequence);
  const sim=summarizeSimulation(await rpcRead('simulateTransaction',{transaction:tx.toXDR(),authMode:'record'}));
  const old=previous.assessment.simulations.find((s:any)=>s.method===call.method);
  report.readSimulations.push({method:call.method,source:service,...sim,historicalVOL004Fee:old.minResourceFee});
  if(sim.status!=='SIMULATION_SUCCESS'||sim.restorePreamblePresent||(sim.restoreList?.length??0)>0)throw Error('ReadSimulationNotReadyStop:'+call.method);
 }
 const spec=contract.Spec.fromWasm(deployedCode);
 const functions=spec.funcs();
 report.deployedAbi=functions.map((f:any)=>({name:f.name.toString(),parameters:f.inputs.map((i:any)=>({name:i.name.toString(),type:safe(i.type.toXdrObject())}))}));
 const ids=synthetic();report.syntheticIds=ids;
 if(ids.batteryId===historic.batteryId||ids.requestId===historic.requestId)throw Error('HistoricalIdReuseStop');
 for(const call of businessCalls(ids,historic.actors)){
  const abi=functions.find((f:any)=>f.name.toString()===call.method);
  if(!abi||abi.inputs.length!==call.args.length)throw Error('AbiArgumentMismatchStop');
  const seq=report.accounts.find((a:any)=>a.address===call.source).sequence;
  const sim=summarizeSimulation(await rpcRead('simulateTransaction',{transaction:unsigned(call,seq).toXDR(),authMode:'record'}));
  report.businessPreflights.push({method:call.method,source:call.source,requiredActors:call.requiredActors,parameters:report.deployedAbi.find((f:any)=>f.name===call.method).parameters,
   argumentXdrHashes:call.args.map((a:any)=>sha(a.toXDR())),...sim});
  if(sim.belowCap===false)throw Error('ApplicationFeeExceedsCapStop:'+call.method);
 }
 // Successful first simulation did not register anything; later state-dependent methods must not be counted as passed.
 const absent=await rpcRead('getLedgerEntries',{keys:[...[
  xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(CONTRACT).toScAddress(),key:xdr.ScVal.scvVec([sym('Battery'),str(ids.batteryId)]),durability:xdr.ContractDataDurability.persistent})),
  xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(CONTRACT).toScAddress(),key:xdr.ScVal.scvVec([sym('Request'),bytes(ids.requestId)]),durability:xdr.ContractDataDurability.persistent})),
 ].map(k=>k.toXDR('base64'))]});
 report.syntheticStateAfter={ledger:absent.latestLedger,returnedEntries:absent.entries.length,note:'No simulation state persisted. Empty reply is not generally proof of nonexistence/permission to reuse IDs; IDs remain reserved as probe fixtures.'};
 const after=await rpcRead('getLedgerEntries',{keys:items.map((e:any)=>e.keyXdr)});
 report.afterFingerprints={ledger:after.latestLedger,values:Object.fromEntries(after.entries.map((e:any)=>{
  const old=items.find((i:any)=>i.keyXdr===e.key),d=xdr.LedgerEntryData.fromXDR(e.xdr,'base64');
  return [old.name,sha(d.type==='contractCode'?Buffer.from(d.contractCode.code):d.contractData.val.toXDR())];
 }))};
 report.unchangedAfterPreflights=items.every((i:any)=>report.afterFingerprints.values[i.name]===fingerprintValues[i.name]);
 if(!report.unchangedAfterPreflights)throw Error('StateChangedDuringProbeStop');
 const all=report.businessPreflights.every((s:any)=>s.status==='SIMULATION_SUCCESS'&&s.belowCap===true);
 report.capDecision=all?'KEEP 50000000':'UNCHANGED 50000000; FULL ASSESSMENT PARTIAL, missing successful stateful preflights';
 report.overall=all?'PASS':'PARTIAL';
 report.maintenanceRequired=false;
 report.limits=['Known eight-entry inventory, not all storage or all future D1 battery/request entries.',
  'Simulations do not persist prior calls. Fresh fixture cannot traverse dependent states without separately authorized on-chain preparation or a clearly labeled local fork.',
  'Error simulations provide no usable success fee/authorization list; never substitute zero or historical fees.',
  'No real signing, signing-helper access or submit path. Native helper tests only; historical offline signing not replayed.',
  'Recording-mode requirements are not proof of signed execution or independent human custodians.',
  'No D1 acceptance review and no BYE-W1-002 implementation.'];
 }catch(e:any){report.stopReasons.push(String(e.message));report.overall='BLOCKED';}
 if(sha(await readFile(path.join(ROOT,'tools/sync_obsidian.py')))!==syncHash)throw Error('ProtectedUtilityChangedStop');
 await save();return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const r=await run();console.log(JSON.stringify({task:r.task,overall:r.overall,ledger:r.networkState?.sequence,stopReasons:r.stopReasons,
  inventory:r.inventory?.map((e:any)=>({name:e.name,status:e.status,liveUntilLedger:e.liveUntilLedger})),ttl:r.ttl,
  reads:r.readSimulations.map((s:any)=>({method:s.method,fee:s.minResourceFee,status:s.status})),
  preflights:r.businessPreflights.map((s:any)=>({method:s.method,fee:s.minResourceFee,status:s.status,auth:s.authorizationEntryCount,error:s.error})),
  signaturesCreated:0,transactionsSubmitted:0},null,2));
}
