import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SPEC,check,read,json,hash,bytes,canonical} from './common.mjs';
import {scanRaw} from './sanitizer.mjs';
import {sameDecodedXdr,decodedXdr} from './comparison.mjs';
import {verifyTx} from './verifier.mjs';
import {assertTestnetNetwork} from './network-identity.mjs';

export const OWNER_QUERY_SHA256='d4e82f4221d187aecdee7440b8331ebbe54e96d0b7400d06bc1430b8d793c9f1';
export const OWNER_QUERY_URL=new URL('./sql/owner-export.sql',import.meta.url);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hex=/^[a-f0-9]{64}$/;
function shape(value,required,optional=[]){
 check(value&&typeof value==='object'&&!Array.isArray(value),'MALFORMED_OWNER_EXPORT');
 check(required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k)),'OWNER_EXPORT_FIELDS_REJECTED');
}
export function assertOwnerQuery(bytes=read(fileURLToPath(OWNER_QUERY_URL))){
 check(hash(bytes)===OWNER_QUERY_SHA256&&SPEC.ownerExport?.querySha256===OWNER_QUERY_SHA256,'OWNER_QUERY_CHANGED_REVIEW_REQUIRED');return OWNER_QUERY_SHA256;
}
// Reject duplicate JSON keys before JSON.parse can silently discard an earlier value.
export function strictJson(text){
 let i=0;function ws(){while(/\s/.test(text[i]??'')&&i<text.length)i++;}
 function string(){const start=i;check(text[i++]==='"','MALFORMED_OWNER_EXPORT');while(i<text.length){const c=text[i++];if(c==='"')return JSON.parse(text.slice(start,i));if(c==='\\')i++;}check(false,'MALFORMED_OWNER_EXPORT');}
 function value(){ws();const c=text[i];if(c==='{'||c==='['){i++;ws();const object=c==='{',end=object?'}':']',keys=new Set();if(text[i]===end){i++;return;}while(true){if(object){ws();const k=string();check(!keys.has(k),'DUPLICATE_JSON_KEY');keys.add(k);ws();check(text[i++]===':','MALFORMED_OWNER_EXPORT');}value();ws();if(text[i]===end){i++;break;}check(text[i++]===',','MALFORMED_OWNER_EXPORT');}return;}
 if(c==='"'){string();return;}const m=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));check(m,'MALFORMED_OWNER_EXPORT');i+=m[0].length;}
 try{value();ws();check(i===text.length,'MALFORMED_OWNER_EXPORT');return JSON.parse(text);}catch(e){if(e?.code)throw e;check(false,'MALFORMED_OWNER_EXPORT');}
}
export function validateScope(scope){
 shape(scope,['deployment_id','operations']);check(scope.deployment_id===SPEC.deployment,'WRONG_DEPLOYMENT');
 check(Array.isArray(scope.operations)&&scope.operations.length>0&&scope.operations.length<=15,'INVALID_OWNER_EXPORT_SCOPE');
 for(const op of scope.operations){shape(op,['operation_id','transaction_hash','command','battery_id']);check(uuid.test(op.operation_id)&&hex.test(op.transaction_hash)&&SPEC.methods.includes(op.command)&&/^[A-Z0-9-]{1,32}$/.test(op.battery_id),'INVALID_OWNER_EXPORT_SCOPE');}
 check(new Set(scope.operations.map(x=>x.operation_id)).size===scope.operations.length&&new Set(scope.operations.map(x=>x.transaction_hash)).size===scope.operations.length,'DUPLICATE_OPERATION');return scope;
}
function confirm(c){
 shape(c,['transactionHash','observationLedger','confirmationLedger','resultXdr','resultMetaXdr','events','sorobanResult','correlationId'],['confirmedAt','facts']);
 check(hex.test(c.transactionHash)&&uuid.test(c.correlationId)&&Number.isSafeInteger(c.confirmationLedger)&&c.confirmationLedger>0&&Number.isSafeInteger(c.observationLedger)&&c.observationLedger>=c.confirmationLedger,'INVALID_OWNER_CONFIRMATION');
 decodedXdr('TransactionResult',c.resultXdr);decodedXdr('TransactionMeta',c.resultMetaXdr);
 check(Array.isArray(c.events),'INVALID_EVENT_LIST');for(const e of c.events)decodedXdr('ContractEvent',e);
 if(c.sorobanResult!==null)decodedXdr('ScVal',c.sorobanResult);
 if(c.facts){shape(c.facts,['battery','request','stateReadLedger'],['reward']);shape(c.facts.battery,['state','registrationHash','requestId','collector','collectionHash','recycler','recyclingHash','rewardState']);if(c.facts.request)shape(c.facts.request,['batteryId','recipient','state']);if(c.facts.reward)shape(c.facts.reward,['recipient','token','amount']);check(Number.isSafeInteger(c.facts.stateReadLedger)&&c.facts.stateReadLedger>=c.confirmationLedger,'INVALID_OWNER_CONFIRMATION');}
}
export function parseOwnerExport(raw,expectedHash,scope){
 assertOwnerQuery();validateScope(scope);check(Buffer.isBuffer(raw)&&hex.test(expectedHash??'')&&hash(raw)===expectedHash,'OWNER_EXPORT_FILE_HASH_MISMATCH');scanRaw(raw);
 const data=strictJson(raw.toString('utf8'));shape(data,['schema','metadata','rows']);check(data.schema==='BYETERY_OWNER_EXPORT_V1','MALFORMED_OWNER_EXPORT');
 const m=data.metadata;shape(m,['query_sha256','export_time','deployment_id','database','project_ref','business_execution_sha','transaction_read_only','requested_operation_ids']);
 check(m.query_sha256===OWNER_QUERY_SHA256,'WRONG_OWNER_QUERY_HASH');check(m.deployment_id===SPEC.deployment,'WRONG_DEPLOYMENT');
 check(m.database==='SUPABASE_DEV'&&m.project_ref==='aemxuqnnwfclzrwwiqfd'&&m.business_execution_sha===SPEC.businessSha&&m.transaction_read_only==='on','UNVERIFIED_OWNER_EXPORT_PROVENANCE');
 check(typeof m.export_time==='string'&&Number.isFinite(Date.parse(m.export_time)),'MISSING_PROVENANCE');
 const requested=scope.operations.map(x=>x.operation_id).sort();check(canonical(m.requested_operation_ids)===canonical(requested),'UNRELATED_OPERATION');
 check(Array.isArray(data.rows)&&data.rows.length===requested.length&&data.rows.length<=15,'OWNER_EXPORT_ROWS_MISSING');
 check(new Set(data.rows.map(x=>x.operation_id)).size===data.rows.length,'DUPLICATE_OPERATION');
 check(canonical(data.rows.map(x=>x.operation_id))===canonical(requested),'OWNER_EXPORT_ROW_ORDER');
 for(const row of data.rows){
  shape(row,['deployment_id','operation_id','battery_id','command','source_account','state','durable_state','logical_state','confirmation','state_evidence','envelope','terminal_evidence']);
  check(row.deployment_id===SPEC.deployment,'WRONG_DEPLOYMENT');const target=scope.operations.find(x=>x.operation_id===row.operation_id);check(target,'UNRELATED_OPERATION');
  check(row.battery_id===target.battery_id&&row.command===target.command,'OWNER_OPERATION_MAPPING_MISMATCH');
  check(['CONFIRMED_SUCCESS','CONFIRMED_FAILED'].includes(row.state),'UNEXPECTED_OPERATION_STATE');
  check(row.state==='CONFIRMED_SUCCESS'?(row.durable_state==='PROJECTED'?row.logical_state==='CONFIRMED':row.durable_state==='CONFIRMED_SUCCESS'&&['CONFIRMED','SUBMITTED','UNKNOWN','READY'].includes(row.logical_state)):row.durable_state==='CONFIRMED_FAILED'&&row.logical_state==='REJECTED','INCONSISTENT_OPERATION_STATE');
  check(row.confirmation,'MISSING_CONFIRMATION');confirm(row.confirmation);
  const env=row.envelope;shape(env,['transaction_hash','signed_envelope','network_id','contract_address']);
  check(env.transaction_hash===target.transaction_hash&&row.confirmation.transactionHash===target.transaction_hash&&row.confirmation.correlationId===row.operation_id,'OWNER_OPERATION_MAPPING_MISMATCH');
  assertTestnetNetwork(SPEC.network,env.network_id);check(env.contract_address===SPEC.contract&&Object.values(SPEC.actors).includes(row.source_account),'OWNER_ENVELOPE_IDENTITY_MISMATCH');decodedXdr('TransactionEnvelope',env.signed_envelope);
  if(row.state_evidence!==null){shape(row.state_evidence,['outcome','stateReadLedger','evidence','correlationId']);check(row.state_evidence.correlationId===row.operation_id&&Number.isSafeInteger(row.state_evidence.stateReadLedger)&&typeof row.state_evidence.evidence==='string','INVALID_STATE_EVIDENCE');}
  const list=row.terminal_evidence;check(Array.isArray(list)&&list.length>0&&list.length<=64,'MISSING_TERMINAL_EVIDENCE');
  for(const t of list){shape(t,['kind','evidence','observation_ledger','confirmation_ledger','state_read_ledger']);check(t.kind===(row.state==='CONFIRMED_SUCCESS'?'SUCCESS':'FAILED'),'INCONSISTENT_TERMINAL_EVIDENCE');confirm(t.evidence);check(canonical(t.evidence)===canonical(row.confirmation)&&t.confirmation_ledger===row.confirmation.confirmationLedger&&t.observation_ledger===row.confirmation.observationLedger&&t.state_read_ledger===null,'TERMINAL_EVIDENCE_MISMATCH');}
 }
 return {data,fileSha256:expectedHash,provenance:{source:'OWNER_READONLY_EXPORT',observedAt:m.export_time,querySha256:m.query_sha256,fileSha256:expectedHash,assertion:'OWNER_ASSERTED_READONLY_EXPORT_NOT_SERVER_ATTESTED'}};
}
export function compareOwnerExport(parsed,observations){
 check(observations.length===parsed.data.rows.length,'CHAIN_EXPORT_SCOPE_MISMATCH');const verified=[];
 for(const row of parsed.data.rows){
  const d=observations.find(d=>d.expected.hash===row.envelope.transaction_hash);check(d,'CHAIN_EXPORT_SCOPE_MISMATCH');
  // Failed receipts remain diagnostics/retired; never make them eligible for a new run or handoff.
  check(row.state==='CONFIRMED_SUCCESS'&&d.rpc.status==='SUCCESS','FAILED_OPERATION_REQUIRES_REVIEW');
  check(row.command===d.expected.method&&row.battery_id===d.expected.batteryId,'CHAIN_EXPORT_SCOPE_MISMATCH');
  sameDecodedXdr('TransactionEnvelope',row.envelope.signed_envelope,d.rpc.envelopeXdr);
  const sql={operation_id:row.operation_id,command:row.command,battery_id:row.battery_id,confirmation:row.confirmation,success_evidence:row.terminal_evidence[0].evidence};
  const result=verifyTx({...d,sql,sqlProvenance:parsed.provenance});check(result.id.source===row.source_account,'OWNER_ENVELOPE_IDENTITY_MISMATCH');
  let stateEvidenceStatus='NOT_PRESENT';
  if(row.state_evidence!==null){const e=row.state_evidence;check(['APPLIED','NOT_APPLIED','UNRESOLVED'].includes(e.outcome),'INVALID_STATE_EVIDENCE');
   const payload=strictJson(e.evidence);scanRaw(bytes(payload));
   if(e.outcome==='APPLIED'){
    shape(payload,['predicate','matched','paymentProofRequired','entryStatus','facts']);shape(payload.facts,['battery','request','stateReadLedger']);
    check(row.command!=='pay_reward'&&payload.predicate===row.command&&payload.matched===true&&payload.paymentProofRequired===false&&Array.isArray(payload.entryStatus)&&payload.entryStatus.length>0&&payload.entryStatus.every(s=>s==='LIVE'),'STATE_EVIDENCE_RPC_MISMATCH');
    check(Number.isSafeInteger(payload.facts.stateReadLedger)&&payload.facts.stateReadLedger>=d.rpc.ledger&&e.stateReadLedger>=payload.facts.stateReadLedger,'STATE_EVIDENCE_RPC_MISMATCH');
    for(const name of ['battery','request'])if(result.meta.after[name])check(canonical(payload.facts[name])===canonical(result.meta.after[name]),'STATE_EVIDENCE_RPC_MISMATCH',{field:'state_evidence.facts.'+name});
    stateEvidenceStatus='APPLIED_FACTS_COMPARED_TO_CAPTURED_META';
   }else{check(payload&&payload.predicate===row.command,'INVALID_STATE_EVIDENCE');stateEvidenceStatus='HISTORICAL_NON_SUCCESS_ASSERTION_NOT_USED_AS_CONFIRMATION';}
  }
  verified.push({operationId:row.operation_id,transactionHash:row.envelope.transaction_hash,command:row.command,batteryId:row.battery_id,status:'PASS',factsReadLedger:result.sqlStatus.factsReadLedger,stateEvidenceStatus,stateEvidenceSha256:row.state_evidence===null?null:hash(bytes(row.state_evidence))});
 }
 return {status:'SQL_INTEGRITY_PASS',querySha256:OWNER_QUERY_SHA256,exportFileSha256:parsed.fileSha256,provenance:parsed.provenance,rows:verified,ownerExportAssertionOnly:true};
}
// Read an already frozen portable chain bundle; no network or SQL access.
export function observationsFromBundle(dir,inventory){return inventory.summary.steps.filter(s=>s.confirmed).map((s,i)=>{
 const prefix=String(i+1).padStart(2,'0')+'-'+s.method;const load=n=>json(resolve(dir,prefix,n));const tx=load('transaction.json');
 const rl=load('rpc-ledger.json');return {network:{passphrase:tx.networkPassphrase,networkId:tx.networkId},rpc:load('rpc-transaction.json'),horizon:load('horizon-transaction.json'),horizonLedger:load('horizon-ledger.json'),rpcLedger:rl?.status==='NOT_CAPTURED'?null:rl,expected:tx.expected,provenance:{source:'LOCAL_HISTORICAL',observedAt:inventory.artifacts.find(x=>x.path===prefix+'/rpc-transaction.json').observedAt}};
 });}
