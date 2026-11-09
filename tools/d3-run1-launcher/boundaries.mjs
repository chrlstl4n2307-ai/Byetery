import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const RUN1 = Object.freeze({
  taskId: 'D3-18-RUN1',
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

// Source must perform the underlying observations within the requested window.
// A new request binding plus source timestamps reject a reused result.
export function createReadPreflight(readSources, { now = Date.now, retain = () => {}, diagnostics } = {}) {
  let lastRead = -1;
  let pending = false;
  return async function readPreflight() {
    requireThat(!pending, 'CONCURRENT_PREFLIGHT_REJECTED');
    pending = true;
    try {
      diagnostics?.event('PREFLIGHT_ENTER');
      const requestedAt = now();
      const requestId = randomUUID();
      let result;
      try {
        result = await readSources(Object.freeze({ requestId, requestedAt, identity: RUN1 }));
      } catch {
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
      diagnostics?.event('PREFLIGHT_FAIL');
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
