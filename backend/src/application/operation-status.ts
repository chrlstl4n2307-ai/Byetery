import type {Identity} from './auth.ts';
import type {Repository} from './repository.ts';
import {databaseTransaction} from './database.ts';
import {requireThat} from './errors.ts';
import {requireMembership} from './membership.ts';
import {CONTRACT} from '../testnet/abi.ts';
import {NETWORK_ID} from '../testnet/identity.ts';
import {INCIDENT} from '../testnet/closure-proof.ts';
export interface StatusRow {id:string;state:string;transport_state:string|null;transaction_hash:string|null;dispatch_attempts:number;review_required:boolean;interrupted:boolean;identity_uncertain?:boolean;rpc_uncertain?:boolean}
export function operationPresentation(row:StatusRow){
  const closed=row.transport_state==='ABORTED_PRE_DISPATCH';
  const intent=row.dispatch_attempts>0;
  const confirmed=row.state==='CONFIRMED'&&row.transport_state==='PROJECTED'&&!!row.transaction_hash;
  const rejected=row.state==='REJECTED';
  const failed=rejected&&row.transport_state==='CONFIRMED_FAILED'&&!!row.transaction_hash;
  const identityUncertain=(row.identity_uncertain===true||row.rpc_uncertain===true||(intent&&!row.transaction_hash))&&!confirmed&&!failed;
  const expiredNotIncluded=!identityUncertain&&intent&&!!row.transaction_hash&&row.transport_state==='EXPIRED_NOT_APPLIED';
  let label='ACCEPTED';
  if(closed)label='TERMINAL_UNSIGNED';
  else if(identityUncertain)label='UNCERTAIN_OPEN';
  else if(expiredNotIncluded)label='EXPIRED_NOT_INCLUDED';
  else if(confirmed||failed)label='CONFIRMED';
  else if(rejected)label='REJECTED';
  else if(intent&&row.transport_state==='EXPIRED_UNRESOLVED')label='UNCERTAIN_OPEN';
  else if(row.review_required&&!intent)label='REVIEWED_RESOLUTION_REQUIRED';
  else if(intent)label=row.state==='UNKNOWN'?'SUBMITTED_UNKNOWN':'SUBMITTED';
  else if(row.transaction_hash)label='READY';
  else if(row.interrupted)label='PRE_DISPATCH_INTERRUPTED';
  else if(row.transport_state==='PREPARING')label='PREPARING';
  return {source:'TESTNET',deploymentId:INCIDENT.deploymentId,operationId:row.id,class:label,state:row.state,transportState:row.transport_state,
    transactionHash:row.transaction_hash,statusUrl:'/api/operations/'+row.id,observedAt:new Date().toISOString(),terminal:closed||(!identityUncertain&&(confirmed||rejected||expiredNotIncluded)),
    reviewRequired:identityUncertain||row.review_required||row.interrupted,submissionEvidence:intent?'DURABLE_INTENT':row.transaction_hash?'SIGNED_NO_INTENT':'NONE',
    result:closed?'NOT_SUBMITTED':identityUncertain?null:expiredNotIncluded?'NOT_APPLIED':confirmed?'SUCCESS':failed?'FAILED':rejected?'REJECTED':null,counting:closed?false:undefined};
}
/** No provisioning, worker, transport or reconciliation callback in this read. */
export async function operationStatus(repo:Repository,identity:Identity,selector:{id?:string;key?:string}){
  requireThat(repo.mode==='TESTNET'&&repo.deploymentId===INCIDENT.deploymentId,404,'OperationNotFound');
  requireThat(selector.id?/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(selector.id):typeof selector.key==='string'&&/^[A-Za-z0-9._:-]{8,128}$/.test(selector.key),404,'OperationNotFound');
  return databaseTransaction(repo.pool,async db=>{
    await db.query('set transaction read only');await db.query("set local statement_timeout='5s'");
    const user=(await db.query(`select u.id from app_private.users u join auth.sessions s on s.user_id=u.auth_user_id
      where u.auth_user_id=$1 and s.id=$2 and u.status='ACTIVE' and (s.not_after is null or s.not_after>now())`,[identity.authUserId,identity.sessionId])).rows[0];
    requireThat(user,404,'OperationNotFound');await requireMembership(db,repo.deploymentId,user.id,'USER','OperationNotFound');
    const row=(await db.query<StatusRow>(`select o.id,o.state,w.state as transport_state,encode(e.transaction_hash,'hex') as transaction_hash,
      coalesce(w.dispatch_attempts,0) as dispatch_attempts,
      exists(select 1 from api_private.testnet_observations x where x.operation_id=o.id and x.evidence->>'classification'='REVIEWED_RESOLUTION_REQUIRED') as review_required,
      exists(select 1 from api_private.testnet_observations x where x.operation_id=o.id
        and x.kind='STATE_READ' and x.evidence->>'classification'='DURABLE_IDENTITY_UNCERTAIN') as identity_uncertain,
      ((select x.evidence->>'classification' from api_private.testnet_observations x where x.operation_id=o.id
        and x.kind in ('RPC_OUTAGE','NOT_FOUND','SUCCESS','FAILED','STATE_READ') order by x.id desc limit 1)='UNCERTAIN_OPEN_RPC') as rpc_uncertain,
      (w.state='PREPARING' and e.operation_id is null and not exists(select 1 from api_private.testnet_source_leases l
        where l.operation_id=w.operation_id and l.lease_until>clock_timestamp())) as interrupted
      from app_private.stellar_operations o join chain_private.deployments d on d.id=o.deployment_id
      left join api_private.testnet_work w on w.operation_id=o.id left join api_private.testnet_envelopes e on e.operation_id=o.id
      where o.deployment_id=$1 and o.principal=$2::text and ($3::uuid is null or o.id=$3)
        and ($4::text is null or o.idempotency_key=$4) and d.mode='TESTNET' and d.contract_address=$5 and d.network_id=decode($6,'hex')`,
      [repo.deploymentId,user.id,selector.id??null,selector.key??null,CONTRACT,NETWORK_ID])).rows[0];
    requireThat(row,404,'OperationNotFound');return operationPresentation(row);
  },'5s');
}
