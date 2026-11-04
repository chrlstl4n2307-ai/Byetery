import {createHash} from 'node:crypto';
import {canonical} from '../application/validation.ts';
import {ensure} from '../domain.ts';
import {assertLocalRuntime} from '../d3/operator-guard.ts';
import {assertVerifiedClosure,type VerifiedClosure,INCIDENT} from './closure-proof.ts';
import type {TransportDatabase} from './store.ts';
import {ACTORS,CONTRACT,WASM} from './abi.ts';
import {NETWORK_ID} from './identity.ts';
export interface CommittedCloseReceipt {
  operationId:string;batteryId:string;incidentSha:string;fixSha:string;proofDigest:string;
}
const committedReceipts=new WeakSet<object>();
export function assertCommittedCloseReceipt(receipt:CommittedCloseReceipt){ensure(committedReceipts.has(receipt),'CommittedClosureRequired');}
function committed(receipt:Record<string,unknown>):CommittedCloseReceipt{
  ensure(receipt.schemaVersion==='BYETERY_PRE_DISPATCH_CLOSE_V1'&&receipt.operationId===INCIDENT.operationId&&receipt.batteryId===INCIDENT.batteryId
    &&receipt.incidentSha===INCIDENT.incidentSha&&/^[a-f0-9]{40}$/.test(String(receipt.fixSha))&&/^[a-f0-9]{64}$/.test(String(receipt.proofDigest)),'InvalidClosureReceipt');
  const result=Object.freeze({operationId:INCIDENT.operationId,batteryId:INCIDENT.batteryId,incidentSha:INCIDENT.incidentSha,fixSha:String(receipt.fixSha),proofDigest:String(receipt.proofDigest)});
  committedReceipts.add(result);return result;
}
/** Inspect the same committed pair after a lost COMMIT response. No repeated writes. */
export async function readClosureReceipt(database:TransportDatabase,decisionId:string){
  const row=await database.transaction(async db=>(await db.query<{evidence:Record<string,unknown>}>(`select x.evidence from api_private.testnet_observations x
    join api_private.testnet_work w on w.operation_id=x.operation_id and w.deployment_id=x.deployment_id
    join app_private.stellar_operations o on o.id=w.operation_id and o.deployment_id=w.deployment_id
    where x.operation_id=$1 and x.deployment_id=$2 and x.kind='PRE_DISPATCH_CLOSE' and x.evidence->>'decisionId'=$3
      and w.state='ABORTED_PRE_DISPATCH' and o.state='CANCELLED_LOCAL'`,[INCIDENT.operationId,INCIDENT.deploymentId,decisionId])).rows[0]);
  return row?committed(row.evidence):null;
}
/** SQL-only, import-safe recovery capability. Not registered on any API/worker. */
export async function closeReviewedRegistration(database:TransportDatabase,proof:VerifiedClosure,now:()=>number=Date.now){
  assertLocalRuntime();assertVerifiedClosure(proof,now());const r=proof.review;
  const result=await database.transaction(async db=>{
    // Match application lock order, then source fence, parent work, logical row.
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[r.deploymentId]);
    const lease=(await db.query<{generation:string;operation_id:string;expired:boolean}>(`select generation::text,operation_id,lease_until<=clock_timestamp() as expired from api_private.testnet_source_leases
      where network_id=decode($1,'hex') and source_account=$2 for update`,[NETWORK_ID,ACTORS.admin])).rows[0];
    ensure(lease&&lease.operation_id===r.operationId&&lease.expired,'ClosureLeaseActiveOrMissing');
    const row=(await db.query<Record<string,any>>(`select w.*,o.state as logical_state,encode(w.context_hash,'hex') as hash,o.parameters,encode(o.parameters_hash,'hex') as logical_hash,d.mode,d.contract_address as deployed_contract,encode(d.wasm_hash,'hex') as wasm
      from api_private.testnet_work w join app_private.stellar_operations o on o.id=w.operation_id join chain_private.deployments d on d.id=w.deployment_id
      where w.operation_id=$1 for update of w,o`,[r.operationId])).rows[0];
    assertVerifiedClosure(proof,now());
    ensure(row&&row.operation_id===INCIDENT.operationId&&row.deployment_id===r.deploymentId&&row.battery_id===r.batteryId&&row.command==='register_battery'
      &&row.mode==='TESTNET'&&row.deployed_contract===CONTRACT&&row.contract_address===CONTRACT&&row.source_account===ACTORS.admin&&row.wasm===WASM&&row.hash===r.contextHash&&row.logical_hash===r.contextHash
      &&createHash('sha256').update(canonical(row.parameters)).digest('hex')===r.contextHash,'ClosureContextMismatch');
    const prior=(await db.query<{evidence:Record<string,unknown>}>("select evidence from api_private.testnet_observations where operation_id=$1 and kind='PRE_DISPATCH_CLOSE'",[r.operationId])).rows[0];
    if(prior){ensure(row.state==='ABORTED_PRE_DISPATCH'&&row.logical_state==='CANCELLED_LOCAL'&&prior.evidence.decisionId===r.decisionId,'ClosureDecisionConflict');return prior.evidence;}
    ensure(lease.generation===proof.leaseGeneration,'ClosureLeaseGenerationChanged');
    ensure(row.state==='PREPARING'&&row.logical_state==='QUEUED'&&row.dispatch_attempts===0&&!row.confirmation&&!row.state_evidence,'ClosureStateMismatch');
    const bad=(await db.query(`select 1 from api_private.testnet_envelopes where operation_id=$1
      union all select 1 from api_private.operation_transport where operation_id=$1
      union all select 1 from api_private.testnet_observations where operation_id=$1 and kind in ('DISPATCH_INTENT','SUBMIT_RESPONSE','RPC_OUTAGE','SUCCESS','FAILED')
      union all select 1 from chain_private.batteries where deployment_id=$2 and battery_id=$3`,[r.operationId,r.deploymentId,r.batteryId])).rows;
    ensure(bad.length===0,'ClosureIdentityOrDispatchExists');
    const baseline=(await db.query<{sequence:string}>("select evidence->>'sourceSequence' as sequence from api_private.testnet_observations where operation_id=$1 and evidence->>'classification'='SIMULATION' order by id limit 1",[r.operationId])).rows[0];
    ensure(baseline?.sequence===proof.sequence,'ClosureBaselineMissing');
    ensure((await db.query('select 1 from api_private.idempotency where operation_id=$1 and response_body is null',[r.operationId])).rows.length===1,'ClosureIdempotencyConflict');
    const receipt={leaseGeneration:lease.generation,schemaVersion:'BYETERY_PRE_DISPATCH_CLOSE_V1',...r,proofDigest:proof.proofDigest,observedAt:proof.observedAt,observationLedger:proof.observationLedger,
      state:'ABORTED_PRE_DISPATCH',logicalState:'CANCELLED_LOCAL',reason:'PreDispatchAborted',contextHash:r.contextHash,counting:false,physicalSignerUse:'UNKNOWN',successfulBusinessTx:0};
    await db.query('update api_private.testnet_source_leases set generation=generation+1 where network_id=decode($1,\'hex\') and source_account=$2',[NETWORK_ID,ACTORS.admin]);
    await db.query("insert into api_private.testnet_observations(deployment_id,operation_id,kind,evidence) values($1,$2,'PRE_DISPATCH_CLOSE',$3::jsonb)",[r.deploymentId,r.operationId,JSON.stringify(receipt)]);
    await db.query("update api_private.testnet_work set state='ABORTED_PRE_DISPATCH' where operation_id=$1",[r.operationId]);
    await db.query("update app_private.stellar_operations set state='CANCELLED_LOCAL',error_code='PreDispatchAborted' where id=$1",[r.operationId]);
    await db.query(`update api_private.idempotency set response_status=409,response_body=$2::jsonb where operation_id=$1`,[r.operationId,JSON.stringify({source:'TESTNET',operationId:r.operationId,class:'TERMINAL_UNSIGNED',state:'CANCELLED_LOCAL',transportState:'ABORTED_PRE_DISPATCH',terminal:true,transactionHash:null,reason:'PreDispatchAborted',counting:false})]);
    return receipt;
  });
  return committed(result);
}
