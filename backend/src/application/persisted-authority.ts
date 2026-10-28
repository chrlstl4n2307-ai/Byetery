import {ensure,type Command} from '../domain.ts';
import {requiredAuthority} from './authority.ts';

export interface AuthoritySql {query<T=Record<string,unknown>>(sql:string,params?:unknown[]):Promise<{rows:T[]}>}
export interface AuthorityContext {deploymentId:string;operationId:string;principal:string;command:Command}

/** SQL only. The same immutable owner/actor policy serves pre-sign and dispatch. */
export async function assertPersistedAuthority(db:AuthoritySql,w:AuthorityContext,lock=false):Promise<void>{
 const op=(await db.query<{principal:string;command:string;battery_id:string}>(`select principal,command,battery_id from app_private.stellar_operations
  where deployment_id=$1 and id=$2`,[w.deploymentId,w.operationId])).rows[0];
 ensure(op&&op.principal===w.principal&&typeof op.principal==='string'
  &&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(op.principal),'AuthorizationRevoked');
 ensure(op.command===w.command.kind&&'batteryId' in w.command&&op.battery_id===w.command.batteryId,'AuthorizationRevoked');
 let owner:string|null=null;
 if(w.command.kind==='cancel_return'){
  const r=(await db.query<{user_id:string}>(`select user_id from app_private.return_requests where deployment_id=$1
   and request_id=decode($2,'hex') and battery_id=$3`,[w.deploymentId,w.command.requestId,w.command.batteryId])).rows[0];
  ensure(r&&r.user_id===op.principal,'AuthorizationRevoked');owner=r.user_id;
 }else if(w.command.kind==='pay_reward'){
  const r=(await db.query<{user_id:string}>(`select r.user_id from app_private.reward_attempts a
   join app_private.return_requests r on r.deployment_id=a.deployment_id and r.request_id=a.request_id and r.battery_id=a.battery_id
   join chain_private.batteries b on b.deployment_id=a.deployment_id and b.battery_id=a.battery_id and b.request_id=a.request_id
   where a.deployment_id=$1 and a.operation_id=$2 and a.battery_id=$3`,[w.deploymentId,w.operationId,w.command.batteryId])).rows[0];
  ensure(r,'AuthorizationRevoked');owner=r.user_id;
 }
 const authority=requiredAuthority(w.command.kind,op.principal,owner);
 // Principal first, then membership: consistent with internal principal-disable cleanup.
 const user=(await db.query(`select id from app_private.users where id=$1 and status='ACTIVE'${lock?' for share':''}`,[op.principal])).rows[0];
 ensure(user,'AuthorizationRevoked');
 const member=(await db.query<{actor_address:string|null}>(`select actor_address from api_private.memberships
  where deployment_id=$1 and user_id=$2 and role=$3 and enabled${lock?' for share':''}`,[w.deploymentId,op.principal,authority.role])).rows[0];
 ensure(member,'AuthorizationRevoked');
 if(authority.ownsRequest)ensure(owner===op.principal,'AuthorizationRevoked');
 if(authority.actorField==='collector')ensure(w.command.kind==='confirm_collection'&&member.actor_address===w.command.collector,'AuthorizationRevoked');
 if(authority.actorField==='recycler')ensure(w.command.kind==='confirm_recycling'&&member.actor_address===w.command.recycler,'AuthorizationRevoked');
}
