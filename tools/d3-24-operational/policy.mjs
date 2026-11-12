import { verifyDetachedEd25519 } from '../d3-24-activation/ed25519.mjs';
import { hash } from '../d3-evidence-capture/common.mjs';
import { checkLiveSessionConfig, LIVE_JWT_EXPIRY_SECONDS, requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { canonicalGrant, exactRecord, MAX_JWT_OBSERVATION_AGE_MS } from '../d3-run1-launcher/grant-schema.mjs';
import { OWNER_GRANT_PUBLIC_KEY, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT } from '../d3-run1-launcher/owner-grant-key.mjs';
import { D324_IDENTITY as run } from '../d3-24-ratification/profile.mjs';

export const D324_ARGV = Object.freeze(['--live', '--task-id', run.taskId, '--expected-sha', run.businessSha]);
export const D324_GRANT_ACTION = 'AUTHORIZE_D3_24_RUN1_EXECUTION';
export const GRANT_LIFETIME_MS = 900_000;
export const NORMAL_JWT_EXPIRY_SECONDS = 3600;
export const RATIFIED_OPERATIONAL_COMMIT = null;
const projectRef = 'aemxuqnnwfclzrwwiqfd';

export function liveDeadline(grant) {
  return Math.min(grant.expiresAt, grant.jwtObservedAt + MAX_JWT_OBSERVATION_AGE_MS);
}

export function verifyD324GrantScope(grant, compositionSha, now) {
  const canonical = canonicalGrant(grant);
  check(grant.action === D324_GRANT_ACTION &&
    Object.entries(run).every(([key, value]) => grant[key] === value) &&
    grant.jwtExpirySeconds === LIVE_JWT_EXPIRY_SECONDS, 'GRANT_SCOPE_REJECTED');
  check(grant.compositionRootSha === compositionSha, 'GRANT_COMPOSITION_SHA_REJECTED');
  check(grant.expiresAt - grant.issuedAt === GRANT_LIFETIME_MS &&
    Number.isSafeInteger(now) && grant.issuedAt <= now && now < grant.expiresAt, 'GRANT_LIFETIME_REJECTED');
  check(grant.jwtObservedAt <= grant.issuedAt && now < liveDeadline(grant), 'GRANT_JWT_OBSERVATION_REJECTED');
  return canonical;
}

// Validate the exact active K5 bytes again at use time, before checking any envelope.
export function verifyD324K5(bytes, expectedSha256, compositionSha) {
  const lines = [
    'BYETERY-D3-RUN1-OWNER-GRANT-V1',
    'schemaVersion=1',
    'action=' + D324_GRANT_ACTION,
    ...Object.entries(run).map(([name, value]) => name + '=' + value),
    'jwtExpirySeconds=' + LIVE_JWT_EXPIRY_SECONDS,
    'jwtObservedAt=<JWT_OBSERVED_AT_EPOCH_MS>',
    'compositionRootSha=' + compositionSha,
    'nonce=<NEW_32_BYTE_NONCE_LOWERCASE_HEX>',
    'issuedAt=<ISSUED_AT_EPOCH_MS>',
    'expiresAt=<EXPIRES_AT_EPOCH_MS>',
  ];
  check(Buffer.isBuffer(bytes) && /^[a-f0-9]{40}$/.test(compositionSha) &&
    hash(bytes) === expectedSha256 && bytes.equals(Buffer.from(lines.join('\n') + '\n')),
  'D324_K5_REJECTED');
}

export function verifyD324OwnerEnvelope(envelope, { compositionSha, k5Bytes, k5Sha256, now }) {
  verifyD324K5(k5Bytes, k5Sha256, compositionSha);
  check(exactRecord(envelope, ['grant', 'signature']), 'GRANT_ENVELOPE_REJECTED');
  const { grant, signature } = envelope;
  const bytes = verifyD324GrantScope(grant, compositionSha, now);
  verifyDetachedEd25519(bytes, signature, OWNER_GRANT_PUBLIC_KEY, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT);
  const sessionConfig = Object.freeze({ projectRef, source: 'SUPABASE_PROJECT_AUTH_CONFIG',
    jwtExpirySeconds: grant.jwtExpirySeconds, observedAt: grant.jwtObservedAt });
  checkLiveSessionConfig(sessionConfig, now);
  return Object.freeze({ grant: Object.freeze({ ...grant }), sessionConfig });
}
