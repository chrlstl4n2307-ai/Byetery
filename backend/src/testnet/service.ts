import { createHash } from 'node:crypto';
import type { ActorRole, Battery, Command, Hash32, ReturnRequest } from '../domain.ts';
import { DomainError, ensure } from '../domain.ts';
import type { Authorization, PreparedOperation, StellarService, Submission, TransactionResult } from '../stellar-service.ts';
import { Repository, one } from '../application/repository.ts';
import { canonical } from '../application/validation.ts';
import type { OperationProcessor } from '../application/coordinator.ts';
import type { Reply } from '../application/errors.ts';
import type { PhasedStellarSigner } from '../stellar-signer.ts';
import { TestnetRpc } from './rpc.ts';
import { ACTORS, CONTRACT, TOKEN, WASM, invocation } from './abi.ts';
import { TestnetTransport, type ContextGuard } from './transport.ts';
import { PgTransportDatabase, TransportStore, type Work } from './store.ts';
import { DurableTransactionWorker } from './worker.ts';
import { string } from './abi.ts';
import { Address, xdr } from '@stellar/stellar-sdk';

const hash=(c:unknown)=>createHash('sha256').update(canonical(c)).digest('hex');
/** Reads committed logical state immediately before each signing phase. */
export class PersistedContextGuard implements ContextGuard {
  readonly repo:Repository;
  constructor(repo:Repository){this.repo=repo;}
  async validateFacts(w:Work,b:Battery,r:ReturnRequest|null){
    if(w.command.kind==='register_battery'||w.command.kind==='set_role')return;
    await this.repo.transaction(async db=>{
      const rid='requestId' in w.command?w.command.requestId:b.requestId;ensure(rid&&r,'RequestEvidenceMissing');
      const expected=await one(db,`select recipient_snapshot,battery_id from app_private.return_requests
        where deployment_id=$1 and request_id=decode($2,'hex')`,[w.deploymentId,rid]);
      ensure(expected&&expected.battery_id===r.batteryId&&expected.recipient_snapshot===r.recipient,'RecipientSnapshotMismatch');
    });
  }
  async validate(w:Work){await this.repo.transaction(async db=>{
    const d=await this.repo.config(db),op=await one(db,`select parameters,encode(parameters_hash,'hex') as hash from app_private.stellar_operations
      where deployment_id=$1 and id=$2`,[w.deploymentId,w.operationId]);
    ensure(d.mode==='TESTNET'&&d.contractAddress===CONTRACT&&d.rewardToken===TOKEN&&d.admin===ACTORS.admin&&d.service===ACTORS.service,'UnexpectedDeployment');
    const manifest=await one(db,"select encode(wasm_hash,'hex') as hash from chain_private.deployments where id=$1",[w.deploymentId]);
    ensure(manifest?.hash===WASM&&op&&op.hash===w.contextHash&&hash(op.parameters)===w.contextHash&&hash(w.command)===w.contextHash,'OperationContextMismatch');
    ensure(w.command.kind!=='set_role'&&invocation(w.command).signers[0]===w.sourceAccount,'WrongSigner');
    if(w.command.kind==='open_return'){
      const r=await one(db,`select recipient_snapshot,battery_id,reservation_state from app_private.return_requests
        where deployment_id=$1 and request_id=decode($2,'hex')`,[w.deploymentId,w.command.requestId]);
      ensure(r&&r.battery_id===w.command.batteryId&&r.recipient_snapshot===w.command.recipient&&r.reservation_state==='HELD','RecipientSnapshotMismatch');
    }
    if(w.command.kind==='register_battery'){
      const e=await one(db,`select manifest_bytes,payload_hash from app_private.evidence_versions
        where deployment_id=$1 and battery_id=$2 and kind='REGISTRATION' and revision=1`,[w.deploymentId,w.command.batteryId]);
      ensure(e&&Buffer.from(e.payload_hash).toString('hex')===w.command.registrationHash
        &&createHash('sha256').update(e.manifest_bytes).digest('hex')===w.command.registrationHash,'RegistrationEvidenceMismatch');
    }else if('evidence' in w.command){
      const e=await one(db,`select manifest_bytes,payload_hash from app_private.evidence_versions where deployment_id=$1
        and battery_id=$2 and request_id=decode($3,'hex') and kind=$4 and payload_hash=decode($5,'hex')`,
        [w.deploymentId,w.command.batteryId,w.command.requestId,w.command.evidence.kind,w.command.evidence.payloadHash]);
      ensure(e&&createHash('sha256').update(e.manifest_bytes).digest('hex')===w.command.evidence.payloadHash,'EvidenceContextMismatch');
    }
  });}
}

/** Real implementation, selected explicitly. Its durable worker owns signing/dispatch. */
export class TestnetStellarService implements StellarService,OperationProcessor {
  readonly repo:Repository;readonly store:TransportStore;readonly transport:TestnetTransport;readonly worker:DurableTransactionWorker;
  constructor(repo:Repository,rpcClient:TestnetRpc,signer:PhasedStellarSigner){
    ensure(repo.mode==='TESTNET','TestnetConfigurationRequired');this.repo=repo;
    this.store=new TransportStore(new PgTransportDatabase(repo.pool));
    this.transport=new TestnetTransport(rpcClient,signer,new PersistedContextGuard(repo),id=>this.store.work(id),repo.deploymentId);
    this.worker=new DurableTransactionWorker(this.store,this.transport,async(db,w)=>{
      const facts=w.confirmation?.facts??(w.stateEvidence?.outcome==='APPLIED'?JSON.parse(w.stateEvidence.evidence).facts:null);
      ensure(facts,'ProjectionFactsMissing');
      // Reuse SQL projection, not MOCK execution or a second lifecycle implementation.
      await this.repo.project(db as Parameters<Repository['project']>[0],{
        getBattery:async()=>facts.battery,getReturnRequest:async()=>facts.request,
      },w.command,w.confirmation?.confirmationLedger??facts.stateReadLedger);
      if(w.command.kind==='pay_reward'){
        ensure(w.confirmation&&facts.reward,'RewardEvidenceMissing');
        await db.query("update app_private.reward_attempts set state='SUCCEEDED' where operation_id=$1",[w.operationId]);
      }
    });
  }
  private deployment(d:string){ensure(d===this.repo.deploymentId,'DeploymentMismatch');}
  async getConfig(d:string){this.deployment(d);return this.transport.config();}
  async getBattery(d:string,id:string){this.deployment(d);return (await this.transport.battery(id)).value;}
  async getReturnRequest(d:string,id:Hash32){this.deployment(d);return this.transport.request(id);}
  async hasRole(d:string,actor:string,role:ActorRole){this.deployment(d);return Boolean((await this.transport.read('has_role',[
    new Address(actor).toScVal(),xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(role==='COLLECTOR'?'Collector':'Recycler')])])).value);}
  async getRewardBalance(d:string){this.deployment(d);return BigInt((await this.transport.read('balance',[new Address(CONTRACT).toScVal()],TOKEN)).value);}
  /** A real preparation must reference an already authenticated durable logical operation. */
  async prepare(d:string,command:Command):Promise<PreparedOperation>{
    this.deployment(d);const op=await this.repo.transaction(db=>one(db,`select id from app_private.stellar_operations
      where deployment_id=$1 and parameters_hash=decode($2,'hex') and state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN')
      order by created_at desc limit 1`,[d,hash(command)]));
    ensure(op,'DurableLogicalOperationRequired');const v=invocation(command);
    await this.store.queue(d,op.id,v.signers[0],v.args.map(a=>a.toXDR('base64')));
    return {deploymentId:d,preparationId:op.id,command,requiredSigners:v.signers,expiresAt:Date.now()+180000};
  }
  async submit(p:PreparedOperation,auth:Authorization[]):Promise<Submission>{
    this.deployment(p.deploymentId);ensure(auth.length===0,'AuthorizationManagedByServerSigner');
    const w=await this.store.work(p.preparationId);ensure(hash(p.command)===w.contextHash,'OperationContextMismatch');
    await this.worker.run(w.operationId,'byetery-testnet-api');
    const identity=await this.store.identity(w.operationId);ensure(identity,'IdentityNotDurable');
    return {deploymentId:p.deploymentId,reference:identity.transactionHash,source:'TESTNET'};
  }
  async getTransactionResult(s:Submission):Promise<TransactionResult>{
    this.deployment(s.deploymentId);ensure(s.source==='TESTNET','SourceMismatch');
    const row=await this.store.database.transaction(async db=>(await db.query<{operation_id:string}>(`select operation_id from api_private.testnet_envelopes
      where deployment_id=$1 and transaction_hash=decode($2,'hex')`,[s.deploymentId,s.reference])).rows[0]);
    ensure(row,'IdentityNotDurable');const w=await this.store.work(row.operation_id);
    if(w.state==='CONFIRMED_FAILED')return {status:'FAILED',error:'ConfirmedChainFailure'};
    if(w.state==='PROJECTED')return {status:'SUCCESS',ledger:w.confirmation?.confirmationLedger??w.stateEvidence!.stateReadLedger,
      result:{operationId:w.operationId,transactionHash:s.reference,source:'TESTNET',reward:w.confirmation?.facts?.reward??null}};
    return {status:'UNKNOWN'};
  }
  async process(id:string):Promise<Reply>{
    const op=await this.repo.transaction(db=>one(db,'select parameters,state from app_private.stellar_operations where deployment_id=$1 and id=$2',[this.repo.deploymentId,id]));
    ensure(op,'OperationNotFound');
    try{
      const existing=await this.store.database.transaction(async db=>(await db.query('select 1 from api_private.testnet_work where operation_id=$1',[id])).rows.length>0);
      if(!existing)await this.prepare(this.repo.deploymentId,op.parameters as Command);
      await this.worker.run(id,'byetery-testnet-api');
    }catch(error){
      if(error instanceof DomainError){return {status:503,body:{source:'TESTNET',operationId:id,error:{code:error.code}}};}
      // Durable state survives unexpected SQL/process/RPC errors; never substitute MOCK.
      return {status:503,body:{source:'TESTNET',operationId:id,error:{code:'TestnetOperationUnresolved'}}};
    }
    const w=await this.store.work(id),i=await this.store.identity(id),review=await this.store.requiresReview(id);
    return this.repo.transaction(async db=>{
      const view=await this.repo.view(db,(op.parameters as Exclude<Command,{kind:'set_role'}>).batteryId);
      const body={...view,operationId:id,transactionHash:i?.transactionHash??null,transportState:review?'REVIEWED_RESOLUTION_REQUIRED':w.state,
        confirmationLedger:w.confirmation?.confirmationLedger??null,...('requestId' in w.command?{requestId:w.command.requestId}:{}),
        ...(w.confirmation?.facts?.reward?{reward:{state:'SENT',...w.confirmation.facts.reward}}:{})};
      const done=w.state==='PROJECTED';
      if(done)await db.query(`update api_private.idempotency set response_status=$3,response_body=$4::jsonb where deployment_id=$1 and operation_id=$2
        and response_body is null`,[this.repo.deploymentId,id,w.command.kind==='register_battery'||w.command.kind==='open_return'?201:200,JSON.stringify(body)]);
      return {status:done?(w.command.kind==='register_battery'||w.command.kind==='open_return'?201:200):w.state==='CONFIRMED_FAILED'?409:202,body};
    });
  }
}
