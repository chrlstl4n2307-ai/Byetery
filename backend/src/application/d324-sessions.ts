import {randomUUID} from 'node:crypto';
import type {SupabaseAuth,Identity} from './auth.ts';
import {one,type Repository} from './repository.ts';
import {requireThat} from './errors.ts';
import {D324} from './d324-scope.ts';
import {ACTORS} from '../testnet/abi.ts';

export const D324_SESSION_ROLES=['ADMIN','USER','COLLECTOR','RECYCLER'] as const;
export type D324SessionRole=typeof D324_SESSION_ROLES[number];
export type D324Sessions=Readonly<Record<D324SessionRole,Identity>>;
export interface PreparedD324Sessions {
  readonly preparationId:string;
  readonly instanceId:string;
  readonly challenge:string;
  readonly sessions:readonly Readonly<Identity&{role:D324SessionRole}>[];
  readonly effectiveNotAfter:number;
}
const custody=new WeakMap<object,{identities:D324Sessions;instanceId:string;challenge:string}>();

/** Internal server preparation. Only Auth validates bearers. No business write,
 * login, token refresh, role assignment, admission or token persistence. */
export async function prepareD324Sessions(repo:Repository,auth:Pick<SupabaseAuth,'validate'>,
  headers:Readonly<Record<D324SessionRole,string>>,instanceId:string,challenge:string,now=Date.now):Promise<PreparedD324Sessions>{
  requireThat(repo.mode==='TESTNET'&&repo.deploymentId===D324.deploymentId,403,'D324SessionScopeRejected');
  requireThat(headers&&Object.keys(headers).sort().join(',')===[...D324_SESSION_ROLES].sort().join(','),403,'D324SessionScopeRejected');
  const identities={} as Record<D324SessionRole,Identity>;
  for(const role of D324_SESSION_ROLES){
    const identity=await auth.validate(headers[role]);
    requireThat(Number.isSafeInteger(identity.tokenExpiresAt)&&identity.tokenExpiresAt!>now()+120_000,403,'D324SessionScopeRejected');
    identities[role]=Object.freeze({...identity});
  }
  requireThat(new Set(Object.values(identities).map(s=>s.sessionId)).size===4,403,'D324SessionScopeRejected');
  const dbLimit=await repo.transaction(async db=>{
    let limit=Infinity;
    for(const role of D324_SESSION_ROLES){
      const identity=identities[role];
      const row=await one(db,`select s.not_after,m.actor_address from auth.sessions s
        join app_private.users u on u.auth_user_id=s.user_id and u.status='ACTIVE'
        join api_private.memberships m on m.user_id=u.id and m.deployment_id=$3 and m.role=$4 and m.enabled
        where s.id=$1 and s.user_id=$2 and (s.not_after is null or s.not_after>clock_timestamp()+interval '120 seconds')
        for share of s,u,m`,[identity.sessionId,identity.authUserId,repo.deploymentId,role]);
      requireThat(row,403,'D324SessionScopeRejected');
      if(role==='COLLECTOR'||role==='RECYCLER')
        requireThat(row.actor_address===(role==='COLLECTOR'?ACTORS.collector:ACTORS.recycler),403,'D324SessionScopeRejected');
      limit=Math.min(limit,identity.tokenExpiresAt!,row.not_after?new Date(row.not_after).getTime():Infinity);
    }
    return limit-120_000;
  });
  const prepared=Object.freeze({preparationId:randomUUID(),instanceId,challenge,
    sessions:Object.freeze(D324_SESSION_ROLES.map(role=>Object.freeze({role,...identities[role]}))),effectiveNotAfter:dbLimit});
  custody.set(prepared,{identities:Object.freeze(identities),instanceId,challenge});
  return prepared;
}
/** One attempt only, tied to this server instance. Restart requires fresh
 * validation. Durable admission uniqueness remains enforced by PostgreSQL. */
export function consumePreparedD324Sessions(prepared:PreparedD324Sessions,instanceId:string,challenge:string,now=Date.now):D324Sessions {
  const stored=custody.get(prepared);
  requireThat(stored&&stored.instanceId===instanceId&&stored.challenge===challenge&&now()<prepared.effectiveNotAfter,
    403,'D324SessionPreparationRequired');
  custody.delete(prepared);
  return stored.identities;
}
