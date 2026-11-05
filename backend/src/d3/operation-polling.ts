/** Import-safe HTTP observer. It has no POST, chain, DB or signer capability. */
import {setTimeout as delay} from 'node:timers/promises';

export const INITIAL_OBSERVATION_MS=120_000;
export const MAX_OBSERVATION_MS=600_000; // Local stop only. The worker alone proves non-inclusion.
export type ConfirmationMode='OBSERVED'|'RECONCILED_AFTER_OBSERVATION_EXPIRY';
export interface OperationReceipt {operationId:string;class:string;terminal:boolean;transactionHash:string|null;submissionEvidence:string;result?:string|null;reviewRequired?:boolean;source:string}
type SubmittedIdentity={operationId:string;transactionHash:string};
export interface ObservationOptions {
  now?:()=>number;sleep?:(ms:number)=>Promise<void>;signal?:AbortSignal;
  budgetMs?:number;totalBudgetMs?:number;initialId?:string|null;initialHash?:string|null;
  onStatus?:(receipt:OperationReceipt)=>void;
  onReconciliation?:(identity:SubmittedIdentity)=>void|Promise<void>;
}
export async function observeOperation(get:(signal:AbortSignal)=>Promise<OperationReceipt>,options:ObservationOptions={}){
  const now=options.now??(()=>performance.now()),start=now();
  const initial=options.budgetMs??INITIAL_OBSERVATION_MS,total=options.totalBudgetMs??MAX_OBSERVATION_MS;
  if(!Number.isSafeInteger(initial)||initial<=0||!Number.isSafeInteger(total)||total<initial||total>MAX_OBSERVATION_MS)throw Error('InvalidObservationBudget');
  let id=options.initialId??null,hash=options.initialHash??null,last:OperationReceipt|undefined;
  let extended=false;
  const assertActive=()=>{if(options.signal?.aborted)throw Error('OBSERVATION_ABORTED');};
  while(true){
    assertActive();
    if(!extended&&now()-start>=initial){
      // A signed but undispatched envelope is not eligible for extra observation.
      if(!id||!hash||last?.submissionEvidence!=='DURABLE_INTENT')throw Error('OBSERVATION_WINDOW_EXPIRED');
      if(now()-start>=total)throw Error('UNCERTAIN_OPEN');
      extended=true;
      await options.onReconciliation?.({operationId:id,transactionHash:hash});
      assertActive();
    }
    const remaining=(extended?total:initial)-(now()-start);
    if(remaining<=0){if(extended)throw Error('UNCERTAIN_OPEN');continue;}
    let receipt:OperationReceipt|undefined;
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const stop=()=>controller.abort();
    options.signal?.addEventListener('abort',stop,{once:true});
    try{
      receipt=await Promise.race([new Promise<undefined>(resolve=>{
        controller.signal.addEventListener('abort',()=>resolve(undefined),{once:true});
        timer=setTimeout(stop,Math.min(10000,remaining));
      }),get(controller.signal)]);
    }catch{/* Read failure preserves both deadlines. */}
    finally{clearTimeout(timer);options.signal?.removeEventListener('abort',stop);}
    assertActive();
    if(receipt){
      if(receipt.source==='TESTNET'&&id===receipt.operationId&&receipt.transactionHash===null
        &&receipt.class==='UNCERTAIN_OPEN'&&receipt.reviewRequired===true)throw Error('UNCERTAIN_OPEN');
      if(receipt.source!=='TESTNET'||!/^[a-f0-9-]{36}$/.test(receipt.operationId)
        ||(receipt.transactionHash!==null&&!/^[a-f0-9]{64}$/.test(receipt.transactionHash))
        ||(id&&receipt.operationId!==id)||(hash&&receipt.transactionHash!==hash)
        ||(extended&&receipt.submissionEvidence!=='DURABLE_INTENT'))throw Error('OriginalIdentityMismatch');
      id=receipt.operationId;if(receipt.transactionHash)hash=receipt.transactionHash;last=receipt;
      options.onStatus?.(receipt);
      if(receipt.class==='UNCERTAIN_OPEN'&&receipt.reviewRequired===true)throw Error('UNCERTAIN_OPEN');
      if(receipt.terminal)return {...receipt,confirmationMode:(extended?'RECONCILED_AFTER_OBSERVATION_EXPIRY':'OBSERVED') as ConfirmationMode};
      if(['PRE_DISPATCH_INTERRUPTED','REVIEWED_RESOLUTION_REQUIRED'].includes(receipt.class))throw Error(receipt.class);
    }
    const pause=Math.min(1000,(extended?total:initial)-(now()-start));
    if(pause>0){
      if(options.sleep)await options.sleep(pause);
      else await delay(pause,undefined,{signal:options.signal}).catch(error=>{assertActive();throw error;});
    }
  }
}
export function timeoutClassification(receipt?:OperationReceipt){
  if(!receipt)return 'REQUEST_ACK_UNKNOWN';
  if(receipt.submissionEvidence==='DURABLE_INTENT')return 'SUBMITTED_RESPONSE_UNCERTAIN';
  return receipt.transactionHash?'SIGNED_PRE_DISPATCH':'REQUEST_TIMEOUT_PRE_DISPATCH';
}
