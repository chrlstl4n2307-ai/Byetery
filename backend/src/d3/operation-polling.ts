/** Import-safe HTTP observer. It has no POST, chain, DB or signer capability. */
export interface OperationReceipt {operationId:string;class:string;terminal:boolean;transactionHash:string|null;submissionEvidence:string;result?:string|null;source:string}
export async function observeOperation(get:(signal:AbortSignal)=>Promise<OperationReceipt>,options:{now?:()=>number;sleep?:(ms:number)=>Promise<void>;budgetMs?:number;initialId?:string|null;initialHash?:string|null;onStatus?:(receipt:OperationReceipt)=>void}={}){
  const now=options.now??Date.now,sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms))),start=now(),budget=options.budgetMs??120000;
  let id=options.initialId??null,hash=options.initialHash??null;
  while(now()-start<budget){
    let receipt:OperationReceipt|undefined;
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      receipt=await Promise.race([get(controller.signal),new Promise<undefined>(resolve=>{
        timer=setTimeout(()=>{controller.abort();resolve(undefined);},Math.min(10000,budget-(now()-start)));
      })]);
    }catch{/* Read failure preserves the original polling deadline. */}
    finally{clearTimeout(timer);}
    if(receipt){
      if(receipt.source!=='TESTNET'||!/^[a-f0-9-]{36}$/.test(receipt.operationId)
        ||(receipt.transactionHash!==null&&!/^[a-f0-9]{64}$/.test(receipt.transactionHash))
        ||(id&&receipt.operationId!==id)||(hash&&receipt.transactionHash!==hash))throw Error('OriginalIdentityMismatch');
      id=receipt.operationId;if(receipt.transactionHash)hash=receipt.transactionHash;
      options.onStatus?.(receipt);
      if(receipt.terminal)return receipt;
      if(['PRE_DISPATCH_INTERRUPTED','REVIEWED_RESOLUTION_REQUIRED'].includes(receipt.class))throw Error(receipt.class);
    }
    const remaining=budget-(now()-start);if(remaining>0)await sleep(Math.min(1000,remaining));
  }
  throw Error('OBSERVATION_WINDOW_EXPIRED');
}
export function timeoutClassification(receipt?:OperationReceipt){
  if(!receipt)return 'REQUEST_ACK_UNKNOWN';
  if(receipt.submissionEvidence==='DURABLE_INTENT')return 'SUBMITTED_RESPONSE_UNCERTAIN';
  return receipt.transactionHash?'SIGNED_PRE_DISPATCH':'REQUEST_TIMEOUT_PRE_DISPATCH';
}
