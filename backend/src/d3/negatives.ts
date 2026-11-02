import {check,hash,CASES,type Negative} from './model.ts';
export const NEGATIVES:ReadonlyArray<{id:Negative;precondition:string;attempt:string;expected:string;simulationSupported:boolean;completedLifecycleRequired:boolean;evidenceFields:string[]}>=Object.freeze([
 {id:'unauthorized_recycler',precondition:'COLLECTED; wrong-role actor',attempt:'confirm_recycling',expected:'Unauthorized/RoleNotGranted; no advancement',simulationSupported:true,completedLifecycleRequired:false,evidenceFields:['layer','errorCode','unchangedState','broadcasts']},
 {id:'invalid_transition',precondition:'RETURNED; not COLLECTED',attempt:'confirm_recycling',expected:'InvalidState; no advancement',simulationSupported:true,completedLifecycleRequired:false,evidenceFields:['layer','errorCode','unchangedState','broadcasts']},
 {id:'early_reward',precondition:'REGISTERED; not RECYCLED/PENDING',attempt:'pay_reward',expected:'RewardNotEligible; no transfer',simulationSupported:true,completedLifecycleRequired:false,evidenceFields:['layer','errorCode','unchangedState','broadcasts']},
 {id:'duplicate_reward',precondition:'RECYCLED/SENT',attempt:'pay_reward',expected:'RewardAlreadySent; no second transfer',simulationSupported:true,completedLifecycleRequired:true,evidenceFields:['layer','errorCode','unchangedState','balanceUnchanged','broadcasts']},
 {id:'altered_record',precondition:'Original committed disclosure',attempt:'verify one altered byte against original commitment',expected:'NOT_VERIFIED; original bytes untouched',simulationSupported:false,completedLifecycleRequired:true,evidenceFields:['originalPayloadHash','alteredPayloadHash','expectedCommitment','status']},
 {id:'uncertain_response',precondition:'Original durable payment identity already exists',attempt:'Reconcile original operation after lost response',expected:'Same identity/hash, one effect; never issue replacement',simulationSupported:false,completedLifecycleRequired:false,evidenceFields:['originalHash','reconciledHash','identityCount','broadcastCount','result']},
]);
check(NEGATIVES.length===6&&new Set(NEGATIVES.map(n=>n.id)).size===CASES.length,'NegativeDefinitionMismatch');
export interface ReconciliationPort {
 identity():Promise<{operationId:string;transactionHash:string}>;
 /** Bind to the existing D1 worker.run(originalOperationId), never a fresh payment call. */
 reconcileOriginalOperation(operationId:string):Promise<'UNRESOLVED'|'SUCCESS'>;
}
/** No preparation, signer or send capability in this wrapper. D1 owns recovery. */
export async function reconcileOriginal(port:ReconciliationPort){
 const before=await port.identity();hash(before.transactionHash);
 const result=await port.reconcileOriginalOperation(before.operationId);
 const after=await port.identity();check(before.operationId===after.operationId&&before.transactionHash===after.transactionHash,'RecoveryIdentityMismatch');
 return {uncertainResponse:true,originalHash:before.transactionHash,reconciledHash:after.transactionHash,result};
}
