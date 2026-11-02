import { open, readFile, mkdir, unlink, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertLocalRuntime } from './operator-guard.ts';
import { ACTORS, CONTRACT, WASM, NETWORK_ID, TOKEN, AMOUNT, check, publicKey, noSecrets, type Plan } from './model.ts';

/** Read-only reflection of the existing runtime ceiling, tested against it.
 * NOT a signing policy. Runtime/secure helper remain authoritative. */
export const REVIEWED_RUNTIME_FEE_CAP = 50_000_000n;
export const LIVE_TASK = 'D3-9-RUN1';
export type Role = 'USER' | 'ADMIN' | 'COLLECTOR' | 'RECYCLER';
export interface LocalArguments { live: boolean; taskId: string; expectedSha: string }
export function activationArguments(argv: readonly string[]): LocalArguments {
  check(argv.length === 5 && argv[0] === '--live' && argv[1] === '--task-id' && argv[3] === '--expected-sha', 'ExplicitLocalArgumentsRequired');
  return { live: true, taskId: argv[2], expectedSha: argv[4] };
}
export interface GitObservation { sha: string; clean: boolean }
export async function observeGit(root: string): Promise<GitObservation> {
  const run = promisify(execFile);
  const opts = { cwd: root, windowsHide: true, encoding: 'utf8' as const };
  const sha = (await run('git', ['rev-parse', 'HEAD'], opts)).stdout.trim();
  const status = (await run('git', ['status', '--porcelain', '--untracked-files=all'], opts)).stdout;
  return { sha, clean: status.length === 0 };
}
export function activation(p: Plan, args: LocalArguments, git: GitObservation, env: NodeJS.ProcessEnv, reviewedTask = LIVE_TASK): void {
  assertLocalRuntime(env);
  check(args.live === true, 'ExplicitLocalFlagRequired');
  check(/^D3-[0-9]+-RUN[123]$/.test(reviewedTask) && args.taskId === reviewedTask, 'ExactTaskRequired');
  check(/^[0-9a-f]{40}$/.test(args.expectedSha) && args.expectedSha === git.sha && git.sha === p.input.gitSha, 'ExactShaRequired');
  check(git.clean === true, 'CleanWorktreeRequired');
  check(p.input.network === 'TESTNET', 'TestnetOnly');
  check(!p.blockers.length, 'RecipientDecisionRequired');
}

/** Public review observations only, never credentials or executable authority.
 * Future owner-approved readers must obtain these BEFORE starting server.ts,
 * whose startup/interval can reconcile already queued work. */
export interface Preflight {
  taskId: string; runId: 'RUN1'|'RUN2'|'RUN3';
  observedAt: number; git: GitObservation; networkId: string; contractId: string; wasmSha256: string;
  deploymentId: string; mode: string; unresolved: number; pendingDispatches: number;
  signers: { address: string; available: boolean }[];
  sources: { address: string; sequence: string; reviewedSequence: string; xlmReady: boolean }[];
  wallets: { address: string; approvedMapping: boolean; trustlineAuthorized: boolean; capacityBaseUnits: string }[];
  payer: string; payerBaseUnits: string; marginBaseUnits: string; ttlMargin: number; requiredTtlMargin: number;
  successfulTxCap: number; failedBroadcastCap: number; setupCap: number; maintenanceCap: number;
  runtimeFeeCap: string; approvedFeeCap: string; requestedFee: string;
  uniqueBatteryIds: boolean; simulationBeforeSend: boolean; sameRuntimeSha: string;
}
export function preflight(p: Plan, args: LocalArguments, f: Preflight, env: NodeJS.ProcessEnv, now = Date.now()): void {
  activation(p, args, f.git, env, f.taskId);
  check(f.taskId.endsWith('-'+f.runId) && p.input.runs.some(r=>r.runId===f.runId), 'ExactRunRequired');
  check(Number.isFinite(f.observedAt) && now >= f.observedAt && now - f.observedAt <= 60_000, 'FreshPreflightRequired');
  check(f.networkId === NETWORK_ID && f.mode === 'TESTNET', 'TestnetOnly');
  check(f.contractId === CONTRACT && f.wasmSha256 === WASM && f.deploymentId === '5c0cad2f-5f25-4216-8068-6cb9d2d26325', 'DeploymentIdentityMismatch');
  check(f.unresolved === 0 && f.pendingDispatches === 0, 'UnresolvedWorkRequiresReview');
  const expected = Object.values(ACTORS).toSorted();
  check(f.signers.length === 4 && f.signers.every(s => s.available === true) && JSON.stringify(f.signers.map(s => s.address).toSorted()) === JSON.stringify(expected), 'SignerReadinessRequired');
  const sources = [ACTORS.admin, ACTORS.service, ACTORS.recycler].toSorted();
  check(f.sources.length === 3 && JSON.stringify(f.sources.map(s => s.address).toSorted()) === JSON.stringify(sources), 'SourceIdentityMismatch');
  check(f.sources.every(s => /^\d+$/.test(s.sequence) && s.sequence === s.reviewedSequence && s.xlmReady === true), 'SourceSequenceOrFeeReadinessRequired');
  const recipients = [...new Set(p.input.runs.map(r => r.recipient))].toSorted();
  check(recipients.length === 2 && f.wallets.length === 2 && JSON.stringify(f.wallets.map(w => w.address).toSorted()) === JSON.stringify(recipients), 'ExactlyTwoApprovedWalletsRequired');
  for (const w of f.wallets) { publicKey(w.address); check(w.approvedMapping === true && w.trustlineAuthorized === true && decimal(w.capacityBaseUnits) >= BigInt(AMOUNT) * BigInt(p.input.runs.filter(r => r.recipient === w.address).length), 'WalletReadinessRequired'); }
  check(f.payer === CONTRACT && decimal(f.marginBaseUnits) > 0n && decimal(f.payerBaseUnits) >= 300_000_000n + decimal(f.marginBaseUnits), 'PayerFundsRequired');
  check(Number.isSafeInteger(f.requiredTtlMargin) && f.requiredTtlMargin > 0 && Number.isSafeInteger(f.ttlMargin) && f.ttlMargin >= f.requiredTtlMargin, 'TtlReadinessRequired');
  check(Number.isInteger(f.successfulTxCap) && f.successfulTxCap > 0 && f.successfulTxCap <= 15 && f.failedBroadcastCap === 0 && f.setupCap === 0 && f.maintenanceCap === 0, 'BudgetReviewRequired');
  check(decimal(f.runtimeFeeCap) === REVIEWED_RUNTIME_FEE_CAP && decimal(f.approvedFeeCap) <= REVIEWED_RUNTIME_FEE_CAP && decimal(f.approvedFeeCap) > 0n && decimal(f.requestedFee) <= decimal(f.approvedFeeCap), 'FeeCapExceeded');
  check(f.uniqueBatteryIds === true && f.simulationBeforeSend === true && f.sameRuntimeSha === args.expectedSha, 'RuntimeReadinessRequired');
}
function decimal(v: string): bigint { check(typeof v === 'string' && /^\d+$/.test(v), 'InvalidBaseUnits'); return BigInt(v); }

export interface JournalEntry {
  taskId: string; gitSha: string; runId: string; batteryId: string; role: Role;
  operation: string; phase: 'INTENT' | 'RESULT' | 'UNKNOWN' | 'STOP';
  operationId?: string; requestId?: string; httpStatus?: number; domainState?: string;
  rewardState?: string; transactionHash?: string; reconciliation?: string; timestamp: string;
}
/** Project to a closed DTO; never serialize arbitrary response/error objects. */
export function sanitizeJournal(value: JournalEntry): JournalEntry {
  const out: Record<string, unknown> = {};
  const specs: Record<string, RegExp> = {
    taskId:/^D3-[A-Z0-9-]{1,60}$/, gitSha:/^[a-f0-9]{40}$/, runId:/^RUN[123]$/,
    batteryId:/^[A-Z0-9-]{1,32}$/, role:/^(USER|ADMIN|COLLECTOR|RECYCLER)$/,
    operation:/^(register_battery|open_return|confirm_collection|confirm_recycling|pay_reward)$/,
    phase:/^(INTENT|RESULT|UNKNOWN|STOP)$/, operationId:/^[a-f0-9-]{36}$/,
    requestId:/^[a-f0-9]{64}$/, transactionHash:/^[a-f0-9]{64}$/,
    domainState:/^(REGISTERED|RETURNED|COLLECTED|RECYCLED)$/, rewardState:/^(NOT_ELIGIBLE|PENDING|SENT|FAILED)$/,
    reconciliation:/^(CONFIRMED|UNRESOLVED|REJECTED|NOT_ATTEMPTED)$/,
    timestamp:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/,
  };
  for (const [key, pattern] of Object.entries(specs)) {
    const v = (value as unknown as Record<string, unknown>)[key];
    if (typeof v === 'string' && pattern.test(v)) out[key] = v;
  }
  if (Number.isInteger(value.httpStatus) && value.httpStatus! >= 100 && value.httpStatus! <= 599) out.httpStatus = value.httpStatus;
  for (const key of ['taskId','gitSha','runId','batteryId','role','operation','phase','timestamp']) check(out[key], 'InvalidJournalEntry');
  noSecrets(JSON.stringify(out));
  return out as unknown as JournalEntry;
}
export async function appendJournal(path: string, entry: JournalEntry): Promise<void> {
  const file = await open(path, 'a', 0o600);
  try { await file.writeFile(JSON.stringify(sanitizeJournal(entry)) + '\n'); await file.sync(); } finally { await file.close(); }
}
/** Fixed common-Git-directory lock, shared by worktrees. No arbitrary lock path
 * or automatic stale unlock. State is local Git metadata, never tracked. */
export async function acquireOperatorLock(root: string): Promise<{ assertHeld(): Promise<void>; release(): Promise<void>; directory: string }> {
  const canonicalRoot = await realpath(root);
  const top = (await promisify(execFile)('git', ['rev-parse','--show-toplevel'], {cwd:canonicalRoot,windowsHide:true})).stdout.trim();
  check(await realpath(top) === canonicalRoot, 'RepositoryRootRequired');
  const common = (await promisify(execFile)('git', ['rev-parse','--git-common-dir'], {cwd:canonicalRoot,windowsHide:true})).stdout.trim();
  const directory = resolve(await realpath(resolve(canonicalRoot,common)), 'byetery-d3-operator');
  await mkdir(directory, { recursive: true });
  check(await realpath(directory) === directory, 'LockDirectorySymlinkDenied');
  const path = join(directory, 'operator.lock');
  const id = randomUUID(); let held = true;
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(id); await file.sync(); } finally { await file.close(); }
  async function assertHeld() { check(held && await readFile(path, 'utf8') === id, 'OperatorLockLost'); }
  return { directory, assertHeld, async release() { await assertHeld(); await unlink(path); held = false; } };
}

/** Reserve before API calls; an unknown/rejected call never refunds its slot. */
export class Budget {
  #reserved = new Set<string>();
  readonly cap: number;
  constructor(cap: number, previous: string[] = []) { check(Number.isInteger(cap) && cap > 0 && cap <= 15, 'BudgetReviewRequired'); this.cap = cap; for(const id of previous)this.reserve(id); }
  reserve(id: string): void { check(!this.#reserved.has(id), 'OriginalOperationOnly'); check(this.#reserved.size < this.cap, 'TxBudgetExceeded'); this.#reserved.add(id); }
  get used() { return this.#reserved.size; }
}
export interface RunDecision { batteryId: string; sha: string; status: 'COMPLETED' | 'FAILED_ATTEMPT / NON_COUNTING'; countable: boolean }
export function runDecision(batteryId: string, frozenSha: string, finalSha: string, fullPreflight: boolean, completed: boolean, sourceChanged: boolean): RunDecision {
  const countable = /^[a-f0-9]{40}$/.test(frozenSha) && frozenSha === finalSha && fullPreflight && completed && !sourceChanged;
  return { batteryId, sha: frozenSha, status: countable ? 'COMPLETED' : 'FAILED_ATTEMPT / NON_COUNTING', countable };
}
/** Durable tombstone is written before the first request, including failed attempts. */
export async function consumeBattery(directory: string, batteryId: string): Promise<void> {
  check(/^[A-Z0-9-]{1,32}$/.test(batteryId), 'InvalidBatteryId');
  const file = await open(join(directory, `${batteryId}.consumed`), 'wx', 0o600);
  try { await file.writeFile('CONSUMED — never reuse, including FAILED_ATTEMPT / NON_COUNTING\n'); await file.sync(); } finally { await file.close(); }
}
