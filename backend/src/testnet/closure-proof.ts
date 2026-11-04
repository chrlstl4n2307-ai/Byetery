import {createHash} from 'node:crypto';
import {ensure} from '../domain.ts';
import {ACTORS,CONTRACT,WASM} from './abi.ts';
import {NETWORK_ID} from './identity.ts';
import {canonical} from '../application/validation.ts';
export const INCIDENT={operationId:'0192a5b3-36e9-4709-9708-03d6a56a5125',batteryId:'BYE-D3-R1-20261103-18551C1AB983',
  deploymentId:'5c0cad2f-5f25-4216-8068-6cb9d2d26325',incidentSha:'d3044d893282d9f83c72ddfd31bf850be04b78e0',source:ACTORS.admin,baselineSequence:'20970216477425672',
  startedAt:'2026-11-04T01:02:42.587Z'} as const;
export interface ClosureReview {operationId:string;batteryId:string;deploymentId:string;incidentSha:string;fixSha:string;contextHash:string;decisionId:string;expiresAt:number}
/** Trusted read-only ports only. No transaction, simulate, sign, send or resume port. */
export interface ClosureReader {
  /** Owner authorization comes from the trusted local review boundary. */
  ownerDecision():Promise<ClosureReview>;
  accounts():Promise<{rpc:{address:string;sequence:string;ledger:number;balance:string};horizon:{address:string;sequence:string;ledger:number;balance:string};networkId:string;observedAt:number}>;
  history():Promise<{source:string;coveredSince:string;throughLedger:number;transactions:readonly unknown[];operations:readonly unknown[]}>;
  effect():Promise<{batteryId:string;contract:string;wasm:string;ledger:number;status:'ABSENT_PROVEN'|'PRESENT'|'ARCHIVED_OR_UNKNOWN';basis:'BASELINE_AND_COMPLETE_HISTORY'|'UNAVAILABLE'}>;
  quiescence():Promise<{leaseGeneration:string;workers:number;helpers:number;activeLeases:number;artifacts:readonly string[];externalSourceUse:'QUIESCENT'|'UNKNOWN';observedAt:number}>;
}
export interface VerifiedClosure {readonly review:ClosureReview;readonly proofDigest:string;readonly observedAt:number;readonly observationLedger:number;readonly sequence:string;readonly leaseGeneration:string}
const verified=new WeakSet<object>();
export function assertVerifiedClosure(v:VerifiedClosure,now=Date.now()){
  ensure(verified.has(v)&&now>=v.observedAt&&now-v.observedAt<=5000&&now<v.review.expiresAt,'FreshVerifiedClosureRequired');
}
export async function verifyClosureEvidence(review:ClosureReview,reader:ClosureReader,now:()=>number=Date.now):Promise<VerifiedClosure>{
  ensure(review.operationId===INCIDENT.operationId&&review.batteryId===INCIDENT.batteryId&&review.deploymentId===INCIDENT.deploymentId
    &&review.incidentSha===INCIDENT.incidentSha&&/^[a-f0-9]{40}$/.test(review.fixSha)&&review.fixSha!==review.incidentSha
    &&/^[a-f0-9]{64}$/.test(review.contextHash)&&/^[A-Za-z0-9._:-]{8,128}$/.test(review.decisionId)&&review.expiresAt>now(),'ClosureReviewMismatch');
  const owner=await reader.ownerDecision();
  const fields=['operationId','batteryId','deploymentId','incidentSha','fixSha','contextHash','decisionId','expiresAt'] as const;
  ensure(fields.every(field=>owner[field]===review[field]),'ClosureOwnerDecisionMismatch');
  const history=await reader.history(),effect=await reader.effect(),quiet=await reader.quiescence(),accounts=await reader.accounts();
  ensure(accounts.networkId===NETWORK_ID&&accounts.rpc.address===INCIDENT.source&&accounts.horizon.address===INCIDENT.source&&accounts.rpc.sequence===INCIDENT.baselineSequence&&accounts.horizon.sequence===INCIDENT.baselineSequence,'ClosureSequenceMismatch');
  ensure(accounts.rpc.balance===accounts.horizon.balance&&accounts.rpc.ledger>0&&accounts.horizon.ledger>=accounts.rpc.ledger,'ClosureAccountDisagreement');
  ensure(history.source===INCIDENT.source&&Date.parse(history.coveredSince)<=Date.parse(INCIDENT.startedAt)&&history.throughLedger>=accounts.rpc.ledger
    &&history.transactions.length===0&&history.operations.length===0,'ClosureHistoryUnproven');
  ensure(effect.batteryId===INCIDENT.batteryId&&effect.contract===CONTRACT&&effect.wasm===WASM&&effect.ledger>=accounts.rpc.ledger&&effect.status==='ABSENT_PROVEN'
    &&effect.basis==='BASELINE_AND_COMPLETE_HISTORY','ClosureEffectUnproven');
  ensure(/^[1-9]\d*$/.test(quiet.leaseGeneration)&&quiet.workers===0&&quiet.helpers===0&&quiet.activeLeases===0&&quiet.artifacts.length===0&&quiet.externalSourceUse==='QUIESCENT','ClosureNotQuiescent');
  ensure(now()>=accounts.observedAt&&now()-accounts.observedAt<=5000&&now()>=quiet.observedAt&&now()-quiet.observedAt<=5000,'ClosureProofStale');
  const frozen=Object.freeze({operationId:review.operationId,batteryId:review.batteryId,deploymentId:review.deploymentId,
    incidentSha:review.incidentSha,fixSha:review.fixSha,contextHash:review.contextHash,decisionId:review.decisionId,expiresAt:review.expiresAt});
  const proof=Object.freeze({review:frozen,proofDigest:createHash('sha256').update(canonical({review:frozen,accounts,history,effect,quiet})).digest('hex'),observedAt:accounts.observedAt,observationLedger:accounts.rpc.ledger,sequence:accounts.rpc.sequence,leaseGeneration:quiet.leaseGeneration});
  verified.add(proof);assertVerifiedClosure(proof,now());return proof;
}
