import {setTimeout as delay} from 'node:timers/promises';

const branded=new WeakSet();
const RPC='https://soroban-testnet.stellar.org';
const MAX_RESPONSE_BYTES=2_097_152;
export const SQL_RECEIPT_QUERY=`SELECT pg_catalog.jsonb_build_object(
 'operationId',o.id::text,'transactionHash',pg_catalog.encode(e.transaction_hash,'hex'),
 'receiptTransactionHash',w.confirmation->>'transactionHash','batteryId',o.battery_id,'method',o.command,
 'ledger',w.confirmation->'confirmationLedger','applicationState',o.state,'durableState',w.state,
 'status',CASE WHEN w.state IN ('PROJECTED','CONFIRMED_SUCCESS') THEN 'SUCCESS'
               WHEN w.state='CONFIRMED_FAILED' THEN 'FAILED' ELSE 'PENDING' END,
 'resultXdr',w.confirmation->>'resultXdr','resultMetaXdr',w.confirmation->>'resultMetaXdr'
)::text AS receipt
FROM app_private.stellar_operations o
JOIN api_private.testnet_work w ON w.operation_id=o.id AND w.deployment_id=o.deployment_id
LEFT JOIN api_private.testnet_envelopes e ON e.operation_id=o.id AND e.deployment_id=o.deployment_id
WHERE o.deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'::uuid
AND o.id=$1::uuid AND o.battery_id=$3
AND (e.transaction_hash=pg_catalog.decode($2,'hex') OR e.transaction_hash IS NULL)`;

function brand(readSql,readRpc,classification){const readers=Object.freeze({readSql,readRpc,classification});branded.add(readers);return readers;}
export const isReadOnlyReaders=value=>branded.has(value);

/** The existing observer supplies its pool. No credentials, env, role change,
 * arbitrary SQL, application import, transaction builder or signer is loaded. */
export function createReadOnlyReaders(pool){
 if(!pool||typeof pool.connect!=='function')throw Error('READONLY_POOL_REQUIRED');
 return brand(async(scope,signal)=>{
  signal.throwIfAborted();const db=await pool.connect();
  try{
   await db.query('BEGIN TRANSACTION READ ONLY');signal.throwIfAborted();
   const rows=(await db.query({text:SQL_RECEIPT_QUERY,values:[scope.operationId,scope.transactionHash,scope.batteryId],query_timeout:3000})).rows;
   signal.throwIfAborted();if(rows.length>1)throw Error('AMBIGUOUS_SQL_RECEIPT');
   const rawUtf8=rows.length===1?rows[0].receipt:JSON.stringify({status:'ABSENT',operationId:scope.operationId,transactionHash:null,batteryId:scope.batteryId});
   if(typeof rawUtf8!=='string'||Buffer.byteLength(rawUtf8)>MAX_RESPONSE_BYTES)throw Error('SQL_RECEIPT_SIZE_REJECTED');
   return {format:'SQL_RECEIPT_JSON',rawUtf8};
  }finally{try{await db.query('ROLLBACK');}finally{db.release();}}
 },async(scope,signal)=>{
  const response=await fetch(RPC,{method:'POST',redirect:'error',credentials:'omit',signal,headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:{hash:scope.transactionHash}})});
  if(!response.ok||!response.body)throw Error('RPC_READ_FAILED');
  let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>MAX_RESPONSE_BYTES)throw Error('RPC_RECEIPT_SIZE_REJECTED');chunks.push(chunk);}
  return {format:'RPC_JSONRPC',rawUtf8:Buffer.concat(chunks).toString('utf8')};
 },'LIVE_READONLY_SQL_AND_TESTNET_RPC');
}

/** Offline-only test/replay input. No caller callback, clock, timeout, reset or
 * lifecycle capability can be attached. Repeats the last frame after exhaustion. */
export function createReplayReaders(sqlFrames,rpcFrames,classification='OFFLINE_SYNTHETIC'){
 if(!Array.isArray(sqlFrames)||!sqlFrames.length||!Array.isArray(rpcFrames)||!rpcFrames.length)throw Error('REPLAY_FRAMES_REQUIRED');
 const sql=structuredClone(sqlFrames),rpc=structuredClone(rpcFrames);let si=0,ri=0;
 async function next(frames,index,signal){const frame=frames[Math.min(index,frames.length-1)];if(frame.delayMs)await delay(frame.delayMs,undefined,{signal});signal.throwIfAborted();return {format:frame.format??'RECEIPT_JSON',rawUtf8:typeof frame.rawUtf8==='string'?frame.rawUtf8:JSON.stringify(frame.value??frame)};}
 return brand((_,s)=>next(sql,si++,s),(_,s)=>next(rpc,ri++,s),classification);
}
