import { createHash } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { canonical } from '../application/validation.ts';
import { ACTORS, CONTRACT, TOKEN, WASM } from '../testnet/abi.ts';
import { NETWORK_ID } from '../testnet/identity.ts';
export { ACTORS, CONTRACT, TOKEN, WASM, NETWORK_ID };
export const ISSUER='GCHROKHXHL4L635J6Y6DWFFD5DDHABOAF4BP5TEUZDZQMW4XYS6DIDL7';
export const AMOUNT='100000000';
export const OPERATIONS=['register_battery','open_return','confirm_collection','confirm_recycling','pay_reward'] as const;
export type Operation=typeof OPERATIONS[number];
export const CASES=['unauthorized_recycler','invalid_transition','early_reward','duplicate_reward','altered_record','uncertain_response'] as const;
export type Negative=typeof CASES[number];
export class D3Error extends Error { constructor(code:string){super(code);this.name='D3Error';} }
export function check(value:unknown,code:string):asserts value {if(!value)throw new D3Error(code);}
export function obj(value:unknown,keys:readonly string[]):Record<string,unknown>{
 check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype,'InvalidObject');
 check(Object.keys(value).every(k=>keys.includes(k)),'UnexpectedField');return value as Record<string,unknown>;
}
export function sha(v:string|Uint8Array){return createHash('sha256').update(v).digest('hex');}
export function hash(v:unknown):asserts v is string{check(typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&v!=='0'.repeat(64),'InvalidHash');}
export function publicKey(v:unknown):asserts v is string{check(typeof v==='string'&&StrKey.isValidEd25519PublicKey(v),'InvalidRecipient');}
export function safeText(v:unknown,max=128):asserts v is string {check(typeof v==='string'&&v.length>0&&v.length<=max&&/^[A-Za-z0-9_.:/ -]+$/.test(v),'InvalidSafeText');}
/** Output is closed-schema; this additional scan also covers decoded disclosure bytes. */
export function noSecrets(text:string){
 check(!/postgres(?:ql)?:\/\/|sb_secret_|(?:password|private[_ -]?key|seed[_ -]?phrase|refresh[_ -]?token|access[_ -]?token|service[_ -]?role|signed[_ -]?xdr|authorization|cookie)["'\s]*[:=]|-----BEGIN|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|_vercel_share=/i.test(text),'SensitiveMaterialRejected');
 check(!/S[A-Z2-7]{55}/.test(text),'SensitiveMaterialRejected');
}
export interface RunInput {runId:'RUN1'|'RUN2'|'RUN3';batteryId:string;recipient:string|null;negativeCases:Negative[]}
export interface PlanInput {version:1;gitSha:string;network:'TESTNET';contractId:string;wasmSha256:string;assetCode:'GREENTEST';issuer:string;sac:string;rewardBaseUnits:string;runs:RunInput[]}
export function plan(input:unknown){
 const v=obj(input,['version','gitSha','network','contractId','wasmSha256','assetCode','issuer','sac','rewardBaseUnits','runs']);
 check(v.version===1,'UnsupportedVersion');check(v.network==='TESTNET','TestnetOnly');
 check(v.contractId===CONTRACT,'ContractMismatch');check(v.wasmSha256===WASM,'WasmMismatch');
 check(v.assetCode==='GREENTEST'&&v.issuer===ISSUER&&v.sac===TOKEN,'AssetMismatch');
 check(v.rewardBaseUnits===AMOUNT,'RewardAmountMismatch');check(typeof v.gitSha==='string'&&/^[0-9a-f]{40}$/.test(v.gitSha),'InvalidGitSha');
 check(Array.isArray(v.runs)&&v.runs.length===3,'ExactlyThreeRunsRequired');
 const runs:RunInput[]=v.runs.map(raw=>{
  const r=obj(raw,['runId','batteryId','recipient','negativeCases']);
  check(['RUN1','RUN2','RUN3'].includes(r.runId as string),'InvalidRunId');
  check(typeof r.batteryId==='string'&&/^[A-Z0-9-]{1,32}$/.test(r.batteryId)&&!r.batteryId.startsWith('BYE-REVIEW-'),'InvalidBatteryId');
  if(r.recipient!==null)publicKey(r.recipient);
  check(Array.isArray(r.negativeCases)&&r.negativeCases.every(n=>CASES.includes(n))&&new Set(r.negativeCases).size===r.negativeCases.length,'InvalidNegativeCases');
  return {runId:r.runId as RunInput['runId'],batteryId:r.batteryId,recipient:r.recipient as string|null,negativeCases:[...r.negativeCases].sort()};
 }).sort((a,b)=>a.runId.localeCompare(b.runId));
 check(new Set(runs.map(r=>r.runId)).size===3&&new Set(runs.map(r=>r.batteryId)).size===3,'DuplicateRunOrBattery');
 const negatives=runs.flatMap(r=>r.negativeCases);check(negatives.length===6&&new Set(negatives).size===6,'ExactlySixNegativesRequired');
 const blockers=runs.filter(r=>r.recipient===null).map(r=>r.runId+':RECIPIENT_OWNER_DECISION_REQUIRED');
 if(!blockers.length)check(new Set(runs.map(r=>r.recipient)).size>=2,'TwoRecipientsRequired');
 const normalized={...v,runs} as unknown as PlanInput;
 noSecrets(canonical(normalized));
 return {schemaVersion:'BYETERY_D3_PLAN_V1' as const,input:normalized,planHash:sha(canonical(normalized)),blockers,
  operations:OPERATIONS,txBudget:{lifecycle:12,reward:3,totalSuccessful:15,negativeBroadcasts:0,setupAuthorized:0,maintenanceAuthorized:0},
  executionEnabled:false as const};
}
export type Plan=ReturnType<typeof plan>;
/** Review data is not a signing capability. Live binding intentionally does not ship in BUILD. */
export function executionPreflight(p:Plan,context:unknown){
 const c=obj(context,['ownerDecisionId','reviewedGitSha','network','contractId','wasmSha256','assetCode','issuer','sac','rewardBaseUnits','signerAvailable','uniqueBatteryIdsVerified','recipientTrustlinesReady','expectedInitialStates','rewardAlreadySent','unresolvedOperation','sourceSequenceStable']);
 check(typeof c.ownerDecisionId==='string'&&/^[A-Z0-9-]{8,80}$/.test(c.ownerDecisionId),'FutureOwnerAuthorizationRequired');
 check(c.reviewedGitSha===p.input.gitSha,'ReviewedShaMismatch');
 check(c.network==='TESTNET','TestnetOnly');check(c.contractId===CONTRACT,'ContractMismatch');check(c.wasmSha256===WASM,'WasmMismatch');
 check(c.assetCode==='GREENTEST'&&c.issuer===ISSUER&&c.sac===TOKEN,'AssetMismatch');check(c.rewardBaseUnits===AMOUNT,'RewardAmountMismatch');
 check(!p.blockers.length,'RecipientDecisionRequired');check(c.signerAvailable===true,'SignerUnavailable');
 check(c.uniqueBatteryIdsVerified===true,'BatteryUniquenessNotVerified');check(c.recipientTrustlinesReady===true,'TrustlineNotReady');
 check(c.expectedInitialStates===true,'UnexpectedLifecycle');check(c.rewardAlreadySent===false,'RewardAlreadySent');
 check(c.unresolvedOperation===false,'UncertaintyNotReconciled');check(c.sourceSequenceStable===true,'SourceSequenceChanged');
}
