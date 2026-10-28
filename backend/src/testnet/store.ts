import type { Pool } from 'pg';
import { ensure, type Command } from '../domain.ts';
import { NETWORK_ID, type OperationContext, type TransportState, type TransactionIdentity, type Confirmation, type StateEvidence } from './identity.ts';
import {databaseHealth,databaseTransaction} from '../application/database.ts';

export interface Sql { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }
export interface TransportDatabase { transaction<T>(work: (db: Sql) => Promise<T>): Promise<T>;connectionGuard?():()=>void }
/** Own short transactions; no deployment-wide advisory lock or network callbacks. */
export class PgTransportDatabase implements TransportDatabase {
  readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool;databaseHealth(pool); }
  connectionGuard(){return databaseHealth(this.pool).guard();}
  async transaction<T>(work: (db: Sql) => Promise<T>): Promise<T> {
    return databaseTransaction(this.pool,client=>work({query:async <R>(sql:string,params?:unknown[])=>({rows:(await client.query(sql,params)).rows as R[]})}),'5s');
  }
}
export interface Work extends OperationContext {
  /** Original immutable application principal, never supplied by the browser/worker. */
  principal: string;
  state: TransportState; dispatchAttempts: number;
  confirmation: Confirmation | null; stateEvidence: StateEvidence | null;
}
export interface Claim { networkId: string; sourceAccount: string; operationId: string; worker: string; generation: string }
type Row = Record<string, any>; // Private SQL rows are mapped into typed server objects below.
export class TransportStore {
  readonly database: TransportDatabase;
  constructor(database: TransportDatabase) { this.database = database; }
  /** Called only after the application has authenticated/authorized/queued the logical operation. */
  async queue(deploymentId: string, operationId: string, source: string, argumentsXdr: readonly string[]): Promise<void> {
    await this.database.transaction(async db => {
      await db.query(`insert into api_private.testnet_work(deployment_id,operation_id,network_id,contract_address,source_account,command,battery_id,context_hash,arguments_xdr)
        select o.deployment_id,o.id,d.network_id,d.contract_address,$3,o.command,o.battery_id,o.parameters_hash,$4::jsonb
        from app_private.stellar_operations o join chain_private.deployments d on d.id=o.deployment_id
        where o.deployment_id=$1 and o.id=$2 and d.mode='TESTNET' and d.network_id=decode($5,'hex')
        on conflict(operation_id) do nothing`, [deploymentId, operationId, source, JSON.stringify(argumentsXdr), NETWORK_ID]);
      const w = await this.workIn(db, operationId);
      ensure(w.deploymentId === deploymentId && w.sourceAccount === source
        && JSON.stringify(w.argumentsXdr) === JSON.stringify(argumentsXdr), 'QueueContextConflict');
    });
  }
  private async workIn(db: Sql, id: string): Promise<Work> {
    const r = (await db.query<Row>(`select w.*,o.parameters,o.principal from api_private.testnet_work w
      join app_private.stellar_operations o on o.id=w.operation_id and o.deployment_id=w.deployment_id where w.operation_id=$1`, [id])).rows[0];
    ensure(r, 'TransportWorkMissing');
    return { deploymentId:r.deployment_id, operationId:r.operation_id, networkId:Buffer.from(r.network_id).toString('hex'),
      contractAddress:r.contract_address, sourceAccount:r.source_account, command:r.parameters as Command, principal:r.principal,
      contextHash:Buffer.from(r.context_hash).toString('hex'), argumentsXdr:r.arguments_xdr,
      state:r.state, dispatchAttempts:r.dispatch_attempts, confirmation:r.confirmation, stateEvidence:r.state_evidence };
  }
  work(id: string) { return this.database.transaction(db => this.workIn(db, id)); }
  async identity(id: string): Promise<TransactionIdentity | null> {
    return this.database.transaction(async db => {
      const r = (await db.query<Row>('select * from api_private.testnet_envelopes where operation_id=$1', [id])).rows[0];
      return r ? { deploymentId:r.deployment_id,operationId:r.operation_id,networkId:Buffer.from(r.network_id).toString('hex'),
        contractAddress:r.contract_address,sourceAccount:r.source_account,sequence:String(r.sequence),envelopeBytes:Buffer.from(r.signed_envelope),
        transactionHash:Buffer.from(r.transaction_hash).toString('hex'),contextHash:Buffer.from(r.context_hash).toString('hex'),
        minTime:String(r.min_time),maxTime:String(r.max_time),authorizationExpirations:r.authorization_expirations.map(Number),preparedLedger:Number(r.prepared_ledger) } : null;
    });
  }
  async claim(id: string, worker: string, leaseMs = 30_000): Promise<Claim> {
    ensure(Number.isSafeInteger(leaseMs) && leaseMs > 0 && leaseMs <= 300_000, 'InvalidLease');
    return this.database.transaction(async db => {
      const w = await this.workIn(db, id);
      ensure(!['PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED'].includes(w.state), 'TransportResolved');
      const r = (await db.query<Row>(`insert into api_private.testnet_source_leases(network_id,source_account,deployment_id,operation_id,worker,generation,lease_until)
        values(decode($1,'hex'),$2,$3,$4,$5,1,clock_timestamp()+$6*interval '1 millisecond')
        on conflict(network_id,source_account) do update set deployment_id=excluded.deployment_id,operation_id=excluded.operation_id,
          worker=excluded.worker,generation=api_private.testnet_source_leases.generation+1,lease_until=excluded.lease_until
        where api_private.testnet_source_leases.lease_until<=clock_timestamp()
          and (api_private.testnet_source_leases.operation_id=excluded.operation_id or exists
            (select 1 from api_private.testnet_work previous where previous.operation_id=api_private.testnet_source_leases.operation_id
              and previous.state in ('PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED')))
        returning generation`, [w.networkId,w.sourceAccount,w.deploymentId,id,worker,leaseMs])).rows[0];
      ensure(r, 'SourceAccountBusy');
      return {networkId:w.networkId,sourceAccount:w.sourceAccount,operationId:id,worker,generation:String(r.generation)};
    });
  }
  private async fence(db: Sql, c: Claim): Promise<Work> {
    const r = (await db.query(`select 1 from api_private.testnet_source_leases where network_id=decode($1,'hex') and source_account=$2
      and operation_id=$3 and worker=$4 and generation=$5 and lease_until>clock_timestamp() for update`,
      [c.networkId,c.sourceAccount,c.operationId,c.worker,c.generation])).rows[0];
    ensure(r, 'StaleClaim');
    return this.workIn(db,c.operationId);
  }
  async release(c: Claim): Promise<void> {
    await this.database.transaction(async db => {
      await db.query(`update api_private.testnet_source_leases set lease_until=least(lease_until,clock_timestamp())
        where network_id=decode($1,'hex') and source_account=$2 and operation_id=$3 and worker=$4 and generation=$5`,
        [c.networkId,c.sourceAccount,c.operationId,c.worker,c.generation]);
    });
  }
  async reviewRequired(c:Claim,reason:string):Promise<void>{
    await this.database.transaction(async db=>{
      const w=await this.fence(db,c);
      await this.evidence(db,w,'STATE_READ',{classification:'REVIEWED_RESOLUTION_REQUIRED',reason});
    });
  }
  async requiresReview(id:string):Promise<boolean>{
    return this.database.transaction(async db=>(await db.query(`select 1 from api_private.testnet_observations
      where operation_id=$1 and evidence->>'classification'='REVIEWED_RESOLUTION_REQUIRED' limit 1`,[id])).rows.length>0);
  }
  async preparing(c: Claim): Promise<void> {
    await this.database.transaction(async db => {
      const w=await this.fence(db,c);
      ensure(['CLAIMED','PREPARING'].includes(w.state),'InvalidPreparationState');
      await db.query("update api_private.testnet_work set state='PREPARING' where operation_id=$1",[c.operationId]);
    });
  }
  async prepared(c:Claim,summary:NonNullable<import('./identity.ts').PreparedBody['simulation']>):Promise<void>{
    await this.database.transaction(async db=>{const w=await this.fence(db,c);
      await this.evidence(db,w,'STATE_READ',{classification:'SIMULATION',...summary},summary.ledger);
    });
  }
  async unsignedInterrupted(c:Claim):Promise<void>{
    await this.database.transaction(async db=>{
      const w=await this.fence(db,c);
      if(w.state!=='PREPARING'||w.dispatchAttempts!==0)return;
      if((await db.query('select 1 from api_private.testnet_envelopes where operation_id=$1',[w.operationId])).rows.length)return;
      await this.evidence(db,w,'STATE_READ',{classification:'UNSIGNED_PREPARATION_INTERRUPTED',reason:'DatabaseConnectionInterrupted',explicitResumeRequired:true});
    });
  }
  async reviewedUnsignedResume(c:Claim,contextHash:string,decisionId:string):Promise<void>{
    await this.database.transaction(async db=>{
      const w=await this.fence(db,c);
      ensure(w.state==='PREPARING'&&w.dispatchAttempts===0&&w.contextHash===contextHash&&decisionId.trim().length>0,'UnsignedRecoveryMismatch');
      ensure(!(await db.query('select 1 from api_private.testnet_envelopes where operation_id=$1',[w.operationId])).rows.length,'SignedIdentityExists');
      await this.evidence(db,w,'STATE_READ',{classification:'REVIEWED_UNSIGNED_RESUME',decisionId,contextHash,generation:c.generation});
    });
  }
  async persist(c: Claim, i: TransactionIdentity): Promise<void> {
    await this.database.transaction(async db => {
      const w=await this.fence(db,c);
      ensure(w.state==='PREPARING' && w.deploymentId===i.deploymentId && w.operationId===i.operationId
        && w.networkId===i.networkId && w.contractAddress===i.contractAddress && w.sourceAccount===i.sourceAccount
        && w.contextHash===i.contextHash,'IdentityContextMismatch');
      await db.query(`insert into api_private.testnet_envelopes(deployment_id,operation_id,network_id,contract_address,source_account,sequence,
        signed_envelope,transaction_hash,context_hash,min_time,max_time,authorization_expirations,prepared_ledger)
        values($1,$2,decode($3,'hex'),$4,$5,$6,$7,decode($8,'hex'),decode($9,'hex'),$10,$11,$12,$13)`,
        [i.deploymentId,i.operationId,i.networkId,i.contractAddress,i.sourceAccount,i.sequence,Buffer.from(i.envelopeBytes),
          i.transactionHash,i.contextHash,i.minTime,i.maxTime,i.authorizationExpirations,i.preparedLedger]);
      await db.query("update api_private.testnet_work set state='SIGNED' where operation_id=$1",[c.operationId]);
      await db.query("update api_private.testnet_work set state='READY' where operation_id=$1",[c.operationId]);
      await db.query("update app_private.stellar_operations set state='READY' where id=$1 and state in ('QUEUED','AWAITING_AUTH')",[c.operationId]);
    });
  }
  private async evidence(db: Sql, w: Work, kind: string, evidence: unknown, observation: number|null=null, confirmation: number|null=null, stateRead: number|null=null) {
    await db.query(`insert into api_private.testnet_observations(deployment_id,operation_id,kind,evidence,observation_ledger,confirmation_ledger,state_read_ledger)
      values($1,$2,$3,$4::jsonb,$5,$6,$7)`,[w.deploymentId,w.operationId,kind,JSON.stringify(evidence),observation,confirmation,stateRead]);
  }
  async dispatchIntent(c: Claim, reviewedSameHashRetry: boolean, decisionId: string|null=null): Promise<void> {
    await this.database.transaction(async db => {
      const w=await this.fence(db,c);
      ensure(w.state==='READY' || (reviewedSameHashRetry && w.state==='SUBMITTED_OR_UNKNOWN'),'DispatchRequiresReview');
      ensure(!reviewedSameHashRetry || !!decisionId?.trim(),'RetryReviewRequired');
      ensure(w.dispatchAttempts<2,'RetryLimit');
      ensure((await db.query('select 1 from api_private.testnet_envelopes where operation_id=$1',[w.operationId])).rows[0],'IdentityNotDurable');
      await db.query("update api_private.testnet_work set state='DISPATCH_INTENT',dispatch_attempts=dispatch_attempts+1 where operation_id=$1",[w.operationId]);
      await db.query("update app_private.stellar_operations set state='SUBMITTED' where id=$1 and state='READY'",[w.operationId]);
      if(w.command.kind==='pay_reward')await db.query("update app_private.reward_attempts set state='SUBMITTED' where operation_id=$1 and state='QUEUED'",[w.operationId]);
      await this.evidence(db,w,'DISPATCH_INTENT',{attempt:w.dispatchAttempts+1,reviewedSameHashRetry,decisionId});
    });
  }
  async unknown(c: Claim, kind: 'SUBMIT_RESPONSE'|'RPC_OUTAGE',reply?:{transactionHash:string;status?:string;ledger?:number;sourceCheck?:{sequence:string;balance:string;ledger:number}|null}): Promise<void> {
    await this.database.transaction(async db => {
      const w=await this.fence(db,c);
      if(['CONFIRMED_SUCCESS','PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED'].includes(w.state))return;
      await db.query("update api_private.testnet_work set state='SUBMITTED_OR_UNKNOWN' where operation_id=$1",[w.operationId]);
      await db.query("update app_private.stellar_operations set state='UNKNOWN' where id=$1 and state='SUBMITTED'",[w.operationId]);
      if(w.command.kind==='pay_reward')await db.query("update app_private.reward_attempts set state='UNKNOWN' where operation_id=$1 and state='SUBMITTED'",[w.operationId]);
      await this.evidence(db,w,kind,{classification:'UNKNOWN',...(reply?{transactionHash:reply.transactionHash,status:reply.status??null,ledger:reply.ledger??null,sourceCheck:reply.sourceCheck??null}:{})});
    });
  }
  async observed(c: Claim, state: TransportState, kind: 'NOT_FOUND'|'SUCCESS'|'FAILED'|'STATE_READ', data: Confirmation|StateEvidence|Record<string,unknown>): Promise<void> {
    await this.database.transaction(async db => {
      const w=await this.fence(db,c);
      const confirmation=kind==='SUCCESS'||kind==='FAILED' ? data as Confirmation : null;
      const stateEvidence=kind==='STATE_READ' ? data as StateEvidence : null;
      await db.query(`update api_private.testnet_work set state=$2,confirmation=coalesce(confirmation,$3::jsonb),state_evidence=coalesce($4::jsonb,state_evidence) where operation_id=$1`,
        [w.operationId,state,confirmation?JSON.stringify(confirmation):null,stateEvidence?JSON.stringify(stateEvidence):null]);
      if(state==='CONFIRMED_FAILED') {
        await db.query("update app_private.stellar_operations set state='REJECTED',error_code='ConfirmedChainFailure' where id=$1 and state in ('READY','SUBMITTED','UNKNOWN')",[w.operationId]);
        if(w.command.kind==='pay_reward')await db.query("update app_private.reward_attempts set state='FAILED',error_code='ConfirmedChainFailure' where operation_id=$1",[w.operationId]);
        if(w.command.kind==='open_return')await db.query(`update app_private.return_requests set reservation_state='RELEASED'
          where deployment_id=$1 and request_id=decode($2,'hex') and reservation_state='HELD'`,[w.deploymentId,w.command.requestId]);
      }
      await this.evidence(db,w,kind,data, 'observationLedger' in data ? Number(data.observationLedger):null,
        confirmation?.confirmationLedger??null,stateEvidence?.stateReadLedger??null);
    });
  }
  async project(c: Claim, effect: (db: Sql, work: Work) => Promise<void>): Promise<void> {
    await this.database.transaction(async db => {
      const w=await this.fence(db,c);
      if(w.state==='PROJECTED')return;
      ensure(w.state==='CONFIRMED_SUCCESS' && (w.confirmation || w.stateEvidence?.outcome==='APPLIED'),'ProjectionNotConfirmed');
      // This callback is SQL-only; chain facts have already been read and persisted.
      await db.query("update app_private.stellar_operations set state='SUBMITTED' where id=$1 and state='READY'",[w.operationId]);
      await db.query("update app_private.stellar_operations set state='CONFIRMED' where id=$1 and state in ('SUBMITTED','UNKNOWN')",[w.operationId]);
      await effect(db,w);
      await db.query("update api_private.testnet_work set state='PROJECTED' where operation_id=$1",[w.operationId]);
      await this.evidence(db,w,'PROJECTION',{applied:true});
    });
  }
}
