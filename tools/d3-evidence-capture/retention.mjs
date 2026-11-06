import {check} from './common.mjs';

// Scheduling estimate from an observed ledger window, never a promise of future
// provider retention or a fixed number of calendar days. Original RPC bytes must
// be captured/committed now and remain usable offline after provider eviction.
export function retentionPolicy(receipt,observedAt,reserveLedgers=120){
 const inclusion=receipt?.ledger,oldest=receipt?.oldestLedger,latest=receipt?.latestLedger;
 check(typeof observedAt==='string'&&Number.isFinite(Date.parse(observedAt)),'MISSING_PROVENANCE');
 check(Number.isSafeInteger(inclusion)&&inclusion>0&&Number.isSafeInteger(reserveLedgers)&&reserveLedgers>0,'INVALID_RETENTION_OBSERVATION');
 const base={inclusionLedger:inclusion,oldestAvailableRpcLedger:oldest??null,latestLedger:latest??null,observedAt,reserveLedgers,providerGuarantee:false,assumedDays:null,requiresCommittedOriginalRpcEvidence:true,refetchExpiredReceiptAllowed:false};
 if(oldest===undefined||latest===undefined)return {...base,status:'REVIEW_REQUIRED_RETENTION_INDICATOR_UNAVAILABLE',SQL_RPC_CROSSCHECK_LATEST_SAFE_LEDGER:null};
 check(Number.isSafeInteger(latest)&&latest>=inclusion&&Number.isSafeInteger(oldest)&&oldest>0,'INVALID_RETENTION_OBSERVATION');
 check(oldest<=latest,'INVALID_RETENTION_OBSERVATION');
 if(oldest>inclusion)return {...base,status:'REVIEW_REQUIRED_ORIGINAL_RECEIPT_OUTSIDE_CURRENT_WINDOW',SQL_RPC_CROSSCHECK_LATEST_SAFE_LEDGER:null};
 const windowLedgers=latest-oldest+1,ceiling=inclusion+windowLedgers-1-reserveLedgers;
 check(Number.isSafeInteger(ceiling)&&ceiling>0,'INVALID_RETENTION_OBSERVATION');
 return {...base,observedWindowLedgers:windowLedgers,SQL_RPC_CROSSCHECK_LATEST_SAFE_LEDGER:ceiling,status:ceiling>latest?'OBSERVED_WINDOW_SCHEDULING_BOUND':'REVIEW_REQUIRED_CAPTURE_DEADLINE_REACHED',formula:'inclusionLedger + (latestLedger - oldestAvailableRpcLedger + 1) - 1 - reserveLedgers',beforeHandoff:'Verify original captured RPC bytes and matching evidence commit; compare SQL offline. If not already committed before eviction, STOP. Recheck actual retention before any planned live comparison.'};
}
