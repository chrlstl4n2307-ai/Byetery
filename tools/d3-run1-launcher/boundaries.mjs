import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const RUN1 = Object.freeze({
  taskId: 'D3-17-FRESH-3RUN',
  runId: 'D3-17-RUN1',
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

export function verifyIdentity(identity) {
  requireThat(identity && Object.keys(identity).length === Object.keys(RUN1).length &&
    Object.entries(RUN1).every(([key, value]) => Object.hasOwn(identity, key) && identity[key] === value), 'RUN_IDENTITY_REJECTED');
}

export async function checkLiveActivation(activation = {}, verifyOwnerGrant) {
  const { identity, ownerGrant } = activation;
  verifyIdentity(identity);
  requireThat(ownerGrant && typeof verifyOwnerGrant === 'function', 'FUTURE_OWNER_AUTHORIZATION_REQUIRED');
  requireThat(Object.keys(activation).sort().join(',') === 'identity,ownerGrant', 'LIVE_ACTIVATION_INPUT_REJECTED');
  let approval;
  try {
    approval = await verifyOwnerGrant(ownerGrant);
  } catch {
    throw new Error('FUTURE_OWNER_AUTHORIZATION_REJECTED');
  }
  requireThat(approval?.action === 'AUTHORIZE_D3_17_RUN1_EXECUTION' &&
    approval.jwtExpirySeconds === LIVE_JWT_EXPIRY_SECONDS &&
    Number.isSafeInteger(approval.expiresAt) && approval.expiresAt > Date.now(), 'FUTURE_OWNER_AUTHORIZATION_REJECTED');
  verifyIdentity(approval.identity);
  return approval.expiresAt;
}

// Source must perform the underlying observations within the requested window.
// A new request binding plus source timestamps reject a reused result.
export function createReadPreflight(readSources, { now = Date.now, retain = () => {} } = {}) {
  let lastRead = -1;
  let pending = false;
  return async function readPreflight() {
    requireThat(!pending, 'CONCURRENT_PREFLIGHT_REJECTED');
    pending = true;
    try {
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
      requireThat(preflight.taskId === RUN1.runId && preflight.runId === 'RUN1' &&
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
      // Frozen operator sets f.git on this independent copy.
      return structuredClone(preflight);
    } finally {
      pending = false;
    }
  };
}

// This port belongs to the eventual owner-approved runtime secure store.
// No local fallback, cached credentials, network/login, or diagnostics.
export function createRuntimeCredentials(store) {
  const served = new Set();
  return async function credentials(role) {
    requireThat(ROLES.includes(role) && !served.has(role), 'CREDENTIAL_ROLE_REJECTED');
    served.add(role);
    try {
      const item = await store.resolve(role);
      requireThat(typeof item?.email === 'string' && item.email.length > 0 &&
        typeof item.password === 'string' && item.password.length > 0, 'CREDENTIALS_UNAVAILABLE');
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
export function createSingleAdmission(claimFile) {
  return async function admitOnce() {
    try {
      const file = await open(claimFile, 'wx', 0o600);
      try {
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
export async function admitLiveOnce(workspace) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  const { stdout } = await promisify(execFile)('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd: workspace, env, windowsHide: true });
  await createSingleAdmission(join(stdout.trim(), 'byetery-d3-17-run1.launcher-admission'))();
}
