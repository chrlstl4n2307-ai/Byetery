import {createHash,createPublicKey,randomUUID,verify,type KeyObject} from 'node:crypto';
import {ensure,type Command} from '../domain.ts';
import type {Identity} from './auth.ts';
import {requireThat} from './errors.ts';
import {one,type Db,type Repository} from './repository.ts';
import {canonical} from './validation.ts';
import {ACTORS} from '../testnet/abi.ts';
import {D324,d324Scope} from './d324-scope.ts';

export const D324_COMMANDS=['register_battery','open_return','confirm_collection','confirm_recycling','pay_reward'] as const;
const roles=['ADMIN','USER','COLLECTOR','RECYCLER','USER'] as const;
const sessionRoles=['ADMIN','USER','COLLECTOR','RECYCLER'] as const;
export const D324_TIME=Object.freeze({grantMs:900_000,observationMs:600_000,executionMs:4_500_000,sessionMarginMs:120_000});
type ExecutionSessions=Readonly<Record<typeof sessionRoles[number],Identity>>;
interface SessionPin {role:typeof sessionRoles[number];authUserId:string;sessionId:string;tokenExpiresAt:number}
const sessionPins=(identities:ExecutionSessions):SessionPin[]=>sessionRoles.map(role=>{
  const identity=identities?.[role];
  requireThat(identity,403,'D324SessionScopeRejected');
  return {role,authUserId:scalar(identity.authUserId,uuid),sessionId:scalar(identity.sessionId,uuid),tokenExpiresAt:time(identity.tokenExpiresAt)};
});
const hex=/^[a-f0-9]{64}$/;
const sha=/^[a-f0-9]{40}$/;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const retiredPlanHash='3c03cfe14ea2bb091fba229c378ebea859b8ebdadbdbb6ee739b23b1b831a02d';
// Five confirmed entries and the excluded zero-dispatch incident in the
// pinned external project ledger. The independent preflight verifies their facts.
const historicalIds=[
  '3cadbed2-eddd-4c19-96fe-e6773fc4c269','7f9a97b0-1ddf-4b5a-a17a-0b6b19bcfaed',
  '78646fea-b225-496a-8540-0ae8d90bd983','2201faa3-980a-4250-8578-ec024272a022',
  '45f4fe9e-e423-419d-9d6a-7b3d7c4ff9f0','0192a5b3-36e9-4709-9708-03d6a56a5125',
];
const digest=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const equalRecord=(value:unknown,keys:string[]):value is Record<string,unknown> =>
  value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===keys.sort().join('\0');
const safeTime=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
const closed=(value:unknown,keys:string[]):Record<string,unknown>=>{
  requireThat(equalRecord(value,keys),403,'D324AuthorityMalformed');
  return value;
};
const scalar=(value:unknown,pattern:RegExp):string=>{
  requireThat(typeof value==='string'&&pattern.test(value),403,'D324AuthorityMalformed');
  return value;
};
const time=(value:unknown):number=>{
  requireThat(safeTime(value),403,'D324AuthorityMalformed');
  return value;
};
const canonicalBytes=(value:unknown)=>Buffer.from(canonical(value)+'\n','utf8');
const message=(domain:string,value:unknown)=>Buffer.concat([Buffer.from(domain+'\n'),canonicalBytes(value)]);

function parseCanonical(bytes:Buffer):unknown {
  try {
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(bytes.equals(canonicalBytes(data))) return data;
  }catch { /* A malformed input never reaches a write. */ }
  requireThat(false,403,'D324AuthorityMalformed');
}
function signature(key:KeyObject,bytes:Buffer,encoded:unknown) {
  const wire=scalar(encoded,/^[A-Za-z0-9_-]{86}$/),raw=Buffer.from(wire,'base64url');
  requireThat(key.asymmetricKeyType==='ed25519'&&raw.length===64&&raw.toString('base64url')===wire&&verify(null,bytes,key,raw),
    403,'D324SignatureRejected');
}
function runnerKey(rawHex:string) {
  return createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(rawHex,'hex')]),type:'spki',format:'der'});
}


export interface D324Pins {
  compositionSha:string;
  operatorSha:string;
  planHash:string;
  manifestSha256:string;
  ownerPublicKey:KeyObject;
  ownerKeyFingerprint:string;
  instanceId:string;
  challenge:string;
}
interface AdmissionInput {
  manifest:Buffer;
  manifestApproval:string;
  grant:unknown;
  grantSignature:string;
  live:unknown;
  liveSignature:string;
  admissionProof:string;
  execution:unknown;
  executionSignature:string;
}
interface ClaimInput {
  identity:Identity;
  command:string;
  requestId:string|null;
  idempotencyKey:string;
  inputHash:Buffer;
  proof:unknown;
}
interface Claim {
  admissionId:string;
  operationId:string;
  ordinal:number;
  principal:string;
  replay:boolean;
  proofExpiresAt:number;
}

export class D324Authority {
  readonly #pins:Readonly<D324Pins>;
  readonly #readiness:()=>Promise<void>;
  readonly #now:()=>number;
  constructor(pins:D324Pins,readiness:()=>Promise<void>,now=Date.now) {
    requireThat(sha.test(pins.compositionSha)&&sha.test(pins.operatorSha)&&hex.test(pins.planHash)&&pins.planHash!==retiredPlanHash&&hex.test(pins.manifestSha256)
      &&hex.test(pins.instanceId)&&hex.test(pins.challenge)&&pins.ownerPublicKey.type==='public'
      &&pins.ownerPublicKey.asymmetricKeyType==='ed25519'
      &&digest(pins.ownerPublicKey.export({format:'der',type:'spki'}))===pins.ownerKeyFingerprint,503,'D324ServerPinsInvalid');
    this.#pins=Object.freeze({...pins});
    this.#readiness=readiness;
    this.#now=now;
  }
  get instanceId(){return this.#pins.instanceId;}

  async admit(repo:Repository,input:AdmissionInput,verifiedSessions:ExecutionSessions):Promise<string> {
    const pin=this.#pins, now=this.#now();
    requireThat(repo.mode==='TESTNET'&&d324Scope(repo.deploymentId,D324.batteryId),403,'D324ScopeRejected');
    requireThat(Buffer.isBuffer(input.manifest)&&input.manifest.length<=8192,403,'D324AuthorityMalformed');
    const raw=Buffer.from(input.manifest), manifestHash=digest(raw);
    requireThat(manifestHash===pin.manifestSha256,403,'D324ManifestMismatch');
    signature(pin.ownerPublicKey,Buffer.from('BYETERY-D324-MANIFEST-APPROVAL-V3\n'+manifestHash+'\n'),input.manifestApproval);
    const manifest=closed(parseCanonical(raw),['schema','target','identity','networkId','deploymentId','operator','ledgerSha256',
      'budget','artifacts','k5Sha256','sessionControlSha256','binaries','operatorRoot']);
    const scope={taskId:D324.taskId,runId:D324.runId,businessSha:pin.operatorSha,planHash:pin.planHash,
      batteryId:D324.batteryId,recipient:D324.recipient};
    requireThat(manifest.schema==='BYETERY_D324_FINAL_ACTIVATION_V3'&&manifest.networkId===D324.networkId&&manifest.deploymentId===D324.deploymentId
      &&(manifest.target as {sha?:unknown}|null)?.sha===pin.compositionSha&&(manifest.operator as {sha?:unknown}|null)?.sha===pin.operatorSha
      &&canonical(manifest.identity)===canonical(scope)&&canonical(manifest.budget)===canonical({
        historicalConfirmed:5,limitWithoutContingency:19,remaining:14,runCap:5,tx20Authorized:false,
      }),403,'D324ManifestMismatch');
    const grant=closed(input.grant,['schemaVersion','action',...Object.keys(scope),'jwtExpirySeconds','jwtObservedAt','compositionRootSha','nonce','issuedAt','expiresAt']);
    requireThat(grant.schemaVersion===1&&grant.action==='AUTHORIZE_D3_24_RUN1_EXECUTION'&&grant.jwtExpirySeconds===5400
      &&Object.entries(scope).every(([key,value])=>grant[key]===value)&&grant.compositionRootSha===pin.compositionSha,403,'D324GrantScopeRejected');
    const nonce=scalar(grant.nonce,hex), issued=time(grant.issuedAt), observed=time(grant.jwtObservedAt), expires=time(grant.expiresAt);
    requireThat(observed<=issued&&issued<=now&&expires-issued===D324_TIME.grantMs&&now<Math.min(expires,observed+D324_TIME.observationMs),403,'D324GrantExpired');
    const grantBytes=Buffer.from(['BYETERY-D3-RUN1-OWNER-GRANT-V1','schemaVersion=1','action='+grant.action,
      ...Object.entries(scope).map(([key,value])=>key+'='+value),'jwtExpirySeconds=5400','jwtObservedAt='+observed,
      'compositionRootSha='+pin.compositionSha,'nonce='+nonce,'issuedAt='+issued,'expiresAt='+expires,''].join('\n'));
    signature(pin.ownerPublicKey,grantBytes,input.grantSignature);
    const grantHash=digest(grantBytes);
    // These identities must come from the trusted Auth validator, separately
    // from the signed request. No bearer is persisted or accepted as a claim.
    const sessions=sessionPins(verifiedSessions);
    requireThat(new Set(sessions.map(s=>s.sessionId)).size===sessions.length,403,'D324SessionScopeRejected');
    const execution=closed(input.execution,['schema',...Object.keys(scope),'deploymentId','networkId','compositionSha',
      'instanceId','challenge','runnerPublicKey','issuedAt','executionNotAfter','sessions']);
    const executionIssued=time(execution.issuedAt),executionExpires=time(execution.executionNotAfter);
    const key=scalar(execution.runnerPublicKey,hex);
    requireThat(execution.schema==='BYETERY_D324_EXECUTION_V1'&&Object.entries(scope).every(([field,value])=>execution[field]===value)
      &&execution.deploymentId===D324.deploymentId&&execution.networkId===D324.networkId&&execution.compositionSha===pin.compositionSha
      &&execution.instanceId===pin.instanceId&&execution.challenge===pin.challenge&&canonical(execution.sessions)===canonical(sessions)
      &&executionIssued>=issued&&executionIssued<=now&&executionExpires>now&&executionExpires-executionIssued<=D324_TIME.executionMs
      &&sessions.every(s=>executionExpires<=s.tokenExpiresAt-D324_TIME.sessionMarginMs),403,'D324ExecutionScopeRejected');
    const executionBytes=message('BYETERY-D324-EXECUTION-V1',execution),executionHash=digest(executionBytes);
    signature(pin.ownerPublicKey,executionBytes,input.executionSignature);
    const live=closed(input.live,['schema','taskId','runId','deploymentId','manifestSha256','grantSha256','executionSha256',
      'instanceId','challenge','runnerPublicKey','issuedAt','expiresAt']);
    const liveIssued=time(live.issuedAt),liveExpires=time(live.expiresAt);
    requireThat(live.schema==='BYETERY_D324_ONE_LIVE_APPROVAL_V3'&&live.taskId===D324.taskId&&live.runId===D324.runId
      &&live.deploymentId===D324.deploymentId&&live.manifestSha256===manifestHash&&live.grantSha256===grantHash&&live.executionSha256===executionHash
      &&live.instanceId===pin.instanceId&&live.challenge===pin.challenge&&live.runnerPublicKey===key&&liveIssued>=executionIssued&&liveIssued<=now
      &&now<liveExpires&&liveExpires<=Math.min(expires,observed+D324_TIME.observationMs),403,'D324LiveScopeRejected');
    const liveBytes=message('BYETERY-D324-ONE-LIVE-APPROVAL-V3',live),liveHash=digest(liveBytes);
    signature(pin.ownerPublicKey,liveBytes,input.liveSignature);
    signature(runnerKey(key),message('BYETERY-D324-ADMISSION-PROOF-V1',{liveHash,challenge:pin.challenge,instanceId:pin.instanceId}),
      input.admissionProof);
    await this.#readiness();
    return repo.transaction(async db=>{
      const reserved=await reservation(db);
      const now=this.#now();
      requireThat(reserved&&now<liveExpires,403,'D324AdmissionUnavailable');
      const facts=await one(db,`select
        exists(select 1 from chain_private.deployments where id=$1 and mode='TESTNET' and network_id=decode($3,'hex')) as deployment,
        exists(select 1 from app_private.battery_records where deployment_id=$1 and battery_id=$2)
          or exists(select 1 from chain_private.batteries where deployment_id=$1 and battery_id=$2) as occupied,
        exists(select 1 from app_private.stellar_operations where deployment_id=$1 and state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN'))
          or exists(select 1 from api_private.testnet_work where deployment_id=$1 and state not in
            ('PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','ABORTED_PRE_DISPATCH'))
          or exists(select 1 from api_private.testnet_source_leases where network_id=decode($3,'hex') and lease_until>clock_timestamp())
          or exists(select 1 from app_private.return_requests where deployment_id=$1 and reservation_state='HELD') as unsettled`,
      [D324.deploymentId,D324.batteryId,D324.networkId]);
      requireThat(facts?.deployment&&!facts.occupied&&!facts.unsettled&&!await waitingReview(db),409,'SQL_QUIESCENCE_REJECTED');
      requireThat(!await unexpectedHistory(db),409,'D324ExternalBudgetChanged');
      const id=randomUUID();
      // Validate actual sessions again under locks. A DB-imposed expiry may
      // be earlier than the access token expiry included in the signed authorization.
      for(const session of sessions){
        const row=await one(db,`select 1 from auth.sessions where id=$1 and user_id=$2
          and (not_after is null or not_after >= $3::timestamptz) for share`,
        [session.sessionId,session.authUserId,new Date(executionExpires+D324_TIME.sessionMarginMs)]);
        requireThat(row,403,'D324SessionScopeRejected');
      }
      const row=await one(db,`insert into api_private.d324_admission
        (id,deployment_id,battery_id,instance_id,grant_nonce,grant_hash,manifest_hash,live_hash,runner_key,admitted_at,expires_at,execution_hash,sessions)
        select $1,$2,$3,decode($4,'hex'),decode($5,'hex'),decode($6,'hex'),decode($7,'hex'),decode($8,'hex'),decode($9,'hex'),
          timing.observed,$10,decode($12,'hex'),$13::jsonb
        from (select clock_timestamp() as observed) timing where timing.observed<least($10::timestamptz,$11::timestamptz)
        on conflict do nothing returning id`,[id,D324.deploymentId,D324.batteryId,pin.instanceId,nonce,grantHash,manifestHash,liveHash,key,
        new Date(executionExpires),new Date(liveExpires),executionHash,JSON.stringify(sessions)]);
      requireThat(row,409,'D324AdmissionUnavailable');
      return id;
    });
  }

  /** Internal reviewed resolution. No API route or worker calls this method. */
  async closeExpiredUnsigned(repo:Repository,decision:unknown,encodedSignature:unknown):Promise<void> {
    requireThat(repo.mode==='TESTNET'&&d324Scope(repo.deploymentId,D324.batteryId),403,'D324ScopeRejected');
    const review=closed(decision,['schema','taskId','deploymentId','batteryId','compositionSha','operatorSha','planHash','instanceId',
      'admissionId','operationId','sourceAccount','leaseGeneration','contextHash','decisionId','reason']);
    requireThat(review.schema==='BYETERY_D324_PRE_DISPATCH_CLOSE_V1'&&review.taskId===D324.taskId
      &&review.deploymentId===D324.deploymentId&&review.batteryId===D324.batteryId
      &&review.compositionSha===this.#pins.compositionSha&&review.operatorSha===this.#pins.operatorSha
      &&review.planHash===this.#pins.planHash&&review.instanceId===this.instanceId
      &&review.reason==='D324ExecutionExpired',403,'D324CloseScopeRejected');
    const admissionId=scalar(review.admissionId,uuid), operationId=scalar(review.operationId,uuid);
    const source=scalar(review.sourceAccount,/^G[A-Z2-7]{55}$/),generation=scalar(review.leaseGeneration,/^[1-9][0-9]{0,18}$/);
    scalar(review.contextHash,hex);scalar(review.decisionId,/^[a-zA-Z0-9._:-]{8,128}$/);
    const bytes=message('BYETERY-D324-PRE-DISPATCH-CLOSE-V1',review);
    signature(this.#pins.ownerPublicKey,bytes,encodedSignature);
    await repo.transaction(async db=>{
      // Same source lock order as the worker. A different or renewed lease
      // invalidates the review. History and the step's budget slot stay durable.
      const lease=await one(db,`select 1 from api_private.testnet_source_leases
        where network_id=decode($1,'hex') and source_account=$2 and deployment_id=$3
          and operation_id=$4 and generation=$5 and lease_until<=clock_timestamp() for update`,
      [D324.networkId,source,D324.deploymentId,operationId,generation]);
      requireThat(lease,409,'D324CloseLeaseChanged');
      const match=await one(db,`select 1 from api_private.d324_step s join api_private.d324_admission a on a.id=s.admission_id
        join api_private.testnet_work w on w.operation_id=s.operation_id and w.deployment_id=s.deployment_id
        join app_private.stellar_operations o on o.id=s.operation_id and o.deployment_id=s.deployment_id
        where s.operation_id=$1 and a.id=$2 and s.deployment_id=$3 and s.battery_id=$4 and a.instance_id=decode($5,'hex')
          and w.source_account=$6 and w.context_hash=decode($7,'hex') and s.dispatch_xid is null
          and a.expires_at<=clock_timestamp() and w.state in ('CLAIMED','PREPARING') and o.state='QUEUED'
        for update of w,o,a`,[operationId,admissionId,D324.deploymentId,D324.batteryId,this.instanceId,source,review.contextHash]);
      requireThat(match,409,'D324CloseStateRejected');
      const receipt={...review,schemaVersion:review.schema,reviewDigest:digest(bytes),budgetReleased:false};
      await db.query(`insert into api_private.testnet_observations(deployment_id,operation_id,kind,evidence)
        values($1,$2,'PRE_DISPATCH_CLOSE',$3::jsonb)`,[D324.deploymentId,operationId,JSON.stringify(receipt)]);
      // The transition trigger verifies the zero-dispatch facts against SQL.
      await db.query("update api_private.testnet_work set state='ABORTED_PRE_DISPATCH' where operation_id=$1",[operationId]);
      await db.query("update app_private.stellar_operations set state='CANCELLED_LOCAL',error_code='D324ExecutionExpired' where id=$1",[operationId]);
      const updated=await one(db,`update api_private.idempotency set response_status=409,response_body=$2::jsonb
        where operation_id=$1 and response_body is null returning operation_id`,[operationId,JSON.stringify({
        source:'TESTNET',operationId,class:'TERMINAL_UNSIGNED',state:'CANCELLED_LOCAL',transportState:'ABORTED_PRE_DISPATCH',
        terminal:true,transactionHash:null,reason:'D324ExecutionExpired',
      })]);
      requireThat(updated,409,'D324CloseIdempotencyConflict');
    });
  }

  async authorize(db:Db,input:ClaimInput):Promise<Claim> {
    requireThat(await reservation(db),403,'D324ReservationRequired');
    const proof=decodeProof(input.proof);
    const id=scalar(proof.admissionId,uuid);
    const a=await one(db,`select encode(runner_key,'hex') as runner,encode(live_hash,'hex') as live,
      revoked_at,expires_at,sessions
      from api_private.d324_admission where id=$1 and deployment_id=$2 and battery_id=$3 and instance_id=decode($4,'hex') for update`,
    [id,D324.deploymentId,D324.batteryId,this.instanceId]);
    requireThat(a&&!a.revoked_at&&await currentBefore(db,a.expires_at),403,'D324AdmissionUnavailable');
    const sessions=a.sessions as SessionPin[];
    const pinned=sessions.map(s=>s.sessionId).sort();
    const actual=(await db.query<{id:string;user_id:string}>(`select id,user_id from auth.sessions
      where id=any($1::uuid[]) and (not_after is null or not_after>clock_timestamp()+interval '120 seconds')
      order by id for share`,[pinned])).rows;
    requireThat(actual.length===pinned.length&&sessions.every(s=>actual.some(q=>q.id===s.sessionId&&q.user_id===s.authUserId)),
      403,'D324SessionScopeRejected');
    const u=await one(db,`select u.id from app_private.users u join auth.sessions s on s.user_id=u.auth_user_id
      where u.auth_user_id=$1 and s.id=$2 and u.status='ACTIVE'
        and (s.not_after is null or s.not_after>clock_timestamp()+interval '120 seconds') for share of u,s`,
    [input.identity.authUserId,input.identity.sessionId]);
    requireThat(u,401,'SessionRevoked');
    const ordinal=D324_COMMANDS.findIndex(kind=>kind===input.command)+1;
    requireThat(ordinal>0,403,'D324OperationForbidden');
    const session=sessions.find(s=>s.role===roles[ordinal-1]);
    requireThat(session&&session.sessionId===input.identity.sessionId&&session.authUserId===input.identity.authUserId
      &&session.tokenExpiresAt===input.identity.tokenExpiresAt,403,'D324SessionScopeRejected');
    const membership=await one(db,`select actor_address from api_private.memberships where deployment_id=$1 and user_id=$2 and role=$3 and enabled for share`,
      [D324.deploymentId,u.id,roles[ordinal-1]]);
    requireThat(membership,403,'RoleRequired');
    if(ordinal===3||ordinal===4)
      requireThat(membership.actor_address===(ordinal===3?ACTORS.collector:ACTORS.recycler),403,'D324ActorMismatch');
    const expected={schema:'BYETERY_D324_WRITE_PROOF_V1',admissionId:id,liveHash:a.live,deploymentId:D324.deploymentId,
      batteryId:D324.batteryId,ordinal,command:input.command,method:'POST',requestId:input.requestId,principal:u.id,
      sessionId:input.identity.sessionId,idempotencyKey:input.idempotencyKey,inputHash:input.inputHash.toString('hex'),expiresAt:proof.expiresAt};
    const expires=time(proof.expiresAt),now=this.#now();
    requireThat(expires>now&&expires-now<=60000&&canonical(proof.payload)===canonical(expected),403,'D324WriteScopeRejected');
    signature(runnerKey(a.runner),message('BYETERY-D324-WRITE-PROOF-V1',expected),proof.signature);
    const previous=(await db.query(`select s.ordinal,s.principal,s.session_id,s.idempotency_key,encode(s.input_hash,'hex') as input_hash,
      s.operation_id,o.state,w.state as transport_state,w.dispatch_attempts
      from api_private.d324_step s join app_private.stellar_operations o on o.id=s.operation_id
      left join api_private.testnet_work w on w.operation_id=o.id where s.admission_id=$1 order by s.ordinal`,[id])).rows;
    const replay=previous.find(row=>row.ordinal===ordinal);
    if(replay&&replay.principal===u.id&&replay.session_id===input.identity.sessionId&&replay.idempotency_key===input.idempotencyKey
      &&replay.input_hash===expected.inputHash){
      const fresh=await one(db,`select 1 from api_private.d324_admission a
        where a.id=$1 and api_private.d324_enqueue_window(a,$2)`,[id,new Date(expires)]);
      requireThat(fresh,403,'D324WriteProofExpired');
      return {admissionId:id,ordinal,principal:u.id,operationId:replay.operation_id,replay:true,proofExpiresAt:expires};
    }
    requireThat(previous.length<D324.runCap&&D324.historicalConfirmed+previous.length<D324.ordinaryLimit,409,'D324BudgetExhausted');
    requireThat(!replay,409,'D324ReplayConflict');
    requireThat(ordinal===previous.length+1&&previous.every((row,index)=>row.ordinal===index+1&&row.state==='CONFIRMED'
      &&row.transport_state==='PROJECTED'&&row.dispatch_attempts===1),409,'D324UnconfirmedPrefix');
    const unsettled=await one(db,`select
      exists(select 1 from app_private.stellar_operations where deployment_id=$1 and state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN'))
      or exists(select 1 from api_private.testnet_work where deployment_id=$1 and state not in
        ('PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','ABORTED_PRE_DISPATCH'))
      or exists(select 1 from api_private.testnet_source_leases where network_id=decode($3,'hex') and lease_until>clock_timestamp())
      or exists(select 1 from app_private.return_requests where deployment_id=$1 and battery_id<>$2 and reservation_state='HELD') as blocked`,
      [D324.deploymentId,D324.batteryId,D324.networkId]);
    requireThat(unsettled?.blocked===false&&!await waitingReview(db),409,'SQL_QUIESCENCE_REJECTED');
    requireThat(!await unexpectedHistory(db),409,'D324ExternalBudgetChanged');
    return {admissionId:id,ordinal,principal:u.id,operationId:randomUUID(),replay:false,proofExpiresAt:expires};
  }

  async reserveStep(db:Db,claim:Claim,input:ClaimInput) {
    const inserted=await one(db,`insert into api_private.d324_step
      (admission_id,deployment_id,battery_id,ordinal,command,principal,session_id,idempotency_key,input_hash,operation_id,proof_expires_at)
      select $1,$2,$3,$4,$5,$6,$7,$8,decode($9,'hex'),$10,$11 where clock_timestamp()<$11::timestamptz returning operation_id`,
    [claim.admissionId,D324.deploymentId,D324.batteryId,claim.ordinal,input.command,claim.principal,input.identity.sessionId,
      input.idempotencyKey,input.inputHash.toString('hex'),claim.operationId,new Date(claim.proofExpiresAt)]);
    requireThat(inserted,403,'D324WriteProofExpired');
  }
}
async function reservation(db:Db) {
  return one(db,'select 1 from api_private.d324_reservation where deployment_id=$1 and battery_id=$2 and task=$3 and recipient=$4 for update',
    [D324.deploymentId,D324.batteryId,D324.taskId,D324.recipient]);
}
async function waitingReview(db:Db):Promise<boolean> {
  const row=await one(db,'select api_private.d324_waiting_review() as waiting');
  return row?.waiting!==false;
}
function decodeProof(header:unknown) {
  const encoded=scalar(header,/^[A-Za-z0-9_-]{1,4096}$/);
  const raw=Buffer.from(encoded,'base64url');
  requireThat(raw.toString('base64url')===encoded,403,'D324AuthorityMalformed');
  const envelope=closed(parseCanonical(raw),['payload','signature']);
  requireThat(envelope.payload!==null&&typeof envelope.payload==='object',403,'D324AuthorityMalformed');
  const {admissionId,expiresAt}=envelope.payload as Record<string,unknown>;
  return {admissionId,expiresAt,payload:envelope.payload,signature:envelope.signature};
}

interface D324Sql {
  query<T=Record<string,unknown>>(sql:string,args?:unknown[]):Promise<{rows:T[]}>;
}
async function unexpectedHistory(db:D324Sql):Promise<boolean> {
  const {rows}=await db.query(`select 1 from app_private.stellar_operations
    where deployment_id=$1 and battery_id like 'BYE-D3-%' and battery_id<>$2
      and not(id=any($3::uuid[])) limit 1`,[D324.deploymentId,D324.batteryId,historicalIds]);
  return rows.length>0;
}
async function currentBefore(db:D324Sql,expiresAt:unknown):Promise<boolean> {
  const {rows:[fact]}=await db.query<{active:boolean}>('select clock_timestamp()<$1::timestamptz as active',[expiresAt]);
  return fact?.active===true;
}
interface DurableScope {deploymentId:string;operationId:string;principal:string;command:Command;contextHash:string}
export async function assertD324Work(db:D324Sql,w:DurableScope,instanceId:string|undefined,claim?:'prepare'|'dispatch') {
  if(!('batteryId' in w.command)||!d324Scope(w.deploymentId,w.command.batteryId)) return;
  ensure(instanceId&&hex.test(instanceId),'D324DispatchAuthorityRequired');
  const {rows:[match]}=await db.query<{expires_at:unknown;sessions:SessionPin[]}>(`select
    a.expires_at,a.sessions from api_private.d324_step s
    join api_private.d324_admission a on a.id=s.admission_id and a.deployment_id=s.deployment_id and a.battery_id=s.battery_id
    join api_private.d324_reservation r on r.deployment_id=s.deployment_id and r.battery_id=s.battery_id
    join app_private.stellar_operations o on o.id=s.operation_id and o.deployment_id=s.deployment_id and o.battery_id=s.battery_id
    join app_private.users u on u.id=s.principal and u.status='ACTIVE'
    where s.deployment_id=$1 and s.operation_id=$2 and s.principal::text=$3 and s.command=$4 and s.battery_id=$5
      and r.task=$6 and r.recipient=$7 and o.parameters_hash=decode($8,'hex') and a.instance_id=decode($9,'hex')
      and a.revoked_at is null and a.expires_at>clock_timestamp()
    for update of a`,[w.deploymentId,w.operationId,w.principal,w.command.kind,w.command.batteryId,D324.taskId,D324.recipient,w.contextHash,instanceId]);
  ensure(match,'D324DispatchAuthorityRequired');
  ensure(!await unexpectedHistory(db),'D324DispatchAuthorityRequired');
  const pinned=match.sessions.map(s=>s.sessionId).sort();
  const {rows:actual}=await db.query<{id:string;user_id:string;not_after:unknown}>(`select id,user_id,not_after from auth.sessions
    where id=any($1::uuid[]) order by id for share`,[pinned]);
  ensure(actual.length===pinned.length&&match.sessions.every(s=>actual.some(q=>q.id===s.sessionId&&q.user_id===s.authUserId)),
    'D324DispatchAuthorityRequired');
  if(claim){
    const column=claim==='prepare'?'prepare_xid':'dispatch_xid';
    const claimed=await db.query(`update api_private.d324_step set ${column}=txid_current() where operation_id=$1 and ${column} is null returning operation_id`,
      [w.operationId]);
    ensure(claimed.rows.length===1,'D324DispatchAuthorityRequired');
  }
  // Last awaited check. The entire round trip is charged against the returned
  // PostgreSQL time budget so a delayed reply cannot resurrect authority.
  const started=performance.now();
  const {rows:[deadline]}=await db.query<{remaining_ms:string}>(`select
    (extract(epoch from (least($1::timestamptz,$2::timestamptz,
      (select min(not_after)-interval '120 seconds' from auth.sessions where id=any($3::uuid[])),
      lease_until)-clock_timestamp()))*1000)::text as remaining_ms
    from api_private.testnet_source_leases where deployment_id=$4 and operation_id=$5`,
    [match.expires_at,new Date(Math.min(...match.sessions.map(s=>s.tokenExpiresAt))-D324_TIME.sessionMarginMs),pinned,w.deploymentId,w.operationId]);
  const remaining=Number(deadline?.remaining_ms);
  const assertStillValid=()=>{
    ensure(Number.isFinite(remaining)&&performance.now()-started<remaining,'D324DispatchAuthorityRequired');
  };
  assertStillValid();
  return assertStillValid;
}

// The transaction may release its locks after this synchronous invocation.
// A transport or signer that defers its actual start must then fail closed.
export function startD324Effect<T>(assertStillValid:()=>void,start:(beforeStart:()=>void)=>Promise<T>) {
  let insideFence=true;
  const beforeStart=()=>{
    ensure(insideFence,'D324DispatchAuthorityRequired');
    insideFence=false;
    assertStillValid();
  };
  try {
    assertStillValid();
    const result=start(beforeStart);
    void result.catch(()=>{});
    return {result};
  }finally{insideFence=false;}
}
