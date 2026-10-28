import {DomainError,ensure,type Command} from '../domain.ts';
import {assertPersistedAuthority,type AuthoritySql} from './persisted-authority.ts';
import {reviewEvidence} from '../testnet/review.ts';

/** Internal SQL-only mechanism. Caller owns the transaction; never exposed by HTTP.
 * Raw administrative SQL must use this mechanism to obtain proactive holds.
 * dispatchIntent independently guards even a raw SQL membership revocation.
 */
export async function disableMemberships(db:AuthoritySql,deploymentId:string,principal:string,roles?:readonly string[]):Promise<void>{
 ensure(!roles||roles.length>0&&roles.every(r=>['USER','ADMIN','COLLECTOR','RECYCLER'].includes(r)),'InvalidMembershipRole');
 await db.query('select id from app_private.users where id=$1 for share',[principal]);
 // Lock all of this principal's membership rows in one order, even when only
 // one role is disabled. Concurrent different-role revocations cannot invert
 // membership/work locks while checking an owner reward's required authority.
 await db.query(`select role from api_private.memberships where deployment_id=$1 and user_id=$2
  order by role for update`,[deploymentId,principal]);
 await db.query(`update api_private.memberships set enabled=false where deployment_id=$1 and user_id=$2
  and ($3::text[] is null or role=any($3::text[]))`,[deploymentId,principal,roles??null]);
 const candidates=await db.query<{operation_id:string;parameters:Command;principal:string}>(`select w.operation_id,o.parameters,o.principal
  from api_private.testnet_work w join app_private.stellar_operations o on o.id=w.operation_id and o.deployment_id=w.deployment_id
  join api_private.testnet_envelopes e on e.operation_id=w.operation_id and e.deployment_id=w.deployment_id
  where w.deployment_id=$1 and o.principal=$2 and w.state='READY' and w.dispatch_attempts=0
  order by w.operation_id for update of w`,[deploymentId,principal]);
 for(const row of candidates.rows){
  const context={deploymentId,operationId:row.operation_id,principal:row.principal,command:row.parameters};
  try{await assertPersistedAuthority(db,context,true);}
  catch(error){if(!(error instanceof DomainError&&error.code==='AuthorizationRevoked'))throw error;
   await reviewEvidence(db,context,'AUTHORIZATION_REVOKED');}
 }
}
