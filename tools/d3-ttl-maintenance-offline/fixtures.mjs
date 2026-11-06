// Deterministic public-byte vectors and synthetic observations ONLY. No keypair,
// seed, account creation, signing, RPC or real D3 completion is produced here.
import {readFileSync} from 'node:fs';
import {SPEC,bytes,hash} from '../d3-evidence-capture/common.mjs';
import {X,identity,strkey,rewardPoolKey} from '../d3-evidence-capture/xdr-reader.mjs';
import {POLICY,PIN,targetPlan,reserveSimulation} from './policy.mjs';
import {deriveWhitelist,keyBytes} from './scope.mjs';

export const historical=JSON.parse(readFileSync(new URL('../d3-evidence-capture/fixtures/historical.json',import.meta.url),'utf8')).items;
const footprint=historical.flatMap(d=>identity(d.rpc.envelopeXdr,{...d.expected,networkPassphrase:SPEC.network}).footprint);
const contract=keyBytes(footprint.find(k=>k.kind==='Battery').keyXdr).key.contractData.contract;
export function lifecycleKey(kind,id){return X.LedgerKey.contractData(new X.LedgerKeyContractData({contract,key:X.ScVal.scvVec([X.ScVal.scvSymbol(kind),kind==='Battery'?X.ScVal.scvString(id):X.ScVal.scvBytes(Buffer.from(id,'hex'))]),durability:X.ContractDataDurability.persistent})).toXDR('base64');}
export function excludedKey(kind){
 if(kind==='SAC')return rewardPoolKey().toXDR('base64');
 if(kind==='INSTANCE')return X.LedgerKey.contractData(new X.LedgerKeyContractData({contract,key:X.ScVal.scvLedgerKeyContractInstance(),durability:X.ContractDataDurability.persistent})).toXDR('base64');
 if(kind==='CODE')return footprint.find(k=>k.kind==='Code').keyXdr;
 if(kind==='TEMPORARY')return X.LedgerKey.contractData(new X.LedgerKeyContractData({contract,key:X.ScVal.scvLedgerKeyNonce(new X.ScNonceKey({nonce:X.Int64.fromString('1')})),durability:X.ContractDataDurability.temporary})).toXDR('base64');
 return X.LedgerKey.configSetting(new X.LedgerKeyConfigSetting({configSettingId:X.ConfigSettingId.configSettingStateArchival})).toXDR('base64');
}
export function entryFor(keyXdr,ledger,observedAt,liveUntilLedgerSeq){const k=keyBytes(keyXdr).key;return {keyXdr,status:'PRESENT',ttlEligible:true,durability:'persistent',observationLedger:ledger,observedAt,liveUntilLedgerSeq,entryDataXdr:X.LedgerEntryData.contractData(new X.ContractDataEntry({ext:X.ExtensionPoint.v0(),contract:k.contractData.contract,key:k.contractData.key,durability:k.contractData.durability,val:X.ScVal.scvVoid()})).toXDR('base64')};}
export function refreshSource(input,index=0){const source=input.sources[index],manifest=JSON.parse(Buffer.from(source.manifestBytesBase64,'base64').toString());const digest=hash(Buffer.from(source.manifestBytesBase64,'base64'));input.review.runs[index].manifestSha256=digest;for(const c of input.captures.filter(c=>c.runId===manifest.runId))c.manifestSha256=digest;}
export function setManifest(input,index,mutate){const source=input.sources[index],m=JSON.parse(Buffer.from(source.manifestBytesBase64,'base64').toString());mutate(m);source.manifestBytesBase64=bytes(m).toString('base64');refreshSource(input,index);}
export function rewriteFootprint(c){c.footprintSha256=hash(bytes({readOnly:c.readOnly,readWrite:c.readWrite}));}
export function makeFixture(count=1,alreadyAbove=false){
 const close=Math.floor(Date.parse('2026-11-06T12:00:00Z')/1000),ledger=6000000,now=close+2;
 const cadence=Array(1000);cadence[999]={ledger,closeTime:close};for(let i=998;i>=0;i--)cadence[i]={ledger:ledger-(999-i),closeTime:cadence[i+1].closeTime-(4+i%3)};
 const publicBytes=Buffer.alloc(32,7),maintenanceAddress=strkey(publicBytes,48),runs=[],sources=[],captures=[];
 for(let n=1;n<=count;n++){
  const runId='RUN'+n,batteryId='TTL-OFFLINE-'+runId+'-001',requestId=hash(Buffer.from('OFFLINE_REQUEST_'+runId));const b=lifecycleKey('Battery',batteryId),q=lifecycleKey('Request',requestId);
  const operations=SPEC.methods.map((operation,i)=>({operation,operationId:'OFFLINE-'+runId+'-OP-'+(i+1),transactionHash:hash(Buffer.from('OFFLINE_TX_'+runId+'_'+i)),ledger:ledger-20+i,result:'SUCCESS',requestId:i?requestId:null}));
  const manifest={schemaVersion:'BYETERY_D3_RUN_V2',runId,batteryId,requestId,gitSha:PIN.business,network:'TESTNET',networkId:SPEC.networkId,contractId:SPEC.contract,source:'TESTNET',evidenceClass:'SYNTHETIC_OFFLINE_MAINTENANCE_FIXTURE_NOT_D3_COMPLETION',complete:true,operations};
  const raw=bytes(manifest),manifestSha256=hash(raw);runs.push({runId,batteryId,requestId,retired:false,manifestSha256,operationIds:operations.map(o=>o.operationId)});sources.push({runId,sourceRef:'OFFLINE_FIXTURE/'+runId+'.json',manifestBytesBase64:raw.toString('base64')});
  for(const [i,o] of operations.entries()){const c={source:'CAPTURED_CONFIRMED_FOOTPRINT',status:'SUCCESS',runId,manifestSha256,batteryId,requestId:o.requestId,operationId:o.operationId,transactionHash:o.transactionHash,confirmationLedger:o.ledger,networkId:SPEC.networkId,contractId:SPEC.contract,deploymentId:SPEC.deployment,readOnly:[],readWrite:i?[b,q]:[b]};rewriteFootprint(c);captures.push(c);}
 }
 const review={source:'REVIEWED_RUN_MANIFESTS_ONLY',ownerReviewRef:hash(Buffer.from('OFFLINE_OWNER_REVIEW_'+count)),runs};const scope=deriveWhitelist(review,sources,captures);
 const current={ledger,closeTime:close,signingTime:now,observedAt:now-1};const target=targetPlan(current,cadence).TARGET_ABSOLUTE_LEDGER;
 const input={mode:'OFFLINE_FIXTURE',identities:{businessSha:PIN.business,businessFingerprint:PIN.fingerprint,toolingCommit:PIN.tooling,toolingRoot:PIN.root,toolingSubtree:PIN.subtree,querySha256:PIN.query,networkPassphrase:SPEC.network,networkId:SPEC.networkId},current,cadence,expectedMaintenanceAddress:maintenanceAddress,
 account:{exists:true,address:maintenanceAddress,publicKeyBytesBase64:publicBytes.toString('base64'),sequence:'123456',finalSequence:'123456',observedAt:now-1,ledger,finalSequenceObservedAt:now,finalSequenceLedger:ledger,dedicated:true,appRoles:[],frontendIdentity:false,businessActorMapping:false,businessSignerCanLoadKey:false,maintenanceSignerCanLoadBusinessKeys:false,masterWeight:1,signers:[{key:maintenanceAddress,weight:1,type:'ed25519_public_key'}],thresholds:{low:0,medium:0,high:0},numSponsoring:0,numSponsored:0,sponsor:null,subentryCount:0,flags:0,homeDomain:''},
 quiescence:{workerQuiet:true,activeBusinessOperations:0,pendingSigning:0,uncertainTransactions:0,concurrentLifecycleMutations:0,externalMaintenanceUse:false,observedAt:now-1,ledger},config:{available:true,networkId:SPEC.networkId,observedAt:now-1,ledger,maxEntryTTL:2000000,maxFootprintEntries:1000,maxReadEntries:1000,maxWriteEntries:1000,maxTxBytes:100000,maxKeyBytes:1000,maxInstructions:1000000,maxDiskReadBytes:1000000,maxWriteBytes:1000000},review,sources,captures,entries:scope.readOnly.map(k=>entryFor(k,ledger,now-1,alreadyAbove?target+100:ledger+100)),request:{id:'OFFLINE-MAINT-'+count,scopeHash:scope.scopeHash,ownerGateRef:scope.reviewRef,runIds:runs.map(r=>r.runId),retry:false,replacement:false,rebroadcast:false}};
 const initial={businessConsumed:3+count*5,businessRemaining:15-count*5,extendsUsed:0,simulationsUsed:0,attempts:[],stopped:false};input.budget=alreadyAbove?initial:reserveSimulation(initial,input.request);
 const data=new X.SorobanTransactionData({ext:X.SorobanTransactionDataExt.v0(),resources:new X.SorobanResources({footprint:new X.LedgerFootprint({readOnly:scope.readOnly.map(k=>keyBytes(k).key),readWrite:[]}),instructions:0,diskReadBytes:4096,writeBytes:0}),resourceFee:X.Int64.fromString('0')});
 const prototype=new X.Transaction({sourceAccount:X.MuxedAccount.keyTypeEd25519(publicBytes),fee:100,seqNum:X.Int64.fromString('123457'),cond:X.Preconditions.precondTime(new X.TimeBounds({minTime:X.Uint64.fromString(String(now)),maxTime:X.Uint64.fromString(String(now+120))})),memo:X.Memo.memoNone(),operations:[new X.Operation({sourceAccount:null,body:X.OperationBody.extendFootprintTtl(new X.ExtendFootprintTtlOp({ext:X.ExtensionPoint.v0(),extendTo:target-ledger}))})],ext:X.TransactionExt.sorobanData(data)});
 input.simulation=alreadyAbove?null:{status:'SUCCESS',auth:[],observedAt:now-1,ledger,minResourceFee:'50000',inclusionFee:'100',sorobanDataXdr:data.toXDR('base64'),inputEnvelopeXdr:X.TransactionEnvelope.envelopeTypeTx(new X.TransactionV1Envelope({tx:prototype,signatures:[]})).toXDR('base64')};return input;
}
