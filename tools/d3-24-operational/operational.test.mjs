import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempDisposable, readFile, realpath, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { hash } from '../d3-evidence-capture/common.mjs';
import { canonicalGrant, GRANT_ACTION } from '../d3-run1-launcher/grant-schema.mjs';
import { createD324ReadPreflight, RUN1 as oldRun } from '../d3-run1-launcher/boundaries.mjs';
import { encodeD324SessionControl, verifySessionPins } from '../d3-run1-launcher/session-pins.mjs';
import { d324ControlPaths } from '../d3-24-ratification/composition.mjs';
import { RUN1 as run } from '../d3-24-ratification/identity.mjs';
import { assertD324Unused, readD324Journal, reviewD324Checkout } from './checkout.mjs';
import { bindD324Readiness, verifyD324SessionPins, evidenceBindings } from './bindings.mjs';
import { liveEntry } from './live.mjs';
import { D324_ARGV, D324_GRANT_ACTION, GRANT_LIFETIME_MS, liveDeadline, verifyD324GrantScope,
  verifyD324K5, verifyD324OwnerEnvelope } from './policy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const syntheticSha = '2'.repeat(40);
const observed = 1_795_000_000_000;
const grant = Object.freeze({
  schemaVersion: 1, action: D324_GRANT_ACTION, ...run, jwtExpirySeconds: 5400,
  jwtObservedAt: observed, compositionRootSha: syntheticSha, nonce: '1'.repeat(64),
  issuedAt: observed + 1000, expiresAt: observed + 1000 + GRANT_LIFETIME_MS,
});
const at = observed + 2000;
const template = Buffer.from(canonicalGrant(grant).toString()
  .replace('jwtObservedAt=' + observed, 'jwtObservedAt=<JWT_OBSERVED_AT_EPOCH_MS>')
  .replace('nonce=' + grant.nonce, 'nonce=<NEW_32_BYTE_NONCE_LOWERCASE_HEX>')
  .replace('issuedAt=' + grant.issuedAt, 'issuedAt=<ISSUED_AT_EPOCH_MS>')
  .replace('expiresAt=' + grant.expiresAt, 'expiresAt=<EXPIRES_AT_EPOCH_MS>'));
const envelopeOptions = { compositionSha: syntheticSha, k5Bytes: template, k5Sha256: hash(template), now: at };
const invalidSignature = Buffer.alloc(64).toString('base64url');

test('pinned review commit, isolated operator, plan, admission namespace and budget', async () => {
  const operatorRoot = await realpath(resolve(root, '../B24op'));
  const proof = await reviewD324Checkout(operatorRoot);
  assert.equal(proof.operator.sha, run.businessSha);
  assert.equal(proof.reviewCommit, 'ae50b48399aefdc68339ac55d3f214adc77349a4');
  assert.equal(proof.checkoutCommit, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
  assert.equal(proof.operationalCommit, null);
  assert.equal(proof.liveAuthority, false);
  assert.equal(proof.normalJwtExpirySeconds, 3600);
  assert.equal(proof.ledger.confirmedConsumed, 5);
  assert.equal(proof.ledger.remaining, 14);
  assert.equal(proof.ledger.runCap, 5);
  assert.equal(proof.ledger.contingencyAuthorized, false);
  assert.match(proof.controls.admission, /byetery-d3-24-run1\.launcher-admission$/);
  assert(proof.controls.journal.endsWith(run.taskId + '-' + run.businessSha + '.jsonl'));
  assert(proof.controls.budget.endsWith(run.planHash + '.budget'));
  assert(proof.controls.consumed.endsWith(run.batteryId + '.consumed'));
  await assert.rejects(reviewD324Checkout(await realpath(resolve(root, '../B24cmp'))), /D324_OPERATOR_CHECKOUT_REJECTED/);
});

test('CLI rejects legacy task and exact D3-24 CLI refuses to open any live port', () => {
  assert.equal(liveEntry(D324_ARGV.with(2, oldRun.taskId)), 'EXACT_ARGV_REQUIRED');
  assert.equal(liveEntry(D324_ARGV.with(4, oldRun.businessSha)), 'EXACT_ARGV_REQUIRED');
  assert.equal(liveEntry([...D324_ARGV, '--enable-live']), 'EXACT_ARGV_REQUIRED');
  const child = spawnSync(process.execPath, [join(root, 'tools/d3-24-operational/live.mjs'), ...D324_ARGV], {
    env: { ...process.env, BYETERY_LIVE_AUTHORITY: 'YES', BYETERY_D324_SESSION_CONTROL_PATH: 'must-not-read' },
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
  });
  assert.equal(child.status, 1);
  assert.equal(child.stdout.trim(), 'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  assert.equal(child.stderr, '');
});

test('K5 pins exact bytes; historical task, action, recipient and composition are rejected before verification', () => {
  assert.doesNotThrow(() => verifyD324K5(template, hash(template), syntheticSha));
  for (const altered of [Buffer.from(template.toString().replaceAll('\n', '\r\n')),
    Buffer.from(template.toString().replace(run.taskId, oldRun.taskId)),
    Buffer.from(template.toString().replace(syntheticSha, '3'.repeat(40)))]) {
    assert.throws(() => verifyD324K5(altered, hash(altered), syntheticSha), /D324_K5_REJECTED/);
  }
  assert.throws(() => verifyD324K5(template, '0'.repeat(64), syntheticSha), /D324_K5_REJECTED/);
  for (const changed of [{ ...oldRun, action: GRANT_ACTION }, { action: GRANT_ACTION },
    { recipient: 'WRONG' }, { planHash: oldRun.planHash }, { jwtExpirySeconds: 3600 }]) {
    assert.throws(() => verifyD324OwnerEnvelope({ grant: { ...grant, ...changed }, signature: invalidSignature },
      envelopeOptions), /GRANT_SCOPE_REJECTED/);
  }
  assert.throws(() => verifyD324GrantScope({ ...grant, compositionRootSha: '3'.repeat(40) }, syntheticSha, at),
    /GRANT_COMPOSITION_SHA_REJECTED/);
  assert.throws(() => verifyD324OwnerEnvelope({ grant, signature: invalidSignature }, envelopeOptions),
    /OWNER_GRANT_SIGNATURE_REJECTED/);
  assert.throws(() => verifyD324OwnerEnvelope({ grant, signature: 'bad' }, envelopeOptions),
    /OWNER_GRANT_SIGNATURE_REJECTED/);
});

test('JWT observation is strictly younger than 600000 ms and grant lifetime is exactly 900000 ms', () => {
  assert.equal(liveDeadline(grant), observed + 600_000);
  assert.doesNotThrow(() => verifyD324GrantScope(grant, syntheticSha, observed + 599_999));
  assert.throws(() => verifyD324GrantScope(grant, syntheticSha, observed + 600_000), /GRANT_JWT_OBSERVATION_REJECTED/);
  assert.throws(() => verifyD324GrantScope(grant, syntheticSha, grant.expiresAt), /GRANT_LIFETIME_REJECTED/);
  assert.throws(() => verifyD324GrantScope({ ...grant, expiresAt: grant.expiresAt + 1 }, syntheticSha, at), /GRANT_LIFETIME_REJECTED/);
});

test('session control rejects legacy task, legacy path, mutated content and an incorrect runtime parent', async () => {
  await using scratch = await mkdtempDisposable(join(root, '.tools/d324-session-'));
  const physical = await realpath(scratch.path);
  const wrapper = join(root, 'tools/d3-24-operational/launch.ps1');
  const entry = join(root, 'tools/d3-24-operational/live.mjs');
  const nodePath = join(physical, 'node.fixture'), parentPath = join(physical, 'pwsh.fixture');
  for (const file of [nodePath, parentPath]) await writeFile(file, 'offline fixture');
  const pin = async path => ({ path: await realpath(path), sha256: hash(await readFile(path)) });
  const session = { schemaVersion: 2, taskId: run.taskId, compositionRootSha: syntheticSha,
    live: await pin(entry), wrapper: await pin(wrapper),
    pwsh: { ...await pin(parentPath), version: '7.6.9' }, node: { ...await pin(nodePath), version: 'v24.16.0' } };
  const path = join(physical, 'session.fixture');
  const options = { root, head: syntheticSha, parentExecutable: () => parentPath,
    nodeExecutable: { path: nodePath, version: session.node.version } };
  const bytes = encodeD324SessionControl(session);
  const digest = hash(bytes);
  const env = { BYETERY_D324_SESSION_CONTROL_PATH: path, BYETERY_D324_SESSION_CONTROL_SHA256: digest };
  await writeFile(path, bytes);
  assert.equal(await verifyD324SessionPins(env, options), digest);
  assert.throws(() => encodeD324SessionControl({ ...session, taskId: oldRun.taskId }), /SESSION_PINS_REJECTED/);
  await assert.rejects(verifySessionPins({ BYETERY_K7_SESSION_CONTROL_PATH: path, BYETERY_K7_SESSION_CONTROL_SHA256: digest },
    options), /SESSION_PINS_REJECTED/);
  await assert.rejects(verifyD324SessionPins(env, { ...options, parentExecutable: () => nodePath }), /SESSION_PINS_REJECTED/);
  await writeFile(nodePath, 'changed offline fixture');
  await assert.rejects(verifyD324SessionPins(env, options), /SESSION_PINS_REJECTED/);
});

test('candidate journal is bounded to the fresh namespace and historical markers are ignored and preserved', async () => {
  await using scratch = await mkdtempDisposable(join(root, '.tools/d324-controls-'));
  const physical = await realpath(scratch.path);
  const controls = d324ControlPaths(physical);
  const oldMarker = join(physical, 'byetery-d3-23-run1.launcher-admission.fixture');
  await writeFile(oldMarker, 'offline historical sentinel\n');
  await assertD324Unused(controls);
  assert.equal((await readD324Journal(controls)).length, 0);
  await mkdir(resolve(controls.journal, '..'));
  const unfinished = Buffer.from(JSON.stringify({ taskId: run.taskId, gitSha: run.businessSha, runId: 'RUN1',
    batteryId: run.batteryId, operation: 'register_battery', phase: 'INTENT' }) + '\n');
  await writeFile(controls.journal, unfinished);
  assert.deepEqual(await readD324Journal(controls), unfinished);
  assert.throws(() => evidenceBindings.projectJournal(unfinished), /D324_JOURNAL_INCOMPLETE/);
  await assert.rejects(assertD324Unused(controls), /D324_PRIOR_CONTROL_REQUIRES_RECONCILIATION/);
  assert.equal(await readFile(oldMarker, 'utf8'), 'offline historical sentinel\n');
});

test('D3-24 fresh preflight uses the same source freshness checks and rejects D3-23 provenance', async () => {
  let instant = at;
  let returnedRun = run;
  const sources = ['LOCAL_GIT', 'SUPABASE_SQL_READ_ONLY', 'STELLAR_RPC_TESTNET'];
  const reader = createD324ReadPreflight(async ({ identity, requestId, requestedAt }) => {
    assert.equal(identity, run);
    return { requestId, preflight: { taskId: returnedRun.taskId, runId: returnedRun.runId,
      sameRuntimeSha: returnedRun.businessSha, mode: 'TESTNET', observedAt: requestedAt },
      observations: sources.map(source => ({ source, observedAt: requestedAt,
        ledger: source === 'STELLAR_RPC_TESTNET' ? 7_000_001 : null })) };
  }, { now: () => ++instant });
  assert.equal((await reader()).sameRuntimeSha, run.businessSha);
  returnedRun = oldRun;
  await assert.rejects(reader, /PREFLIGHT_SCOPE_REJECTED/);
});

test('candidate binding uses coordinated SQL and read-only RPC, preserving the quiescence leaf on failure', async () => {
  await using scratch = await mkdtempDisposable(join(root, '.tools/d324-readiness-'));
  const controls = d324ControlPaths(await realpath(scratch.path));
  const events = [];
  let connects = 0;
  const binding = bindD324Readiness({
    controls,
    checkCheckout: async () => {},
    readSignerIdentities: () => assert.fail('must stop before probing signer identities'),
    pool: { async connect() {
      connects++;
      return { async query(query) {
        if (query.includes('pg_advisory_xact_lock_shared')) throw Object.assign(Error('fixture'), { code: '55P03' });
      }, release() {} };
    } },
    fetcher: (_url, options) => {
      assert(['GET', 'POST'].includes(options.method));
      if (options.method === 'POST') assert(['getNetwork', 'getLedgerEntries'].includes(JSON.parse(options.body).method));
      return new Promise(resolve => setTimeout(() => resolve(new Response(null, { status: 503 })), 15));
    },
    diagnostics: { event(...args) { events.push(args); } },
  });
  await assert.rejects(binding.readPreflight(), /PREFLIGHT_SOURCES_UNAVAILABLE/);
  assert.equal(connects, 1);
  assert.equal(events.find(event => event[0] === 'PREFLIGHT_FAIL')?.[3]?.leaf, 'SQL_QUIESCENCE_REJECTED');
  await assert.rejects(binding.verifyCompletion(), /D324_BASELINE_REQUIRED/);
});
