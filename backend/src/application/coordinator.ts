import {ExecutionSupervisor} from './execution-supervisor.ts';
import { createHash, randomUUID } from 'node:crypto';
import { DomainError, newRequestId, type Command, type Evidence } from '../domain.ts';
import { evidenceCommitment } from '../evidence.ts';
import type { StellarService, PreparedOperation, Submission } from '../stellar-service.ts';
import type { Identity } from './auth.ts';
import { Repository, one, type Db } from './repository.ts';
import { WalletService } from './wallet.ts';
import { AppError, commandFailure, failure, jsonSafe, requireThat, type Reply } from './errors.ts';
import { bid, bytes, canonical, object, rid, text, uuid } from './validation.ts';
import {requiredAuthority,type ApplicationCommandKind} from './authority.ts';
import {assertLifecycleWritable,HISTORICAL_DEPLOYMENT} from './historical-lifecycle.ts';
import type {D324Authority} from './d324-authority.ts';
import {D324,d324Scope} from './d324-scope.ts';
export interface Action { kind: 'register'|'return'|'cancel'|'collection'|'recycling'|'reward'|'challenge'|'verify'; resource?: string }
const commandForAction={register:'register_battery',return:'open_return',cancel:'cancel_return',collection:'confirm_collection',recycling:'confirm_recycling',reward:'pay_reward'} as const satisfies Record<Exclude<Action['kind'],'challenge'|'verify'>,ApplicationCommandKind>;
/** Faults are injectable by server-side tests only. Never read from HTTP or env. */
export interface Faults { hold?: (command: Command) => boolean; omitSigner?: (signer: string, command: Command) => boolean }
export interface OperationProcessor { supervisor?:ExecutionSupervisor;process(id:string):Promise<Reply> }
const hash=(v: string|Buffer)=>createHash('sha256').update(v).digest();
export class Coordinator {
  readonly repo: Repository; readonly wallets: WalletService; readonly faults: Faults;
  readonly processor?:OperationProcessor;readonly supervisor:ExecutionSupervisor;
  readonly d324?:D324Authority;
  constructor(repo: Repository, faults: Faults = {}, wallets = new WalletService(repo),processor?:OperationProcessor,
    d324?:D324Authority) {this.repo=repo;this.faults=faults;this.wallets=wallets;this.processor=processor;this.d324=d324;this.supervisor=processor?.supervisor??new ExecutionSupervisor();}
  async get(identity: Identity, batteryId: string): Promise<Reply> {
    return this.repo.transaction(async db=>{const user=await this.repo.principal(db,identity);await this.repo.role(db,user,'USER');return {status:200,body:await this.repo.view(db,bid(batteryId))};});
  }
  async mutate(identity:Identity,action:Action,input:unknown,key:string):Promise<Reply>{
    return this.runMutation(identity,action,input,key,false);
  }
  /** HTTP acknowledgement never executes the Testnet processor. */
  async acknowledge(identity:Identity,action:Action,input:unknown,key:string,d324Proof?:unknown):Promise<Reply>{
    return this.runMutation(identity,action,input,key,true,d324Proof);
  }
  private async runMutation(identity:Identity,action:Action,input:unknown,key:string,acknowledge:boolean,d324Proof?:unknown):Promise<Reply>{
    requireThat(this.supervisor.accepting,503,'RuntimeStopping');
    return this.supervisor.run('request:'+randomUUID(),()=>this.acceptMutation(identity,action,input,key,acknowledge,d324Proof));
  }
  private async acceptMutation(identity:Identity,action:Action,input:unknown,key:string,acknowledge:boolean,d324Proof?:unknown):Promise<Reply>{
    requireThat(/^[A-Za-z0-9._:-]{8,128}$/.test(key),400,'InvalidIdempotencyKey');
    const inputHash=hash(canonical({action,input}));
    const queued=await this.repo.transaction(async db=>{
      const d=this.repo.deploymentId;
      if(d324Scope(d,D324.batteryId)&&action.kind!=='challenge'&&action.kind!=='verify'){
        const byRequest=action.kind==='cancel'||action.kind==='collection'||action.kind==='recycling';
        const requestId=byRequest&&typeof action.resource==='string'&&/^[a-f0-9]{64}$/.test(action.resource)
          ?action.resource:null;
        const target=byRequest
          ?requestId&&(await one(db,"select battery_id from app_private.return_requests where deployment_id=$1 and request_id=decode($2,'hex')",[d,requestId]))?.battery_id
          :action.kind==='register'?(input as Record<string,unknown>|null)?.batteryId:action.resource;
        if(d324Scope(d,target)){
          requireThat(this.repo.mode==='TESTNET'&&this.d324,403,'D324AuthorityRequired');
          const proofInput={identity,command:commandForAction[action.kind],requestId,idempotencyKey:key,inputHash,proof:d324Proof};
          const claim=await this.d324.authorize(db,proofInput);
          if(claim.replay) return {id:claim.operationId,reply:null,protected:true};
          requireThat(!await one(db,'select 1 from api_private.idempotency where deployment_id=$1 and user_id=$2 and key=$3',
            [d,claim.principal,key]),409,'IdempotencyConflict');
          await this.d324.reserveStep(db,claim,proofInput);
          await this.queue(db,claim.principal,action,input,key,claim.operationId);
          await db.query(`insert into api_private.idempotency(deployment_id,user_id,key,input_hash,operation_id)
            values($1,$2,$3,$4,$5)`,[d,claim.principal,key,inputHash,claim.operationId]);
          return {id:claim.operationId,reply:null,protected:true};
        }
      }
      const user=await this.repo.principal(db,identity);
      // Preserve GAP1 USER/reward checks before cache lookup; privileged queue
      // failures retain their existing application Reply/idempotency semantics.
      if(action.kind==='challenge'||action.kind==='verify')await this.repo.role(db,user,'USER');
      else if(action.kind==='return'||action.kind==='cancel'||action.kind==='reward') {
       let requestOwner:string|null=null;
       if(action.kind==='reward'){
        const owner=await one(db,`select r.user_id from chain_private.batteries b
          left join app_private.return_requests r on r.deployment_id=b.deployment_id and r.request_id=b.request_id and r.battery_id=b.battery_id
          where b.deployment_id=$1 and b.battery_id=$2`,[d,bid(action.resource)]);
        requireThat(owner,404,'BatteryNotConfirmed');
        requestOwner=owner.user_id??null;
       }
       await this.repo.role(db,user,requiredAuthority(commandForAction[action.kind],user,requestOwner).role);
      }
      if(d===HISTORICAL_DEPLOYMENT&&action.kind!=='challenge'&&action.kind!=='verify'){
        const target=['cancel','collection','recycling'].includes(action.kind)
          ?(await one(db,"select battery_id from app_private.return_requests where deployment_id=$1 and request_id=decode($2,'hex')",[d,rid(action.resource)]))?.battery_id
          :action.kind==='register'?(input as Record<string,unknown>|null)?.batteryId:action.resource;
        if(typeof target==='string'){
          try{assertLifecycleWritable(d,target);}catch{throw new AppError(409,'HistoricalLifecyclePermanentlyNonCounting');}
        }
      }
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
    }).catch(error=>{
      // The candidate migration can expire a verified proof while this
      // transaction is committing. PostgreSQL has already rolled it back.
      if(error instanceof Error&&'code' in error&&error.code==='23514'&&error.message==='D324WriteProofExpired')
        throw new AppError(403,'D324WriteProofExpired');
      throw error;
    });
    if(queued.reply) return queued.reply;
    requireThat(queued.id,500,'OperationMissing');
    if((acknowledge||queued.protected)&&this.repo.mode==='TESTNET'){
      // Acknowledge the committed intent. The status route is the current view.
      return {status:202,body:{source:'TESTNET',deploymentId:this.repo.deploymentId,operationId:queued.id,
        class:'ACCEPTED',state:'ACCEPTED',statusUrl:'/api/operations/'+queued.id}};
    }
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
  private async queue(db: Db, user: string, action: Action, input: unknown, key: string, id:string=randomUUID()): Promise<string> {
    const d=this.repo.deploymentId; let command: Command; let batteryId: string; let claim: Awaited<ReturnType<typeof one>>;
    const body=object(input,action.kind==='register'?['batteryId','metadata']:action.kind==='return'?['walletLinkId']:['collection','recycling'].includes(action.kind)?['evidence']:[]);
    if(['cancel','collection','recycling'].includes(action.kind)) {
      const requestId=rid(action.resource);
      claim=await one(db,"select * from app_private.return_requests where deployment_id=$1 and request_id=decode($2,'hex')",[d,requestId]);
      requireThat(claim,404,'RequestNotFound'); batteryId=claim.battery_id;
      if(action.kind==='cancel') requireThat(claim.user_id===user,403,'RequestOwnerRequired');
    } else batteryId=bid(action.kind==='register'?body.batteryId:action.resource);
    const protectedBattery=d324Scope(d,batteryId);
    if(protectedBattery&&claim)requireThat(claim.recipient_snapshot===D324.recipient,403,'D324RecipientRejected');
    try{assertLifecycleWritable(d,batteryId);}catch{throw new AppError(409,'HistoricalLifecyclePermanentlyNonCounting');}
    const stoppedD3=await one(db,`select 1 from app_private.stellar_operations o join api_private.testnet_work w on w.operation_id=o.id
      where o.deployment_id=$1 and o.battery_id=$2 and o.idempotency_key like 'd3:%'
      and w.state in ('CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','EXPIRED_UNRESOLVED') limit 1`,[d,batteryId]);
    requireThat(!stoppedD3,409,'D3LifecycleRequiresOwnerReview');
    if(action.kind==='register'||action.kind==='collection'||action.kind==='recycling')await this.repo.role(db,user,requiredAuthority(commandForAction[action.kind],user).role);
    if(action.kind==='register'){
      // Server-generated review IDs are reserved for explicit local owner adoption.
      // Namespace exclusion closes the ordinary-registration race without reading intents.
      requireThat(!batteryId.startsWith('BYE-REVIEW-'),409,'ReviewBatteryReserved');
    }
    // One snapshot must include both pending work and a D3 terminal/hold. If
    // reconciliation completes between the previous diagnostic and this read,
    // it cannot open a window for a new-key replacement.
    const pending=await one(db,`select 1 from app_private.stellar_operations o where deployment_id=$1 and battery_id=$2
      and (state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN') or
        (o.idempotency_key like 'd3:%' and exists(select 1 from api_private.testnet_work w where w.operation_id=o.id
          and w.state in ('CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','EXPIRED_UNRESOLVED'))))`,[d,batteryId]);
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
        requireThat(wallet,409,'VerifiedWalletRequired');
        if(protectedBattery)requireThat(wallet.address===D324.recipient,403,'D324RecipientRejected');
        const requestId=newRequestId();
        await db.query(`insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot)
          values($1,decode($2,'hex'),$3,$4,$5,$6)`,[d,requestId,batteryId,user,wallet.id,wallet.address]);
        command={kind:'open_return',batteryId,requestId,recipient:wallet.address};
      } else if(action.kind==='cancel') {
        command={kind:'cancel_return',batteryId,requestId:rid(action.resource)};
      } else if(action.kind==='collection'||action.kind==='recycling') {
        const requestId=rid(action.resource);
        const role=requiredAuthority(commandForAction[action.kind],user).role;
        const actor=(await this.repo.role(db,user,role))!;
        // Reject stale/ineligible requests before immutable evidence or durable work.
        requireThat(battery.state===(action.kind==='collection'?'RETURNED':'COLLECTED')
          &&battery.request_id&&Buffer.from(battery.request_id).toString('hex')===requestId
          &&claim?.reservation_state===(action.kind==='collection'?'HELD':'CONSUMED'),409,'InvalidState');
        const ev=await this.evidence(db,user,batteryId,requestId,action.kind==='collection'?'COLLECTION':'RECYCLING',body.evidence);
        command=action.kind==='collection'?{kind:'confirm_collection',batteryId,requestId,collector:actor,evidence:ev}
          :{kind:'confirm_recycling',batteryId,requestId,recycler:actor,evidence:ev};
      } else {
        requireThat(action.kind==='reward',400,'UnknownAction');
        const owner=await one(db,'select user_id,recipient_snapshot from app_private.return_requests where deployment_id=$1 and request_id=$2',[d,battery.request_id]);
        if(protectedBattery)requireThat(owner?.user_id===user&&owner.recipient_snapshot===D324.recipient,403,'D324RecipientRejected');
        await this.repo.role(db,user,requiredAuthority('pay_reward',user,owner?.user_id??null).role);
        requireThat(battery.reward_state!=='SENT',409,'RewardAlreadySent');
        requireThat(battery.state==='RECYCLED' && battery.reward_state==='PENDING',409,'RewardNotEligible');
        command={kind:'pay_reward',batteryId};
      }
    }
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
    if(this.processor)return this.supervisor.run(id,()=>this.processor!.process(id));
    requireThat(this.repo.mode==='MOCK',503,'TestnetProcessorRequired');
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
  async reconcile(trigger: 'manual' | 'periodic' = 'manual'): Promise<void> {
    const scan=async (db:Db)=>(await db.query<{id:string}>(`select id from app_private.stellar_operations where deployment_id=$1
      and state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN') order by created_at`,[this.repo.deploymentId])).rows.map(r=>r.id);
    const ids=trigger==='periodic'?await this.repo.tryPeriodicReconcileScan(scan):await this.repo.transaction(scan);
    if(ids===undefined)return;
    for(const id of ids){if(!this.supervisor.accepting)break;await this.process(id);}
  }
}
