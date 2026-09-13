import { createHash, randomUUID } from 'node:crypto';
import { DomainError, newRequestId, type Command, type Evidence } from '../domain.ts';
import { evidenceCommitment } from '../evidence.ts';
import type { StellarService, PreparedOperation, Submission } from '../stellar-service.ts';
import type { Identity } from './auth.ts';
import { Repository, one, type Db } from './repository.ts';
import { WalletService } from './wallet.ts';
import { AppError, commandFailure, failure, jsonSafe, requireThat, type Reply } from './errors.ts';
import { bid, bytes, canonical, object, rid, text, uuid } from './validation.ts';
export interface Action { kind: 'register'|'return'|'cancel'|'collection'|'recycling'|'reward'|'challenge'|'verify'; resource?: string }
/** Faults are injectable by server-side tests only. Never read from HTTP or env. */
export interface Faults { hold?: (command: Command) => boolean; omitSigner?: (signer: string, command: Command) => boolean }
const hash=(v: string|Buffer)=>createHash('sha256').update(v).digest();
export class Coordinator {
  readonly repo: Repository; readonly wallets: WalletService; readonly faults: Faults;
  constructor(repo: Repository, faults: Faults = {}, wallets = new WalletService(repo)) {this.repo=repo;this.faults=faults;this.wallets=wallets;}
  async get(identity: Identity, batteryId: string): Promise<Reply> {
    return this.repo.transaction(async db=>{await this.repo.principal(db,identity);return {status:200,body:await this.repo.view(db,bid(batteryId))};});
  }
  async mutate(identity: Identity, action: Action, input: unknown, key: string): Promise<Reply> {
    requireThat(/^[A-Za-z0-9._:-]{8,128}$/.test(key),400,'InvalidIdempotencyKey');
    const inputHash=hash(canonical({action,input}));
    const queued=await this.repo.transaction(async db=>{
      const user=await this.repo.principal(db,identity),d=this.repo.deploymentId;
      const old=await one(db,'select * from api_private.idempotency where deployment_id=$1 and user_id=$2 and key=$3',[d,user,key]);
      if(old) {
        requireThat(old.input_hash.equals(inputHash),409,'IdempotencyConflict');
        return {id:old.operation_id as string|null, reply: old.response_body ? {status:old.response_status,body:old.response_body} as Reply : null};
      }
      let id: string|null=null, reply: Reply|null=null;
      await db.query('savepoint application_action');
      try {
        if(action.kind==='challenge') reply=await this.wallets.challenge(db,user,input);
        else if(action.kind==='verify') reply=await this.wallets.verify(db,user,input);
        else id=await this.queue(db,user,action,input,key);
      } catch(error) {
        if(!(error instanceof AppError)) throw error;
        await db.query('rollback to savepoint application_action'); reply=failure(error.status,error.code);
      }
      await db.query(`insert into api_private.idempotency(deployment_id,user_id,key,input_hash,operation_id,response_status,response_body)
        values($1,$2,$3,$4,$5,$6,$7)`,[d,user,key,inputHash,id,reply?.status??null,reply?.body??null]);
      return {id,reply};
    });
    if(queued.reply) return queued.reply;
    requireThat(queued.id,500,'OperationMissing');
    return this.process(queued.id);
  }
  private async evidence(db: Db, user: string, batteryId: string, requestId: string, kind: Evidence['kind'], input: unknown): Promise<Evidence> {
    const body=object(input,['batteryId','requestId','kind','manifestBase64']);
    requireThat(body.batteryId===batteryId,422,'EvidenceBatteryMismatch');
    requireThat(body.requestId===requestId,422,'EvidenceRequestMismatch');
    requireThat(body.kind===kind,422,'InvalidEvidence');
    const raw=bytes(body.manifestBase64); let manifest: Record<string,unknown>;
    try {manifest=JSON.parse(raw.toString('utf8'));} catch {throw new AppError(422,'InvalidEvidence');}
    requireThat(manifest && !Array.isArray(manifest) && typeof manifest==='object' && manifest.batteryId===batteryId && manifest.requestId===requestId && manifest.kind===kind,422,'EvidenceManifestMismatch');
    const ev: Evidence={version:1,batteryId,requestId,kind,payloadHash:hash(raw).toString('hex')};
    const commitment=evidenceCommitment(await this.repo.config(db),ev);
    const revision=(await one(db,`select coalesce(max(revision),0)+1 as n from app_private.evidence_versions where deployment_id=$1 and battery_id=$2 and request_id=decode($3,'hex') and kind=$4`,[this.repo.deploymentId,batteryId,requestId,kind]))!.n;
    await db.query(`insert into app_private.evidence_versions(deployment_id,battery_id,request_id,kind,revision,format_version,manifest_bytes,payload_hash,commitment,object_path,created_by)
      values($1,$2,decode($3,'hex'),$4,$5,1,$6,decode($7,'hex'),decode($8,'hex'),$9,$10)`,
      [this.repo.deploymentId,batteryId,requestId,kind,revision,raw,ev.payloadHash,commitment,`${this.repo.deploymentId}/${batteryId}/${requestId}/${kind}/${revision}`,user]);
    return ev;
  }
  private async queue(db: Db, user: string, action: Action, input: unknown, key: string): Promise<string> {
    const d=this.repo.deploymentId; let command: Command; let batteryId: string; let claim: Awaited<ReturnType<typeof one>>;
    const body=object(input,action.kind==='register'?['batteryId','metadata']:action.kind==='return'?['walletLinkId']:['collection','recycling'].includes(action.kind)?['evidence']:[]);
    if(['cancel','collection','recycling'].includes(action.kind)) {
      const requestId=rid(action.resource);
      claim=await one(db,"select * from app_private.return_requests where deployment_id=$1 and request_id=decode($2,'hex')",[d,requestId]);
      requireThat(claim,404,'RequestNotFound'); batteryId=claim.battery_id;
      if(action.kind==='cancel') requireThat(claim.user_id===user,403,'RequestOwnerRequired');
    } else batteryId=bid(action.kind==='register'?body.batteryId:action.resource);
    if(action.kind==='register') await this.repo.role(db,user,'ADMIN');
    if(action.kind==='collection') await this.repo.role(db,user,'COLLECTOR');
    if(action.kind==='recycling') await this.repo.role(db,user,'RECYCLER');
    const pending=await one(db,`select 1 from app_private.stellar_operations where deployment_id=$1 and battery_id=$2 and state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN')`,[d,batteryId]);
    requireThat(!pending,409,'OperationInProgress');
    if(action.kind==='register') {
      requireThat(!await one(db,'select 1 from app_private.battery_records where deployment_id=$1 and battery_id=$2',[d,batteryId]),409,'BatteryAlreadyExists');
      const metadata=body.metadata??{};
      requireThat(metadata!==null && typeof metadata==='object' && !Array.isArray(metadata) && Buffer.byteLength(canonical(metadata))<=8192,400,'InvalidMetadata');
      const raw=Buffer.from(canonical({version:1,batteryId,metadata})); const registrationHash=hash(raw);
      await db.query('insert into app_private.battery_records(deployment_id,battery_id,metadata,created_by) values($1,$2,$3,$4)',[d,batteryId,metadata,user]);
      await db.query(`insert into app_private.evidence_versions(deployment_id,battery_id,kind,revision,format_version,manifest_bytes,payload_hash,object_path,created_by)
        values($1,$2,'REGISTRATION',1,1,$3,$4,$5,$6)`,[d,batteryId,raw,registrationHash,`${d}/${batteryId}/registration/1`,user]);
      command={kind:'register_battery',batteryId,registrationHash:registrationHash.toString('hex')};
    } else {
      const battery=await one(db,'select * from chain_private.batteries where deployment_id=$1 and battery_id=$2',[d,batteryId]);
      requireThat(battery,404,'BatteryNotConfirmed');
      if(action.kind==='return') {
        requireThat(battery.state==='REGISTERED',409,'InvalidState');
        const walletId=body.walletLinkId===undefined?null:uuid(body.walletLinkId);
        const wallet=await one(db,`select * from app_private.wallet_links where deployment_id=$1 and user_id=$2 and revoked_at is null
          and ($3::uuid is null or id=$3) order by verified_at desc,id limit 1`,[d,user,walletId]);
        requireThat(wallet,409,'VerifiedWalletRequired'); const requestId=newRequestId();
        await db.query(`insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot)
          values($1,decode($2,'hex'),$3,$4,$5,$6)`,[d,requestId,batteryId,user,wallet.id,wallet.address]);
        command={kind:'open_return',batteryId,requestId,recipient:wallet.address};
      } else if(action.kind==='cancel') {
        command={kind:'cancel_return',batteryId,requestId:rid(action.resource)};
      } else if(action.kind==='collection'||action.kind==='recycling') {
        const requestId=rid(action.resource);
        const role=action.kind==='collection'?'COLLECTOR':'RECYCLER';
        const actor=(await this.repo.role(db,user,role))!;
        const ev=await this.evidence(db,user,batteryId,requestId,action.kind==='collection'?'COLLECTION':'RECYCLING',body.evidence);
        command=action.kind==='collection'?{kind:'confirm_collection',batteryId,requestId,collector:actor,evidence:ev}
          :{kind:'confirm_recycling',batteryId,requestId,recycler:actor,evidence:ev};
      } else {
        requireThat(action.kind==='reward',400,'UnknownAction');
        const owner=await one(db,'select user_id from app_private.return_requests where deployment_id=$1 and request_id=$2',[d,battery.request_id]);
        if(owner?.user_id!==user) await this.repo.role(db,user,'ADMIN');
        requireThat(battery.reward_state!=='SENT',409,'RewardAlreadySent');
        requireThat(battery.state==='RECYCLED' && battery.reward_state==='PENDING',409,'RewardNotEligible');
        command={kind:'pay_reward',batteryId};
      }
    }
    const id=randomUUID();
    await db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,request_id,parameters,parameters_hash)
      values($1,$2,$3,$4,$5,$6,decode($7,'hex'),$8,$9)`,[id,d,user,key,command.kind,batteryId,'requestId' in command?command.requestId:null,command,hash(canonical(command))]);
    if(command.kind==='pay_reward') await db.query(`insert into app_private.reward_attempts(deployment_id,battery_id,request_id,operation_id,attempt_number)
      select $1::uuid,$2::app_private.battery_id,b.request_id,$3::uuid,(select coalesce(max(attempt_number),0)+1 from app_private.reward_attempts where deployment_id=$1 and battery_id=$2)
      from chain_private.batteries b where b.deployment_id=$1 and b.battery_id=$2`,[d,batteryId,id]);
    return id;
  }
  private async finish(db: Db, id: string, command: Command, reply: Reply): Promise<Reply> {
    await db.query('update api_private.idempotency set response_status=$3,response_body=$4 where deployment_id=$1 and operation_id=$2',[this.repo.deploymentId,id,reply.status,jsonSafe(reply.body)]);
    return reply;
  }
  private async reject(db: Db, id: string, command: Command, code: string): Promise<Reply> {
    const d=this.repo.deploymentId;
    await db.query("update app_private.stellar_operations set state='REJECTED',error_code=$3 where deployment_id=$1 and id=$2",[d,id,code]);
    if(command.kind==='pay_reward') await db.query("update app_private.reward_attempts set state='FAILED',error_code=$3 where deployment_id=$1 and operation_id=$2",[d,id,code]);
    if(command.kind==='open_return') await db.query("update app_private.return_requests set reservation_state='RELEASED' where deployment_id=$1 and request_id=decode($2,'hex') and reservation_state='HELD'",[d,command.requestId]);
    return this.finish(db,id,command,commandFailure(code));
  }
  async process(id: string): Promise<Reply> {
    const submitted=await this.repo.transaction(async db=>{
      const d=this.repo.deploymentId; const op=await one(db,'select * from app_private.stellar_operations where deployment_id=$1 and id=$2',[d,id]);
      requireThat(op,404,'OperationNotFound'); const command=op.parameters as Command;
      const cached=await one(db,'select response_status,response_body from api_private.idempotency where deployment_id=$1 and operation_id=$2',[d,id]);
      if(cached?.response_body) return {reply:{status:cached.response_status,body:cached.response_body} as Reply};
      if(['SUBMITTED','UNKNOWN'].includes(op.state)) return {};
      requireThat(['QUEUED','AWAITING_AUTH','READY'].includes(op.state),409,'InvalidOperationState');
      const mock=await this.repo.mock(db); const stellar: StellarService=mock;
      const prepared=await stellar.prepare(d,command);
      if(op.state==='QUEUED') await db.query("update app_private.stellar_operations set state='AWAITING_AUTH' where id=$1",[id]);
      // Authentication and application roles were verified before the durable queue insert.
      // These server-issued proofs are MOCK-only, each bound to this same preparation.
      const auth=prepared.requiredSigners.filter(s=>!this.faults.omitSigner?.(s,command)).map(s=>mock.authorize(prepared,s));
      await db.query("update app_private.stellar_operations set state='READY' where id=$1",[id]);
      let submission: Submission;
      try {submission=await stellar.submit(prepared,auth);} catch(error) {
        if(error instanceof DomainError) return {reply:await this.reject(db,id,command,error.code)};
        throw error;
      }
      await db.query('insert into api_private.operation_transport(deployment_id,operation_id,prepared,submission) values($1,$2,$3,$4)',[d,id,prepared,submission]);
      await db.query("update app_private.stellar_operations set state='SUBMITTED' where id=$1",[id]);
      if(command.kind==='pay_reward') await db.query("update app_private.reward_attempts set state='SUBMITTED' where operation_id=$1",[id]);
      await this.repo.saveMock(db,mock); return {};
    });
    if(submitted.reply) return submitted.reply;
    return this.repo.transaction(async db=>{
      const d=this.repo.deploymentId;
      const op=await one(db,'select * from app_private.stellar_operations where deployment_id=$1 and id=$2',[d,id]);
      requireThat(op,404,'OperationNotFound');const command=op.parameters as Command;
      const cached=await one(db,'select response_status,response_body from api_private.idempotency where deployment_id=$1 and operation_id=$2',[d,id]);
      if(cached?.response_body) return {status:cached.response_status,body:cached.response_body} as Reply;
      const transport=await one(db,'select submission from api_private.operation_transport where deployment_id=$1 and operation_id=$2',[d,id]);
      requireThat(transport,500,'SubmissionMissing');const submission=transport.submission as Submission;
      const mock=await this.repo.mock(db);const stellar: StellarService=mock;
      let result=await stellar.getTransactionResult(submission);
      if(result.status==='PENDING' && !this.faults.hold?.(command)) {
        // Local simulated ledger advancement; no remote effects. Snapshot and SQL commit together.
        mock.settle(submission); result=await stellar.getTransactionResult(submission);
      }
      if(result.status==='UNKNOWN'||result.status==='PENDING') {
        await db.query("update app_private.stellar_operations set state='UNKNOWN' where id=$1",[id]);
        if(command.kind==='pay_reward') await db.query("update app_private.reward_attempts set state='UNKNOWN' where operation_id=$1",[id]);
        return {status:202,body:{...await this.repo.view(db,op.battery_id),operationId:id,...('requestId'in command?{requestId:command.requestId}:{})}};
      }
      await this.repo.saveMock(db,mock);
      if(result.status==='FAILED') return this.reject(db,id,command,result.error);
      requireThat(result.status==='SUCCESS',500,'UnexpectedResult');
      await this.repo.project(db,mock,command,result.ledger);
      await db.query("update app_private.stellar_operations set state='CONFIRMED' where id=$1",[id]);
      if(command.kind==='pay_reward') await db.query("update app_private.reward_attempts set state='SUCCEEDED' where operation_id=$1",[id]);
      const body={...await this.repo.view(db,op.battery_id),operationId:id,...('requestId'in command?{requestId:command.requestId}:{}),
        ...(command.kind==='pay_reward'?{reward:{state:'SENT',amount:'10',asset:'GREEN-TEST'}}:{})};
      return this.finish(db,id,command,{status:command.kind==='register_battery'||command.kind==='open_return'?201:200,body});
    });
  }
  async reconcile(): Promise<void> {
    const ids=await this.repo.transaction(async db=>(await db.query(`select id from app_private.stellar_operations where deployment_id=$1
      and state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN') order by created_at`,[this.repo.deploymentId])).rows.map(r=>r.id as string));
    for(const id of ids) await this.process(id);
  }
}
