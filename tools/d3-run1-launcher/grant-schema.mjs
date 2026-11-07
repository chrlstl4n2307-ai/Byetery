import { LIVE_JWT_EXPIRY_SECONDS, RUN1, SESSION_SAFETY_MARGIN_SECONDS, requireThat } from './boundaries.mjs';

export const GRANT_ACTION = 'AUTHORIZE_D3_17_RUN1_EXECUTION';
export const GRANT_CLOCK_SKEW_MS = 30_000;
export const MAX_GRANT_LIFETIME_MS = 7_200_000;
export const MAX_JWT_OBSERVATION_AGE_MS = 600_000;
const identityKeys = Object.keys(RUN1);
const grantKeys = ['schemaVersion', 'action', ...identityKeys, 'jwtExpirySeconds',
  'jwtObservedAt', 'compositionRootSha', 'nonce', 'issuedAt', 'expiresAt'];
const evidenceKeys = ['schemaVersion', 'compositionRootSha', 'grantNonce', 'jwtExpiryBefore',
  'jwtObservedAtBefore', 'jwtExpiryAfter', 'jwtObservedAtAfter', 'changedDuringRun',
  'jwtExpiryRestored', 'jwtObservedAtRestored'];
const hex40 = /^[a-f0-9]{40}$/;
const hex64 = /^[a-f0-9]{64}$/;
const time = value => Number.isSafeInteger(value) && value > 0;
const duration = value => Number.isSafeInteger(value) && value > 0;

export function exactRecord(value, keys) {
  return value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'));
}

function canonical(domain, fields, value) {
  return Buffer.from(domain + '\n' + fields.map(key => key + '=' + String(value[key]) + '\n').join(''), 'utf8');
}

export function canonicalGrant(grant) {
  requireThat(exactRecord(grant, grantKeys) && grant.schemaVersion === 1 &&
    [grant.action, ...identityKeys.map(key => grant[key])].every(value =>
      typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)) &&
    typeof grant.compositionRootSha === 'string' && hex40.test(grant.compositionRootSha) &&
    typeof grant.nonce === 'string' && hex64.test(grant.nonce) &&
    duration(grant.jwtExpirySeconds) && time(grant.jwtObservedAt) && time(grant.issuedAt) &&
    time(grant.expiresAt), 'GRANT_SCHEMA_REJECTED');
  return canonical('BYETERY-D3-RUN1-OWNER-GRANT-V1', grantKeys, grant);
}

export function checkGrantScope(grant, checkedOutSha, now) {
  requireThat(grant.action === GRANT_ACTION && identityKeys.every(key => grant[key] === RUN1[key]) &&
    grant.jwtExpirySeconds === LIVE_JWT_EXPIRY_SECONDS, 'GRANT_SCOPE_REJECTED');
  requireThat(grant.compositionRootSha === checkedOutSha, 'GRANT_COMPOSITION_SHA_REJECTED');
  requireThat(time(now) && grant.issuedAt - now <= GRANT_CLOCK_SKEW_MS && grant.expiresAt > now &&
    grant.expiresAt > grant.issuedAt && grant.expiresAt - grant.issuedAt <= MAX_GRANT_LIFETIME_MS,
  'GRANT_LIFETIME_REJECTED');
  requireThat(grant.jwtObservedAt <= now && grant.jwtObservedAt <= grant.issuedAt &&
    now - grant.jwtObservedAt <= MAX_JWT_OBSERVATION_AGE_MS, 'GRANT_JWT_OBSERVATION_REJECTED');
}

export function canonicalAuthEvidence(evidence) {
  requireThat(exactRecord(evidence, evidenceKeys) && evidence.schemaVersion === 1 &&
    typeof evidence.compositionRootSha === 'string' && hex40.test(evidence.compositionRootSha) &&
    typeof evidence.grantNonce === 'string' && hex64.test(evidence.grantNonce) &&
    duration(evidence.jwtExpiryBefore) && duration(evidence.jwtExpiryAfter) &&
    time(evidence.jwtObservedAtBefore) && time(evidence.jwtObservedAtAfter) &&
    typeof evidence.changedDuringRun === 'boolean' &&
    ((evidence.jwtExpiryRestored === null && evidence.jwtObservedAtRestored === null) ||
      (duration(evidence.jwtExpiryRestored) && time(evidence.jwtObservedAtRestored))),
  'POST_RUN_AUTH_SCHEMA_REJECTED');
  return canonical('BYETERY-D3-RUN1-POST-RUN-AUTH-V1', evidenceKeys, evidence);
}

// A consistency check for already authenticated owner evidence.
export function evaluateAuthEvidence(evidence, grant, { operatorStart, completedAt, now }) {
  canonicalAuthEvidence(evidence);
  const restored = evidence.jwtExpiryRestored !== null;
  const restorationVerified = restored && evidence.jwtExpiryRestored === 3600 &&
    evidence.jwtObservedAtRestored >= evidence.jwtObservedAtAfter && evidence.jwtObservedAtRestored <= now;
  const valid = time(operatorStart) && time(completedAt) && time(now) && operatorStart <= completedAt &&
    completedAt - operatorStart < (LIVE_JWT_EXPIRY_SECONDS - SESSION_SAFETY_MARGIN_SECONDS) * 1000 &&
    evidence.compositionRootSha === grant.compositionRootSha && evidence.grantNonce === grant.nonce &&
    evidence.jwtExpiryBefore === LIVE_JWT_EXPIRY_SECONDS &&
    evidence.jwtExpiryBefore === grant.jwtExpirySeconds && evidence.jwtObservedAtBefore === grant.jwtObservedAt &&
    evidence.jwtObservedAtBefore <= operatorStart && operatorStart - evidence.jwtObservedAtBefore <= MAX_JWT_OBSERVATION_AGE_MS &&
    evidence.jwtObservedAtAfter >= completedAt && evidence.jwtObservedAtAfter <= now &&
    evidence.jwtExpiryAfter === LIVE_JWT_EXPIRY_SECONDS && !evidence.changedDuringRun &&
    (!restored || restorationVerified);
  return Object.freeze({ RUN_EVIDENCE_VALID: valid ? 'YES' : 'NO', restorationVerified });
}