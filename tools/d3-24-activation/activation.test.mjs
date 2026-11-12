import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { lstat, mkdtempDisposable, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { bytes, hash, SPEC } from '../d3-evidence-capture/common.mjs';
import { RUN1, OWNER_QUERY_URL, OWNER_QUERY_SHA256, readD324Ledger, retired } from '../d3-24-ratification/identity.mjs';
import { projectD324Journal } from '../d3-24-ratification/readiness.mjs';
import { verifyD324CaptureInventory, verifyD324CapturedTransaction } from '../d3-24-ratification/capture.mjs';
import { fixture as fixtureSessions } from '../d3-run1-launcher/replay.mjs';
import { RUN1 as historical } from '../d3-run1-launcher/boundaries.mjs';
import { GRANT_ACTION, canonicalGrant } from '../d3-run1-launcher/grant-schema.mjs';
import { runEntry as legacyEntry } from '../d3-run1-launcher/live.mjs';
import { encodeD324SessionControl } from '../d3-run1-launcher/session-pins.mjs';
import { D324_ARGV, D324_GRANT_ACTION, verifyD324OwnerEnvelope } from '../d3-24-operational/policy.mjs';
import { liveEntry } from '../d3-24-operational/live.mjs';
import { BASE_COMMIT, observeD324Checkout, verifyD324RatificationManifest } from './manifest.mjs';
import { createD324SyntheticRun, SYNTHETIC_OPERATOR_APPROVAL as approval } from './rehearsal.mjs';
import { fixtureReceipts, steps } from './fixtures.mjs';
import { captureSyntheticInChild } from './supervisor.mjs';
import { bindD324EvidenceReview } from './evidence.mjs';

const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const { now } = fixtureSessions([]);
const sha = 'a'.repeat(40);
const absent = path => assert.rejects(lstat(path), { code: 'ENOENT' });
const captureChild = fileURLToPath(new URL('./receipt-child.mjs', import.meta.url));
const wrapperEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(SYSTEMROOT|WINDIR|PATH|PATHEXT|COMSPEC|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|HOMEDRIVE|HOMEPATH|PROGRAMFILES|PROGRAMDATA)$/i.test(key)));
const k5Template = grant => Buffer.from(canonicalGrant(grant).toString()
  .replace('jwtObservedAt=' + grant.jwtObservedAt, 'jwtObservedAt=<JWT_OBSERVED_AT_EPOCH_MS>')
  .replace('nonce=' + grant.nonce, 'nonce=<NEW_32_BYTE_NONCE_LOWERCASE_HEX>')
  .replace('issuedAt=' + grant.issuedAt, 'issuedAt=<ISSUED_AT_EPOCH_MS>')
  .replace('expiresAt=' + grant.expiresAt, 'expiresAt=<EXPIRES_AT_EPOCH_MS>'));

async function material(t) {
  const scratch = await mkdtempDisposable(join(root, '.tools/d324-activation-input-'));
  t.after(() => scratch.remove());
  const sandbox = await realpath(scratch.path);
  const checkout = await observeD324Checkout(await realpath(resolve(root, '../B24run')), await realpath(resolve(root, '../B24op')));
  assert.equal(checkout.target.sha, BASE_COMMIT);
  assert.equal(checkout.operator.sha, RUN1.businessSha);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ type: 'spki', format: 'der' });
  const fixtureKey = { publicKey: der.toString('base64url'), fingerprint: hash(der) };
  const grant = { schemaVersion: 1, action: D324_GRANT_ACTION, ...RUN1, jwtExpirySeconds: 5400,
    jwtObservedAt: now() - 2000, compositionRootSha: sha, nonce: 'a1'.repeat(32),
    issuedAt: now() - 1000, expiresAt: now() - 1000 + 900_000 };
  const envelopeFor = value => ({ grant: value, signature: sign(null, canonicalGrant(value), privateKey).toString('base64url') });
  const k5Bytes = k5Template(grant);
  const k5Sha256 = hash(k5Bytes);
  const sessionPath = join(sandbox, 'session.json');
  const pin = async path => ({ path: await realpath(path), sha256: hash(await readFile(path)) });
  const pwsh = process.env.BYETERY_D324_TEST_PWSH;
  assert(pwsh, 'Set BYETERY_D324_TEST_PWSH to the local PowerShell 7.6.9 executable');
  const session = { schemaVersion: 2, taskId: RUN1.taskId, compositionRootSha: sha,
    live: await pin(join(root, 'tools/d3-24-operational/live.mjs')),
    wrapper: await pin(join(root, 'tools/d3-24-operational/launch.ps1')),
    pwsh: { ...await pin(pwsh), version: '7.6.9' },
    node: { ...await pin(process.execPath), version: process.version } };
  const sessionBytes = encodeD324SessionControl(session);
  await writeFile(sessionPath, sessionBytes, { flag: 'wx' });
  // No commit is created for the fixture target. Only the Git reader above
  // reports real object identity. This target exercises the external binding shape.
  const observed = { target: { sha, parent: BASE_COMMIT, tree: 'b'.repeat(40) }, operator: checkout.operator,
    artifacts: { ...checkout.artifacts, captureChild: hash(await readFile(captureChild)) } };
  const manifest = { ...observed, schema: 'BYETERY_D324_ACTIVATION_REVIEW_V1', identity: RUN1,
    networkId: SPEC.networkId, deploymentId: SPEC.deployment, ledgerSha256: (await readD324Ledger()).ledgerSha256,
    budget: { historicalConfirmed: 5, limitWithoutContingency: 19, remaining: 14, runCap: 5, tx20Authorized: false },
    k5Sha256, sessionControlSha256: hash(sessionBytes) };
  const verifyManifest = (value, facts = observed) => verifyD324RatificationManifest(bytes(value), hash(bytes(value)), facts);
  return { checkout, observed, manifest, verifyManifest, session, sessionBytes, sessionPath, grant, envelopeFor,
    input: { manifest: await verifyManifest(manifest), session: { path: sessionPath, parentPath: session.pwsh.path },
      envelope: envelopeFor(grant), k5Bytes, k5Sha256, key: fixtureKey } };
}

test('independent Git checkout and detached manifest reject wrong SHAs, plan, artifacts and contingency', async t => {
  const f = await material(t);
  assert.equal(f.input.manifest.liveAuthority, false);
  assert.equal(f.input.manifest.sha, sha);
  assert.equal(f.checkout.target.tree, '0a298cb74299f07cb7b602a2879c737485ebc297');
  await assert.rejects(observeD324Checkout(root, root), /DIRTY_EXECUTION_CHECKOUT|D324_OPERATOR_CHECKOUT_REJECTED/);
  for (const [changes, code] of [
    [{ target: { ...f.manifest.target, sha: 'c'.repeat(40) } }, /D324_MANIFEST_TARGET_REJECTED/],
    [{ target: { ...f.manifest.target, parent: f.checkout.target.parent } }, /D324_MANIFEST_TARGET_REJECTED/],
    [{ operator: { ...f.manifest.operator, sha: historical.businessSha } }, /D324_MANIFEST_OPERATOR_REJECTED/],
    [{ identity: { ...RUN1, planHash: '0'.repeat(64) } }, /D324_MANIFEST_PROFILE_REJECTED/],
    [{ budget: { ...f.manifest.budget, tx20Authorized: true } }, /D324_MANIFEST_BUDGET_REJECTED/],
    [{ budget: { ...f.manifest.budget, runCap: 6 } }, /D324_MANIFEST_BUDGET_REJECTED/],
    [{ artifacts: { ...f.manifest.artifacts, captureChild: '0'.repeat(64) } }, /D324_MANIFEST_ARTIFACT_REJECTED/],
  ]) await assert.rejects(f.verifyManifest({ ...f.manifest, ...changes }), code);
  await assert.rejects(verifyD324RatificationManifest(bytes(f.manifest), '0'.repeat(64), f.observed), /D324_MANIFEST_DIGEST_REJECTED/);
});

test('PowerShell fixture checks real Node and parent binary, canonical session bytes and closed LIVE entry', async t => {
  const f = await material(t);
  const probe = join(root, 'tools/d3-24-activation/wrapper-probe.mjs');
  const wrapper = join(root, 'tools/d3-24-activation/wrapper-fixture.ps1');
  const reviewedProbe = hash(await readFile(probe));
  const run = (digest, probeDigest = reviewedProbe) => spawnSync(f.session.pwsh.path,
    ['-NoProfile', '-NonInteractive', '-File', wrapper, '-SessionControl', f.sessionPath, '-SessionControlSha256',
      digest, '-CompositionSha', sha, '-ProbeSha256', probeDigest],
    { env: wrapperEnv, encoding: 'utf8', timeout: 25_000, windowsHide: true });
  const good = await run(hash(f.sessionBytes));
  assert.equal(good.stdout.trim(), 'D324_WRAPPER_FIXTURE_PINS_OK_LIVE_CLOSED', good.stderr);
  assert.equal(good.status, 0);
  assert.equal((await run(hash(f.sessionBytes), '0'.repeat(64))).status, 1);
  const mutated = encodeD324SessionControl({ ...f.session, node: { ...f.session.node, sha256: '0'.repeat(64) } });
  await writeFile(f.sessionPath, mutated);
  for (const digest of [hash(f.sessionBytes), hash(mutated)]) {
    const stopped = await run(digest);
    assert.equal(stopped.status, 1);
    assert.equal(stopped.stdout.trim(), 'D324_WRAPPER_FIXTURE_REJECTED');
  }
});

test('separate approval, manifest, K5 and valid scoped synthetic signature precede even sandbox admission', async t => {
  const f = await material(t);
  const run = await createD324SyntheticRun();
  const old = { ...f.grant, ...historical, action: GRANT_ACTION };
  const fakeOwnerOptions = { ...f.input, compositionSha: sha, now: now() };
  assert.throws(() => verifyD324OwnerEnvelope(f.input.envelope, fakeOwnerOptions), /OWNER_GRANT_SIGNATURE_REJECTED/);
  for (const [input, flag] of [[f.input, undefined], [{ ...f.input, manifest: { ...f.input.manifest } }, approval],
    [{ ...f.input, k5Sha256: '0'.repeat(64) }, approval],
    [{ ...f.input, envelope: f.envelopeFor(old) }, approval],
    [{ ...f.input, envelope: { ...f.input.envelope, signature: Buffer.alloc(64).toString('base64url') } }, approval]]) {
    assert.equal((await run.replay(input, flag)).status, 'STOP_RUN_ADMISSION');
    await absent(run.controls.admission);
    assert.deepEqual(run.attempted(), []);
  }
});

test('concurrent sandbox claims produce one five-step run, durable identities, sealed captures and cap', async t => {
  const f = await material(t);
  const run = await createD324SyntheticRun();
  const outcomes = await Promise.all([run.replay(f.input, approval), run.replay(f.input, approval)]);
  assert.deepEqual(outcomes.map(result => result.status).sort(), ['OFFLINE_CAPTURE_COMPLETE', 'STOP_RUN_ADMISSION']);
  assert(outcomes.every(result => result.executionAuthority === false));
  const completed = outcomes.find(result => result.accepted.length === 5);
  const journal = projectD324Journal(await run.readJournal());
  assert.equal(journal.length, 5);
  assert.deepEqual(run.attempted(), SPEC.methods);
  assert.equal((await readFile(run.controls.budget, 'utf8')).trimEnd().split('\n').length, 5);
  assert.equal(await readFile(run.controls.admission, 'utf8'), f.grant.nonce + '\n');
  const caps = run.captures();
  for (const [i, capture] of caps.entries()) {
    const proof = await verifyD324CaptureInventory(capture.directory, capture.scope, 'OFFLINE_SYNTHETIC');
    assert.equal(proof.inventorySha256, completed.accepted[i].inventorySha256);
    assert.equal(proof.chainVerified, false);
    assert.equal(journal[i].operationId, capture.scope.operationId);
    assert.equal(journal[i].transactionHash, capture.scope.transactionHash);
    assert.equal(capture.attempt, 1);
  }
  assert.equal((await run.replay(f.input, approval)).status, 'STOP_RUN_ADMISSION');
  await assert.rejects(verifyD324CapturedTransaction(caps[0].directory, caps[0].scope, {}, {}), /D324_CAPTURE_BINDING_REJECTED/);
  const observations = caps.map(({ scope }) => ({ rpc: { ledger: scope.ledger },
    expected: { hash: scope.transactionHash, batteryId: scope.batteryId, method: scope.method } }));
  const raw = bytes({ schema: 'BYETERY_D324_OWNER_EXPORT_V1', rows: [], metadata: {
    query_sha256: OWNER_QUERY_SHA256, export_time: '2026-11-12T01:00:00Z', deployment_id: SPEC.deployment,
    database: 'SUPABASE_DEV', project_ref: 'aemxuqnnwfclzrwwiqfd', transaction_read_only: 'on',
    business_execution_sha: RUN1.businessSha, task_id: RUN1.taskId, plan_hash: RUN1.planHash, battery_id: RUN1.batteryId,
    requested_operation_ids: caps.map(({ scope }) => scope.operationId),
  } });
  await assert.rejects(run.verifyExport(raw, hash(raw), observations), /OWNER_EXPORT_ROWS_MISSING/);
  await assert.rejects(run.verifyExport(raw, hash(raw), observations.toReversed()), /D324_EXPORT_OPERATION_IDENTITY_REJECTED/);
  const artifact = join(caps[0].directory, 'receipt', '01-sql.raw.utf8');
  const original = await readFile(artifact);
  try {
    await writeFile(artifact, Buffer.concat([original.subarray(1), Buffer.from(' ')]));
    await assert.rejects(run.verifyExport(raw, hash(raw), observations), /CAPTURE_BYTES_REJECTED/);
  } finally { await writeFile(artifact, original); }
});

test('crash after confirmation preserves marker, budget and incomplete journal without resubmission', async t => {
  const f = await material(t);
  const run = await createD324SyntheticRun({ crashAt: 0 });
  assert.equal((await run.replay(f.input, approval)).status, 'STOP_OPERATOR_REQUIRES_REVIEW');
  const paths = ['admission', 'budget', 'consumed', 'journal'].map(key => run.controls[key]);
  const hashes = async () => Promise.all(paths.map(async path => hash(await readFile(path))));
  const before = await hashes();
  assert.match((await run.readJournal()).toString(), /"reconciliation":"CONFIRMED"/);
  const interrupted = await run.readJournal();
  assert.throws(() => projectD324Journal(interrupted), /D324_JOURNAL_INCOMPLETE/);
  assert.equal((await run.replay(f.input, approval)).status, 'STOP_RUN_ADMISSION');
  assert.deepEqual(await hashes(), before);
  assert.deepEqual(run.attempted(), ['register_battery']);
});

test('duplicates, mismatched SQL/RPC identities and unexpected history halt progression', async t => {
  const f = await material(t);
  for (const [fault, attempts, status] of [
    [{ duplicateAt: 1 }, 2, 'STOP_OPERATOR_REQUIRES_REVIEW'],
    [{ wrongSqlAt: 1 }, 1, 'STOP_OPERATOR_REQUIRES_REVIEW'],
    [{ rpcMismatchAt: 1 }, 2, 'STOP_CAPTURE_UNVERIFIED'],
    [{ unexpectedHistory: true }, 0, 'STOP_RUN_ADMISSION'],
  ]) {
    const run = await createD324SyntheticRun(fault);
    assert.equal((await run.replay(f.input, approval)).status, status);
    assert.equal(run.attempted().length, attempts);
    if (attempts === 0) await absent(run.controls.admission);
  }
});

test('supervisor times out a child and rejects historical receipt identity', async () => {
  const scope = steps[0].scope;
  const { sql, rpc } = fixtureReceipts(scope);
  await assert.rejects(captureSyntheticInChild(scope, sql, rpc, 1), /D324_CAPTURE_CHILD_TIMEOUT/);
  await assert.rejects(captureSyntheticInChild({ ...scope, transactionHash: retired.txHash }, sql, rpc),
    /D324_HISTORICAL_OR_DUPLICATE_RECEIPT/);
});

test('owner export query reads all five exact IDs only in a read-only fixture transaction', async () => {
  const { PGlite } = createRequire(new URL('../../backend/package.json', import.meta.url))('@electric-sql/pglite');
  const pg = new PGlite();
  const queryBytes = await readFile(OWNER_QUERY_URL);
  assert.equal(hash(queryBytes), OWNER_QUERY_SHA256);
  const query = queryBytes.toString();
  const prefix = `WITH fixture_work AS (SELECT $3::uuid deployment_id,operation_id,$6::text battery_id,
    command,''::text source_account,'PROJECTED'::text state,'{}'::jsonb confirmation,NULL::jsonb state_evidence
    FROM unnest($4::uuid[],$5::text[]) AS fixture(operation_id,command)),
    fixture_operations AS (SELECT deployment_id,operation_id id,'CONFIRMED'::text state FROM fixture_work),
    fixture_envelopes AS (SELECT deployment_id,operation_id,''::bytea transaction_hash,''::bytea signed_envelope,
    ''::bytea network_id,''::text contract_address FROM fixture_work),
    fixture_observations AS (SELECT NULL::uuid deployment_id,NULL::uuid operation_id,NULL::bigint id,NULL::text kind,
    NULL::jsonb evidence,NULL::bigint observation_ledger,NULL::bigint confirmation_ledger,NULL::bigint state_read_ledger WHERE false), `;
  const fixtureQuery = query.slice(query.indexOf('WITH ')).replace('WITH ', prefix)
    .replaceAll(":'operation_ids'", '$1').replaceAll(":'query_sha256'", '$2')
    .replaceAll('api_private.testnet_work', 'fixture_work').replaceAll('app_private.stellar_operations', 'fixture_operations')
    .replaceAll('api_private.testnet_envelopes', 'fixture_envelopes').replaceAll('api_private.testnet_observations', 'fixture_observations');
  const ids = steps.map(step => step.scope.operationId);
  const params = [JSON.stringify(ids), OWNER_QUERY_SHA256, SPEC.deployment, ids, SPEC.methods, RUN1.batteryId];
  try {
    assert.equal((await pg.query(fixtureQuery, params)).rows.length, 0);
    await pg.exec('BEGIN TRANSACTION READ ONLY');
    const [row] = (await pg.query(fixtureQuery, params)).rows;
    assert.equal(row.owner_export.metadata.transaction_read_only, 'on');
    assert.deepEqual(row.owner_export.rows.map(row => row.operation_id), ids);
    assert.deepEqual(row.owner_export.rows.map(row => row.command), SPEC.methods);
    assert.deepEqual((await pg.query(fixtureQuery, [...params.slice(0, -1), retired.batteryId])).rows[0].owner_export.rows, []);
    const extra = JSON.stringify([...ids, '00000000-0000-4000-8000-000000000399']);
    assert.deepEqual((await pg.query(fixtureQuery, [extra, ...params.slice(1)])).rows[0].owner_export.rows, []);
    await pg.exec('ROLLBACK');
  } finally { await pg.close(); }
});

test('prepared evidence binding closes on an uncorroborated journal before opening readers', async () => {
  const run = await createD324SyntheticRun();
  const forbidden = () => assert.fail('read port opened without a matching journal');
  const evidence = bindD324EvidenceReview({ controls: run.controls, pool: { connect: forbidden }, fetcher: forbidden });
  await assert.rejects(evidence.verifyExport(Buffer.alloc(0), '0'.repeat(64)), /D324_EXPORT_INCOMPLETE/);
  await assert.rejects(evidence.capture(steps[0].scope, {}), /D324_CAPTURE_JOURNAL_REJECTED/);
  await assert.rejects(evidence.capture(steps[0].scope, {}), /D324_EVIDENCE_PROGRESS_REJECTED/);
});

test('candidate LIVE and legacy launcher block D3-24 before any real port', async () => {
  assert.equal(liveEntry(D324_ARGV), 'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  assert.equal(liveEntry([...D324_ARGV, '--offline-synthetic']), 'EXACT_ARGV_REQUIRED');
  assert.equal(await legacyEntry(D324_ARGV, {}, new Proxy({}, { get() { assert.fail('legacy runtime port reached'); } })),
    'EXACT_ARGV_REQUIRED');
});
