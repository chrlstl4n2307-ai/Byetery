import { writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve,relative,isAbsolute } from 'node:path';
import { canonical } from '../application/validation.ts';
import { verifyEvidenceV1 } from '../evidence-verifier.ts';
import type { BatteryState,RewardState } from '../domain.ts';
import type { ConfirmationMode } from './operation-polling.ts';
import { ACTORS,AMOUNT,CONTRACT,ISSUER,NETWORK_ID,OPERATIONS,TOKEN,WASM,check,hash,noSecrets,obj,plan,sha, type Operation,type PlanInput } from './model.ts';
export interface State {lifecycle:BatteryState|null;reward:RewardState|null}
export interface OperationEvidence {operation:Operation;operationId:string;transactionHash:string|null;ledger:number|null;timestamp:string|null;result:'SUCCESS'|'FAILED'|'UNKNOWN'|'NOT_SUBMITTED';before:State;after:State;requestId:string|null;source:string;authorizers:string[];confirmationMode?:ConfirmationMode|'RECONCILED_SAME_HASH'|'NOT_CONFIRMED'}
export interface IntegrityRecord {kind:'REGISTRATION'|'COLLECTION'|'RECYCLING';revision:number;manifestBase64:string;payloadHash:string;commitment:string}
export interface RewardEvidence {recipient:string;assetCode:'GREENTEST';issuer:string;sac:string;amountBaseUnits:string;recipientBefore:string;recipientAfter:string;payerBefore:string;payerAfter:string;stateBefore:'PENDING';stateAfter:'SENT';successfulPayments:number;receiptMatched:boolean;transferMatched:boolean;beforeLedger:number;afterLedger:number;otherActivity:boolean}
export interface RecoveryEvidence {uncertainResponse:boolean;originalHash:string|null;reconciledHash:string|null;result:'NOT_ENCOUNTERED'|'UNRESOLVED'|'SUCCESS';identityCount:number;broadcastCount:number}
export interface RawRunEvidence {source:'OFFLINE_MOCK'|'TESTNET';operations:OperationEvidence[];records:IntegrityRecord[];reward:RewardEvidence|null;recovery:RecoveryEvidence}
function state(value:unknown):asserts value is State{
 const s=obj(value,['lifecycle','reward']);check([null,'REGISTERED','RETURNED','COLLECTED','RECYCLED'].includes(s.lifecycle as null)&&[null,'NOT_ELIGIBLE','PENDING','SENT'].includes(s.reward as null),'InvalidState');
}
function units(v:unknown):asserts v is string {check(typeof v==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(v),'InvalidBaseUnits');}
function safeId(v:unknown){check(typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v),'InvalidOperationId');}
function recovery(value:unknown,ops:OperationEvidence[],source:unknown){
 const r=obj(value,['uncertainResponse','originalHash','reconciledHash','result','identityCount','broadcastCount']);
 check(typeof r.uncertainResponse==='boolean'&&['NOT_ENCOUNTERED','UNRESOLVED','SUCCESS'].includes(r.result as string),'InvalidRecovery');
 check(Number.isSafeInteger(r.identityCount)&&Number(r.identityCount)>=0&&Number(r.identityCount)<=1&&Number.isSafeInteger(r.broadcastCount)&&Number(r.broadcastCount)>=0&&Number(r.broadcastCount)<=1,'DuplicateRecoveryIdentity');
 for(const h of [r.originalHash,r.reconciledHash])if(h!==null)hash(h);
 if(r.uncertainResponse){
  if(source==='OFFLINE_MOCK')check(r.originalHash===null&&r.reconciledHash===null&&r.identityCount===1&&r.broadcastCount===0,'MockCannotClaimTestnetReceipt');
  else {check(r.originalHash!==null&&r.identityCount===1&&r.broadcastCount===1,'RecoveryIdentityMissing');
   if(r.result==='SUCCESS')check(r.originalHash===r.reconciledHash&&ops.some(o=>o.transactionHash===r.originalHash&&o.result==='SUCCESS'),'RecoveryIdentityMismatch');}
 }
 if(!r.uncertainResponse)check(r.result==='NOT_ENCOUNTERED'&&r.originalHash===null&&r.reconciledHash===null,'InvalidRecovery');
 return r as unknown as RecoveryEvidence;
}
// A successor must reference a verified prior snapshot and preserve its full prefix.
export function exportManifest(input:PlanInput,runId:string,raw:unknown,previous?:ManifestSnapshot){
 const p=plan(input),run=p.input.runs.find(r=>r.runId===runId);check(run&&run.recipient,'RecipientDecisionRequired');
 const v=obj(raw,['source','operations','records','reward','recovery']);check(v.source==='OFFLINE_MOCK'||v.source==='TESTNET','InvalidEvidenceSource');
 check(Array.isArray(v.operations)&&v.operations.length<=OPERATIONS.length,'InvalidOperationEvidence');
 const ops:OperationEvidence[]=v.operations.map((value,i)=>{
  const o=obj(value,['operation','operationId','transactionHash','ledger','timestamp','result','before','after','requestId','source','authorizers','confirmationMode']);
  check(OPERATIONS[i]===o.operation,'OperationOrderOrDuplicate');safeId(o.operationId);state(o.before);state(o.after);
  check(['SUCCESS','FAILED','UNKNOWN','NOT_SUBMITTED'].includes(o.result as string),'InvalidResult');
  if(o.requestId!==null)hash(o.requestId);check(i!==0||o.requestId===null,'RegistrationRequestNotApplicable');
  const source=i===0?ACTORS.admin:i===3?ACTORS.recycler:ACTORS.service;
  const auth=i===2?[ACTORS.service,ACTORS.collector]:[source];
  check(o.source===source&&Array.isArray(o.authorizers)&&canonical([...o.authorizers].sort())===canonical([...auth].sort()),'AuthorizerMismatch');
  if(o.transactionHash!==null)hash(o.transactionHash);
  if(v.source==='OFFLINE_MOCK')check(o.transactionHash===null&&o.ledger===null&&o.timestamp===null,'MockCannotClaimTestnetReceipt');
  if(v.source==='TESTNET'&&['SUCCESS','FAILED'].includes(o.result as string))check(o.transactionHash!==null&&Number.isSafeInteger(o.ledger)&&Number(o.ledger)>0,'ConfirmedReferenceRequired');
  if(['UNKNOWN','NOT_SUBMITTED'].includes(o.result as string))check(o.ledger===null,'UnconfirmedLedger');
  if(o.result==='NOT_SUBMITTED')check(o.transactionHash===null,'UnsubmittedHash');
  if(o.timestamp!==null)check(typeof o.timestamp==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(o.timestamp)&&Number.isFinite(Date.parse(o.timestamp)),'InvalidTimestamp');
  const terminal=o.result==='SUCCESS'||o.result==='FAILED';
  return {...structuredClone(o),confirmationMode:o.confirmationMode??(terminal?'OBSERVED':'NOT_CONFIRMED')} as unknown as OperationEvidence;
 });
 check(new Set(ops.map(o=>o.operationId)).size===ops.length,'DuplicateOperation');
 const hashes=ops.flatMap(o=>o.transactionHash?[o.transactionHash]:[]);check(new Set(hashes).size===hashes.length,'DuplicateTransaction');
 for(let i=1;i<ops.length;i++)check(ops[i-1].result==='SUCCESS'&&canonical(ops[i].before)===canonical(ops[i-1].after),'LifecycleContinuity');
 const requests=ops.filter(o=>o.operation!=='register_battery').map(o=>o.requestId);check(requests.every(r=>r!==null)&&new Set(requests).size<=1,'RequestContextMismatch');
 const rid=requests[0]??null;
 check(Array.isArray(v.records)&&v.records.length<=3,'InvalidRecords');
 const records=v.records.map(value=>{
  const r=obj(value,['kind','revision','manifestBase64','payloadHash','commitment']);
  check(['REGISTRATION','COLLECTION','RECYCLING'].includes(r.kind as string)&&r.revision===1,'InvalidRecordVersion');hash(r.payloadHash);hash(r.commitment);
  check(typeof r.manifestBase64==='string'&&r.manifestBase64.length>0&&r.manifestBase64.length<=21848,'InvalidDisclosure');
  const b=Buffer.from(r.manifestBase64,'base64');check(b.length>0&&b.length<=16384&&b.toString('base64')===r.manifestBase64,'InvalidDisclosure');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(b);noSecrets(text);check(sha(b)===r.payloadHash,'PayloadHashMismatch');
  const decoded=JSON.parse(text) as Record<string,unknown>;check(decoded?.batteryId===run.batteryId,'EvidenceBatteryMismatch');
  let computed:string;
  if(r.kind==='REGISTRATION')computed=sha(b);
  else{
   check(rid&&decoded.requestId===rid&&decoded.kind===r.kind,'EvidenceContextMismatch');
   const result=verifyEvidenceV1({version:1,domain:'BYETERY_EVIDENCE_V1',networkId:NETWORK_ID,contractAddress:CONTRACT,batteryId:run.batteryId,requestId:rid,kind:r.kind as 'COLLECTION'|'RECYCLING',manifestBytes:b,expectedCommitment:r.commitment});
   check(result.status==='VERIFIED','CommitmentMismatch');computed=result.computedCommitment!;
  }
  check(computed===r.commitment,'CommitmentMismatch');return {...r as unknown as IntegrityRecord,recomputedCommitment:computed,match:true};
 });
 check(new Set(records.map(r=>r.kind)).size===records.length,'DuplicateRecord');
 let reward:RewardEvidence|null=null;
 if(v.reward!==null){
  const r=obj(v.reward,['recipient','assetCode','issuer','sac','amountBaseUnits','recipientBefore','recipientAfter','payerBefore','payerAfter','stateBefore','stateAfter','successfulPayments','receiptMatched','transferMatched','beforeLedger','afterLedger','otherActivity']);
  check(r.recipient===run.recipient,'RewardRecipientMismatch');check(r.assetCode==='GREENTEST'&&r.issuer===ISSUER&&r.sac===TOKEN,'AssetMismatch');check(r.amountBaseUnits===AMOUNT,'RewardAmountMismatch');
  for(const n of [r.recipientBefore,r.recipientAfter,r.payerBefore,r.payerAfter])units(n);
  check(BigInt(r.recipientAfter as string)-BigInt(r.recipientBefore as string)===BigInt(AMOUNT)&&BigInt(r.payerBefore as string)-BigInt(r.payerAfter as string)===BigInt(AMOUNT),'BalanceCorrelationMismatch');
  check(r.stateBefore==='PENDING'&&r.stateAfter==='SENT'&&r.successfulPayments===1,'DuplicateOrIneligibleReward');
  check(r.receiptMatched===true&&r.transferMatched===true&&r.otherActivity===false,'RewardProofOrActivityUnresolved');
  if(v.source==='TESTNET')check(Number.isSafeInteger(r.beforeLedger)&&Number(r.beforeLedger)>0&&Number.isSafeInteger(r.afterLedger)&&Number(r.afterLedger)>=Number(r.beforeLedger),'BalanceObservationMissing');
  else check(r.beforeLedger===0&&r.afterLedger===0,'MockCannotClaimTestnetReceipt');
  const pay=ops.at(-1);check(pay?.operation==='pay_reward'&&pay.result==='SUCCESS'&&pay.source===ACTORS.service&&pay.before.lifecycle==='RECYCLED'&&pay.before.reward==='PENDING'&&pay.after.lifecycle==='RECYCLED'&&pay.after.reward==='SENT','SentWithoutSuccessfulPayment');
  if(v.source==='TESTNET')check(Number(r.beforeLedger)<=pay.ledger!&&pay.ledger!<=Number(r.afterLedger),'PaymentOutsideBalanceObservations');
  check(ops[3]?.result==='SUCCESS'&&ops[3].after.reward==='PENDING'&&ops[3].after.lifecycle==='RECYCLED','RecyclingMustLeavePending');
  reward=structuredClone(r) as unknown as RewardEvidence;
 }
 check(!ops.some(o=>o.after.reward==='SENT')||reward!==null,'SentWithoutSuccessfulPayment');
 for(const op of ops){
  const terminal=op.result==='SUCCESS'||op.result==='FAILED';
  check(terminal
    ? op.confirmationMode==='OBSERVED'||(v.source==='TESTNET'&&(op.confirmationMode==='RECONCILED_AFTER_OBSERVATION_EXPIRY'||op.confirmationMode==='RECONCILED_SAME_HASH'))
    : op.confirmationMode==='NOT_CONFIRMED','InvalidConfirmationMode');
 }
 const rec=recovery(v.recovery,ops,v.source);check(!reward||rec.result!=='UNRESOLVED','UncertaintyNotReconciled');
 // Legacy summaries are still readable input; do not infer that they expired
 // the local window unless the observer explicitly recorded that fact.
 if(v.source==='TESTNET'&&rec.result==='SUCCESS'){
  const op=ops.find(o=>o.transactionHash===rec.originalHash)!;
  if(op.confirmationMode==='OBSERVED')op.confirmationMode='RECONCILED_SAME_HASH';
 }
 check(ops.every(op=>op.confirmationMode!=='RECONCILED_SAME_HASH'||(v.source==='TESTNET'&&rec.result==='SUCCESS'&&
  op.transactionHash===rec.originalHash&&op.result==='SUCCESS')),'RecoveryIdentityMismatch');
 const complete=ops.length===5&&ops.every(o=>o.result==='SUCCESS')&&reward!==null;
 if(complete)check(records.length===3,'CompletedRunMissingRecords');
 const body={schemaVersion:'BYETERY_D3_RUN_V2' as const,runId:run.runId,batteryId:run.batteryId,requestId:rid,gitSha:p.input.gitSha,network:'TESTNET',networkId:NETWORK_ID,contractId:CONTRACT,wasmSha256:WASM,source:v.source,
  evidenceClass:v.source==='OFFLINE_MOCK'?'LOCAL_OFFLINE_FIXTURE_NOT_D3_COMPLETION':'DECLARED_TESTNET_EVIDENCE_REQUIRES_INDEPENDENT_REVIEW',
  validationScope:'OFFLINE_CONSISTENCY_ONLY',complete,actors:{USER:run.recipient,ADMIN:ACTORS.admin,SERVICE:ACTORS.service,COLLECTOR:ACTORS.collector,RECYCLER:ACTORS.recycler,rewardRecipient:run.recipient},operations:ops,previousManifestSha256:previous?.integrityRelevantSha256??null,records:records.sort((a,b)=>String(a.kind).localeCompare(String(b.kind))),reward,recovery:rec,planHash:p.planHash,
  claimLimit:'Digital evidence does not independently prove physical recycling'};
 if(previous)validateAppend(previous,body);
 const content=canonical(body);noSecrets(content);return {...body,integrityRelevantSha256:sha(content)};
}
interface ManifestSnapshot {
 schemaVersion:'BYETERY_D3_RUN_V2';runId:string;batteryId:string;gitSha:string;planHash:string;source:string;
 complete:boolean;operations:OperationEvidence[];records:IntegrityRecord[];reward:RewardEvidence|null;
 recovery:RecoveryEvidence;integrityRelevantSha256:string;
}
function validateAppend(previous:ManifestSnapshot,next:Omit<ManifestSnapshot,'integrityRelevantSha256'>){
 const {integrityRelevantSha256,...body}=previous;
 check(sha(canonical(body))===integrityRelevantSha256,'PreviousManifestIntegrityMismatch');
 check(previous.schemaVersion===next.schemaVersion&&previous.runId===next.runId&&previous.batteryId===next.batteryId&&
  previous.planHash===next.planHash&&previous.gitSha===next.gitSha&&previous.source===next.source,'ManifestLineageMismatch');
 check(!previous.complete&&previous.operations.length<next.operations.length,'ManifestAppendRequired');
 check(canonical(previous.operations)===canonical(next.operations.slice(0,previous.operations.length)),'HistoricalOperationChanged');
 check(previous.records.every(r=>next.records.some(candidate=>canonical(candidate)===canonical(r))),'HistoricalRecordChanged');
 check(!previous.reward||canonical(previous.reward)===canonical(next.reward),'HistoricalRewardChanged');
 check(previous.recovery.result==='NOT_ENCOUNTERED'||canonical(previous.recovery)===canonical(next.recovery),'HistoricalRecoveryChanged');
}
export async function writeManifest(directory:string,manifest:ReturnType<typeof exportManifest>){
 obj(manifest,['schemaVersion','runId','batteryId','requestId','gitSha','network','networkId','contractId','wasmSha256','source','evidenceClass','validationScope','complete','actors','operations','records','reward','recovery','planHash','previousManifestSha256','claimLimit','integrityRelevantSha256']);
 const {integrityRelevantSha256,...body}=manifest;check(sha(canonical(body))===integrityRelevantSha256,'ManifestChangedAfterValidation');noSecrets(canonical(manifest));
 check(/^RUN[123]$/.test(manifest.runId),'InvalidRunId');
 await mkdir(directory,{recursive:true});const root=await realpath(directory);const file=resolve(root,manifest.runId+'.json');
 check(!isAbsolute(relative(root,file))&&!relative(root,file).startsWith('..'),'OutputOutsideDirectory');
 // Atomic create: even an identical regeneration cannot overwrite completed evidence.
 await writeFile(file,canonical(manifest)+'\n',{flag:'wx',mode:0o600});return file;
}
