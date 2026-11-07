import { createHash, createPublicKey, verify } from 'node:crypto';

import { requireThat } from './boundaries.mjs';
import { canonicalAuthEvidence, canonicalGrant, checkGrantScope, evaluateAuthEvidence, exactRecord } from './grant-schema.mjs';
import { OWNER_GRANT_PUBLIC_KEY, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT } from './owner-grant-key.mjs';

const ed25519Spki = Buffer.from('302a300506032b6570032100', 'hex');
const pins = Object.freeze({ publicKey: OWNER_GRANT_PUBLIC_KEY, fingerprint: OWNER_GRANT_PUBLIC_KEY_FINGERPRINT });
export const OWNER_GRANT_KEY_STATUS = pins.publicKey === null || pins.fingerprint === null
  ? 'PLACEHOLDER_FAIL_CLOSED' : 'PINNED';

function decode(value, length, code) {
  requireThat(typeof value === 'string' && value.length === Math.ceil(length * 4 / 3) &&
    /^[A-Za-z0-9_-]+$/.test(value), code);
  const bytes = Buffer.from(value, 'base64url');
  requireThat(bytes.length === length && bytes.toString('base64url') === value, code);
  return bytes;
}

function checkedKey({ publicKey, fingerprint }) {
  requireThat(publicKey !== null && fingerprint !== null, 'OWNER_GRANT_KEY_PLACEHOLDER');
  const der = decode(publicKey, 44, 'OWNER_GRANT_PUBLIC_KEY_REJECTED');
  requireThat(der.subarray(0, ed25519Spki.length).equals(ed25519Spki), 'OWNER_GRANT_PUBLIC_KEY_REJECTED');
  requireThat(typeof fingerprint === 'string' && createHash('sha256').update(der).digest('hex') === fingerprint,
    'OWNER_GRANT_FINGERPRINT_REJECTED');
  return createPublicKey({ key: der, type: 'spki', format: 'der' });
}

function checkSignature(key, bytes, encoded) {
  const signature = decode(encoded, 64, 'OWNER_GRANT_SIGNATURE_REJECTED');
  requireThat(verify(null, bytes, key, signature), 'OWNER_GRANT_SIGNATURE_REJECTED');
}

// Pure verifier used by the pinned entry point and public-only test vectors.
// A result from this helper cannot substitute for the pinned check in the launcher.
export function verifySignedGrant(envelope, keyPin, checkedOutSha, now) {
  const key = checkedKey(keyPin);
  requireThat(exactRecord(envelope, ['grant', 'signature']), 'GRANT_ENVELOPE_REJECTED');
  const bytes = canonicalGrant(envelope.grant);
  checkGrantScope(envelope.grant, checkedOutSha, now);
  checkSignature(key, bytes, envelope.signature);
  return Object.freeze({ ...envelope.grant });
}

export function verifyOwnerGrant(envelope, checkedOutSha, now = Date.now()) {
  return verifySignedGrant(envelope, pins, checkedOutSha, now);
}

export function verifySignedAuthEvidence(envelope, grant, keyPin, runTimes) {
  const key = checkedKey(keyPin);
  requireThat(exactRecord(envelope, ['evidence', 'signature']), 'POST_RUN_AUTH_ENVELOPE_REJECTED');
  checkSignature(key, canonicalAuthEvidence(envelope.evidence), envelope.signature);
  return evaluateAuthEvidence(envelope.evidence, grant, runTimes);
}

export function verifyPostRunAuthEvidence(envelope, ownerGrant, checkedOutSha, runTimes) {
  const grant = verifyOwnerGrant(ownerGrant, checkedOutSha, runTimes.operatorStart);
  return verifySignedAuthEvidence(envelope, grant, pins, { ...runTimes, now: Date.now() });
}
