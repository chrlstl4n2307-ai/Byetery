import {openSync,writeSync,fsyncSync,closeSync,readFileSync,existsSync,mkdirSync,unlinkSync,lstatSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT,check,digest,canonical,clean,sequence,isHash,creationManifest,local} from './core.mjs';
import {inspectMaintenanceEnvelope,expiredNotIncluded} from './chain.mjs';

const lockHandles=new WeakMap();
const actions=['INITIALIZED','BUSINESS_SNAPSHOT_OBSERVED','SIMULATION_RESERVED','SIMULATION_COMPLETED','SIMULATION_ABORTED','FEE_CAP_STOP','EXTEND_RESERVED','SIGNING_OBSERVED','CONFIRMED_SUCCESS','CONFIRMED_FAILED','UNCERTAIN','EXPIRED_NOT_INCLUDED','EXPIRED_UNRESOLVED','REJECTED_AFTER_SIGNING'];
const id=v=>typeof v==='string'&&/^[A-Za-z0-9-]{1,100}$/.test(v);
export const recordHash=record=>{const {recordHash:ignored,...rest}=record;return digest(rest);};
export const checkpoint=records=>({recordCount:records.length,lastRecordHash:records.at(-1)?.recordHash??null});
const empty=creation=>({businessRemaining:15,simulationsUsed:0,extendAttemptsUsed:0,includedExtendsCount:0,sequenceObserved:creation.S0,stopped:false,attempts:[]});
const snapshot=s=>({businessRemaining:s.businessRemaining,simulationsUsed:s.simulationsUsed,extendAttemptsUsed:s.extendAttemptsUsed,includedExtendsCount:s.includedExtendsCount,sequenceObserved:s.sequenceObserved});
function transition(previous,event,creation){const s=structuredClone(previous),d=event.detail??{};check(actions.includes(event.action),'UNKNOWN_OR_RELEASE_ACTION_FORBIDDEN');check(d.retry!==true&&d.replacement!==true&&d.rebroadcast!==true,'RETRY_REPLACEMENT_REBROADCAST_FORBIDDEN');
 if(event.action==='INITIALIZED'){check(event.index===0&&event.status==='INITIALIZED','JOURNAL_GENESIS_REQUIRED');return s;}
 if(event.action==='BUSINESS_SNAPSHOT_OBSERVED'){check(Number.isInteger(d.businessRemaining)&&d.businessRemaining>=0&&d.businessRemaining<=s.businessRemaining&&d.businessConsumed+d.businessRemaining===18&&isHash(d.reviewedBusinessBundleHash)&&isHash(event.ownerGateRef),'BUSINESS_SNAPSHOT_INVALID');s.businessRemaining=d.businessRemaining;return s;}
 let a=s.attempts.find(a=>a.simulationReservationId===event.simulationReservationId);
 if(event.action==='SIMULATION_RESERVED'){
  check(!s.stopped&&s.attempts.every(a=>a.status==='CONFIRMED_SUCCESS'),'OWNER_REVIEW_STOP');check(s.simulationsUsed<3,'SIMULATION_CAP_EXHAUSTED');
  check(id(event.simulationReservationId)&&event.extendReservationId===null&&isHash(event.scopeHash)&&isHash(event.ownerGateRef)&&Array.isArray(event.runIds)&&event.runIds.length>0&&event.runIds.length<=3&&new Set(event.runIds).size===event.runIds.length&&event.runIds.every(r=>/^RUN[123]$/.test(r)),'OWNER_GATE_AND_RUN_SCOPE_REQUIRED');
  check(!a&&!s.attempts.some(p=>p.scopeHash===event.scopeHash||p.ownerGateRef===event.ownerGateRef||p.runIds.some(r=>event.runIds.includes(r))),'RETRY_REPLACEMENT_REBROADCAST_FORBIDDEN');
  a={simulationReservationId:event.simulationReservationId,extendReservationId:null,scopeHash:event.scopeHash,ownerGateRef:event.ownerGateRef,runIds:event.runIds,status:'SIMULATION_RESERVED',transactionHash:null,intent:null};s.attempts.push(a);s.simulationsUsed++;return s;
 }
 check(a&&canonical(a.runIds)===canonical(event.runIds)&&a.scopeHash===event.scopeHash&&a.ownerGateRef===event.ownerGateRef,'RESERVATION_BEFORE_EFFECT_REQUIRED');
 if(event.action==='SIMULATION_COMPLETED'){check(a.status==='SIMULATION_RESERVED'&&event.status==='SIMULATION_COMPLETED','RESERVATION_BEFORE_EFFECT_REQUIRED');a.status='SIMULATION_COMPLETED';}
 else if(['SIMULATION_ABORTED','FEE_CAP_STOP'].includes(event.action)){check(['SIMULATION_RESERVED','SIMULATION_COMPLETED'].includes(a.status)&&a.extendReservationId===null,'INVALID_ATTEMPT_TRANSITION');a.status=event.action;s.stopped=true;}
 else if(event.action==='EXTEND_RESERVED'){
  check(!s.stopped&&a.status==='SIMULATION_COMPLETED'&&s.extendAttemptsUsed<3&&id(event.extendReservationId)&&!s.attempts.some(p=>p.extendReservationId===event.extendReservationId),'EXTEND_RESERVATION_REQUIRED');
  check(isHash(event.transactionHash)&&d.intent?.transactionHash===event.transactionHash&&d.intent.seqNum===(sequence(s.sequenceObserved)+1n).toString(),'SEQUENCE_OR_IDENTITY_DRIFT');const shape=inspectMaintenanceEnvelope(d.intent.envelopeXdr,creation,d.intent);check(Number.isSafeInteger(d.intent.maxTime)&&shape.maxTime===d.intent.maxTime&&Number.isSafeInteger(d.intent.firstPossibleLedger),'EXTEND_INTENT_REQUIRED');
  a.extendReservationId=event.extendReservationId;a.transactionHash=event.transactionHash;a.intent=d.intent;a.status='EXTEND_RESERVED';s.extendAttemptsUsed++;
 }else{
  check(a.extendReservationId&&a.extendReservationId===event.extendReservationId&&a.transactionHash===event.transactionHash,'EXTEND_RESERVED_BEFORE_SIGNING_REQUIRED');
  if(event.action==='SIGNING_OBSERVED'){check(!s.stopped&&a.status==='EXTEND_RESERVED','EXTEND_RESERVED_BEFORE_SIGNING_REQUIRED');a.status='SIGNING_OBSERVED';}
  else if(['CONFIRMED_SUCCESS','CONFIRMED_FAILED'].includes(event.action)){
   check(['EXTEND_RESERVED','SIGNING_OBSERVED','UNCERTAIN'].includes(a.status)&&d.included===true&&Number.isSafeInteger(d.confirmationLedger)&&d.confirmationLedger>=a.intent.firstPossibleLedger&&d.seqNum===a.intent.seqNum&&d.seqNum===(sequence(s.sequenceObserved)+1n).toString(),'INCLUDED_TRANSACTION_PROOF_REQUIRED');a.status=event.action;s.sequenceObserved=d.seqNum;s.includedExtendsCount++;if(event.action==='CONFIRMED_FAILED')s.stopped=true;
  }else if(event.action==='EXPIRED_NOT_INCLUDED'){check(['EXTEND_RESERVED','SIGNING_OBSERVED','UNCERTAIN'].includes(a.status),'INVALID_ATTEMPT_TRANSITION');expiredNotIncluded(d.proof,a.intent);a.status=event.action;s.stopped=true;}
  else{check(['UNCERTAIN','EXPIRED_UNRESOLVED','REJECTED_AFTER_SIGNING'].includes(event.action)&&['EXTEND_RESERVED','SIGNING_OBSERVED','UNCERTAIN'].includes(a.status),'INVALID_ATTEMPT_TRANSITION');a.status=event.action;s.stopped=true;}
 }
 return s;
}
export function reconstruct(records,creation,trustedCheckpoint,claims){creationManifest(creation);clean(records);check(Array.isArray(records)&&records.length>0&&trustedCheckpoint&&trustedCheckpoint.recordCount===records.length&&trustedCheckpoint.lastRecordHash===records.at(-1)?.recordHash,'JOURNAL_CHECKPOINT_MISMATCH');check(records[0].action==='INITIALIZED','JOURNAL_GENESIS_REQUIRED');let state=empty(creation),previousHash=null,lastTime=-1;const ids=new Set();
 for(const [index,r] of records.entries()){
  check(id(r.recordId)&&!ids.has(r.recordId),'DUPLICATE_RECORD_ID');ids.add(r.recordId);check(r.index===index&&r.previousRecordHash===previousHash&&r.recordHash===recordHash(r),'BROKEN_APPEND_ONLY_HASH_CHAIN');check(r.S0===creation.S0&&r.networkId===creation.networkId&&r.creationManifestHash===digest(creation)&&canonical(r.toolingIdentities)===canonical(creation.identities),'JOURNAL_CONTEXT_MISMATCH');const time=Date.parse(r.timestamp);check(Number.isFinite(time)&&time>=lastTime,'JOURNAL_TIMESTAMP_REORDERED');lastTime=time;
  state=transition(state,r,creation);check(r.status===r.action&&canonical(snapshot(state))===canonical({businessRemaining:r.businessRemaining,simulationsUsed:r.simulationsUsed,extendAttemptsUsed:r.extendAttemptsUsed,includedExtendsCount:r.includedExtendsCount,sequenceObserved:r.sequenceObserved}),'COUNTER_SNAPSHOT_MISMATCH');previousHash=r.recordHash;
 }
 if(claims!==undefined){for(const [k,v] of Object.entries(claims)){const key=k==='extendsUsed'?'extendAttemptsUsed':k;check(Object.hasOwn(snapshot(state),key)&&snapshot(state)[key]===v,'CALLER_COUNTER_RESET_OR_MISMATCH');}}
 return {status:'DURABLE_COUNTER_RECONSTRUCTION_PASS',...state,checkpoint:checkpoint(records)};
}
export function nextRecord(records,event,creation,trustedCheckpoint){const old=records.length?reconstruct(records,creation,trustedCheckpoint):empty(creation);check(records.length||event.action==='INITIALIZED','JOURNAL_GENESIS_REQUIRED');const base={recordId:event.recordId??randomUUID(),previousRecordHash:records.at(-1)?.recordHash??null,index:records.length,timestamp:event.timestamp,action:event.action,runIds:event.runIds??[],ownerGateRef:event.ownerGateRef??(event.action==='INITIALIZED'?creation.ownerApprovalRef:null),scopeHash:event.scopeHash??null,simulationReservationId:event.simulationReservationId??null,extendReservationId:event.extendReservationId??null,transactionHash:event.transactionHash??null,status:event.action,businessRemaining:old.businessRemaining,simulationsUsed:old.simulationsUsed,extendAttemptsUsed:old.extendAttemptsUsed,includedExtendsCount:old.includedExtendsCount,sequenceObserved:old.sequenceObserved,S0:creation.S0,networkId:creation.networkId,toolingIdentities:creation.identities,creationManifestHash:digest(creation),detail:event.detail??{}};const derived=transition(old,base,creation);Object.assign(base,snapshot(derived));base.recordHash=recordHash(base);clean(base);reconstruct([...records,base],creation,checkpoint([...records,base]));return base;}

function localDirectory(directory){local();const dir=resolve(directory),rel=relative(resolve(ROOT,'.tools'),dir);check(rel&&!rel.startsWith('..')&&!rel.includes(':'),'JOURNAL_MUST_BE_IGNORED_LOCAL');let p=dir;while(true){if(existsSync(p))check(!lstatSync(p).isSymbolicLink(),'JOURNAL_SYMLINK_DENIED');const parent=dirname(p);if(parent===p)break;p=parent;}mkdirSync(dir,{recursive:true});return dir;}
export function acquireLock(directory,now=Date.now()){
 const dir=localDirectory(directory),path=resolve(dir,'reservation.lock');let fd;try{fd=openSync(path,'wx',0o600);}catch(e){if(e.code==='EEXIST'){let lock;try{lock=JSON.parse(readFileSync(path,'utf8'));}catch{check(false,'LOCK_CORRUPT_OWNER_REVIEW_REQUIRED');}check(now-lock.timestamp<=120000,'STALE_LOCK_OWNER_REVIEW_REQUIRED');check(false,'RESERVATION_LOCK_BUSY');}throw e;}
 const owner={processId:process.pid,ownerToken:randomUUID(),timestamp:now};try{writeSync(fd,canonical(owner)+'\n');fsyncSync(fd);}finally{closeSync(fd);}const handle=Object.freeze({kind:'LOCAL_OFFLINE_RESERVATION_LOCK'});lockHandles.set(handle,{path,dir,owner});return handle;
}
function lockOwner(handle,directory){const held=lockHandles.get(handle);check(held&&held.dir===resolve(directory)&&canonical(JSON.parse(readFileSync(held.path,'utf8')))===canonical(held.owner),'RESERVATION_LOCK_OWNERSHIP_REQUIRED');return held;}
export function assertLockHeld(handle,directory){lockOwner(handle,directory);return true;}
export function releaseLock(handle){const held=lockHandles.get(handle);check(held,'RESERVATION_LOCK_OWNERSHIP_REQUIRED');lockOwner(handle,held.dir);unlinkSync(held.path);lockHandles.delete(handle);}
export function readJournal(directory,creation,trustedCheckpoint,claims){const path=resolve(localDirectory(directory),'attempts.jsonl');check(existsSync(path),'JOURNAL_MISSING_NO_RESET');check(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'JOURNAL_SYMLINK_DENIED');const raw=readFileSync(path,'utf8');check(raw.endsWith('\n')&&raw.length>1,'JOURNAL_TORN_WRITE_OWNER_REVIEW_REQUIRED');let records;try{records=raw.trimEnd().split('\n').map(l=>JSON.parse(l));}catch{check(false,'JOURNAL_TORN_WRITE_OWNER_REVIEW_REQUIRED');}return {records,state:reconstruct(records,creation,trustedCheckpoint,claims)};}
export function appendJournal(directory,handle,creation,trustedCheckpoint,event){const dir=localDirectory(directory);lockOwner(handle,dir);const path=resolve(dir,'attempts.jsonl');let records=[];if(existsSync(path))records=readJournal(dir,creation,trustedCheckpoint).records;else check(trustedCheckpoint?.recordCount===0&&trustedCheckpoint.lastRecordHash===null&&event.action==='INITIALIZED','JOURNAL_MISSING_NO_RESET');const record=nextRecord(records,event,creation,trustedCheckpoint);const fd=openSync(path,'a',0o600);try{writeSync(fd,canonical(record)+'\n');fsyncSync(fd);}finally{closeSync(fd);}const next=[...records,record];return {record,checkpoint:checkpoint(next),state:reconstruct(next,creation,checkpoint(next))};}
