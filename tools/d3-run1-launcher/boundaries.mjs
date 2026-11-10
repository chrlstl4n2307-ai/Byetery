import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const RUN1 = Object.freeze({
  taskId: 'D3-22-RUN1',
  runId: 'RUN1',
  businessSha: 'c6ba2e837ed0f7b81373655b8106b58ecb86a8cd',
  planHash: '3788fd5b0ce1e07cb91720a7fb16cf8d9a81f1ee86e2eb29b289c56f4fc15c1e',
  batteryId: 'BYE-D3-R1-20261107-5FB1AED9DA08',
  recipient: 'GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS',
});

export const LIVE_JWT_EXPIRY_SECONDS = 5400;
export const ROLES = Object.freeze(['USER', 'ADMIN', 'COLLECTOR', 'RECYCLER']);
export const SESSION_SAFETY_MARGIN_SECONDS = 120;
export const STARTUP_ALLOWANCE_SECONDS = 180;
export const SESSION_PER_STEP_SECONDS = 600 + 120 + 2 * 30;
export const MAX_RECAPTURE_ATTEMPTS_AFTER_INITIAL_CAPTURE = 1;
const AUTH_CONFIG_SOURCE = 'SUPABASE_PROJECT_AUTH_CONFIG';
const PROJECT_REF = 'aemxuqnnwfclzrwwiqfd';
const MAX_AUTH_CONFIG_AGE_MS = 10 * 60_000;
const allowedSources = new Set(['LOCAL_GIT', 'STELLAR_RPC_TESTNET', 'SUPABASE_SQL_READ_ONLY']);

export function requireThat(condition, code) {
  if (!condition) throw new Error(code);
}

export const PREFLIGHT_LEAF_CODE = /^[A-Z][A-Z0-9_]{1,80}$/;
export const PREFLIGHT_PHASES = Object.freeze(['PRE_ADMISSION', 'REVIEWED', 'STARTUP_FRESH', 'OPERATOR_STEP']);

export const PREFLIGHT_INNER_CODES = Object.freeze([
  'TIMEOUT', 'NET', 'HTTP_STATUS', 'RPC_REJECTED', 'TOO_LARGE', 'VALIDATION', 'JSON', 'UNKNOWN',
]);
const innerCodes = new Set(PREFLIGHT_INNER_CODES);
const mappedCodes = new Map([
  ['PUBLIC_READ_UNAVAILABLE', 'NET'],
  ['RPC_REJECTED', 'RPC_REJECTED'],
  ['RESPONSE_TOO_LARGE', 'TOO_LARGE'],
  ['HORIZON_ACCOUNT_RESPONSE_TOO_LARGE', 'TOO_LARGE'],
  ['INVALID_PUBLIC_JSON', 'JSON'],
  ['HORIZON_ACCOUNT_UNAVAILABLE', 'HTTP_STATUS'],
]);
const validationCode = /^(?:CHAIN_READINESS_REJECTED|TESTNET_[A-Z0-9_]+|SQL_[A-Z0-9_]+|POOL_OR_TTL_REJECTED|POOL_AUTHORIZATION_REJECTED|SOURCE_SEQUENCE_OR_FUNDING_REJECTED|WALLET_TRUSTLINE_REJECTED|WALLET_LINK_REJECTED|ARCHIVED_BATTERY_COLLISION|REWARD_READINESS_REJECTED|CHAIN_SOURCE_IDENTITY_REJECTED|DURABLE_SOURCE_SEQUENCE_REJECTED|RUN1_[A-Z0-9_]+|EXTERNAL_LEDGER_[A-Z0-9_]+|NONCOUNTING_OPERATION_REJECTED|PREFLIGHT_FRESHNESS_REJECTED|PREFLIGHT_SCOPE_REJECTED|PREFLIGHT_PROVENANCE_REJECTED|CONCURRENT_PREFLIGHT_REJECTED)$/;
const leafCodes = new Set([
  ...mappedCodes.keys(), 'ROLE_IDENTITY_NOT_UNIQUE', 'ROLE_BEFORE_ADMISSION_REJECTED',
  'CHAIN_READINESS_REJECTED', 'TESTNET_IDENTITY_REJECTED', 'TESTNET_CONTRACT_STATE_UNAVAILABLE',
  'TESTNET_CONTRACT_IDENTITY_REJECTED', 'TESTNET_ACCOUNT_UNAVAILABLE', 'LEDGER_KEY_RESPONSE_MISMATCH',
  'SQL_READONLY_REQUIRED', 'SQL_DEPLOYMENT_REJECTED', 'SQL_QUIESCENCE_REJECTED', 'SQL_CONFIG_TARGET_REJECTED',
  'POOL_OR_TTL_REJECTED', 'POOL_AUTHORIZATION_REJECTED', 'SOURCE_SEQUENCE_OR_FUNDING_REJECTED',
  'WALLET_TRUSTLINE_REJECTED', 'WALLET_LINK_REJECTED', 'ARCHIVED_BATTERY_COLLISION',
  'REWARD_READINESS_REJECTED', 'CHAIN_SOURCE_IDENTITY_REJECTED', 'DURABLE_SOURCE_SEQUENCE_REJECTED',
  'RUN1_BATTERY_COLLISION', 'RUN1_CHAIN_SQL_STATE_MISMATCH', 'RUN1_OPERATION_IDENTITY_REJECTED',
  'RUN1_RESERVATION_REJECTED', 'RUN1_PLAN_REJECTED', 'RUN1_CONTROL_DIRECTORY_REJECTED',
  'RUN1_JOURNAL_IDENTITY_REJECTED', 'RUN1_JOURNAL_INCOMPLETE', 'RUN1_JOURNAL_REJECTED', 'RUN1_PRIOR_CONTROL_REJECTED',
  'EXTERNAL_LEDGER_CONSUMPTION_REJECTED', 'EXTERNAL_LEDGER_DIGEST_REJECTED', 'EXTERNAL_LEDGER_POLICY_REJECTED',
  'NONCOUNTING_OPERATION_REJECTED', 'PREFLIGHT_FRESHNESS_REJECTED', 'PREFLIGHT_SCOPE_REJECTED',
  'PREFLIGHT_PROVENANCE_REJECTED', 'CONCURRENT_PREFLIGHT_REJECTED', 'K6_COMPOSITION_CHANGED',
  'SIGNER_CLI_IDENTITY_REJECTED', 'PUBLIC_SIGNER_IDENTITY_REJECTED',
]);

function errorNames(error) {
  const names = [];
  const seen = new Set();
  for (let current = error, depth = 0; current && depth < 8; current = current.cause, depth++) {
    if (seen.has(current)) break;
    seen.add(current);
    if (typeof current.name === 'string') names.push(current.name);
  }
  return names;
}

function declaredCode(error) {
  for (const value of [error?.code, error?.message]) {
    if (typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,80}$/.test(value)) return value;
  }
}

export function classifyPreflightInnerCode(error) {
  if (errorNames(error).some(name => name === 'TimeoutError' || name === 'AbortError')) return 'TIMEOUT';
  if (error instanceof SyntaxError || errorNames(error).includes('SyntaxError')) return 'JSON';
  const code = declaredCode(error);
  if (mappedCodes.has(code)) return mappedCodes.get(code);
  if (code === 'ROLE_IDENTITY_NOT_UNIQUE' || (typeof code === 'string' && validationCode.test(code))) return 'VALIDATION';
  return 'UNKNOWN';
}

export function sanitizePreflightInnerCode(value) {
  return innerCodes.has(value) ? value : undefined;
}

export function preflightLeafCode(error) {
  const seen = new Set();
  for (let current = error, depth = 0; current && depth < 8; current = current.cause, depth++) {
    if (seen.has(current)) break;
    seen.add(current);
    for (const code of [current.code, current.message]) {
      if (sanitizePreflightLeafCode(code) !== 'UNKNOWN_LEAF') return code;
    }
  }
  return 'UNKNOWN_LEAF';
}

export function sanitizePreflightLeafCode(value) {
  return typeof value === 'string' && PREFLIGHT_LEAF_CODE.test(value) && leafCodes.has(value) ? value : 'UNKNOWN_LEAF';
}

export function sanitizePreflightPhase(value) {
  return PREFLIGHT_PHASES.includes(value) ? value : undefined;
}

function preflightPhaseOf(phaseOf, readNumber) {
  if (typeof phaseOf === 'function') return sanitizePreflightPhase(phaseOf(readNumber));
  return readNumber >= 1 ? 'PRE_ADMISSION' : undefined;
}

// Source must perform the underlying observations within the requested window.
// A new request binding plus source timestamps reject a reused result.
export function createReadPreflight(readSources, { now = Date.now, retain = () => {}, diagnostics, phaseOf } = {}) {
  let lastRead = -1;
  let pending = false;
  let reads = 0;
  return async function readPreflight() {
    requireThat(!pending, 'CONCURRENT_PREFLIGHT_REJECTED');
    pending = true;
    let sourceFailure;
    const readNumber = ++reads;
    const phase = preflightPhaseOf(phaseOf, readNumber);
    try {
      diagnostics?.event('PREFLIGHT_ENTER');
      const requestedAt = now();
      const requestId = randomUUID();
      let result;
      try {
        result = await readSources(Object.freeze({ requestId, requestedAt, identity: RUN1 }));
      } catch (sourceError) {
        sourceFailure = sourceError;
        throw new Error('PREFLIGHT_SOURCES_UNAVAILABLE');
      }
      const completedAt = now();
      const { preflight, observations } = result ?? {};
      requireThat(result?.requestId === requestId && Number.isSafeInteger(requestedAt) &&
        Number.isSafeInteger(completedAt) && completedAt >= requestedAt &&
        completedAt - requestedAt <= 60_000 && Number.isSafeInteger(preflight?.observedAt) &&
        preflight.observedAt > lastRead && preflight.observedAt >= requestedAt && preflight.observedAt <= completedAt,
      'PREFLIGHT_FRESHNESS_REJECTED');
      requireThat(preflight.taskId === RUN1.taskId && preflight.runId === RUN1.runId &&
        preflight.sameRuntimeSha === RUN1.businessSha && preflight.mode === 'TESTNET', 'PREFLIGHT_SCOPE_REJECTED');
      requireThat(Array.isArray(observations) && observations.length === allowedSources.size &&
        new Set(observations.map(item => item.source)).size === allowedSources.size &&
        observations.every(({ source, observedAt, ledger }) => allowedSources.has(source) &&
          Number.isSafeInteger(observedAt) && observedAt >= requestedAt && observedAt <= completedAt &&
          (source === 'STELLAR_RPC_TESTNET' ? Number.isSafeInteger(ledger) && ledger > 0 : ledger === null)),
      'PREFLIGHT_PROVENANCE_REJECTED');
      lastRead = preflight.observedAt;
      await retain({ requestedAt, completedAt, observations: observations.map(({ source, observedAt, ledger }) =>
        ({ source, observedAt, ledger })) });
      diagnostics?.event('PREFLIGHT_OK');
      // Frozen operator sets f.git on this independent copy.
      return structuredClone(preflight);
    } catch (error) {
      diagnostics?.event('PREFLIGHT_FAIL', undefined, classifyPreflightInnerCode(sourceFailure ?? error), {
        leaf: preflightLeafCode(sourceFailure ?? error),
        readNumber,
        phase,
      });
      throw error;
    } finally {
      pending = false;
    }
  };
}

// This port belongs to the eventual owner-approved runtime secure store.
// No local fallback, cached credentials, or login at this boundary.
export function createRuntimeCredentials(store, diagnostics) {
  const served = new Set();
  return async function credentials(role) {
    requireThat(ROLES.includes(role), 'CREDENTIAL_ROLE_REJECTED');
    diagnostics?.event('CREDENTIAL_ENTER', role);
    if (served.has(role)) {
      diagnostics?.event('CREDENTIAL_REJECTED', role);
      throw new Error('CREDENTIAL_ROLE_REJECTED');
    }
    served.add(role);
    try {
      const item = await store.resolve(role);
      if (!(typeof item?.email === 'string' && item.email.length > 0 &&
        typeof item.password === 'string' && item.password.length > 0)) {
        diagnostics?.event('CREDENTIAL_REJECTED', role);
        throw new Error('CREDENTIALS_UNAVAILABLE');
      }
      diagnostics?.event('CREDENTIAL_RETURN', role);
      return { email: item.email, password: item.password };
    } catch {
      throw new Error('CREDENTIALS_UNAVAILABLE');
    }
  };
}

function checkAuthConfig(config, at) {
  const observedAt = config?.observedAt;
  requireThat(config && Object.keys(config).sort().join(',') === 'jwtExpirySeconds,observedAt,projectRef,source' &&
    config.source === AUTH_CONFIG_SOURCE && config.projectRef === PROJECT_REF &&
    Number.isSafeInteger(config.jwtExpirySeconds) && config.jwtExpirySeconds > SESSION_SAFETY_MARGIN_SECONDS &&
    Number.isSafeInteger(at) && Number.isSafeInteger(observedAt) && observedAt <= at &&
    at - observedAt <= MAX_AUTH_CONFIG_AGE_MS, 'SESSION_CONFIGURATION_UNAVAILABLE');
}

export function checkLiveSessionConfig(config, at = Date.now()) {
  checkAuthConfig(config, at);
  requireThat(config.jwtExpirySeconds === LIVE_JWT_EXPIRY_SECONDS, 'LIVE_JWT_EXPIRY_REJECTED');
}

export function createSessionDeadline(config, { operatorStart, now = Date.now }) {
  checkAuthConfig(config, operatorStart);
  const deadline = operatorStart + (config.jwtExpirySeconds - SESSION_SAFETY_MARGIN_SECONDS) * 1000;
  requireThat(Number.isSafeInteger(deadline), 'SESSION_CONFIGURATION_UNAVAILABLE');
  let lastTime = operatorStart;
  return Object.freeze({
    deadline,
    check(remainingSteps, beforeStart = false) {
      const time = now();
      requireThat(Number.isSafeInteger(time) && time >= lastTime && Number.isInteger(remainingSteps) &&
        remainingSteps >= 0 && remainingSteps <= 5, 'SESSION_CLOCK_REJECTED');
      lastTime = time;
      const required = (SESSION_PER_STEP_SECONDS * remainingSteps + (beforeStart ? STARTUP_ALLOWANCE_SECONDS : 0)) * 1000;
      requireThat(deadline - time > required, 'SESSION_DEADLINE_INSUFFICIENT');
    },
  });
}

// The exclusive admission survives process exit. Never release it on failure.
export function createSingleAdmission(claimFile, nonce) {
  return async function admitOnce() {
    try {
      const file = await open(claimFile, 'wx', 0o600);
      try {
        if (nonce !== undefined) await file.writeFile(nonce + '\n');
        await file.sync();
      } finally {
        await file.close();
      }
    } catch {
      throw new Error('RUN_ALREADY_CLAIMED_OR_ADMISSION_UNAVAILABLE');
    }
  };
}

// All linked worktrees use the same claim. The frozen operator still owns
// its independent lock and journal.
export function admissionControlName(taskId = RUN1.taskId) {
  requireThat(/^D3-[0-9]+-RUN1$/.test(taskId) && taskId === RUN1.taskId, 'EXACT_TASK_REQUIRED');
  return 'byetery-' + taskId.toLowerCase() + '.launcher-admission';
}

export function runControlPaths(common) {
  const directory = join(common, 'byetery-d3-operator');
  return {
    admission: join(common, admissionControlName()),
    operatorLock: join(directory, 'operator.lock'),
    journal: join(directory, RUN1.taskId + '-' + RUN1.businessSha + '.jsonl'),
    budget: join(directory, RUN1.planHash + '.budget'),
    consumed: join(directory, RUN1.batteryId + '.consumed'),
  };
}

export async function admitLiveOnce(workspace, nonce) {
  requireThat(typeof nonce === 'string' && /^[a-f0-9]{64}$/.test(nonce), 'LIVE_GRANT_NONCE_REJECTED');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  const { stdout } = await promisify(execFile)('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd: workspace, env, windowsHide: true });
  await createSingleAdmission(runControlPaths(stdout.trim()).admission, nonce)();
}
