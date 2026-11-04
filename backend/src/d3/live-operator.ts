import {observeOperation,timeoutClassification,type OperationReceipt} from './operation-polling.ts';
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
  confirmationLedger: number; confirmedAt: string;
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
  const origin = localApiOrigin(options.apiOrigin);
  const lock = await acquireOperatorLock(options.root);
  const sessions = new Map<Role,Session>(); let closed = false; let busy = false; let stopped = false;
  const journal = join(lock.directory, `${args.taskId}-${args.expectedSha}.jsonl`);
  const budgetFile=join(lock.directory,`${p.planHash}.budget`);
  let previous: string[]=[];
  try { previous=(await readFile(budgetFile,'utf8')).trim().split('\n').filter(Boolean);check(previous.every(v=>/^d3:[a-f0-9]{64}$/.test(v)),'InvalidBudgetJournal'); }
  catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT'){await lock.release();throw new Error('InvalidBudgetJournal');}}
  const budget = new Budget(15,previous); let reservedCap = 15;
  let activeRun: string | null = null; let step = 0; let requestId: string | null = null; let walletLinkId: string | null = null;
  const evidence: SafeEvidence[] = [];
  async function fresh() {
    check(!closed && !stopped, 'OperatorStopped'); await lock.assertHeld(); assertLocalRuntime();
    const f = await options.readPreflight(); f.git = await observeGit(options.root);
    preflight(p,args,f,process.env); reservedCap = Math.min(reservedCap,f.successfulTxCap);
    check(f.runId===run!.runId && f.taskId===reviewed.taskId,'ExactRunRequired');
    check(budget.used < reservedCap, 'TxBudgetExceeded');
  }
  async function api(role: Role, path: string, method = 'GET', body?: unknown, key?: string, signal?:AbortSignal): Promise<ApiResult> {
    const session = sessions.get(role); check(session, 'RoleSessionRequired');
    try {
      const r = await fetch(origin + path, {method,redirect:'error',credentials:'omit',signal:signal??AbortSignal.timeout(30_000),
        headers:{Authorization:'Bearer '+session.bearer(),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},
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
    for (const role of ['USER','ADMIN','COLLECTOR','RECYCLER'] as const) {
      const session = await passwordSession(options.publishableKey,await options.credentials(role)); sessions.set(role,session);
      const me = await api(role,'/api/me');
      check(me.status===200 && Array.isArray(me.body.roles) && me.body.roles.includes(role) && me.body.membershipStatus==='ENABLED','RoleSessionMismatch');
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
        let original:OperationIdentity={operationId:null,transactionHash:null};
        let last:OperationReceipt|undefined;
        let observedAt=0;
        try {
          const result=await api(role,path,'POST',body,key);
          check(result.status===202,'ApplicationRejectedOrUnresolved');
          original=identity(result.body);check(original.operationId,'OriginalIdentityUnavailable');
          await log({httpStatus:202,operationId:original.operationId!});
        } catch(error) {
          if(!(error instanceof Error)||error.message!=='ApiResponseUncertain')throw error;
          await log({phase:'UNKNOWN',observationClass:'REQUEST_ACK_UNKNOWN'});
        }
        try{
          const receipt=await observeOperation(async signal=>{
            const route=original.operationId?`/api/operations/${original.operationId}`:'/api/operations/lookup?key='+encodeURIComponent(key);
            const result=await api(role,route,'GET',undefined,undefined,signal);
            check(result.status===200&&result.body.deploymentId==='5c0cad2f-5f25-4216-8068-6cb9d2d26325','OperationStatusUnavailable');
            return result.body as unknown as OperationReceipt;
          },{initialId:original.operationId,initialHash:original.transactionHash,onStatus:status=>{
            original={operationId:status.operationId,transactionHash:status.transactionHash};last=status;observedAt=Date.now();
          }});
          check(receipt.class==='CONFIRMED'&&receipt.result==='SUCCESS'&&receipt.transactionHash,'OriginalOperationNotConfirmed');
        }catch(error){
          await log({phase:'UNKNOWN',observationClass:timeoutClassification(Date.now()-observedAt<=5000?last:undefined),reconciliation:'UNRESOLVED',
            ...(original.operationId?{operationId:original.operationId}:{}),...(original.transactionHash?{transactionHash:original.transactionHash}:{})});
          throw error;
        }
        const history=()=>api(role,`/api/batteries/${run.batteryId}/history`).then(r=>{check(r.status===200,'HistoryUnavailable');return r.body;});
        const reconciliation=await reconcileViaHistory(original,history);
        await log({reconciliation,operationId:original.operationId!});
        check(reconciliation==='CONFIRMED','UnknownOriginalOperationRequiresReview');
        // Independently verified history gives the original hash even if POST
        // response was pending. It never promotes a local presence to success.
        const h=await history(); const row=(h.entries as Record<string,unknown>[]).find(e=>e.operationId===original.operationId)!;
        check(row && row.verification==='CONFIRMED' && row.chainResult==='SUCCESS','HistoryConfirmationRequired');
        const expectedKind={register_battery:'REGISTERED',open_return:'RETURNED',confirm_collection:'COLLECTED',confirm_recycling:'RECYCLED',pay_reward:'REWARD'}[operation];
        check(h.batteryId===run.batteryId && row.kind===expectedKind && row.category===(operation==='pay_reward'?'REWARD':'LIFECYCLE') && Number.isSafeInteger(row.ledger) && (row.ledger as number)>0 && typeof row.confirmedAt==='string' && Number.isFinite(Date.parse(row.confirmedAt)),'HistoryContextMismatch');
        const view=await api(role,`/api/batteries/${run.batteryId}`);
        check(view.status===200 && view.body.confirmedBatteryState===next[operation][0] && view.body.confirmedRewardState===next[operation][1] && view.body.pendingOperation===null,'ConfirmedStateMismatch');
        if (operation==='open_return') {
          const own=view.body.ownRequest as Record<string,unknown>|null;
          check(own && typeof own.requestId==='string' && /^[a-f0-9]{64}$/.test(own.requestId),'OriginalRequestRequired'); requestId=own.requestId;
        }
        const safe:SafeEvidence={operationId:original.operationId!,transactionHash:row.transactionHash as string,requestId,batteryId:run.batteryId,operation,confirmedBatteryState:next[operation][0],confirmedRewardState:next[operation][1],confirmationLedger:row.ledger as number,confirmedAt:row.confirmedAt,...(payload?{payload}:{})};
        await log({domainState:safe.confirmedBatteryState,rewardState:safe.confirmedRewardState,transactionHash:safe.transactionHash,...(requestId?{requestId}:{})});
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
