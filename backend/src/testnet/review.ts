import type {AuthoritySql} from '../application/persisted-authority.ts';

export async function reviewEvidence(db:AuthoritySql,w:{deploymentId:string;operationId:string},reason:string){
 await db.query(`insert into api_private.testnet_observations(deployment_id,operation_id,kind,evidence)
  values($1,$2,'STATE_READ',$3::jsonb)`,[w.deploymentId,w.operationId,JSON.stringify({classification:'REVIEWED_RESOLUTION_REQUIRED',reason})]);
}
export async function authorizationHold(db:AuthoritySql,id:string){
 return (await db.query(`select 1 from api_private.testnet_observations where operation_id=$1
  and evidence->>'classification'='REVIEWED_RESOLUTION_REQUIRED' and evidence->>'reason'='AUTHORIZATION_REVOKED' limit 1`,[id])).rows.length>0;
}
