import { DomainError,ensure } from '../domain.ts';
import { finalizedBody, signedIdentity, type PreparedBody, type FinalizedBody,
  type Observation, type StateEvidence, type TransactionIdentity, type TransportState } from './identity.ts';
import { TransportStore, type Work, type Sql, type Claim } from './store.ts';

/** VOL-003 ports have no RPC implementation and no production signer binding. */
export interface TransactionTransport {
  readonly scope: 'LOCAL_FAKE'|'TESTNET';
  prepareAndSimulate(context: Work): Promise<PreparedBody>;
  attachSorobanAuthorization(body: PreparedBody, context: Work): Promise<PreparedBody>;
  signEnvelope(body: FinalizedBody, context: Work): Promise<string>;
  submit(identity: TransactionIdentity): Promise<{ transactionHash: string;status?:string;ledger?:number }>;
  observe(identity: TransactionIdentity): Promise<Observation>;
  inspectExpiredEffect(identity: TransactionIdentity, context: Work): Promise<StateEvidence>;
  /** Evidence that submission/rebroadcast is still within trusted ledger/time validity. */
  validity(identity: TransactionIdentity): Promise<{ ledger: number; closeTime: string }>;
  /** Immediately before broadcast, after committed dispatch intent. */
  assertSourceSequence?(identity:TransactionIdentity):Promise<void|{sequence:string;balance:string;ledger:number}>;
}
export interface FixtureTransport extends TransactionTransport {readonly scope:'LOCAL_FAKE'}
export interface ReviewedRetry { operationId: string; transactionHash: string; decisionId: string }
export interface ReviewedUnsignedResume {operationId:string;contextHash:string;decisionId:string}
export function recoveryClassification(w:Work,identity:TransactionIdentity|null){
  ensure(identity||w.dispatchAttempts===0,'DispatchWithoutIdentity');
  if(identity)return w.dispatchAttempts>0?'SUBMITTED_OR_UNKNOWN':'SIGNED_IDENTITY_EXISTS';
  return w.state==='PREPARING'?'UNSIGNED_PREPARATION_INTERRUPTED':'NOT_INTERRUPTED';
}
export type SqlProjector = (db: Sql, work: Work) => Promise<void>;
const resolved = (state: TransportState) => ['PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED'].includes(state);
export class DurableTransactionWorker {
  readonly store: TransportStore; readonly transport: TransactionTransport; readonly project: SqlProjector;
  constructor(store: TransportStore, transport: TransactionTransport, project: SqlProjector) {
    this.store=store;this.transport=transport;this.project=project;
  }
  async run(id: string, worker: string): Promise<TransportState> {
    return this.execute(id,worker);
  }
  async resumeUnsigned(review:ReviewedUnsignedResume,worker:string):Promise<TransportState>{
    ensure(review.decisionId.trim().length>0,'UnsignedRecoveryDecisionRequired');
    return this.execute(review.operationId,worker,review);
  }
  private async execute(id:string,worker:string,review?:ReviewedUnsignedResume):Promise<TransportState>{
    const healthy=this.store.database.connectionGuard?.()??(()=>{});
    const existing=await this.store.work(id);
    if(resolved(existing.state)){ensure(!review,'UnsignedRecoveryMismatch');return existing.state;}
    const priorIdentity=await this.store.identity(id);
    const classification=recoveryClassification(existing,priorIdentity);
    if(review)ensure(classification==='UNSIGNED_PREPARATION_INTERRUPTED'&&existing.contextHash===review.contextHash,'UnsignedRecoveryMismatch');
    else ensure(classification!=='UNSIGNED_PREPARATION_INTERRUPTED','ExplicitUnsignedResumeRequired');
    // A READY identity observed at entry may be the result of an uncertain
    // COMMIT/readback. Only the uninterrupted attempt that persisted it may
    // perform first dispatch; reconnect/restart cannot grant that permission.
    ensure(!(priorIdentity&&existing.state==='READY'&&existing.dispatchAttempts===0),'SignedIdentityRequiresReviewedDispatch');
    if(await this.store.requiresReview(id)){ensure(!review,'REVIEWED_RESOLUTION_REQUIRED');return existing.state;}
    healthy();
    const claim=await this.store.claim(id,worker,this.transport.scope==='TESTNET'?180000:30000);
    try {
      // Durable identity always wins, even after a restart with a coarse stale status.
      let identity=await this.store.identity(id);
      if(!identity) {
        if(review)await this.store.reviewedUnsignedResume(claim,review.contextHash,review.decisionId);
        healthy();
        await this.store.preparing(claim);
        const context=await this.store.work(id);
        const prepared=await this.transport.prepareAndSimulate(context);
        if(prepared.simulation)await this.store.prepared(claim,prepared.simulation);
        healthy();
        const authorized=await this.transport.attachSorobanAuthorization(prepared,context);
        healthy();
        const final=finalizedBody(context,authorized); // SDK hash before source signature.
        const signed=await this.transport.signEnvelope(final,context);
        healthy();
        identity=signedIdentity(context,final,signed);
        await this.store.persist(claim,identity); // MUST COMMIT before dispatch intent/send.
        healthy();
      }
      const w=await this.store.work(id);
      if(w.state==='CONFIRMED_SUCCESS')await this.store.project(claim,this.project);
      else {
        // Recovery of DISPATCH_INTENT never automatically calls submit again.
        if(w.state==='READY')await this.dispatch(claim,identity,false,null,healthy);
        await this.reconcile(claim,identity);
      }
      return (await this.store.work(id)).state;
    } catch(error){
      if(error instanceof DomainError&&error.code==='DatabaseConnectionInterrupted'){
        // Best effort diagnostic only. PREPARING itself denies automatic replay,
        // including when the database cannot accept this diagnostic.
        try{
          const identity=await this.store.identity(id);
          if(identity)await this.store.reviewRequired(claim,'DatabaseConnectionInterrupted');
          else await this.store.unsignedInterrupted(claim);
        }catch{ /* Durable state and lease expiry remain the safety boundary. */ }
      }
      throw error;
    } finally { await this.store.release(claim); }
  }
  private async dispatch(claim: Claim, identity: TransactionIdentity, reviewed: boolean, decisionId:string|null=null,healthy:()=>void=()=>{}): Promise<void> {
    healthy();
    const validity=await this.transport.validity(identity); // external; no SQL lock.
    // Reload committed bytes: never submit a transient prepared/signer object.
    const durable=await this.store.identity(claim.operationId);
    ensure(durable,'IdentityNotDurable');
    if(!(BigInt(validity.closeTime)<BigInt(durable.maxTime)
      && BigInt(validity.closeTime)>=BigInt(durable.minTime)
      && durable.authorizationExpirations.every(v=>v>validity.ledger)))return;
    await this.store.dispatchIntent(claim,reviewed,decisionId);
    healthy();
    // Intentionally outside the submit catch: drift is a durable reviewed hold,
    // not an RPC send timeout and never permission to replace the identity.
    let sourceCheck:void|{sequence:string;balance:string;ledger:number};
    try {sourceCheck=await this.transport.assertSourceSequence?.(durable);}
    catch(error) {
      await this.store.reviewRequired(claim,'SourceSequenceCheckFailed');
      throw error;
    }
    healthy();
    try {
      const reply=await this.transport.submit(durable);
      ensure(reply.transactionHash===durable.transactionHash,'SubmitIdentityMismatch');
      await this.store.unknown(claim,'SUBMIT_RESPONSE',{...reply,sourceCheck:sourceCheck??null});
    } catch {
      // Raw RPC errors/envelopes never go to logs/evidence. Durable intent is ambiguous.
      await this.store.unknown(claim,'RPC_OUTAGE',{transactionHash:durable.transactionHash,sourceCheck:sourceCheck??null});
    }
  }
  private async reconcile(claim: Claim, identity: TransactionIdentity): Promise<void> {
    let observation: Observation;
    try { observation=await this.transport.observe(identity); }
    catch { await this.store.unknown(claim,'RPC_OUTAGE');return; }
    if(observation.status==='SUCCESS'||observation.status==='FAILED') {
      const c=observation.confirmation;
      ensure(c.transactionHash===identity.transactionHash && c.confirmationLedger>0
        && c.observationLedger>=c.confirmationLedger,'ConfirmationMismatch');
      await this.store.observed(claim,observation.status==='SUCCESS'?'CONFIRMED_SUCCESS':'CONFIRMED_FAILED',observation.status,c);
      if(observation.status==='SUCCESS')await this.store.project(claim,this.project);
      return;
    }
    ensure(observation.status==='NOT_FOUND','InvalidObservation');
    // NOT_FOUND is not failure. Use the RPC's ledger close time, not a client clock.
    const expired=BigInt(observation.ledgerCloseTime)>BigInt(identity.maxTime)
      || identity.authorizationExpirations.some(v=>observation.observationLedger>v);
    await this.store.observed(claim,expired?'EXPIRED_UNRESOLVED':'SUBMITTED_OR_UNKNOWN','NOT_FOUND',observation);
    if(!expired)return;
    let evidence: StateEvidence;
    try { evidence=await this.transport.inspectExpiredEffect(identity,await this.store.work(identity.operationId)); }
    catch { return; } // Persisted EXPIRED_UNRESOLVED keeps the source blocked.
    ensure(evidence.stateReadLedger>=observation.observationLedger && evidence.evidence.length>0,'InvalidStateEvidence');
    const state=evidence.outcome==='APPLIED'?'CONFIRMED_SUCCESS':evidence.outcome==='NOT_APPLIED'?'EXPIRED_NOT_APPLIED':'EXPIRED_UNRESOLVED';
    await this.store.observed(claim,state,'STATE_READ',evidence);
    if(state==='CONFIRMED_SUCCESS')await this.store.project(claim,this.project);
  }
  /** Explicit reviewed bounded SAME identity retry; never prepares/signs a replacement. */
  async retrySameHash(review: ReviewedRetry, worker: string): Promise<TransportState> {
    ensure(review.decisionId.trim().length>0,'RetryReviewRequired');
    const i=await this.store.identity(review.operationId);
    ensure(i && i.transactionHash===review.transactionHash,'RetryIdentityMismatch');
    const c=await this.store.claim(review.operationId,worker);
    try {
      // Reconcile before even a reviewed rebroadcast; it may already be applied.
      await this.reconcile(c,i);
      const w=await this.store.work(i.operationId);
      if(w.state==='SUBMITTED_OR_UNKNOWN') {
        await this.dispatch(c,i,true,review.decisionId);await this.reconcile(c,i);
      }
      return (await this.store.work(i.operationId)).state;
    } finally { await this.store.release(c); }
  }
}
/** Preserve the fixture-only constructor used by all VOL-003 tests. */
export class LocalTransactionWorker extends DurableTransactionWorker {
  constructor(store:TransportStore,transport:FixtureTransport,project:SqlProjector){
    ensure(transport.scope==='LOCAL_FAKE','LocalFixturesOnly');super(store,transport,project);
  }
}
