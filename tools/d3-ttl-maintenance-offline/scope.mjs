import {check,hash,bytes,canonical,SPEC} from '../d3-evidence-capture/common.mjs';
import {X,native,address} from '../d3-evidence-capture/xdr-reader.mjs';
import {PIN} from './policy.mjs';
import {scanRaw} from '../d3-evidence-capture/sanitizer.mjs';

const retiredBatteries=new Set([SPEC.retiredBattery,'BYE-D3-R1-20261103-18551C1AB983']);
const retiredRequest='c064a842735ea9699c9b9bb645da1987513c9952bc1818e46f057ce81ce296e1';
const retiredTx=new Set(['5d7fff5457e19ad337e50398a07d403e68a054dbf58d8a5959c826c540b3d937','3e8a0482e3f32ea314c7df0da7ef6a8d3394b8aef354fa291fd7d6cd06007c15','32ba94f9da05b52f44813e26e576cc994fd694f1df9132dd14d67557aa0ddd06']);
export function keyBytes(encoded){check(typeof encoded==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(encoded),'UNKNOWN_TTL_LEDGER_KEY');const raw=Buffer.from(encoded,'base64');check(raw.toString('base64')===encoded,'UNKNOWN_TTL_LEDGER_KEY');let key;try{key=X.LedgerKey.fromXDR(raw);}catch{check(false,'UNKNOWN_TTL_LEDGER_KEY');}check(Buffer.from(key.toXDR()).equals(raw),'UNKNOWN_TTL_LEDGER_KEY');return {raw,key};}
export function canonicalKeys(keys){check(Array.isArray(keys),'INVALID_TTL_WHITELIST');const unique=[...new Set(keys)];for(const k of unique)keyBytes(k);return unique.sort((a,b)=>Buffer.compare(Buffer.from(a,'base64'),Buffer.from(b,'base64')));}
export const keySetHash=keys=>hash(bytes(keys));
export function classifyKey(encoded,run){const {key:k}=keyBytes(encoded);
 if(k.type==='contractCode')return {eligible:false,reason:'EXCLUDED_CONTRACT_CODE'};
 if(k.type==='ttl')return {eligible:false,reason:'EXCLUDED_TTL_BOOKKEEPING'};
 if(k.type==='account')return {eligible:false,reason:'EXCLUDED_CLASSIC_ACCOUNT'};
 if(k.type==='trustline')return {eligible:false,reason:'EXCLUDED_CLASSIC_TRUSTLINE'};
 check(k.type==='contractData','UNKNOWN_TTL_LEDGER_KEY');const d=k.contractData,contract=address(d.contract),value=native(d.key);
 if(d.durability.name==='temporary'){check(value?.kind==='AUTH_NONCE','UNKNOWN_TTL_LEDGER_KEY');return {eligible:false,reason:'EXCLUDED_TEMPORARY_AUTH_NONCE'};}
 check(d.durability.name==='persistent','UNKNOWN_TTL_LEDGER_KEY');
 if(value==='INSTANCE')return {eligible:false,reason:'EXCLUDED_CONTRACT_INSTANCE'};
 if(contract===SPEC.token&&Array.isArray(value)&&value[0]==='Balance')return {eligible:false,reason:'EXCLUDED_SAC_POOL_BALANCE'};
 if(contract===SPEC.contract&&Array.isArray(value)&&['Role','Config'].includes(value[0]))return {eligible:false,reason:'EXCLUDED_ROLE_CONFIG_OWNER_REAPPROVAL_REQUIRED'};
 check(contract===SPEC.contract&&Array.isArray(value)&&value.length===2&&['Battery','Request'].includes(value[0]),'UNKNOWN_TTL_LEDGER_KEY');
 check(!retiredBatteries.has(value[1])&&value[1]!==retiredRequest,'HISTORICAL_LIFECYCLE_EXCLUDED');
 check((value[0]==='Battery'&&value[1]===run.batteryId)||(value[0]==='Request'&&value[1]===run.requestId),'UNKNOWN_TTL_LEDGER_KEY');
 return {eligible:true,kind:value[0],id:value[1],durability:'persistent',contract};
}
export function deriveWhitelist(review,sources,captures){
 check(review?.source==='REVIEWED_RUN_MANIFESTS_ONLY','WHITELIST_SOURCE_NOT_REVIEWED_MANIFESTS');check(/^[a-f0-9]{64}$/.test(review.ownerReviewRef??'')&&Array.isArray(review.runs)&&review.runs.length>0&&review.runs.length<=3,'REVIEWED_RUN_SCOPE_REQUIRED');
 check(Array.isArray(sources)&&Array.isArray(captures)&&sources.length===review.runs.length,'SOURCE_MANIFEST_SCOPE_MISMATCH');
 check(new Set(review.runs.map(r=>r.runId)).size===review.runs.length&&new Set(review.runs.map(r=>r.batteryId)).size===review.runs.length&&new Set(review.runs.map(r=>r.requestId)).size===review.runs.length,'DUPLICATE_REVIEWED_RUN');
 const accepted=[],excluded=[],operationIds=[],transactionHashes=[],bindings=[];
 for(const run of review.runs){
  check(/^RUN[123]$/.test(run.runId)&&run.retired===false&&!retiredBatteries.has(run.batteryId)&&run.requestId!==retiredRequest,'HISTORICAL_LIFECYCLE_EXCLUDED');
  check(/^[A-Z0-9-]{1,32}$/.test(run.batteryId)&&/^[a-f0-9]{64}$/.test(run.requestId),'REVIEWED_RUN_SCOPE_REQUIRED');
  const source=sources.find(s=>s.runId===run.runId);check(source&&typeof source.manifestBytesBase64==='string'&&source.sourceRef,'SOURCE_MANIFEST_SCOPE_MISMATCH');
  const raw=Buffer.from(source.manifestBytesBase64,'base64');check(raw.length>0&&raw.toString('base64')===source.manifestBytesBase64&&hash(raw)===run.manifestSha256,'SOURCE_MANIFEST_HASH_MISMATCH');
  scanRaw(raw);
  let m;try{m=JSON.parse(raw.toString('utf8'));}catch{check(false,'SOURCE_MANIFEST_INVALID');}
  check(m.schemaVersion==='BYETERY_D3_RUN_V2'&&m.complete===true&&m.runId===run.runId&&m.batteryId===run.batteryId&&m.requestId===run.requestId&&m.gitSha===PIN.business&&m.network==='TESTNET'&&m.networkId===SPEC.networkId&&m.contractId===SPEC.contract&&m.source==='TESTNET','SOURCE_MANIFEST_SCOPE_MISMATCH');
  check(m.retired!==true&&Array.isArray(m.operations)&&m.operations.length===5&&Array.isArray(run.operationIds)&&canonical(m.operations.map(o=>o.operationId))===canonical(run.operationIds),'SOURCE_MANIFEST_OPERATION_SCOPE_MISMATCH');
  for(const [i,op] of m.operations.entries()){
   check(op.operation===SPEC.methods[i]&&op.result==='SUCCESS'&&typeof op.operationId==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(op.operationId)&&/^[a-f0-9]{64}$/.test(op.transactionHash??'')&&!retiredTx.has(op.transactionHash),'HISTORICAL_OR_UNCONFIRMED_OPERATION_EXCLUDED');
   check(i===0?op.requestId===null:op.requestId===run.requestId,'SOURCE_MANIFEST_OPERATION_SCOPE_MISMATCH');
   const matches=captures.filter(c=>c.operationId===op.operationId);check(matches.length===1,'CAPTURED_FOOTPRINT_SCOPE_MISMATCH');const c=matches[0];
   check(c.source==='CAPTURED_CONFIRMED_FOOTPRINT'&&c.status==='SUCCESS'&&c.runId===run.runId&&c.manifestSha256===run.manifestSha256&&c.batteryId===run.batteryId&&c.requestId===(i===0?null:run.requestId)&&c.transactionHash===op.transactionHash&&c.confirmationLedger===op.ledger&&Number.isSafeInteger(c.confirmationLedger)&&c.confirmationLedger>0&&c.networkId===SPEC.networkId&&c.contractId===SPEC.contract&&c.deploymentId===SPEC.deployment,'CAPTURED_FOOTPRINT_SCOPE_MISMATCH');
   check(Array.isArray(c.readOnly)&&Array.isArray(c.readWrite)&&c.footprintSha256===hash(bytes({readOnly:c.readOnly,readWrite:c.readWrite})),'CAPTURED_FOOTPRINT_HASH_MISMATCH');
   for(const keyXdr of [...c.readOnly,...c.readWrite]){const kind=classifyKey(keyXdr,run);if(kind.eligible)accepted.push({keyXdr,runId:run.runId,operationId:op.operationId,...kind});else excluded.push({keyXdr,runId:run.runId,operationId:op.operationId,...kind});}
   operationIds.push(op.operationId);transactionHashes.push(op.transactionHash);
  }
  check(accepted.some(k=>k.runId===run.runId&&k.kind==='Battery')&&accepted.some(k=>k.runId===run.runId&&k.kind==='Request'),'REVIEWED_LIFECYCLE_KEYS_MISSING');
  bindings.push({runId:run.runId,batteryId:run.batteryId,requestId:run.requestId,manifestSha256:run.manifestSha256,sourceRef:source.sourceRef,operationIds:run.operationIds});
 }
 check(captures.length===operationIds.length&&captures.every(c=>operationIds.includes(c.operationId)),'SCOPE_OPERATION_NOT_IN_RUN_MANIFEST');
 check(new Set(operationIds).size===operationIds.length&&new Set(transactionHashes).size===transactionHashes.length,'DUPLICATE_OPERATION_OR_TRANSACTION');
 const readOnly=canonicalKeys(accepted.map(x=>x.keyXdr));check(readOnly.length>0&&readOnly.length<=30,'INVALID_TTL_WHITELIST');
 return {source:'REVIEWED_RUN_MANIFESTS_ONLY',reviewRef:review.ownerReviewRef,bindings,operationIds,readOnly,readWrite:[],whitelistHash:keySetHash(readOnly),scopeHash:hash(bytes({bindings,readOnly})),observedCandidates:accepted,excluded};
}
export function selectLiveSubset(scope,entries,currentLedger,target){
 check(Array.isArray(entries)&&entries.length===scope.readOnly.length&&new Set(entries.map(e=>e.keyXdr)).size===entries.length&&entries.every(e=>scope.readOnly.includes(e.keyXdr)),'PRE_SIGN_LEDGER_KEY_SET_MISMATCH');
 const selected=[],alreadyAboveTarget=[],pre=[];
 for(const keyXdr of scope.readOnly){const e=entries.find(e=>e.keyXdr===keyXdr);check(e.status!=='ARCHIVED'&&!(Number.isInteger(e.liveUntilLedgerSeq)&&e.liveUntilLedgerSeq<currentLedger),'TTL_KEY_ARCHIVED_OWNER_DECISION_REQUIRED');check(e.status==='PRESENT'&&e.durability==='persistent'&&e.ttlEligible===true&&Number.isInteger(e.liveUntilLedgerSeq)&&e.liveUntilLedgerSeq>=currentLedger,'TTL_KEY_UNAVAILABLE_OWNER_DECISION_REQUIRED');const b=keyBytes(keyXdr).key;check(b.type==='contractData'&&b.contractData.durability.name==='persistent','UNKNOWN_TTL_LEDGER_KEY');let data;try{data=X.LedgerEntryData.fromXDR(e.entryDataXdr,'base64');}catch{check(false,'PRE_SIGN_LEDGER_ENTRY_MISMATCH');}scanRaw(Buffer.from(e.entryDataXdr,'base64'));check(data.type==='contractData'&&Buffer.from(data.contractData.contract.toXDR()).equals(b.contractData.contract.toXDR())&&Buffer.from(data.contractData.key.toXDR()).equals(b.contractData.key.toXDR())&&data.contractData.durability.name==='persistent','PRE_SIGN_LEDGER_ENTRY_MISMATCH');pre.push({keyXdr,entryDataXdr:e.entryDataXdr,observationLedger:e.observationLedger,observedAt:e.observedAt,liveUntilLedgerSeq:e.liveUntilLedgerSeq});if(e.liveUntilLedgerSeq>=target)alreadyAboveTarget.push({keyXdr,status:'ALREADY_ABOVE_TARGET',liveUntilLedgerSeq:e.liveUntilLedgerSeq});else selected.push(keyXdr);}
 return {readOnly:selected,readWrite:[],effectiveWhitelistHash:keySetHash(selected),alreadyAboveTarget,pre};
}
