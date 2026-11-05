import {ExecutionSupervisor} from '../application/execution-supervisor.ts';
import { DomainError,ensure } from '../domain.ts';
import { finalizedBody, signedIdentity, preparedIdentity, assertPersistedEnvelope, ENVELOPE_TIME_POLICY, hasSafeValidity, type PreparedBody, type FinalizedBody,
  type Observation, type StateEvidence, type TransactionIdentity, type TransportState } from './identity.ts';
import { TransportStore, type Work, type Sql, type Claim } from './store.ts';
import {invocation} from './abi.ts';

/** VOL-003 ports have no RPC implementation and no production signer binding. */
export interface TransactionTransport {
  readonly scope: 'LOCAL_FAKE'|'TESTNET';
  prepareAndSimulate(context: Work): Promise<PreparedBody>;
  attachSorobanAuthorization(body: PreparedBody, context: Work): Promise<PreparedBody>;
  signEnvelope(body: FinalizedBody, context: Work): Promise<string>;
  submit(identity: TransactionIdentity): Promise<{ transactionHash: string;status?:string;ledger?:number }>;
  observe(identity: TransactionIdentity): Promise<Observation>;
  inspectExpiredEffect(identity: TransactionIdentity, context: Work): Promise<StateEvidence>;
  /** Stricter non-application proof for a pre-dispatch authorization hold. */
  inspectRevokedEffect?(identity:TransactionIdentity,context:Work):Promise<StateEvidence>;
  sourceSequenceForClosure?(identity: TransactionIdentity):Promise<{sequence:string;ledger:number}>;
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
const resolved = (state: TransportState) => ['PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','ABORTED_PRE_DISPATCH'].includes(state);
export class DurableTransactionWorker {
  private readonly nowSeconds:()=>number;
  readonly store: TransportStore; readonly transport: TransactionTransport; readonly project: SqlProjector; readonly supervisor?:ExecutionSupervisor;
  constructor(store: TransportStore, transport: TransactionTransport, project: SqlProjector, supervisor?:ExecutionSupervisor, nowSeconds=()=>Math.floor(Date.now()/1000)) {
    this.store=store;this.transport=transport;this.project=project;this.supervisor=supervisor;this.nowSeconds=nowSeconds;
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
    if(await this.store.hasIdentityHold(id)){ensure(!review,'UnsignedRecoveryMismatch');return existing.state;}
    const priorIdentity=existing.dispatchAttempts===0?await this.store.identity(id):null;
    if(existing.dispatchAttempts===0&&await this.store.authorizationRevoked(id)){
      ensure(priorIdentity&&!review,'AuthorizationRevoked');
      const claim=await this.store.claim(id,worker);
      try{
        if(await this.verifyOriginal(claim,existing,priorIdentity))await this.reconcileRevoked(claim,priorIdentity);
        return (await this.store.work(id)).state;
      }
      finally{await this.store.release(claim);}
    }
    const classification=existing.dispatchAttempts>0?'SUBMITTED_OR_UNKNOWN':recoveryClassification(existing,priorIdentity);
    if(review)ensure(classification==='UNSIGNED_PREPARATION_INTERRUPTED'&&existing.contextHash===review.contextHash,'UnsignedRecoveryMismatch');
    else ensure(classification!=='UNSIGNED_PREPARATION_INTERRUPTED','ExplicitUnsignedResumeRequired');
    // A READY identity observed at entry may be the result of an uncertain
    // COMMIT/readback. Only the uninterrupted attempt that persisted it may
    // perform first dispatch; reconnect/restart cannot grant that permission.
    if(existing.dispatchAttempts===0&&!['READY','SIGNED'].includes(existing.state)&&await this.store.requiresReview(id)){
      ensure(!review,'REVIEWED_RESOLUTION_REQUIRED');return existing.state;
    }
    healthy();
    const claim=await this.store.claim(id,worker,this.transport.scope==='TESTNET'?180000:30000);
    try {
      // Durable identity always wins, even after a restart with a coarse stale status.
      const work=await this.store.work(id);
      let identity=await this.store.identity(id);
      if(work.dispatchAttempts>0){
        await this.recoverDispatched(claim,work,identity);
        return (await this.store.work(id)).state;
      }
      if(['READY','SIGNED'].includes(work.state)){
        if(!await this.verifyOriginal(claim,work,identity))return work.state;
        throw new DomainError('SignedIdentityRequiresReviewedDispatch');
      }
      if(!identity) {
        if(review)await this.store.reviewedUnsignedResume(claim,review.contextHash,review.decisionId);
        healthy();
        await this.store.preparing(claim);
        const context=await this.store.work(id);
        context.auditPhase=phase=>this.store.phase(claim,phase);
        const prepared=await this.phase(id,'PREPARING',()=>this.transport.prepareAndSimulate(context));
        if(prepared.simulation)await this.store.prepared(claim,prepared.simulation);
        healthy();
        const unsigned=finalizedBody(context,prepared);
        await this.store.signingIdentity(claim,'AUTHORIZATION',unsigned);
        const authorized=await this.phase(id,'AUTHORIZATION',()=>this.transport.attachSorobanAuthorization(prepared,context));
        healthy();
        const final=finalizedBody(context,authorized); // SDK hash before source signature.
        const beforeAuth=preparedIdentity(unsigned),afterAuth=preparedIdentity(final);
        ensure(beforeAuth.sequence===afterAuth.sequence&&beforeAuth.minTime===afterAuth.minTime
          &&beforeAuth.maxTime===afterAuth.maxTime,'AuthorizationChangedEnvelopeIdentity');
        await this.store.signingIdentity(claim,'ENVELOPE',final);
        const signed=await this.phase(id,'ENVELOPE_SIGNING',()=>this.transport.signEnvelope(final,context));
        healthy();
        identity=signedIdentity(context,final,signed);
        await this.store.phase(claim,'IDENTITY_PERSIST_START');
        await this.phase(id,'PERSISTING',()=>this.store.persist(claim,identity!),true); // MUST COMMIT before dispatch intent/send.
        healthy();
      }
      const w=await this.store.work(id);
      if(w.state==='CONFIRMED_SUCCESS')await this.store.project(claim,this.project);
      else {
        // Recovery of DISPATCH_INTENT never automatically calls submit again.
        if(w.state==='READY'&&w.dispatchAttempts===0)await this.dispatch(claim,identity,false,null,healthy);
        const dispatched=await this.store.work(id);
        if(dispatched.dispatchAttempts>0)await this.recoverDispatched(claim,dispatched,await this.store.identity(id));
      }
      return (await this.store.work(id)).state;
    } catch(error){
      try{await this.store.phase(claim,'PHASE_OUTCOME_UNKNOWN');}catch{ /* A committed START remains UNKNOWN if diagnostics fail. */ }
      if(error instanceof DomainError&&error.code==='RuntimeStopping'){try{await this.store.phase(claim,'SHUTDOWN_INTERRUPTED');}catch{ /* START/state remains durable. */ }}
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
  private phase<T>(id:string,name:string,work:()=>Promise<T>,persistence=false){return this.supervisor?this.supervisor.phase(id,name,work,persistence):work();}
  private async dispatch(claim: Claim, identity: TransactionIdentity, reviewed: boolean, decisionId:string|null=null,healthy:()=>void=()=>{}): Promise<void> {
    healthy();this.supervisor?.assertAdmission();
    const validity=await this.transport.validity(identity); // external; no SQL lock.
    // Reload committed bytes: never submit a transient prepared/signer object.
    const durable=await this.store.identity(claim.operationId);
    if(!durable){await this.store.holdUnverifiedIdentity(claim);return;}
    if(!await this.verifyOriginal(claim,await this.store.work(claim.operationId),durable))return;
    if(!hasSafeValidity(durable.maxTime,validity.closeTime,ENVELOPE_TIME_POLICY.minimumBeforeDispatch)
      ||BigInt(validity.closeTime)<BigInt(durable.minTime)
      ||!durable.authorizationExpirations.every(v=>v>validity.ledger))return;
    this.supervisor?.assertAdmission();
    await this.store.dispatchIntent(claim,reviewed,decisionId,{ledger:validity.ledger,identity:durable});
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
    this.supervisor?.assertAdmission();
    try {
      const reply=await this.transport.submit(durable);
      ensure(reply.transactionHash===durable.transactionHash,'SubmitIdentityMismatch');
      await this.store.unknown(claim,'SUBMIT_RESPONSE',{...reply,sourceCheck:sourceCheck??null});
    } catch {
      // Raw RPC errors/envelopes never go to logs/evidence. Durable intent is ambiguous.
      await this.store.unknown(claim,'RPC_OUTAGE',{transactionHash:durable.transactionHash,sourceCheck:sourceCheck??null});
    }
  }
  private async recordReceipt(claim:Claim,identity:TransactionIdentity,observation:Exclude<Observation,{status:'NOT_FOUND'}>){
    const c=observation.confirmation;
    ensure(c.transactionHash===identity.transactionHash&&c.confirmationLedger>0
      &&c.observationLedger>=c.confirmationLedger,'ConfirmationMismatch');
    const success=observation.status==='SUCCESS';
    await this.store.observed(claim,success?'CONFIRMED_SUCCESS':'CONFIRMED_FAILED',observation.status,c);
    if(success)await this.store.project(claim,this.project);
  }
  private freshLedger(closeTime:string):boolean{
    const age=this.nowSeconds()-Number(closeTime);
    return /^\d+$/.test(closeTime)&&Number.isSafeInteger(age)
      &&age<=ENVELOPE_TIME_POLICY.maxLedgerAgeSeconds&&age>=-ENVELOPE_TIME_POLICY.maxLedgerLeadSeconds;
  }
  private pastExpiryMargin(closeTime:string,identity:TransactionIdentity):boolean{
    return /^\d+$/.test(closeTime)&&BigInt(closeTime)>BigInt(identity.maxTime)+BigInt(ENVELOPE_TIME_POLICY.expiryMarginSeconds);
  }
  private async verifyOriginal(claim:Claim,work:Work,identity:TransactionIdentity|null):Promise<{dispatchLedger:number|null}|null>{
    if(await this.store.hasIdentityHold(work.operationId))return null;
    try{
      ensure(identity,'IdentityNotDurable');
      const expectedSource=this.transport.scope==='TESTNET'?invocation(work.command).signers[0]:work.sourceAccount;
      assertPersistedEnvelope(identity,work,expectedSource);
      await this.store.assertPersistedEnvelopeAnchor(identity);
      const dispatchLedger=work.dispatchAttempts>0?await this.store.firstDispatchLedger(identity):null;
      return {dispatchLedger};
    }catch(error){
      if(!(error instanceof DomainError)||error.code==='DatabaseConnectionInterrupted')throw error;
      await this.store.holdUnverifiedIdentity(claim);
      return null;
    }
  }
  private async recoverDispatched(claim:Claim,work:Work,identity:TransactionIdentity|null):Promise<void>{
    ensure(work.dispatchAttempts>0,'DispatchIntentRequired');
    const verified=await this.verifyOriginal(claim,work,identity);
    if(!verified||!identity)return;
    if(work.state==='CONFIRMED_SUCCESS')await this.store.project(claim,this.project);
    else await this.reconcile(claim,work,identity,verified.dispatchLedger);
  }
  private async reconcile(claim:Claim,work:Work,identity:TransactionIdentity,dispatchLedger:number|null):Promise<void>{
    const open=work.state==='EXPIRED_UNRESOLVED'?'EXPIRED_UNRESOLVED':'SUBMITTED_OR_UNKNOWN';
    let observation:Observation;
    try{observation=await this.transport.observe(identity);}
    catch{await this.store.unknown(claim,'RPC_OUTAGE',{transactionHash:identity.transactionHash,classification:'UNCERTAIN_OPEN'});return;}
    if(observation.status!=='NOT_FOUND'){await this.recordReceipt(claim,identity,observation);return;}
    const pastMargin=this.pastExpiryMargin(observation.ledgerCloseTime,identity);
    const uncertainState=pastMargin?'EXPIRED_UNRESOLVED':open;
    await this.store.observed(claim,uncertainState,'NOT_FOUND',{...observation,classification:'UNCERTAIN_OPEN'});
    if(!pastMargin)return;
    const hold=async(reason:string)=>{
      if(!await this.store.requiresReview(identity.operationId))await this.store.reviewRequired(claim,reason);
    };
    if(dispatchLedger===null){await hold('OriginalDispatchLedgerUnavailable');return;}

    // Establish a closed ledger after the margin, then query the same hash.
    // A receipt wins even if the previous read showed a retention gap.
    let afterMargin, final:Observation;
    try{
      afterMargin=await this.transport.validity(identity);
      if(!this.pastExpiryMargin(afterMargin.closeTime,identity)||!this.freshLedger(afterMargin.closeTime)
        ||!Number.isSafeInteger(afterMargin.ledger)||afterMargin.ledger<=dispatchLedger||afterMargin.ledger<observation.observationLedger)return;
      final=await this.transport.observe(identity);
    }catch{await this.store.unknown(claim,'RPC_OUTAGE',{transactionHash:identity.transactionHash,classification:'UNCERTAIN_OPEN'});return;}
    if(final.status!=='NOT_FOUND'){await this.recordReceipt(claim,identity,final);return;}
    if(!Number.isSafeInteger(final.observationLedger)||final.observationLedger<Math.max(afterMargin.ledger,dispatchLedger)
      ||!this.pastExpiryMargin(final.ledgerCloseTime,identity)||!this.freshLedger(final.ledgerCloseTime)
      ||BigInt(final.ledgerCloseTime)<BigInt(afterMargin.closeTime)
      ||!Number.isSafeInteger(final.oldestLedger)||final.oldestLedger!<=0)return;
    const retentionReference=Math.min(dispatchLedger,identity.preparedLedger);
    if(final.oldestLedger!>retentionReference){await hold('RpcRetentionGap');return;}

    let source;
    try{source=await this.transport.sourceSequenceForClosure?.(identity);}catch{return;}
    if(!source||!Number.isSafeInteger(source.ledger)||source.ledger<final.observationLedger
      ||!this.freshLedger(final.ledgerCloseTime)||!/^\d+$/.test(source.sequence))return;
    if(BigInt(source.sequence)!==BigInt(identity.sequence)-1n){await hold('SourceSequenceDoesNotProveAbsence');return;}
    const evidence:StateEvidence={outcome:'NOT_APPLIED',stateReadLedger:source.ledger,correlationId:identity.operationId,
      evidence:JSON.stringify({classification:'EXPIRED_NOT_INCLUDED',transactionHash:identity.transactionHash,
        maxTime:identity.maxTime,sequence:identity.sequence,sourceAccount:identity.sourceAccount,
        dispatchLedger,retentionReference,expiryMarginSeconds:ENVELOPE_TIME_POLICY.expiryMarginSeconds,afterMargin,
        lastLookup:{status:'NOT_FOUND',latestLedger:final.observationLedger,closeTime:final.ledgerCloseTime,oldestLedger:final.oldestLedger},
        source})};
    await this.store.observed(claim,'EXPIRED_NOT_APPLIED','STATE_READ',evidence);
  }
  /** Never dispatches, re-signs, or weakens a hold after role reactivation. */
  private async reconcileRevoked(claim:Claim,identity:TransactionIdentity):Promise<void>{
    let observation:Observation;
    try{observation=await this.transport.observe(identity);}
    catch{await this.store.revokedObservation(claim,{reason:'ObservationUnavailable'});return;}
    if(observation.status!=='NOT_FOUND'){
      // An external submission is outside the revocation threat model. Preserve
      // the hold for reviewed resolution; never invent an authorization failure receipt.
      await this.store.revokedObservation(claim,{reason:'ExternalChainReceiptRequiresReview',status:observation.status,
        transactionHash:identity.transactionHash},observation.confirmation.observationLedger);return;
    }
    await this.store.revokedObservation(claim,{reason:'NotFound',transactionHash:identity.transactionHash,
      ledgerCloseTime:observation.ledgerCloseTime},observation.observationLedger);
    if(!(BigInt(observation.ledgerCloseTime)>BigInt(identity.maxTime)
      &&identity.authorizationExpirations.every(v=>observation.observationLedger>v)))return;
    let evidence:StateEvidence;
    try{
      const inspect=this.transport.inspectRevokedEffect?.bind(this.transport)??this.transport.inspectExpiredEffect.bind(this.transport);
      evidence=await inspect(identity,await this.store.work(identity.operationId));
    }
    catch{await this.store.revokedObservation(claim,{reason:'StateReadUnavailable'});return;}
    if(evidence.outcome!=='NOT_APPLIED'||evidence.stateReadLedger<observation.observationLedger||!evidence.evidence){
      await this.store.revokedObservation(claim,{reason:'EffectNotProvenAbsent',outcome:evidence.outcome},evidence.stateReadLedger);return;
    }
    await this.store.resolveRevoked(claim,identity,observation,evidence);
  }
  /** Explicit reviewed bounded SAME identity retry; never prepares/signs a replacement. */
  async retrySameHash(review: ReviewedRetry, worker: string): Promise<TransportState> {
    ensure(review.decisionId.trim().length>0,'RetryReviewRequired');
    const i=await this.store.identity(review.operationId);
    const originalWork=await this.store.work(review.operationId);
    ensure(!originalWork.idempotencyKey?.startsWith('d3:'),'D3ReplayForbidden');
    ensure(i && i.transactionHash===review.transactionHash,'RetryIdentityMismatch');
    const c=await this.store.claim(review.operationId,worker);
    try {
      const work=await this.store.work(i.operationId);
      const verified=await this.verifyOriginal(c,work,i);
      if(!verified)return work.state;
      if(work.dispatchAttempts===0&&await this.store.authorizationRevoked(i.operationId)){
        await this.reconcileRevoked(c,i);throw new DomainError('AuthorizationRevoked');
      }
      // Reconcile before even a reviewed rebroadcast; it may already be applied.
      if(work.dispatchAttempts>0)await this.reconcile(c,work,i,verified.dispatchLedger);
      else {
        const original=await this.transport.observe(i);
        if(original.status!=='NOT_FOUND'){await this.recordReceipt(c,i,original);return (await this.store.work(i.operationId)).state;}
      }
      const w=await this.store.work(i.operationId);
      if(w.state==='READY'||w.state==='SUBMITTED_OR_UNKNOWN') {
        await this.dispatch(c,i,true,review.decisionId);
        const dispatched=await this.store.work(i.operationId);
        if(dispatched.dispatchAttempts>0)await this.recoverDispatched(c,dispatched,await this.store.identity(i.operationId));
      }
      return (await this.store.work(i.operationId)).state;
    } finally { await this.store.release(c); }
  }
}
/** Preserve the fixture-only constructor used by all VOL-003 tests. */
export class LocalTransactionWorker extends DurableTransactionWorker {
  constructor(store:TransportStore,transport:FixtureTransport,project:SqlProjector,nowSeconds?:()=>number){
    ensure(transport.scope==='LOCAL_FAKE','LocalFixturesOnly');super(store,transport,project,undefined,nowSeconds);
  }
}
