import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { RUN1, checkLiveSessionConfig, createSessionDeadline } from './boundaries.mjs';
import { checkedOutCommit, checkCaptureCheckout, checkSharedGitDirectory, frozenOperatorPath } from './f1-checkout.mjs';
import { corroborateSharedFacts } from './f1-evidence.mjs';
import { canonicalGrant, evaluateAuthEvidence } from './grant-schema.mjs';
import { OWNER_GRANT_KEY_STATUS, verifyOwnerGrant, verifySignedAuthEvidence, verifySignedGrant } from './grant-verifier.mjs';
import { ROOT, launchRun1 } from './launcher.mjs';
import { outputDirectory } from './replay.mjs';

const exec = promisify(execFile);
const now = 1_800_000_000_000;
const checkedOutSha = 'a'.repeat(40);
const nonce = 'b'.repeat(64);
const grant = Object.freeze({ schemaVersion: 1, action: 'AUTHORIZE_D3_17_RUN1_EXECUTION', ...RUN1,
  jwtExpirySeconds: 5400, jwtObservedAt: now - 1000, compositionRootSha: checkedOutSha, nonce,
  issuedAt: now - 500, expiresAt: now + 3_600_000 });

// Public-only fixture derived from RFC 8032 test key 1. It never appears in production pins.
const fixturePin = Object.freeze({
  publicKey: 'MCowBQYDK2VwAyEA11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
  fingerprint: '06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9',
});
const signature = 'Ogc0EFV59oY51OQnjFKc4qJ_r17TFmR4oUelkss9Uav1sKMYfABnznqsYtCxnRwJNJMGP7fr6R3jHLeRbeHkBQ';
const envelope = Object.freeze({ grant, signature });
const validate = (data, pin = fixturePin, sha = checkedOutSha) => verifySignedGrant(data, pin, sha, now);
const auth = Object.freeze({ schemaVersion: 1, compositionRootSha: checkedOutSha, grantNonce: nonce,
  jwtExpiryBefore: 5400, jwtObservedAtBefore: grant.jwtObservedAt, jwtExpiryAfter: 5400,
  jwtObservedAtAfter: now + 60_000, changedDuringRun: false, jwtExpiryRestored: 3600,
  jwtObservedAtRestored: now + 61_000 });
const runTimes = { operatorStart: now, completedAt: now + 59_000, now: now + 62_000 };

test('real Ed25519 verification accepts only the exact public fixture signature', () => {
  assert.deepEqual(validate(envelope), grant);
  const wrong = Buffer.from(signature, 'base64url');
  wrong[0] ^= 1;
  assert.throws(() => validate({ grant, signature: wrong.toString('base64url') }), /OWNER_GRANT_SIGNATURE_REJECTED/);
  assert.throws(() => validate({ ...envelope, grant: { ...grant, nonce: 'c'.repeat(64) } }), /OWNER_GRANT_SIGNATURE_REJECTED/);
});

test('placeholder rejects valid-looking input, external verifier and runtime before I/O', async (t) => {
  let accesses = 0;
  t.mock.method(globalThis, 'fetch', () => { accesses++; throw new Error('NETWORK_UNEXPECTED'); });
  const runtime = new Proxy({ verifyOwnerGrant: () => grant }, {
    ownKeys() { accesses++; throw new Error('RUNTIME_UNEXPECTED'); },
    get() { accesses++; throw new Error('RUNTIME_UNEXPECTED'); },
  });
  assert.equal(OWNER_GRANT_KEY_STATUS, 'PLACEHOLDER_FAIL_CLOSED');
  assert.throws(() => verifyOwnerGrant(envelope, checkedOutSha, now), /OWNER_GRANT_KEY_PLACEHOLDER/);
  for (const input of [undefined, envelope, { ...envelope, verifyOwnerGrant: () => true }]) {
    await assert.rejects(launchRun1(input, runtime), /OWNER_GRANT_KEY_PLACEHOLDER/);
  }
  assert.equal(accesses, 0);
});

test('fingerprint and SPKI format are checked independently', () => {
  assert.throws(() => validate(envelope, { ...fixturePin, fingerprint: '1'.repeat(64) }), /FINGERPRINT_REJECTED/);
  assert.throws(() => validate(envelope, { ...fixturePin, publicKey: 'invalid' }), /PUBLIC_KEY_REJECTED/);
  assert.throws(() => validate(envelope, { ...fixturePin, publicKey: 'A'.repeat(59) }), /PUBLIC_KEY_REJECTED/);
});

for (const key of ['action', ...Object.keys(RUN1), 'jwtExpirySeconds']) {
  test('grant rejects a different ' + key, () => {
    assert.throws(() => validate({ ...envelope, grant: { ...grant,
      [key]: key === 'jwtExpirySeconds' ? 4200 : 'WRONG' } }), /GRANT_SCOPE_REJECTED/);
  });
}

for (const [name, mutation, rejection] of [
  ['stale observation', { jwtObservedAt: now - 600_001 }, /GRANT_JWT_OBSERVATION_REJECTED/],
  ['future observation', { jwtObservedAt: now + 1 }, /GRANT_JWT_OBSERVATION_REJECTED/],
  ['observation after issue', { jwtObservedAt: now, issuedAt: now - 1 }, /GRANT_JWT_OBSERVATION_REJECTED/],
  ['expired grant', { expiresAt: now }, /GRANT_LIFETIME_REJECTED/],
  ['lifetime over two hours', { expiresAt: grant.issuedAt + 7_200_001 }, /GRANT_LIFETIME_REJECTED/],
  ['future issue outside skew', { issuedAt: now + 30_001 }, /GRANT_LIFETIME_REJECTED/],
  ['expires before issue', { issuedAt: now + 2, expiresAt: now + 1 }, /GRANT_LIFETIME_REJECTED/],
  ['malformed timestamp', { issuedAt: '2027-01-01T00:00:00Z' }, /GRANT_SCHEMA_REJECTED/],
  ['wrong composition SHA', { compositionRootSha: 'c'.repeat(40) }, /GRANT_COMPOSITION_SHA_REJECTED/],
  ['missing nonce', { nonce: undefined }, /GRANT_SCHEMA_REJECTED/],
  ['extra field', { verifyOwnerGrant: true }, /GRANT_SCHEMA_REJECTED/],
]) {
  test(name + ' fails closed', () => {
    assert.throws(() => validate({ ...envelope, grant: { ...grant, ...mutation } }), rejection);
  });
}

test('scope binds the independently observed Git SHA and input is exact', () => {
  assert.throws(() => validate(envelope, fixturePin, 'c'.repeat(40)), /GRANT_COMPOSITION_SHA_REJECTED/);
  assert.throws(() => validate({ ...envelope, publicKey: fixturePin.publicKey }), /GRANT_ENVELOPE_REJECTED/);
  const missing = { ...grant };
  delete missing.nonce;
  assert.throws(() => validate({ ...envelope, grant: missing }), /GRANT_SCHEMA_REJECTED/);
});

test('canonical UTF-8 is deterministic, exact and independent of property order', () => {
  const reversed = Object.fromEntries(Object.entries(grant).reverse());
  const expected = [
    'BYETERY-D3-RUN1-OWNER-GRANT-V1', 'schemaVersion=1', 'action=AUTHORIZE_D3_17_RUN1_EXECUTION',
    ...Object.entries(RUN1).map(([key, value]) => key + '=' + value), 'jwtExpirySeconds=5400',
    'jwtObservedAt=' + grant.jwtObservedAt, 'compositionRootSha=' + checkedOutSha, 'nonce=' + nonce,
    'issuedAt=' + grant.issuedAt, 'expiresAt=' + grant.expiresAt, '',
  ].join('\n');
  assert.deepEqual(canonicalGrant(grant), Buffer.from(expected));
  assert.deepEqual(canonicalGrant(reversed), canonicalGrant(grant));
  assert.deepEqual(validate({ grant: reversed, signature }), grant);
});

test('signed expiry leads to a strict 5280 versus 4080 seconds deadline', () => {
  const verified = validate(envelope);
  const config = { projectRef: 'aemxuqnnwfclzrwwiqfd', source: 'SUPABASE_PROJECT_AUTH_CONFIG',
    observedAt: verified.jwtObservedAt, jwtExpirySeconds: verified.jwtExpirySeconds };
  checkLiveSessionConfig(config, now);
  const deadline = expiry => createSessionDeadline({ ...config, jwtExpirySeconds: expiry },
    { operatorStart: now, now: () => now });
  assert.equal(deadline(5400).deadline - now, 5_280_000);
  deadline(5400).check(5, true);
  assert.equal(deadline(4200).deadline - now, 4_080_000);
  assert.throws(() => deadline(4200).check(5, true), /SESSION_DEADLINE_INSUFFICIENT/);
});

test('post-run owner evidence is signed separately and ties before, after and restoration to the run', () => {
  const authSignature = 'fOWRlsvZ3qKubW-pJw9ptUUzbCIojCjywYFCq7B5hM6W4aQlUZJmubAVzrAANgYbEm5S8EyDYbyfEjv-CorDAQ';
  assert.deepEqual(verifySignedAuthEvidence({ evidence: auth, signature: authSignature }, grant, fixturePin, runTimes),
    { RUN_EVIDENCE_VALID: 'YES', restorationVerified: true });
  assert.throws(() => verifySignedAuthEvidence({ evidence: auth, signature }, grant, fixturePin, runTimes),
    /OWNER_GRANT_SIGNATURE_REJECTED/);
  for (const change of [{ jwtExpiryAfter: 3600 }, { changedDuringRun: true }, { grantNonce: 'd'.repeat(64) },
    { jwtObservedAtAfter: now + 58_999 }, { jwtObservedAtBefore: grant.jwtObservedAt - 1 }]) {
    assert.equal(evaluateAuthEvidence({ ...auth, ...change }, grant, runTimes).RUN_EVIDENCE_VALID, 'NO');
  }
  assert.deepEqual(evaluateAuthEvidence({ ...auth, jwtExpiryRestored: null, jwtObservedAtRestored: null }, grant, runTimes),
    { RUN_EVIDENCE_VALID: 'YES', restorationVerified: false });
});

test('checkout gate rejects dirty execution paths and a different frozen business SHA', async () => {
  const directory = join(await outputDirectory(), 'checkout');
  await exec('git', ['init', '--quiet', directory]);
  const { stdout } = await exec('git', ['rev-parse', 'HEAD', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT });
  const [head, common] = stdout.trim().split(/\r?\n/);
  const info = join(directory, '.git/objects/info');
  await mkdir(info, { recursive: true });
  await writeFile(join(info, 'alternates'), common + '/objects\n');
  await exec('git', ['checkout', '--quiet', '--detach', head], { cwd: directory });
  const commit = await checkedOutCommit(directory);
  assert.match(commit, /^[a-f0-9]{40}$/);
  await checkSharedGitDirectory(ROOT, ROOT);
  await assert.rejects(checkSharedGitDirectory(ROOT, directory), /FROZEN_OPERATOR_GIT_DIRECTORY_REJECTED/);
  await assert.rejects(frozenOperatorPath(directory), /FROZEN_OPERATOR_SHA_REJECTED/);
  await writeFile(join(directory, 'tools/d3-run1-launcher/untracked-fixture.mjs'), '// dirty fixture\n');
  await assert.rejects(checkedOutCommit(directory), /DIRTY_EXECUTION_CHECKOUT/);
});

test('capture and evidence subtrees are ratified; no new auth network path or real admission exists', async () => {
  const { stdout } = await exec('git', ['rev-parse', 'HEAD', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT });
  const [head, common] = stdout.trim().split(/\r?\n/);
  await checkCaptureCheckout(ROOT, head);
  await assert.rejects(access(join(common, 'byetery-d3-17-run1.launcher-admission')), { code: 'ENOENT' });
  for (const name of ['launcher.mjs', 'f1-checkout.mjs', 'grant-schema.mjs', 'grant-verifier.mjs', 'f1-evidence.mjs', 'f1-capture-child.mjs']) {
    const source = await readFile(new URL('./' + name, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /globalThis\.fetch\s*=|createServer|api\.supabase\.com|SUPABASE_ACCESS_TOKEN|auth\/v1\/token/);
  }
  const child = new URL('./f1-capture-child.mjs', import.meta.url);
  assert.match(await readFile(child, 'utf8'), /captureDurableReceipt.*d3-receipt-capture\/capture\.mjs/);
});

test('corroboration requires all shared identities, states and actual chain proof', () => {
  const scope = { batteryId: RUN1.batteryId, operationId: 'op', transactionHash: 'tx', ledger: 10, method: 'register_battery' };
  const api = { ...scope, operation: scope.method, confirmationLedger: scope.ledger, requestId: null,
    confirmedBatteryState: 'REGISTERED', confirmedRewardState: 'NOT_ELIGIBLE' };
  const sql = { ...scope, receiptTransactionHash: 'tx', status: 'SUCCESS', applicationState: 'CONFIRMED', durableState: 'PROJECTED' };
  const chain = { verification: { TX_IDENTITY_VERIFIED: 'PASS', ledger: 10 },
    meta: { after: { battery: { state: 'REGISTERED', rewardState: 'NOT_ELIGIBLE', requestId: null } } } };
  assert.equal(corroborateSharedFacts(scope, api, sql, chain), true);
  assert.throws(() => corroborateSharedFacts(scope, api, { ...sql, transactionHash: 'wrong' }, chain), /CAPTURE_CORROBORATION_REJECTED/);
  assert.throws(() => corroborateSharedFacts(scope, { ...api, confirmedRewardState: 'SENT' }, sql, chain), /CAPTURE_CORROBORATION_REJECTED/);
});