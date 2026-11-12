import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { plan } from '../../backend/src/d3/model.ts';
import { assertLocalRuntime } from '../../backend/src/d3/operator-guard.ts';
import { checkedOutCommit, checkCaptureCheckout, checkSharedGitDirectory, frozenOperatorPath } from './f1-checkout.mjs';
import { bindLiveEvidence, verifyLiveCorroboration } from './f1-evidence.mjs';
import { exactRecord } from './grant-schema.mjs';
import { OWNER_GRANT_KEY_STATUS, verifyOwnerGrant } from './grant-verifier.mjs';
import { D324_IDENTITY } from '../d3-24-ratification/profile.mjs';
import {
  RUN1, ROLES, SESSION_PER_STEP_SECONDS, SESSION_SAFETY_MARGIN_SECONDS,
  MAX_RECAPTURE_ATTEMPTS_AFTER_INITIAL_CAPTURE, admitLiveOnce, checkLiveSessionConfig,
  createReadPreflight, createRuntimeCredentials, createSessionDeadline, requireThat,
} from './boundaries.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const { businessSha: FROZEN_SHA, planHash: PLAN_HASH, batteryId: BATTERY_ID } = RUN1;
const steps = [
  ['register_battery', 'REGISTERED', 'NOT_ELIGIBLE'],
  ['open_return', 'RETURNED', 'NOT_ELIGIBLE'],
  ['confirm_collection', 'COLLECTED', 'NOT_ELIGIBLE'],
  ['confirm_recycling', 'RECYCLED', 'PENDING'],
  ['pay_reward', 'RECYCLED', 'SENT'],
];
const converged = 'DURABLE_RECEIPT_CONVERGED_NORMALIZED';
const pending = 'DURABLE_RECEIPT_MISMATCH_PRESERVED';
const transientReasons = new Set(['PROJECTION_NOT_TERMINAL', 'RPC_NOT_TERMINAL', 'CONVERGENCE_TIME_LIMIT', 'CAPTURE_CHILD_UNAVAILABLE']);
const goodReasons = new Set(['CANONICAL_BYTES_MATCH', 'ENCODING_REPRESENTATION_DIFFERENCE', 'APPROVED_DIAGNOSTIC_VARIANCE']);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hex = /^[a-f0-9]{64}$/;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const CAPTURE_CHILD_TIMEOUT_MS = 30_000;
export const SESSION_PER_STEP_MS = SESSION_PER_STEP_SECONDS * 1000;
export const SESSION_MARGIN_MS = SESSION_SAFETY_MARGIN_SECONDS * 1000;

export async function reviewedPlan() {
  const bytes = await readFile(join(ROOT, 'docs/instaward/d3/review/D3-17-FRESH-3RUN/new-plan.json'));
  const reviewed = plan(JSON.parse(bytes));
  requireThat(reviewed.planHash === PLAN_HASH && reviewed.input.gitSha === FROZEN_SHA, 'PLAN_IDENTITY_REJECTED');
  const run = reviewed.input.runs[0];
  requireThat(run.runId === 'RUN1' && run.batteryId === BATTERY_ID && run.recipient === RUN1.recipient &&
    run.negativeCases.length === 0, 'RUN1_SCOPE_REJECTED');
  return run;
}

// Consume sanitized observations only. The caller of a future live adapter must
// validate /me and retain the same four sessions. This guard accepts no token.
export function sessionWindow(observations, now) {
  requireThat(Array.isArray(observations) && observations.length === ROLES.length, 'SESSION_ROLE_SET_REJECTED');
  const pinned = new Map();
  const checkShape = (entries) => {
    requireThat(Array.isArray(entries) && entries.length === ROLES.length &&
      new Set(entries.map(entry => entry?.role)).size === ROLES.length, 'SESSION_ROLE_SET_REJECTED');
    requireThat(new Set(entries.map(entry => entry?.sessionId)).size === ROLES.length, 'SESSION_PROVENANCE_REJECTED');
    for (const entry of entries) {
      requireThat(entry && Object.keys(entry).sort().join(',') === 'expiresAt,role,sessionId,validated' &&
        ROLES.includes(entry.role) && uuid.test(entry.sessionId) && entry.validated === true &&
        Number.isSafeInteger(entry.expiresAt), 'SESSION_PROVENANCE_REJECTED');
    }
  };
  checkShape(observations);
  for (const observation of observations) pinned.set(observation.role, Object.freeze({ ...observation }));

  let lastTime = -1;
  return (current, remainingSteps) => {
    checkShape(current);
    const time = now();
    requireThat(Number.isSafeInteger(time) && time >= lastTime && Number.isInteger(remainingSteps) &&
      remainingSteps >= 0 && remainingSteps <= steps.length, 'SESSION_TIME_REJECTED');
    lastTime = time;
    for (const { role, sessionId, expiresAt } of current) {
      const original = pinned.get(role);
      requireThat(sessionId === original.sessionId && expiresAt === original.expiresAt, 'SESSION_CHANGED');
      requireThat(expiresAt - time > remainingSteps * SESSION_PER_STEP_MS + SESSION_MARGIN_MS, 'SESSION_WINDOW_INSUFFICIENT');
    }
  };
}

function scopeFromStep(evidence, index, previous, seenOperations, seenHashes, run) {
  const [operation, lifecycle, reward] = steps[index];
  requireThat(evidence?.batteryId === run.batteryId && evidence.operation === operation &&
    evidence.confirmedBatteryState === lifecycle && evidence.confirmedRewardState === reward &&
    ['OBSERVED', 'RECONCILED_AFTER_OBSERVATION_EXPIRY'].includes(evidence.confirmationMode) &&
    Number.isFinite(Date.parse(evidence.confirmedAt)), 'OPERATOR_EVIDENCE_REJECTED');
  requireThat(uuid.test(evidence.operationId) && hex.test(evidence.transactionHash) &&
    Number.isSafeInteger(evidence.confirmationLedger) && evidence.confirmationLedger > 0 &&
    (!previous || evidence.confirmationLedger >= previous.ledger) &&
    !seenOperations.has(evidence.operationId) && !seenHashes.has(evidence.transactionHash), 'OPERATION_IDENTITY_REJECTED');
  requireThat(index === 0 ? evidence.requestId === null : hex.test(evidence.requestId) &&
    (index === 1 || previous.requestId === evidence.requestId), 'REQUEST_IDENTITY_REJECTED');
  if (operation === 'confirm_collection' || operation === 'confirm_recycling') {
    const payload = evidence.payload;
    requireThat(typeof payload?.manifestBase64 === 'string' && payload.manifestBase64.length > 0 &&
      hex.test(payload.payloadHash), 'ATTESTATION_BYTES_REJECTED');
    const bytes = Buffer.from(payload.manifestBase64, 'base64');
    requireThat(bytes.toString('base64') === payload.manifestBase64 && sha(bytes) === payload.payloadHash,
      'ATTESTATION_BYTES_REJECTED');
  }
  return Object.freeze({
    operationId: evidence.operationId,
    transactionHash: evidence.transactionHash,
    batteryId: evidence.batteryId,
    method: evidence.operation,
    ledger: evidence.confirmationLedger,
  });
}

function sameScope(actual, expected) {
  return actual && Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => actual[key] === value);
}

async function regularBytes(directory, name, maxBytes) {
  const file = join(directory, name);
  const stat = await lstat(file);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maxBytes, 'CAPTURE_FILE_REJECTED');
  return readFile(file);
}

export async function verifyCaptureInventory(directory, expected, classification) {
  const bytes = await regularBytes(directory, 'inventory.json', 65_536);
  const digest = sha(bytes);
  const recorded = await regularBytes(directory, 'INVENTORY_SHA256', 65);
  requireThat(recorded.toString() === digest + '\n', 'CAPTURE_INVENTORY_REJECTED');
  const inventory = JSON.parse(bytes);
  requireThat(Array.isArray(inventory) && inventory.length > 0 && inventory.length <= 30, 'CAPTURE_INVENTORY_REJECTED');
  const sealed = new Map();
  for (const entry of inventory) {
    requireThat(typeof entry?.path === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry.path) &&
      !sealed.has(entry.path) && hex.test(entry.sha256) && Number.isSafeInteger(entry.bytes) &&
      entry.bytes >= 0 && entry.bytes <= 4_194_304, 'CAPTURE_ENTRY_REJECTED');
    const contents = await regularBytes(directory, entry.path, entry.bytes);
    requireThat(contents.length === entry.bytes && sha(contents) === entry.sha256, 'CAPTURE_BYTES_REJECTED');
    sealed.set(entry.path, contents);
  }
  const result = JSON.parse(sealed.get('result.json'));
  const scope = JSON.parse(sealed.get('capture-scope.json'));
  requireThat(scope.classification === classification && sameScope(scope.expected, expected) &&
    sameScope(result.expected, expected) && result.schema === 'BYETERY_DURABLE_RECEIPT_RESULT_V2' &&
    scope.grantsExecutionAuthority === false && result.grantsExecutionAuthority === false &&
    result.nextLifecycleOperation === false && result.networkMutationPaths === 0 &&
    Number.isInteger(result.attempts) && result.attempts > 0 && result.attempts <= 3, 'CAPTURE_SCOPE_REJECTED');
  const attempt = String(result.attempts).padStart(2, '0');
  const final = result.finalObservations;
  let receipt;
  if (result.status === converged) {
    requireThat(final?.terminalSql === true && final.terminalRpc === true && final.chainResult === 'SUCCESS' &&
      final.status === result.reason && goodReasons.has(result.reason) &&
      final.rawSqlSha256 === sha(sealed.get(attempt + '-sql.raw.utf8')) &&
      final.rawRpcSha256 === sha(sealed.get(attempt + '-rpc.raw.utf8')), 'CAPTURE_PASS_REJECTED');
    if (classification === 'LIVE_READONLY_SQL_AND_TESTNET_RPC') {
      receipt = Object.freeze({ sql: JSON.parse(sealed.get(attempt + '-sql.raw.utf8')),
        rpc: JSON.parse(sealed.get(attempt + '-rpc.raw.utf8')).result });
    }
  }
  return Object.freeze({ status: result.status, reason: result.reason, inventorySha256: digest,
    ...(receipt ? { receipt } : {}) });
}

async function observeCapture({ output, unavailable }, scope, classification) {
  if (unavailable === true) {
    try {
      await lstat(join(output, 'inventory.json'));
    } catch (error) {
      if (error.code === 'ENOENT') return { status: pending, reason: 'CAPTURE_CHILD_UNAVAILABLE' };
      throw error;
    }
  }
  return verifyCaptureInventory(output, scope, classification);
}

// Entry point for synthetic replay. A second process must use the same
// exclusive admission artifact for the same replay identity.
export function replayLauncher(options) {
  return runSingleOperator(options, 'OFFLINE_SYNTHETIC');
}

// The candidate can exercise the same serial launcher with synthetic ports only.
export function replayD324Launcher(options, { verifyPlan, verifyCapture }) {
  return runSingleOperator(options, 'OFFLINE_SYNTHETIC', { run: D324_IDENTITY, verifyPlan, verifyCapture });
}

// The only live composition. Runtime supplies the existing fresh source and
// credential ports, never the verifier, a session observer or an operator factory.
export async function launchRun1(ownerGrant, runtime, { diagnostics, checkPins } = {}) {
  assertLocalRuntime();
  requireThat(OWNER_GRANT_KEY_STATUS === 'PINNED', 'OWNER_GRANT_KEY_PLACEHOLDER');
  const compositionSha = await checkedOutCommit(ROOT);
  const grant = verifyOwnerGrant(ownerGrant, compositionSha);
  requireThat(grant.expiresAt - grant.issuedAt === 900_000 && typeof checkPins === 'function', 'LIVE_SESSION_PINS_REQUIRED');
  const sessionConfig = Object.freeze({
    projectRef: 'aemxuqnnwfclzrwwiqfd', source: 'SUPABASE_PROJECT_AUTH_CONFIG',
    jwtExpirySeconds: grant.jwtExpirySeconds, observedAt: grant.jwtObservedAt,
  });
  requireThat(exactRecord(runtime, ['apiOrigin', 'frozenRoot', 'publishableKey', 'readSources', 'secureStore', 'sqlPool']) &&
    typeof runtime.apiOrigin === 'string' && typeof runtime.frozenRoot === 'string' &&
    typeof runtime.publishableKey === 'string' && typeof runtime.readSources === 'function' &&
    typeof runtime.secureStore?.resolve === 'function' && typeof runtime.sqlPool?.connect === 'function',
  'LIVE_RUNTIME_BINDING_REQUIRED');
  const { apiOrigin, frozenRoot, publishableKey, readSources, secureStore, sqlPool } = runtime;
  const argv = ['--live', '--task-id', RUN1.taskId, '--expected-sha', RUN1.businessSha];
  requireThat(process.argv.slice(2).join('\0') === argv.join('\0'), 'ACTUAL_LOCAL_CLI_REQUIRED');
  await checkSharedGitDirectory(ROOT, frozenRoot);
  const pinnedOperator = await frozenOperatorPath(frozenRoot);
  await checkCaptureCheckout(ROOT, compositionSha);
  const checkStart = async () => {
    await checkSharedGitDirectory(ROOT, frozenRoot);
    requireThat(await checkedOutCommit(ROOT) === compositionSha &&
      await frozenOperatorPath(frozenRoot) === pinnedOperator, 'EXECUTION_CHECKOUT_CHANGED');
    await checkPins(compositionSha);
    requireThat(grant.expiresAt > Date.now(), 'GRANT_LIFETIME_REJECTED');
    checkLiveSessionConfig(sessionConfig);
  };
  const readPreflight = createReadPreflight(readSources, { diagnostics,
    phaseOf: n => n === 1 ? 'REVIEWED' : n === 2 ? 'STARTUP_FRESH' : 'OPERATOR_STEP' });
  const credentials = createRuntimeCredentials(secureStore, diagnostics);
  const evidence = bindLiveEvidence(sqlPool, CAPTURE_CHILD_TIMEOUT_MS);
  return runSingleOperator({
    ...evidence,
    now: Date.now,
    sessionConfig,
    verifyCorroboration: verifyLiveCorroboration,
    admitOnce: async () => {
      await checkStart();
      await admitLiveOnce(ROOT, grant.nonce);
    },
    operatorFactory: async () => {
      await checkStart();
      const { createLocalOperator } = await import(pathToFileURL(pinnedOperator).href);
      checkLiveSessionConfig(sessionConfig);
      requireThat(grant.expiresAt > Date.now(), 'GRANT_LIFETIME_REJECTED');
      return createLocalOperator({ root: frozenRoot, argv,
        publicPlanFile: join(ROOT, 'docs/instaward/d3/review/D3-17-FRESH-3RUN/new-plan.json'),
        apiOrigin, publishableKey, readPreflight, credentials });
    },
  }, 'LIVE');
}

async function runSingleOperator({
  operatorFactory, admitOnce, sessionConfig, observeSessions, preserve, capture, verifyCorroboration, now, onPause = () => {},
}, mode, { run = RUN1, verifyPlan = reviewedPlan, verifyCapture = observeCapture } = {}) {
  let operator;
  let operatorStart;
  let completedAt;
  const captureClassification = mode === 'LIVE' ? 'LIVE_READONLY_SQL_AND_TESTNET_RPC' : 'OFFLINE_SYNTHETIC';
  const accepted = [];
  let stop = mode === 'LIVE' ? 'STOP_LIVE_PREFLIGHT' : 'STOP_OFFLINE_PREFLIGHT';
  let previous;
  const seenOperations = new Set();
  const seenHashes = new Set();
  try {
    await verifyPlan();
    stop = 'STOP_SESSION_GATE';
    let sessionDeadline = createSessionDeadline(sessionConfig, { operatorStart: now(), now });
    sessionDeadline.check(steps.length, true);
    stop = 'STOP_RUN_ADMISSION';
    await admitOnce();
    stop = 'STOP_SESSION_GATE';
    sessionDeadline.check(steps.length, true);
    stop = 'STOP_OPERATOR_START_REQUIRES_REVIEW';
    if (mode === 'LIVE') {
      // The frozen factory issues its role logins after this timestamp.
      operatorStart = now();
      sessionDeadline = createSessionDeadline(sessionConfig, { operatorStart, now });
      sessionDeadline.check(steps.length, true);
    }
    operator = await operatorFactory();
    stop = 'STOP_SESSION_GATE';
    let checkWindow;
    if (mode === 'OFFLINE_SYNTHETIC') {
      const startup = await observeSessions();
      checkWindow = sessionWindow(startup, now);
      checkWindow(startup, steps.length);
    }
    for (const [index, [operation]] of steps.entries()) {
      stop = 'STOP_SESSION_GATE';
      if (checkWindow) checkWindow(await observeSessions(), steps.length - index);
      sessionDeadline.check(steps.length - index);
      stop = 'STOP_OPERATOR_REQUIRES_REVIEW';
      const evidence = await operator.step(operation);
      stop = 'STOP_INVALID_OPERATOR_EVIDENCE';
      const scope = scopeFromStep(evidence, index, previous, seenOperations, seenHashes, run);
      seenOperations.add(scope.operationId);
      seenHashes.add(scope.transactionHash);
      previous = { ...scope, requestId: evidence.requestId };

      stop = 'STOP_CAPTURE_UNVERIFIED';
      await preserve(scope, evidence);
      let proof = await verifyCapture(await capture(scope, 1), scope, captureClassification);
      if (proof.status === pending && transientReasons.has(proof.reason)) {
        await onPause(scope);
        // Reconcile the already-confirmed identity even if Auth expires here.
        // Recheck the original sessions before permitting further progression.
        proof = await verifyCapture(await capture(scope, 1 + MAX_RECAPTURE_ATTEMPTS_AFTER_INITIAL_CAPTURE),
          scope, captureClassification);
      }
      if (proof.status !== converged || !goodReasons.has(proof.reason) || !hex.test(proof.inventorySha256)) break;
      if (mode === 'LIVE') {
        // A receipt match is insufficient on its own. The reviewed runtime
        // must bind the same evidence to terminal API, SQL and chain facts.
        const corroboration = await verifyCorroboration(scope, evidence, proof);
        requireThat(corroboration === true, 'CAPTURE_CORROBORATION_REJECTED');
      }
      accepted.push(Object.freeze({ ...scope, inventorySha256: proof.inventorySha256 }));
      stop = 'STOP_SESSION_GATE';
      if (checkWindow) checkWindow(await observeSessions(), steps.length - index - 1);
      sessionDeadline.check(steps.length - index - 1);
    }
    if (accepted.length === steps.length) {
      stop = 'STOP_OPERATOR_DECISION';
      const decision = await operator.countingDecision();
      requireThat(decision?.batteryId === run.batteryId && decision.sha === run.businessSha &&
        decision.status === 'COMPLETED' && decision.countable === true, 'OPERATOR_DECISION_REJECTED');
      if (mode === 'LIVE') completedAt = now();
      stop = mode === 'LIVE' ? 'LIVE_CAPTURE_COMPLETE' : 'OFFLINE_CAPTURE_COMPLETE';
    }
  } catch {
    // Stop at the current gate. Never emit arbitrary callback errors.
  } finally {
    try {
      await operator?.close();
    } catch {
      stop = 'STOP_OPERATOR_CLOSE_REQUIRES_REVIEW';
    }
  }
  return Object.freeze({ mode, status: stop, accepted, executionAuthority: false,
    ...(completedAt === undefined ? {} : { operatorStart, completedAt, RUN_EVIDENCE_VALID: 'PENDING_OWNER_OBSERVATION' }) });
}

export const isDirect = (moduleUrl) => Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(moduleUrl);
