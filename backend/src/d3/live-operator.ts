import {observeOperation,timeoutClassification,type OperationReceipt,type ConfirmationMode,type ObservationOptions} from './operation-polling.ts';
/** Thin LOCAL authenticated API client. No chain, signing or database binding.
 * Importing this module performs no I/O. No CLI auto-start or env activation. */
import { readFile, open, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertLocalRuntime } from './operator-guard.ts';
import { activationArguments, activation, preflight, observeGit, acquireOperatorLock,
  appendJournal, consumeBattery, Budget, runDecision, type Role, type Preflight, type JournalEntry } from './operator-control.ts';
import { plan, check, CONTRACT, type Operation } from './model.ts';

export interface Credentials { email: string; password: string }
export type CredentialInput = (role: Role) => Promise<Credentials>;
export interface Session { bearer(): string; close(): Promise<void> }
export interface PreparedRoleSessions {readonly prepared:true;close():Promise<void>}
const preparedRoleSessions=new WeakMap<object,{origin:string;sessions:Map<Role,Session>;principals:Map<Role,string>}>();
/** Auth and read-only profile preparation. Bearers stay in a private runtime
 * map. The server must independently validate them before issuing its receipt. */
export async function prepareLocalRoleSessions(options:{apiOrigin:string;publishableKey:string;credentials:CredentialInput;
  verify:(sessions:ReadonlyMap<Role,Session>)=>Promise<void>;fetcher?:typeof fetch}):Promise<PreparedRoleSessions>{
  assertLocalRuntime();
  const origin=localApiOrigin(options.apiOrigin),fetcher=options.fetcher??fetch;
  const sessions=new Map<Role,Session>(),principals=new Map<Role,string>();
  const close=async()=>{
    let failed=false;
    for(const session of sessions.values())try{await session.close();}catch{failed=true;}
    sessions.clear();principals.clear();check(!failed,'LogoutFailed');
  };
  try{
    for(const role of ['USER','ADMIN','COLLECTOR','RECYCLER'] as const){
      const session=await passwordSession(options.publishableKey,await options.credentials(role),fetcher);
      sessions.set(role,session);
      const r=await fetcher(origin+'/api/me',{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(30_000),
        headers:{Authorization:'Bearer '+session.bearer()}});
      const me=await r.json() as Record<string,unknown>;
      check(r.status===200&&me.source==='TESTNET'&&Array.isArray(me.roles)&&me.roles.includes(role)
        &&me.membershipStatus==='ENABLED'&&typeof me.userId==='string'&&/^[a-f0-9-]{36}$/.test(me.userId),'RoleSessionMismatch');
      principals.set(role,me.userId);
    }
    await options.verify(new Map(sessions));
    const prepared=Object.freeze({prepared:true as const,close});
    preparedRoleSessions.set(prepared,{origin,sessions,principals});
    return prepared;
  }catch{await close();throw new Error('OperatorSessionPreparationStopped');}
}
const AUTH_ORIGIN = 'https://aemxuqnnwfclzrwwiqfd.supabase.co';
/** Existing ordinary password grant, also used by application/dev-fixture.ts.
 * No admin credential, generate_link, cookie, persistence or token refresh. */
export async function passwordSession(publicKey: string, credentials: Credentials, fetcher: typeof fetch = fetch): Promise<Session> {
  check(/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)$/.test(publicKey), 'PublishableKeyRequired');
  // Refuse a legacy service JWT by inspecting its declared role before use;
  // the Auth service remains the authority for validation.
  if (publicKey.startsWith('eyJ')) {
    let role: unknown;
    try { role = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role; } catch { /* closed below */ }
    check(role === 'anon', 'PublishableKeyRequired');
  }
  let token = '';
  try {
    const r = await fetcher(AUTH_ORIGIN + '/auth/v1/token?grant_type=password', {
      method:'POST', redirect:'error', credentials:'omit', signal:AbortSignal.timeout(10_000),
      headers:{apikey:publicKey,'Content-Type':'application/json'}, body:JSON.stringify({email:credentials.email,password:credentials.password}),
    });
    check(r.ok, 'LoginFailed');
    const body = await r.json() as { access_token?: unknown };
    check(typeof body.access_token === 'string' && /^[A-Za-z0-9_.-]+$/.test(body.access_token) && body.access_token.length < 12000, 'InvalidLoginResponse');
    token = body.access_token;
  } catch { throw new Error('LoginFailed'); }
  finally { credentials.password = ''; credentials.email = ''; }
  return { bearer() { check(token, 'SessionClosed'); return token; }, async close() {
    const original = token; token = '';
    if (!original) return;
    try {
      const r = await fetcher(AUTH_ORIGIN + '/auth/v1/logout?scope=local', {method:'POST', redirect:'error', credentials:'omit',
        signal:AbortSignal.timeout(10_000), headers:{apikey:publicKey,Authorization:'Bearer '+original}});
      await r.body?.cancel(); check(r.ok, 'LogoutFailed');
    } catch { throw new Error('LogoutFailed'); }
  } };
}
interface ApiResult { status: number; body: Record<string, unknown> }
export interface OperationIdentity { operationId: string | null; transactionHash: string | null }
export interface SafeEvidence {
  operationId: string; transactionHash: string; requestId: string | null;
  batteryId: string; operation: Operation; confirmedBatteryState: string; confirmedRewardState: string;
  confirmationLedger: number; confirmedAt: string; confirmationMode: ConfirmationMode;
  /** Exact submitted attestation bytes, not an envelope or auth entry. Further
   * receipt/balance facts must come from separately approved authoritative reads. */
  payload?: { manifestBase64: string; payloadHash: string };
}
/** Evidence ports contain observations only. No simulate/send or signer callback.
 * Contract-enforced negative evidence will be gathered by the existing runtime
 * under separate authority: API rejection + unchanged state/balance + unsigned
 * contract simulation rejection, with ZERO failed broadcasts. */
export interface NegativeEvidence {
  apiRejected: boolean; unchangedState: boolean; unchangedBalance: boolean;
  contractSimulation: 'REJECTED' | 'NOT_RUN'; failedBroadcasts: 0;
}
export function negativeEvidenceReady(e: NegativeEvidence): boolean {
  return e.apiRejected === true && e.unchangedState === true && e.unchangedBalance === true && e.contractSimulation === 'REJECTED' && e.failedBroadcasts === 0;
}
export function localApiOrigin(value: string): string {
  let u: URL;
  try { u = new URL(value); } catch { throw new Error('LoopbackApiRequired'); }
  check(u.protocol === 'http:' && ['127.0.0.1','[::1]'].includes(u.hostname) && u.port !== '' && u.pathname === '/' && !u.username && !u.password && !u.search && !u.hash, 'LoopbackApiRequired');
  return u.origin;
}
/** A public object cannot impersonate flags on the invoking local process. */
export function requireActualArguments(supplied: readonly string[], actual: readonly string[] = process.argv.slice(2)): void {
  check(supplied.length===actual.length && supplied.every((v,i)=>v===actual[i]),'ActualLocalCliRequired');
}
export async function requireModuleWorktree(root: string): Promise<void> {
  check(await realpath(root) === await realpath(fileURLToPath(new URL('../../../',import.meta.url))), 'OperatorWorktreeMismatch');
}
const roleFor: Record<Operation, Role> = {register_battery:'ADMIN',open_return:'USER',confirm_collection:'COLLECTOR',confirm_recycling:'RECYCLER',pay_reward:'USER'};
const next: Record<Operation, [string,string]> = {register_battery:['REGISTERED','NOT_ELIGIBLE'],open_return:['RETURNED','NOT_ELIGIBLE'],confirm_collection:['COLLECTED','NOT_ELIGIBLE'],confirm_recycling:['RECYCLED','PENDING'],pay_reward:['RECYCLED','SENT']};
const operations = Object.keys(roleFor) as Operation[];
function identity(body: Record<string,unknown>): OperationIdentity {
  return {operationId:typeof body.operationId==='string'&&/^[a-f0-9-]{36}$/.test(body.operationId)?body.operationId:null,
    transactionHash:typeof body.transactionHash==='string'&&/^[a-f0-9]{64}$/.test(body.transactionHash)?body.transactionHash:null};
}
/** The only submission callback runs once, before the observer gets control.
 * A null acknowledgement permits read-only lookup by the existing key. */
export async function submitAndObserveOperation(
  post:()=>Promise<OperationIdentity|null>,
  get:(operationId:string|null,signal:AbortSignal)=>Promise<OperationReceipt>,
  acknowledged:(identity:OperationIdentity|null)=>Promise<void>,
  options:Omit<ObservationOptions,'initialId'|'initialHash'>={},
){
  if(options.signal?.aborted)throw Error('OBSERVATION_ABORTED');
  const accepted=await post();
  if(accepted)check(accepted.operationId,'OriginalIdentityUnavailable');
  await acknowledged(accepted);
  let id=accepted?.operationId??null;
  const receipt=await observeOperation(signal=>get(id,signal),{...options,
    initialId:id,initialHash:accepted?.transactionHash,onStatus:status=>{id=status.operationId;options.onStatus?.(status);}});
  return receipt;
}

/** Read only: existing GET history invokes independent verification. No POST
 * replay, new idempotency key, replacement operation or forced worker dispatch. */
export async function reconcileViaHistory(original: OperationIdentity, getHistory: () => Promise<Record<string,unknown>>): Promise<'CONFIRMED'|'UNRESOLVED'> {
  if (!original.operationId) return 'UNRESOLVED';
  const body = await getHistory();
  check(body.source === 'TESTNET' && body.deploymentId === '5c0cad2f-5f25-4216-8068-6cb9d2d26325' && body.contractAddress === CONTRACT && body.network === 'STELLAR TESTNET' && Array.isArray(body.entries), 'TestnetHistoryRequired');
  const matches = body.entries.filter((e: Record<string,unknown>) => e.operationId === original.operationId);
  check(matches.length <= 1, 'AmbiguousHistory');
  if (!matches.length) return 'UNRESOLVED';
  const row = matches[0] as Record<string,unknown>;
  if (original.transactionHash !== null) check(row.transactionHash === original.transactionHash, 'OriginalIdentityMismatch');
  check(typeof row.transactionHash === 'string' && /^[a-f0-9]{64}$/.test(row.transactionHash), 'OriginalIdentityUnavailable');
  return row.persistedState === 'CONFIRMED' && row.verification === 'CONFIRMED' && row.chainResult === 'SUCCESS' ? 'CONFIRMED' : 'UNRESOLVED';
}

export interface OperatorOptions {
  root: string; argv: readonly string[]; publicPlanFile: string; apiOrigin: string; publishableKey: string;
  /** Fresh local owner-reviewed READ observations, not authority from plan JSON.
   * Must be supplied under the future preflight task, never sourced from env. */
  readPreflight: () => Promise<Preflight>; credentials: CredentialInput;
  observationSignal?: AbortSignal;
  preparedSessions?:PreparedRoleSessions;
  d324Proofs?: {
    assertAdmission(scope:{taskId:string;operatorSha:string;planHash:string;batteryId:string;recipient:string}):Promise<void>;
    proofFor(input:{action:{kind:string;resource?:string};body:unknown;idempotencyKey:string;
      principal:string;sessionId:string}):Promise<string>;
  };
}
/** No invocations in D3-5. The future local entrypoint supplies CLI args and
 * no-echo credentials; no password CLI/env/file option is exposed here. */
export async function createLocalOperator(options: OperatorOptions) {
  assertLocalRuntime(); // Before file, Auth, lock, API, or any runtime activity.
  const args = activationArguments(options.argv);
  requireActualArguments(options.argv);
  await requireModuleWorktree(options.root);
  const p = plan(JSON.parse(await readFile(options.publicPlanFile, 'utf8')));
  const git=await observeGit(options.root);check(git.clean,'CleanWorktreeRequired');
  const reviewed=await options.readPreflight();
  activation(p, args, git, process.env,reviewed.taskId);
  const run = p.input.runs.find(r=>r.runId===reviewed.runId); check(run,'ExactRunRequired');
  const d324=args.taskId==='D3-24-RUN1';
  const reservedBattery=run.batteryId==='BYE-D3-R1-20261111-DCDE088CA870';
  check(d324===reservedBattery,'D324OperatorScopeRejected');
  if(d324)check(run.runId==='RUN1'&&run.recipient==='GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS',
    'D324OperatorScopeRejected');
  const proofs=d324?options.d324Proofs:undefined;
  if(d324) {
    check(proofs&&run.recipient,'D324ProofProviderRequired');
    check(options.preparedSessions,'D324SessionPreparationRequired');
  }
  const origin = localApiOrigin(options.apiOrigin);
  const lock = await acquireOperatorLock(options.root);
  const sessions = new Map<Role,Session>(); let closed = false; let busy = false; let stopped = false;
  const principals = new Map<Role,string>();
  const journal = join(lock.directory, `${args.taskId}-${args.expectedSha}.jsonl`);
  const budgetFile=join(lock.directory,`${p.planHash}.budget`);
  let previous: string[]=[];
  try { previous=(await readFile(budgetFile,'utf8')).trim().split('\n').filter(Boolean);check(previous.every(v=>/^d3:[a-f0-9]{64}$/.test(v)),'InvalidBudgetJournal'); }
  catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT'){await lock.release();throw new Error('InvalidBudgetJournal');}}
  const budget = new Budget(15,previous); let reservedCap = 15;
  let activeRun: string | null = null; let step = 0; let requestId: string | null = null; let walletLinkId: string | null = null;
  const evidence: SafeEvidence[] = [];
  async function fresh() {
    check(!closed && !stopped && !options.observationSignal?.aborted, 'OperatorStopped'); await lock.assertHeld(); assertLocalRuntime();
    const f = await options.readPreflight(); f.git = await observeGit(options.root);
    preflight(p,args,f,process.env); reservedCap = Math.min(reservedCap,f.successfulTxCap);
    check(f.runId===run!.runId && f.taskId===reviewed.taskId,'ExactRunRequired');
    check(budget.used < reservedCap, 'TxBudgetExceeded');
  }
  async function api(role: Role, path: string, method = 'GET', body?: unknown, key?: string, signal?:AbortSignal,
    writeProof?:string): Promise<ApiResult> {
    const session = sessions.get(role); check(session, 'RoleSessionRequired');
    try {
      const r = await fetch(origin + path, {method,redirect:'error',credentials:'omit',signal:signal??AbortSignal.timeout(30_000),
        headers:{Authorization:'Bearer '+session.bearer(),...(body!==undefined?{'Content-Type':'application/json'}:{}),
          ...(key?{'Idempotency-Key':key}:{}),...(writeProof?{'X-Byetery-D324-Proof':writeProof}:{})},
        ...(body!==undefined?{body:JSON.stringify(body)}:{})});
      const value = await r.json() as Record<string,unknown>;
      check(value && typeof value==='object' && !Array.isArray(value) && value.source === 'TESTNET','TestnetResponseRequired');
      return {status:r.status,body:value};
    } catch { throw new Error('ApiResponseUncertain'); }
  }
  try {
    await fresh();
    // Existing journal means prior execution/intent may exist. Never resume POST
    // automatically, even when the old process is no longer holding the lock.
    const f = await open(journal,'wx',0o600); await f.sync(); await f.close();
    if(proofs){
      const prepared=preparedRoleSessions.get(options.preparedSessions!);
      check(prepared&&prepared.origin===origin&&prepared.sessions.size===4,'D324SessionPreparationRequired');
      preparedRoleSessions.delete(options.preparedSessions!);
      for(const [role,session] of prepared.sessions)sessions.set(role,session);
      for(const [role,principal] of prepared.principals)principals.set(role,principal);
      await proofs.assertAdmission({taskId:args.taskId,operatorSha:args.expectedSha,planHash:p.planHash,
        batteryId:run.batteryId,recipient:run.recipient!});
    }else for (const role of ['USER','ADMIN','COLLECTOR','RECYCLER'] as const) {
      const session = await passwordSession(options.publishableKey,await options.credentials(role)); sessions.set(role,session);
      const me = await api(role,'/api/me');
      check(me.status===200 && Array.isArray(me.body.roles) && me.body.roles.includes(role) && me.body.membershipStatus==='ENABLED','RoleSessionMismatch');
      if(proofs){
        check(typeof me.body.userId==='string'&&/^[a-f0-9-]{36}$/.test(me.body.userId),'D324PrincipalRequired');
        principals.set(role,me.body.userId);
      }
    }
  } catch (e) {
    for (const session of sessions.values()) try { await session.close(); } catch { /* no token propagation */ }
    await lock.release(); throw new Error('OperatorStartupStopped');
  }
  return {
    /** One explicitly reviewed run, five serial application actions. No advance
     * to a later run; a separate owner task/activation is required for each. */
    async step(operation: Operation): Promise<SafeEvidence> {
      check(!busy, 'ConcurrentOperatorActionDenied'); busy = true;
      try {
        await fresh(); check(operation === operations[step], 'SerialOperationRequired');
        if (activeRun === null) {
          await consumeBattery(lock.directory,run.batteryId); activeRun = run.runId;
          const me = await api('USER','/api/me');
          const wallets = me.body.wallets;
          check(Array.isArray(wallets),'VerifiedWalletRequired');
          const matching = wallets.filter(w => w.address===run.recipient);
          check(matching.length===1 && typeof matching[0].id==='string' && /^[a-f0-9-]{36}$/.test(matching[0].id),'ApprovedWalletMappingRequired');
          walletLinkId=matching[0].id;
        }
        check(budget.used < reservedCap,'TxBudgetExceeded');
        const role=roleFor[operation];
        const key='d3:'+createHash('sha256').update([args.taskId,args.expectedSha,p.planHash,run.runId,run.batteryId,operation].join(':')).digest('hex');
        budget.reserve(key);
        const reservation=await open(budgetFile,'a',0o600);
        try {await reservation.writeFile(key+'\n');await reservation.sync();} finally {await reservation.close();}
        let path: string; let body: unknown = {}; let payload: SafeEvidence['payload'];
        if (operation==='register_battery') {path='/api/batteries';body={batteryId:run.batteryId,metadata:{type:'D3 owner-reviewed test fixture'}};}
        else if (operation==='open_return') {path=`/api/batteries/${run.batteryId}/returns`;body={walletLinkId};}
        else if (operation==='pay_reward') path=`/api/batteries/${run.batteryId}/reward`;
        else {
          check(requestId,'OriginalRequestRequired');
          const kind=operation==='confirm_collection'?'COLLECTION':'RECYCLING';
          path=`/api/returns/${requestId}/${kind==='COLLECTION'?'collection':'recycling'}`;
          // Exact UTF-8 bytes are retained in-memory with the export handoff.
          const manifest=Buffer.from(JSON.stringify({version:1,batteryId:run.batteryId,requestId,kind}),'utf8');
          payload={manifestBase64:manifest.toString('base64'),payloadHash:createHash('sha256').update(manifest).digest('hex')};
          body={evidence:{batteryId:run.batteryId,requestId,kind,manifestBase64:manifest.toString('base64')}};
        }
        const base={taskId:args.taskId,gitSha:args.expectedSha,runId:run.runId,batteryId:run.batteryId,role,operation};
        const log=async(extra:Partial<JournalEntry>)=>appendJournal(journal,{...base,phase:'RESULT',timestamp:new Date().toISOString(),...extra});
        await log({phase:'INTENT'}); // fsync BEFORE possible API mutation.
        let writeProof:string|undefined;
        if(proofs){
          const kinds={register_battery:'register',open_return:'return',confirm_collection:'collection',
            confirm_recycling:'recycling',pay_reward:'reward'};
          const resource=operation==='open_return'||operation==='pay_reward'?run.batteryId:
            operation==='confirm_collection'||operation==='confirm_recycling'?requestId!:undefined;
          const session=sessions.get(role),principal=principals.get(role);
          check(session&&principal,'D324PrincipalRequired');
          const {session_id:sessionId}=JSON.parse(Buffer.from(session.bearer().split('.')[1],'base64url').toString('utf8')) as {session_id?:string};
          check(typeof sessionId==='string'&&/^[a-f0-9-]{36}$/.test(sessionId),'D324SessionRequired');
          writeProof=await proofs.proofFor({action:{kind:kinds[operation],...(resource===undefined?{}:{resource})},
            body,idempotencyKey:key,principal,sessionId});
          check(/^[A-Za-z0-9_-]{1,4096}$/.test(writeProof),'D324WriteProofRequired');
        }
        let original:OperationIdentity={operationId:null,transactionHash:null};
        let last:OperationReceipt|undefined;
        let confirmationMode: ConfirmationMode;
        try{
          const receipt=await submitAndObserveOperation(async()=>{
            try {
              const result=await api(role,path,'POST',body,key,undefined,writeProof);
              check(result.status===202,'ApplicationRejectedOrUnresolved');
              return identity(result.body);
            }catch(error){
              if(error instanceof Error&&error.message==='ApiResponseUncertain')return null;
              throw error;
            }
          },async (id,signal)=>{
            const route=id?`/api/operations/${id}`:'/api/operations/lookup?key='+encodeURIComponent(key);
            const result=await api(role,route,'GET',undefined,undefined,signal);
            check(result.status===200&&result.body.deploymentId==='5c0cad2f-5f25-4216-8068-6cb9d2d26325','OperationStatusUnavailable');
            return result.body as unknown as OperationReceipt;
          },async accepted=>{
            if(accepted){original=accepted;await log({httpStatus:202,operationId:accepted.operationId!});}
            else await log({phase:'UNKNOWN',observationClass:'REQUEST_ACK_UNKNOWN'});
          },{signal:options.observationSignal,onStatus:status=>{
            original={operationId:status.operationId,transactionHash:status.transactionHash};last=status;
          },onReconciliation: submitted=>log({observationClass:'OBSERVATION_WINDOW_EXPIRED',...submitted})});
          confirmationMode=receipt.confirmationMode;
          if((receipt.class==='CONFIRMED'&&receipt.result==='FAILED')||receipt.result==='NOT_APPLIED'){
            await log({phase:'STOP',reconciliation:'REJECTED',confirmationMode,operationId:receipt.operationId,transactionHash:receipt.transactionHash!});
          }
          check(receipt.class==='CONFIRMED'&&receipt.result==='SUCCESS'&&receipt.transactionHash,'OriginalOperationNotConfirmed');
        }catch(error){
          if(last?.terminal)throw error;
          const reason=error instanceof Error?error.message:'';
          const observationClass=['UNCERTAIN_OPEN','OBSERVATION_ABORTED'].includes(reason)?reason:timeoutClassification(last);
          await log({phase:'UNKNOWN',observationClass,reconciliation:'UNRESOLVED',
            ...(original.operationId?{operationId:original.operationId}:{}),...(original.transactionHash?{transactionHash:original.transactionHash}:{})});
          throw error;
        }
        const history=await api(role,`/api/batteries/${run.batteryId}/history`);
        check(history.status===200,'HistoryUnavailable');
        const reconciliation=await reconcileViaHistory(original,async()=>history.body);
        await log({reconciliation,confirmationMode,operationId:original.operationId!,transactionHash:original.transactionHash!});
        check(reconciliation==='CONFIRMED','UnknownOriginalOperationRequiresReview');
        // Independently verified history gives the original hash even if POST
        // response was pending. It never promotes a local presence to success.
        const h=history.body; const row=(h.entries as Record<string,unknown>[]).find(e=>e.operationId===original.operationId)!;
        check(row && row.verification==='CONFIRMED' && row.chainResult==='SUCCESS','HistoryConfirmationRequired');
        const expectedKind={register_battery:'REGISTERED',open_return:'RETURNED',confirm_collection:'COLLECTED',confirm_recycling:'RECYCLED',pay_reward:'REWARD'}[operation];
        check(h.batteryId===run.batteryId && row.kind===expectedKind && row.category===(operation==='pay_reward'?'REWARD':'LIFECYCLE') && Number.isSafeInteger(row.ledger) && (row.ledger as number)>0 && typeof row.confirmedAt==='string' && Number.isFinite(Date.parse(row.confirmedAt)),'HistoryContextMismatch');
        const view=await api(role,`/api/batteries/${run.batteryId}`);
        check(view.status===200 && view.body.confirmedBatteryState===next[operation][0] && view.body.confirmedRewardState===next[operation][1] && view.body.pendingOperation===null,'ConfirmedStateMismatch');
        if (operation==='open_return') {
          const own=view.body.ownRequest as Record<string,unknown>|null;
          check(own && typeof own.requestId==='string' && /^[a-f0-9]{64}$/.test(own.requestId),'OriginalRequestRequired'); requestId=own.requestId;
        }
        const safe:SafeEvidence={operationId:original.operationId!,transactionHash:row.transactionHash as string,requestId,batteryId:run.batteryId,operation,confirmedBatteryState:next[operation][0],confirmedRewardState:next[operation][1],confirmationLedger:row.ledger as number,confirmedAt:row.confirmedAt,confirmationMode,...(payload?{payload}:{})};
        await log({operationId:safe.operationId,confirmationMode:safe.confirmationMode,domainState:safe.confirmedBatteryState,
          rewardState:safe.confirmedRewardState,transactionHash:safe.transactionHash,...(safe.requestId?{requestId:safe.requestId}:{})});
        evidence.push(safe); step++; return {...safe};
      } catch { stopped=true; throw new Error('OperatorStoppedRequiresReview'); }
      finally { busy=false; }
    },
    evidence() { return structuredClone(evidence); },
    async countingDecision() {
      const git=await observeGit(options.root);
      return runDecision(run.batteryId,args.expectedSha,git.sha,true,step===5&&!stopped,!git.clean);
    },
    async close() {
      check(!busy,'ConcurrentOperatorActionDenied'); closed=true;
      let failed=false;
      for (const session of sessions.values()) try { await session.close(); } catch {failed=true;}
      sessions.clear(); await lock.release(); check(!failed,'LogoutFailed');
    },
  };
}
