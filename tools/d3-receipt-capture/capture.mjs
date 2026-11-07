import {mkdir,open,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {decodedXdr} from '../d3-evidence-capture/comparison.mjs';
import {X} from '../d3-evidence-capture/xdr-reader.mjs';
import {isReadOnlyReaders} from './sources.mjs';

export const MAX_RECEIPT_READ_ATTEMPTS=3;
export const MAX_RECEIPT_CONVERGENCE_SECONDS=20;
export const RECEIPT_READ_TIMEOUT_MS=3000;
export const RECEIPT_REREAD_INTERVAL_MS=200;
export const PRIOR_STOPPED_BUNDLE_SHA256='a926783d15bb509410ba00f8466ffc281e4104ace43d65bfed9e35e6695c83eb';
const MAX_RAW_BYTES=2_097_152;
const digest=value=>createHash('sha256').update(value).digest('hex');
const now=performance.now.bind(performance);
const canonical=value=>JSON.stringify(sorted(value));
function sorted(v){if(typeof v==='bigint')return {xdrInteger:v.toString()};if(v instanceof Uint8Array)return {xdrOpaqueHex:Buffer.from(v).toString('hex')};if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])]));return v;}
function requireThat(v,code){if(!v)throw Error(code);}
function expectedScope(value){
 requireThat(value&&Object.keys(value).sort().join(',')==='batteryId,ledger,method,operationId,transactionHash','INVALID_EXPECTED_SCOPE');
 requireThat(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.operationId)&&/^[0-9a-f]{64}$/.test(value.transactionHash),'INVALID_EXPECTED_SCOPE');
 requireThat(/^[A-Z0-9-]{1,32}$/.test(value.batteryId)&&['register_battery','open_return','confirm_collection','confirm_recycling','pay_reward'].includes(value.method)&&Number.isSafeInteger(value.ledger)&&value.ledger>0,'INVALID_EXPECTED_SCOPE');
 return Object.freeze({...value});
}
async function newOutput(directory){
 const path=resolve(directory);let cursor=dirname(path);
 while(true){const st=await lstat(cursor);requireThat(!st.isSymbolicLink(),'SYMLINK_OUTPUT_DENIED');const next=dirname(cursor);if(next===cursor)break;cursor=next;}
 requireThat(!path.replaceAll('\\','/').split('/').some(p=>['.git','backend','frontend','contracts','database','stopped-chain-bundle'].includes(p)),'OUTPUT_PATH_DENIED');
 await mkdir(path);requireThat(await realpath(path)===path,'OUTPUT_PATH_DENIED');return path;
}
function safeRaw(text){requireThat(typeof text==='string'&&Buffer.byteLength(text)<=MAX_RAW_BYTES,'RAW_SIZE_REJECTED');requireThat(!/postgres(?:ql)?:\/\/|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\bS[A-Z2-7]{55}\b|-----BEGIN|sb_secret_|sbp_[A-Za-z0-9]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text),'SENSITIVE_RAW_REJECTED');}
async function durable(directory,name,value,inventory){
 const bytes=Buffer.isBuffer(value)?value:Buffer.from(canonical(value)+'\n');
 const file=await open(resolve(directory,name),'wx',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
 const entry={path:name,bytes:bytes.length,sha256:digest(bytes),durableWriteIndex:inventory.length+1};inventory.push(entry);return entry;
}
function decodeField(type,text){
 if(text===null||text===undefined||text==='')return {status:'MISSING'};
 try{
  const bytes=decodedXdr(type,text);const parsed=X[type].fromXDR(bytes);const value=parsed.toXdrObject();
  return {status:'VALID',canonicalBase64:bytes.toString('base64'),decodedBytesSha256:digest(bytes),canonicalDecoded:sorted(value),
   ...(type==='TransactionResult'?{resultTag:parsed.result.type}:{})};
 }catch{return {status:'MALFORMED_XDR'};}
}
function normalize(raw,source,scope,index,attempt){
 let value;try{value=JSON.parse(raw.rawUtf8);if(raw.format==='RPC_JSONRPC'){requireThat(value.jsonrpc==='2.0'&&value.id===1&&!value.error&&value.result,'INVALID_RPC_RESPONSE');value=value.result;}}catch{return {source,index,attempt,status:'INVALID_JSON',decodeError:'INVALID_SOURCE_JSON'};}
 const rpc=source==='RPC';
 return {source,format:raw.format,index,attempt,observationTimestamp:raw.observedAt,
  operationId:rpc&&raw.format==='RPC_JSONRPC'?scope.operationId:value.operationId??null,
  operationIdProvenance:rpc?'LOCAL_CORRELATION_TO_EXPECTED_OPERATION_NOT_ONCHAIN_UUID':'SQL_OPERATION_PRIMARY_KEY',
  transactionHash:rpc&&raw.format==='RPC_JSONRPC'?value.txHash??null:value.transactionHash??null,
  receiptTransactionHash:value.receiptTransactionHash??null,batteryId:rpc&&raw.format==='RPC_JSONRPC'?scope.batteryId:value.batteryId??null,
  method:rpc&&raw.format==='RPC_JSONRPC'?scope.method:value.method??null,
  ledger:value.ledger??null,status:value.status??null,applicationState:value.applicationState??null,durableState:value.durableState??null,
  resultXdr:value.resultXdr??null,resultMetaXdr:value.resultMetaXdr??null};
}
function identityError(v,scope){
 for(const name of ['operationId','transactionHash','receiptTransactionHash','batteryId','method']){
  if(v[name]!==null&&v[name]!==undefined&&v[name]!==scope[name==='receiptTransactionHash'?'transactionHash':name])return name==='operationId'?'OPERATION_ID_MISMATCH':name.includes('Hash')?'TX_HASH_MISMATCH':'CONTEXT_MISMATCH';
 }
 if(v.ledger!==null&&v.ledger!==undefined&&v.ledger!==scope.ledger)return 'LEDGER_MISMATCH';return null;
}
function terminal(v,source){
 if(!['SUCCESS','FAILED'].includes(v.status)||!v.operationId||!v.transactionHash||!v.ledger||!v.resultXdr||!v.resultMetaXdr)return false;
 if(source==='SQL')return !!v.receiptTransactionHash&&(v.status==='SUCCESS'?v.applicationState==='CONFIRMED'&&['PROJECTED','CONFIRMED_SUCCESS'].includes(v.durableState):v.applicationState==='REJECTED'&&v.durableState==='CONFIRMED_FAILED');
 return true;
}

/** Observation-only. Branded readers have no mutation methods; no action after
 * return is dispatched. PASS means matching receipts, never execution authority. */
export async function captureDurableReceipt(options){
 requireThat(options&&Object.keys(options).sort().join(',')==='expected,outputDirectory,readers','UNSUPPORTED_CAPTURE_OPTION');
 const scope=expectedScope(options.expected),readers=options.readers;requireThat(isReadOnlyReaders(readers),'READONLY_READERS_REQUIRED');
 const directory=await newOutput(options.outputDirectory),inventory=[];const start=now(),deadline=start+MAX_RECEIPT_CONVERGENCE_SECONDS*1000;
 const elapsed=()=>Math.max(0,Math.ceil(now()-start));let attempts=0,readCount=0,index=0,reason='NO_CONVERGENCE',lastPair=null;
 await durable(directory,'capture-scope.json',{schema:'BYETERY_DURABLE_RECEIPT_CAPTURE_V1',expected:scope,priorStoppedBundleSha256:PRIOR_STOPPED_BUNDLE_SHA256,
  classification:readers.classification,rootCause:'ROOT_CAUSE_NOT_PROVEN',maxAttempts:MAX_RECEIPT_READ_ATTEMPTS,maxElapsedMs:MAX_RECEIPT_CONVERGENCE_SECONDS*1000,
  readTimeoutMs:RECEIPT_READ_TIMEOUT_MS,grantsExecutionAuthority:false},inventory);
 async function read(source,attempt){
  const n=++index,remaining=deadline-now();let raw;const controller=new AbortController();let timeout;
  try{
   requireThat(remaining>0,'CONVERGENCE_TIME_LIMIT');
   const fn=source==='SQL'?readers.readSql:readers.readRpc;
   readCount++;
   raw=await Promise.race([fn(scope,controller.signal),new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},Math.min(RECEIPT_READ_TIMEOUT_MS,remaining));})]);
   safeRaw(raw.rawUtf8);raw={...raw,observedAt:new Date().toISOString()};
  }catch(e){
   if(e.message==='SENSITIVE_RAW_REJECTED')throw e;
   raw={format:'READ_ERROR',observedAt:new Date().toISOString(),rawUtf8:canonical({status:'READ_ERROR',code:['READ_TIMEOUT','CONVERGENCE_TIME_LIMIT'].includes(e.message)?e.message:'SOURCE_READ_UNAVAILABLE'})};
  }finally{clearTimeout(timeout);controller.abort();}
  const name=String(attempt).padStart(2,'0')+'-'+source.toLowerCase();
  // Preserve source UTF-8 bytes and fsync before normalization, decoding or equality.
  const saved=await durable(directory,name+'.raw.utf8',Buffer.from(raw.rawUtf8,'utf8'),inventory);
  const view=normalize(raw,source,scope,n,attempt);
  await durable(directory,name+'.observation.json',{...view,rawFile:saved.path,rawUtf8Sha256:saved.sha256,rawUtf8Bytes:saved.bytes,
   rawRepresentation:raw.rawUtf8,sourceFormat:raw.format},inventory);
  return {raw,view,saved,name};
 }
 async function finish(status){
  const result={schema:'BYETERY_DURABLE_RECEIPT_RESULT_V1',status,reason,attempts,readCount,sourceObservationCount:index,elapsedMs:elapsed(),expected:scope,
   priorStoppedBundleSha256:PRIOR_STOPPED_BUNDLE_SHA256,rootCause:'ROOT_CAUSE_NOT_PROVEN',finalObservations:lastPair,
   grantsExecutionAuthority:false,nextLifecycleOperation:false,networkMutationPaths:0};
  await durable(directory,'result.json',result,inventory);
  const bytes=Buffer.from(canonical(inventory.toSorted((a,b)=>a.path.localeCompare(b.path)))+'\n');
  await durable(directory,'inventory.json',bytes,[]);const inventorySha256=digest(bytes);
  await durable(directory,'INVENTORY_SHA256',Buffer.from(inventorySha256+'\n'),[]);
  return {...result,directory,inventorySha256};
 }
 for(let attempt=1;attempt<=MAX_RECEIPT_READ_ATTEMPTS&&now()<deadline;attempt++){
  attempts=attempt;
  const sql=await read('SQL',attempt);const rpc=await read('RPC',attempt);
  const left={resultXdr:decodeField('TransactionResult',sql.view.resultXdr),resultMetaXdr:decodeField('TransactionMeta',sql.view.resultMetaXdr)};
  const right={resultXdr:decodeField('TransactionResult',rpc.view.resultXdr),resultMetaXdr:decodeField('TransactionMeta',rpc.view.resultMetaXdr)};
  // Both decoded/canonical comparison inputs survive even a malformed/identity STOP.
  const decoded=await durable(directory,String(attempt).padStart(2,'0')+'-canonical-inputs.json',{
   sql:{...left,source:'SQL',operationId:sql.view.operationId??null,transactionHash:sql.view.transactionHash??null,observationIndex:sql.view.index,observationTimestamp:sql.raw.observedAt},
   rpc:{...right,source:'RPC',operationId:rpc.view.operationId??null,transactionHash:rpc.view.transactionHash??null,observationIndex:rpc.view.index,observationTimestamp:rpc.raw.observedAt},
   rawSqlSha256:sql.saved.sha256,rawRpcSha256:rpc.saved.sha256},inventory);
  const terminalSql=terminal(sql.view,'SQL'),terminalRpc=terminal(rpc.view,'RPC');
  const wrong=identityError(sql.view,scope)??identityError(rpc.view,scope);
  const malformed=[left,right].some(v=>Object.values(v).some(f=>f.status==='MALFORMED_XDR'))||sql.view.decodeError||rpc.view.decodeError;
  let status;
  if(wrong)status=wrong;
  else if(malformed)status='MALFORMED_XDR';
  else if(!terminalSql)status='PROJECTION_NOT_TERMINAL';
  else if(!terminalRpc)status='RPC_NOT_TERMINAL';
  else if(sql.view.status!==rpc.view.status)status='TERMINAL_RESULT_MISMATCH';
  else if((rpc.view.status==='SUCCESS')!==(right.resultXdr.resultTag==='txSuccess'))status='RESULT_STATUS_MISMATCH';
  else if(!Buffer.from(left.resultXdr.canonicalBase64,'base64').equals(Buffer.from(right.resultXdr.canonicalBase64,'base64'))||
          !Buffer.from(left.resultMetaXdr.canonicalBase64,'base64').equals(Buffer.from(right.resultMetaXdr.canonicalBase64,'base64')))status='CANONICAL_BYTES_MISMATCH';
  else status=(sql.view.resultXdr!==rpc.view.resultXdr||sql.view.resultMetaXdr!==rpc.view.resultMetaXdr)?'ENCODING_REPRESENTATION_DIFFERENCE':'CANONICAL_BYTES_MATCH';
  const decision={attempt,status,terminalSql,terminalRpc,chainResult:rpc.view.status??null,elapsedMs:elapsed(),
   rawSqlSha256:sql.saved.sha256,rawRpcSha256:rpc.saved.sha256,canonicalInputsSha256:decoded.sha256,
   sqlDecodedHashes:{resultXdr:left.resultXdr.decodedBytesSha256??null,resultMetaXdr:left.resultMetaXdr.decodedBytesSha256??null},
   rpcDecodedHashes:{resultXdr:right.resultXdr.decodedBytesSha256??null,resultMetaXdr:right.resultMetaXdr.decodedBytesSha256??null}};
  await durable(directory,String(attempt).padStart(2,'0')+'-decision.json',decision,inventory);lastPair=decision;reason=status;
  if(now()>=deadline){reason='CONVERGENCE_TIME_LIMIT';break;}
  if(['CANONICAL_BYTES_MATCH','ENCODING_REPRESENTATION_DIFFERENCE'].includes(status))return finish('DURABLE_RECEIPT_CONVERGED');
  if(wrong||malformed)break;
  if(attempt<MAX_RECEIPT_READ_ATTEMPTS&&now()<deadline)await delay(Math.min(RECEIPT_REREAD_INTERVAL_MS,Math.max(0,deadline-now())));
 }
 return finish('DURABLE_RECEIPT_MISMATCH_PRESERVED');
}
