import assert from 'node:assert/strict';
import { createHash, createPublicKey } from 'node:crypto';
import test from 'node:test';

import { RUN1 } from './boundaries.mjs';
import { OWNER_GRANT_PUBLIC_KEY as publicKey, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT as fingerprint } from './owner-grant-key.mjs';
import { OWNER_GRANT_KEY_STATUS, verifyOwnerGrant, verifySignedGrant } from './grant-verifier.mjs';

const checkedOutSha = 'a'.repeat(40);
const now = 1_800_000_000_000;
const pin = { publicKey, fingerprint };
// A synthetic envelope with an invalid signature. It cannot authorize execution.
const fixture = {
  grant: { schemaVersion: 1, action: 'AUTHORIZE_D3_17_RUN1_EXECUTION', ...RUN1,
    jwtExpirySeconds: 5400, jwtObservedAt: now - 1000, compositionRootSha: checkedOutSha, nonce: 'b'.repeat(64),
    issuedAt: now - 500, expiresAt: now + 3_600_000 },
  signature: Buffer.alloc(64).toString('base64url'),
};

test('ratified DER is canonical Ed25519 SPKI with the exact fingerprint', () => {
  assert.equal(publicKey, 'MCowBQYDK2VwAyEAYarOLAmvZ9dpaCKhkTRIy1ly8CAuz8WsZtQ-NZRJi38');
  const der = Buffer.from(publicKey, 'base64url');
  assert.equal(der.length, 44);
  assert.equal(der.toString('base64url'), publicKey);
  assert.equal(createPublicKey({ key: der, format: 'der', type: 'spki' }).asymmetricKeyType, 'ed25519');
  assert.equal(fingerprint, '6dfd3b7cef2c39bae0fd8e9b3625d94f1e20bd16331efcbcf3393d5d551d48b6');
  assert.equal(createHash('sha256').update(der).digest('hex'), fingerprint);
});

test('pinned verifier clears the unset-key gate and rejects malformed envelopes', () => {
  assert.equal(OWNER_GRANT_KEY_STATUS, 'PINNED');
  assert.throws(() => verifyOwnerGrant(undefined, checkedOutSha, now), /^Error: GRANT_ENVELOPE_REJECTED$/);
});

test('altered fingerprint fails', () => {
  assert.throws(() => verifySignedGrant(fixture, { ...pin, fingerprint: '0'.repeat(64) }, checkedOutSha, now),
    /^Error: OWNER_GRANT_FINGERPRINT_REJECTED$/);
});

test('altered public key fails with a pinned fingerprint', () => {
  const der = Buffer.from(publicKey, 'base64url');
  der[43] ^= 1;
  assert.throws(() => verifySignedGrant(fixture, { ...pin, publicKey: der.toString('base64url') }, checkedOutSha, now),
    /^Error: OWNER_GRANT_FINGERPRINT_REJECTED$/);
  assert.throws(() => verifySignedGrant(fixture, { ...pin, publicKey: 'A'.repeat(59) }, checkedOutSha, now),
    /^Error: OWNER_GRANT_PUBLIC_KEY_REJECTED$/);
});

test('pinned production entry point rejects a zero signature', () => {
  assert.throws(() => verifyOwnerGrant(fixture, checkedOutSha, now), /^Error: OWNER_GRANT_SIGNATURE_REJECTED$/);
});

test('pinned production entry point rejects a wrong scope and an injected verifier', () => {
  assert.throws(() => verifyOwnerGrant({ ...fixture, grant: { ...fixture.grant, action: 'BAD' } }, checkedOutSha, now),
    /^Error: GRANT_SCOPE_REJECTED$/);
  assert.throws(() => verifyOwnerGrant({ ...fixture, grant: { ...fixture.grant, nonce: undefined } }, checkedOutSha, now),
    /^Error: GRANT_SCHEMA_REJECTED$/);
  assert.throws(() => verifyOwnerGrant({ ...fixture, verifyOwnerGrant: () => true }, checkedOutSha, now),
    /^Error: GRANT_ENVELOPE_REJECTED$/);
});
