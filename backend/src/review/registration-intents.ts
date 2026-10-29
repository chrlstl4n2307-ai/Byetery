import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {databaseTransaction} from '../application/database.ts';
import {AppError,requireThat} from '../application/errors.ts';
import {uuid} from '../application/validation.ts';

export const REVIEW_DEPLOYMENT='5c0cad2f-5f25-4216-8068-6cb9d2d26325';
export const REVIEW_CONTRACT='CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON';
export interface ReviewIntent {
 operationId:string;batteryId:string;registrationHash:string;status:'WAITING'|'ADOPTED';
 createdAt:string;adoptedAt:string|null;adoptedOperationId:string|null;
 source:'TESTNET';deploymentId:string;transactionHash:null;
}
export interface AdoptionResult {
 operationId:string;batteryId:string;status:'ADOPTED';operationState:'QUEUED';source:'TESTNET';deploymentId:string;
}
/** A trusted local read dependency. No RPC implementation, signing or default ABSENT. */
export interface ReviewChainPrecheck {
 getBattery(context:{deploymentId:string;contractAddress:string;batteryId:string}):Promise<'ABSENT'|'PRESENT'|'UNVERIFIED'>;
}
const allowedErrors=new Set(['ReviewAuthorityRequired','ReviewDeploymentMismatch','InvalidReviewRequest','UnsupportedReviewTemplate',
 'ReviewIdempotencyConflict','ReviewIntentNotFound','ReviewIntentAlreadyAdopted','ReviewMaterialMismatch','ReviewFoundationCollision','ReviewBatteryAlreadyExists']);
function sqlError(error:unknown):never {
 const e=error as {message?:string;code?:string;constraint?:string};
 const code=e.message&&allowedErrors.has(e.message)?e.message:e.constraint==='review_one_waiting_per_principal'?'ReviewWaitingLimit':
  e.code==='23505'?'ReviewConflict':e.code==='42501'?'ReviewAccessDenied':'ReviewDatabaseError';
 throw new AppError(code==='ReviewIntentNotFound'?404:code==='ReviewAccessDenied'||code==='ReviewAuthorityRequired'?403:
  code==='InvalidReviewRequest'||code==='UnsupportedReviewTemplate'?400:code==='ReviewDatabaseError'?503:409,code);
}

/** Trusted-server API/function boundary, NOT an HTTP/Auth adapter. Never takes a role.
 * B2 must supply the principal only after real Auth/session validation. SQL independently
 * checks ACTIVE + actual ADMIN + separate enabled review permission on every call.
 */
export class RegistrationIntents {
 readonly pool:Pool;
 constructor(pool:Pool){this.pool=pool;}
 async create(principal:string,key:string,request:unknown):Promise<ReviewIntent>{
  uuid(principal);
  try{
   return await databaseTransaction(this.pool,async db=>(await db.query<{result:ReviewIntent}>(
    'select review_private.create_registration_intent($1,$2,$3::jsonb) result',[principal,key,JSON.stringify(request)])).rows[0].result,'5s');
  }catch(error){return sqlError(error);}
 }
 async status(principal:string,operationId:string):Promise<ReviewIntent>{
  uuid(principal);uuid(operationId);
  try{return await databaseTransaction(this.pool,async db=>{
   return (await db.query<{result:ReviewIntent}>('select review_private.registration_intent_status($1,$2) result',[principal,operationId])).rows[0].result;
  },'5s');}catch(error){return sqlError(error);}
 }
}

/** Local owner capability: never imported by the generic worker, HTTP or hosted API.
 * The only input to adopt is the reserved UUID. The precheck is independently injected
 * by a trusted operator, not selectable in a browser/CLI argument. No processor dependency.
 */
export class OwnerRegistrationAdoption {
 readonly pool:Pool;readonly chain:ReviewChainPrecheck;
 constructor(pool:Pool,chain:ReviewChainPrecheck){this.pool=pool;this.chain=chain;}
 async adopt(operationId:string):Promise<AdoptionResult>{
  uuid(operationId);
  // Finish the read transaction BEFORE any external dependency. Snapshot is immutable;
  // the SQL function locks/revalidates status, identity/material and authority afterward.
  const snapshot=await databaseTransaction(this.pool,async db=>{
   await db.query('set transaction read only');
   const r=(await db.query<{deployment_id:string;battery_id:string;manifest_bytes:Buffer;registration_hash:Buffer;status:string}>(
    'select deployment_id,battery_id,manifest_bytes,registration_hash,status from review_private.registration_intents where operation_id=$1',[operationId])).rows[0];
   requireThat(r,404,'ReviewIntentNotFound');
   requireThat(r.deployment_id===REVIEW_DEPLOYMENT,409,'ReviewDeploymentMismatch');
   requireThat(r.status==='WAITING',409,'ReviewIntentAlreadyAdopted');
   requireThat(createHash('sha256').update(r.manifest_bytes).digest().equals(r.registration_hash),409,'ReviewMaterialMismatch');
   return r;
  },'5s');
  const absent=await this.chain.getBattery({deploymentId:snapshot.deployment_id,contractAddress:REVIEW_CONTRACT,batteryId:snapshot.battery_id});
  requireThat(absent==='ABSENT',409,absent==='PRESENT'?'ReviewChainBatteryExists':'ReviewChainUnverified');
  try{return await databaseTransaction(this.pool,async db=>(await db.query<{result:AdoptionResult}>(
   'select review_private.adopt_registration_intent($1) result',[operationId])).rows[0].result,'5s');
  }catch(error){return sqlError(error);}
 }
}
