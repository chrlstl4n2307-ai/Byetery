import {check,clean,isHash,creationManifest,canonical} from './core.mjs';
import {custodyModel,auditSourceGraph} from './custody.mjs';
import {reconstruct,assertLockHeld} from './journal.mjs';
import {correlateHistory} from './chain.mjs';
import {whitelistProvenance} from './provenance.mjs';
import {evaluateOffline} from '../d3-ttl-maintenance-offline/gate.mjs';

export const REQUIRED=Object.freeze({
 CREATION:['custodyLocationChosen','maintenanceLoaderIsolated','businessLoaderIsolationProven','syntheticAccessDenialsPassed','creationSchemaReady','S0RecordingReady','appendOnlyLogReady','hashChainReady','exclusiveLockReady'],
 SIMULATION:['accountMatchesCreation','S0Frozen','sourceHistoryCorrelated','journalIntegrity','slotAvailable','exclusiveLockHeld','ownerGateValid','whitelistAuthenticated'],
 SIGNING:['extendReservedDurably','sequenceExact','signerIsolationValid','singleMasterOnly','thresholdsUnchanged','noSponsorship','reviewedSimulationXdr','feeCap','shortTimebounds','exactWhitelist','businessWorkerQuiet']});
export function readiness(stage,input){clean(input);check(Object.hasOwn(REQUIRED,stage)&&REQUIRED[stage].every(k=>input.proofs?.[k]===true),'FUTURE_GATE_PREREQUISITE_MISSING');custodyModel(input.custody);auditSourceGraph(input.importGraph.sources,input.importGraph.definitions);
 if(stage!=='CREATION'){
  creationManifest(input.creation);const state=reconstruct(input.records,input.creation,input.trustedCheckpoint,input.claims);correlateHistory(input.creation,input.records,input.observation);check(isHash(input.ownerGateRef)&&!state.stopped,'OWNER_REVIEW_STOP');const proof=whitelistProvenance(input.review,input.bundle,input.mode);check(proof.keys.length>0,'WHITELIST_PROVENANCE_REQUIRED');
  assertLockHeld(input.lock,input.directory);
  if(stage==='SIMULATION'){const a=state.attempts.find(a=>a.simulationReservationId===input.simulationReservationId);check(a?.status==='SIMULATION_RESERVED'&&a.ownerGateRef===input.ownerGateRef&&a.runIds.includes(proof.runId),'SIMULATION_RESERVATION_BEFORE_EFFECT_REQUIRED');}
  else{const a=state.attempts.find(a=>a.extendReservationId===input.extendReservationId);check(a?.status==='EXTEND_RESERVED'&&a.ownerGateRef===input.ownerGateRef&&a.intent.seqNum===String(BigInt(state.sequenceObserved)+1n),'EXTEND_RESERVED_BEFORE_SIGNING_REQUIRED');const inspected=evaluateOffline(input.signingInspection);check(inspected.maintenanceAccount===input.creation.maintenancePublicKey&&inspected.verification?.transactionHash===a.transactionHash&&canonical(inspected.subset.readOnly)===canonical(a.intent.readOnly)&&canonical(proof.keys)===canonical(a.intent.readOnly),'SIGNING_REVIEW_IDENTITY_MISMATCH');}
 }
 return {status:stage+'_PREREQUISITES_MODEL_READY_OFFLINE',executionAuthorized:false,liveAuthority:false,operationalCustodyProven:false};
}
