import type {Db} from './repository.ts';
import {requireThat} from './errors.ts';

/** Read-only assertion. Never provisions or re-enables authority. */
export async function requireMembership(db:Db,deploymentId:string,user:string,role:string,errorCode='RoleRequired'):Promise<string|null>{
 requireThat(['USER','ADMIN','COLLECTOR','RECYCLER'].includes(role),403,errorCode);
 const row=(await db.query(`select m.actor_address from api_private.memberships m
  join app_private.users u on u.id=m.user_id and u.status='ACTIVE'
  where m.deployment_id=$1 and m.user_id=$2 and m.role=$3 and m.enabled`,[deploymentId,user,role])).rows[0];
 requireThat(row,403,errorCode);
 return row.actor_address as string|null;
}
