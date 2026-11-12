import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtempDisposable, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { bytes, hash, SPEC } from '../d3-evidence-capture/common.mjs';
import { observeD324Checkout, verifyD324ActivationManifest } from '../d3-24-activation/manifest.mjs';
import { RUN1, OWNER_QUERY_SHA256, OWNER_QUERY_URL, readD324Ledger } from '../d3-24-ratification/identity.mjs';
import { canonicalGrant } from '../d3-run1-launcher/grant-schema.mjs';
import { encodeD324SessionControl } from '../d3-run1-launcher/session-pins.mjs';
import { d324ScopeFromStep } from '../d3-run1-launcher/launcher.mjs';
import { createD324Diagnostics } from '../d3-run1-launcher/diagnostics.mjs';
import { ACTIVATION_PARENT, BOOTSTRAP_BINARIES } from './bootstrap-pins.mjs';
import { checkD324ApiIdentity } from './api-continuity.mjs';
import { preserveD324OwnerExport, readD324OwnerExport } from './export-readonly.mjs';
import { executeD324ApprovedRun } from './final-runtime.mjs';
import { resolveD324Operator } from './operator-binding.mjs';
import { checkLaunchScope, verifyManifestApproval } from './owner-authorization.mjs';
import { D324_ARGV, D324_GRANT_ACTION } from './policy.mjs';

const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const directory = join(root, 'tools', 'd3-24-operational');
const ownerSignaturePlaceholder = Buffer.alloc(64).toString('base64url');
const shellEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(SYSTEMROOT|WINDIR|PATH|PATHEXT|COMSPEC|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|HOMEDRIVE|HOMEPATH|PROGRAMFILES|PROGRAMDATA)$/i.test(key)));
const fixed = Date.UTC(2026, 10, 12, 2, 0);

function exampleGrant(compositionRootSha) {
  return { schemaVersion: 1, action: D324_GRANT_ACTION, ...RUN1, compositionRootSha, jwtExpirySeconds: 5400,
    jwtObservedAt: fixed - 3000, nonce: 'a1'.repeat(32), issuedAt: fixed - 1000, expiresAt: fixed - 1000 + 900000 };
}

const k5 = grant => Buffer.from(canonicalGrant(grant).toString('utf8')
  .replace('jwtObservedAt=' + grant.jwtObservedAt, 'jwtObservedAt=<JWT_OBSERVED_AT_EPOCH_MS>')
  .replace('nonce=' + grant.nonce, 'nonce=<NEW_32_BYTE_NONCE_LOWERCASE_HEX>')
  .replace('issuedAt=' + grant.issuedAt, 'issuedAt=<ISSUED_AT_EPOCH_MS>')
  .replace('expiresAt=' + grant.expiresAt, 'expiresAt=<EXPIRES_AT_EPOCH_MS>'));

async function fixture(t) {
  const temporary = await mkdtempDisposable(join(root, '.tools/d324-wrapper-fixture-'));
  t.after(() => temporary.remove());
  const folder = await realpath(temporary.path);
  const executable = process.env.BYETERY_D324_TEST_PWSH;
  assert(executable, 'Set BYETERY_D324_TEST_PWSH to the reviewed PowerShell executable');
  const pin = async file => ({ path: await realpath(file), sha256: hash(await readFile(file)) });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const session = { schemaVersion: 2, taskId: RUN1.taskId, compositionRootSha: head,
    live: await pin(join(directory, 'live.mjs')), wrapper: await pin(join(directory, 'launch.ps1')),
    pwsh: { ...await pin(executable), version: '7.6.9' }, node: { ...await pin(process.execPath), version: process.version } };
  assert.equal(session.node.sha256, BOOTSTRAP_BINARIES.nodeSha256);
  assert.equal(session.pwsh.sha256, BOOTSTRAP_BINARIES.pwshSha256);
  const sessionPath = join(folder, 'session-control.json');
  const templatePath = join(folder, 'K5-UNSIGNED-TEMPLATE.txt');
  const fixturePath = join(folder, 'fixture.json');
  const template = k5(exampleGrant(head));
  const sessionBytes = encodeD324SessionControl(session);
  const settings = { schema: 'D324_WRAPPER_OFFLINE_FIXTURE_V1', head,
    operatorRoot: await realpath(resolve(root, '../B24op')), entrySha256: session.live.sha256,
    k5Sha256: hash(template), sessionControlSha256: hash(sessionBytes) };
  await writeFile(fixturePath, bytes(settings));
  await writeFile(sessionPath, sessionBytes);
  await writeFile(templatePath, template);
  const local = join(folder, 'local-custody-fixture');
  await mkdir(local);
  const run = (args, additions = {}) => spawnSync(session.pwsh.path,
    ['-NoProfile', '-NonInteractive', '-File', session.wrapper.path, ...args], {
      cwd: root, env: { ...shellEnv, LOCALAPPDATA: local, ...additions },
      encoding: 'utf8', timeout: 35000, windowsHide: true,
    });
  return { folder, local, session, sessionPath, sessionBytes, fixturePath, settings, templatePath, template, run };
}

test('actual PowerShell wrapper pins Node, bootstrap, session and K5 and loads only c50e4eb1 offline', async t => {
  const f = await fixture(t);
  const args = ['-OfflineFixture', f.folder];
  const result = f.run(args);
  assert.equal(result.stdout.trim(), 'D324_WRAPPER_OFFLINE_PASS', result.stderr || result.error?.message);
  assert.equal(result.status, 0);
  const extraNodeFlags = spawnSync(process.execPath,
    ['--no-warnings', join(directory, 'entry-bootstrap.mjs'), '--offline-wrapper-check', f.folder],
    { encoding: 'utf8', env: shellEnv, windowsHide: true });
  assert.equal(extraNodeFlags.stdout.trim(), 'D324_OFFLINE_BOOTSTRAP_REJECTED');
  assert.equal(extraNodeFlags.status, 1);
  await writeFile(f.sessionPath, Buffer.concat([f.sessionBytes, Buffer.from(' ')]));
  assert.equal(f.run(args).stdout.trim(), 'D324_OFFLINE_WRAPPER_REJECTED');
  await writeFile(f.sessionPath, f.sessionBytes);
  await writeFile(f.templatePath, Buffer.concat([f.template, Buffer.from(' ')]));
  assert.equal(f.run(args).stdout.trim(), 'D324_OFFLINE_WRAPPER_REJECTED');
  await writeFile(f.templatePath, f.template);
  await writeFile(f.fixturePath, bytes({ ...f.settings, operatorRoot: await realpath(resolve(root, '../B24cmp')) }));
  assert.equal(f.run(args).stdout.trim(), 'D324_OFFLINE_WRAPPER_REJECTED');
  const replacement = join(f.folder, 'replacement');
  await mkdir(replacement);
  await writeFile(join(replacement, 'node.exe'), 'offline fixture for an altered binary');
  const pathKey = Object.keys(shellEnv).find(name => name.toUpperCase() === 'PATH');
  assert.equal(f.run(args, { [pathKey]: replacement + delimiter + shellEnv[pathKey] }).stdout.trim(),
    'D324_BOOTSTRAP_PINS_REJECTED');
});

test('real PowerShell LIVE path rejects absent and forged custody files and Node rejects direct entry', async t => {
  const f = await fixture(t);
  const expectGate = result => {
    assert.equal(result.status, 1);
    assert.equal(result.stdout.trim(), 'D324_OPERATIONAL_RATIFICATION_REQUIRED', result.stderr);
  };
  expectGate(f.run([]));
  expectGate(spawnSync(process.execPath, ['--no-warnings', join(directory, 'entry-bootstrap.mjs'), ...D324_ARGV], {
    encoding: 'utf8', env: { ...shellEnv, LOCALAPPDATA: f.local }, windowsHide: true,
  }));
  const custody = join(f.local, 'OwnerKeyCustody', 'Byetery-D3-RUN1', 'live', RUN1.taskId);
  await mkdir(custody, { recursive: true });
  await writeFile(join(custody, 'activation-manifest.json'), bytes({ schema: 'BYETERY_D324_FINAL_ACTIVATION_V2',
    identity: RUN1, target: { sha: 'a'.repeat(40), parent: ACTIVATION_PARENT, tree: 'b'.repeat(40) } }));
  await writeFile(join(custody, 'manifest-approval.sig'), ownerSignaturePlaceholder + '\n');
  expectGate(f.run([], { BYETERY_LIVE_AUTHORITY: 'YES', BYETERY_D324_SESSION_CONTROL_PATH: f.sessionPath }));
  expectGate(spawnSync(process.execPath, [join(directory, 'live.mjs'), ...D324_ARGV], { encoding: 'utf8',
    env: { ...shellEnv, LOCALAPPDATA: f.local }, windowsHide: true }));
  await assert.rejects(executeD324ApprovedRun(root, Object.freeze({ liveAuthority: true })), /D324_OPERATIONAL_RATIFICATION_REQUIRED/);
});

test('final manifest binds exact clean checkout parent, operator, task, plan, binaries and budget; a digest alone carries no authority', async () => {
  const baseline = await realpath(resolve(root, '../B24rat'));
  const operatorRoot = await realpath(resolve(root, '../B24op'));
  const observation = await observeD324Checkout(baseline, operatorRoot);
  assert.equal(observation.target.sha, ACTIVATION_PARENT);
  const target = { sha: 'a'.repeat(40), parent: ACTIVATION_PARENT, tree: 'b'.repeat(40) };
  const observed = { ...observation, target, operatorRoot };
  const record = { ...observed, schema: 'BYETERY_D324_FINAL_ACTIVATION_V2', identity: RUN1, networkId: SPEC.networkId,
    deploymentId: SPEC.deployment, ledgerSha256: (await readD324Ledger()).ledgerSha256,
    budget: { historicalConfirmed: 5, limitWithoutContingency: 19, remaining: 14, runCap: 5, tx20Authorized: false },
    binaries: BOOTSTRAP_BINARIES, k5Sha256: 'c'.repeat(64), sessionControlSha256: 'd'.repeat(64) };
  const verify = data => verifyD324ActivationManifest(bytes(data), hash(bytes(data)), observed);
  assert.equal((await verify(record)).liveAuthority, false);
  await assert.rejects(verifyD324ActivationManifest(bytes(record), hash(bytes({ ...record, k5Sha256: 'f'.repeat(64) })), observed),
    /D324_MANIFEST_DIGEST_REJECTED/);
  for (const [change, code] of [
    [{ target: { ...target, parent: observation.target.parent } }, /TARGET/],
    [{ target: { ...target, tree: '9'.repeat(40) } }, /TARGET/],
    [{ operator: { ...record.operator, sha: 'c6ba2e837ed0f7b81373655b8106b58ecb86a8cd' } }, /OPERATOR/],
    [{ identity: { ...RUN1, planHash: '0'.repeat(64) } }, /PROFILE/],
    [{ identity: { ...RUN1, taskId: 'D3-23-RUN1' } }, /PROFILE/],
    [{ binaries: { ...BOOTSTRAP_BINARIES, nodeSha256: '0'.repeat(64) } }, /RUNTIME/],
    [{ operatorRoot: root }, /RUNTIME/],
    [{ budget: { ...record.budget, tx20Authorized: true, runCap: 6 } }, /BUDGET/],
  ]) await assert.rejects(verify({ ...record, ...change }), code);
  assert.throws(() => verifyManifestApproval(bytes(record), Buffer.from(ownerSignaturePlaceholder + '\n')), /OWNER_GRANT_SIGNATURE_REJECTED/);
  await assert.rejects(resolveD324Operator(root, baseline), /D324_OPERATOR_CHECKOUT_REJECTED/);
});

test('separate LIVE approval is bound to exact grant, API identity and earliest deadline', () => {
  const grant = exampleGrant('a'.repeat(40));
  const manifest = 'b'.repeat(64);
  const api = { origin: 'http://127.0.0.1:51432', pid: 23, startedAt: new Date(fixed - 60000).toISOString() };
  const approval = { schema: 'BYETERY_D324_ONE_LIVE_APPROVAL_V1', taskId: RUN1.taskId,
    manifestSha256: manifest, grantSha256: hash(canonicalGrant(grant)), api, issuedAt: fixed, expiresAt: fixed + 2000 };
  const message = checkLaunchScope(approval, manifest, grant, fixed);
  assert.match(message.toString(), /^BYETERY-D324-ONE-LIVE-APPROVAL-V1\n/);
  assert.throws(() => checkLaunchScope(approval, 'e'.repeat(64), grant, fixed), /SCOPE_REJECTED/);
  assert.throws(() => checkLaunchScope(approval, manifest, { ...grant, nonce: 'b1'.repeat(32) }, fixed), /SCOPE_REJECTED/);
  assert.throws(() => checkLaunchScope({ ...approval, expiresAt: grant.expiresAt }, manifest, grant, fixed), /SCOPE_REJECTED/);
  assert.throws(() => checkLaunchScope({ ...approval, api: { ...api, origin: 'http://localhost:51432' } }, manifest, grant, fixed),
    /API_APPROVAL_REJECTED/);
  const proc = { path: 'C:\\example\\node.exe', startedAt: api.startedAt,
    commandLine: '"C:\\example\\node.exe" --experimental-strip-types "C:\\example app\\server.ts"' };
  const args = [api, proc.path, 'C:\\example app\\server.ts'];
  const row = '  TCP  127.0.0.1:51432  0.0.0.0:0  LISTENING  23\n';
  assert.doesNotThrow(() => checkD324ApiIdentity(...args, proc, row));
  assert.throws(() => checkD324ApiIdentity(...args, proc, row.replace('23\n', '24\n')), /LISTENER_CHANGED/);
  assert.throws(() => checkD324ApiIdentity(...args, { ...proc, commandLine: proc.commandLine.replace('server', 'other') }, row),
    /PROCESS_CHANGED/);
});

test('read-only export checks the pinned SQL, empty permissions probe, exact five IDs and rollback', async () => {
  const ids = Array.from({ length: 5 }, (_, i) => '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'));
  const query = (await readFile(OWNER_QUERY_URL, 'utf8')).replaceAll(":'operation_ids'", '$1').replaceAll(":'query_sha256'", '$2');
  const statements = [];
  let bad = false;
  const pool = { connect: async () => ({ async query(arg) {
    statements.push(arg);
    if (typeof arg === 'string') return { rows: [] };
    assert.equal(arg.text, query);
    assert.equal(arg.values[1], OWNER_QUERY_SHA256);
    const requested = JSON.parse(arg.values[0]);
    return { rows: [{ owner_export: { schema: 'BYETERY_D324_OWNER_EXPORT_V1', metadata: {
      transaction_read_only: bad ? 'off' : 'on', query_sha256: OWNER_QUERY_SHA256, deployment_id: SPEC.deployment,
      task_id: RUN1.taskId, battery_id: RUN1.batteryId, plan_hash: RUN1.planHash, requested_operation_ids: requested.toSorted(),
    }, rows: requested.map(() => ({})) } }] };
  }, release() { statements.push('RELEASE'); } }) };
  let exportFile;
  for (const selection of [[], ids]) {
    const observed = await readD324OwnerExport(pool, selection);
    assert.equal(observed.sha256, hash(observed.content));
    if (selection.length === 5) exportFile = observed;
    assert.deepEqual(statements.splice(0).map(s => typeof s === 'string' ? s : 'SELECT'), [
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY', 'SELECT', 'ROLLBACK', 'RELEASE']);
  }
  await assert.rejects(readD324OwnerExport(pool, ids.with(4, ids[0])), /D324_EXPORT_INPUT_REJECTED/);
  bad = true;
  await assert.rejects(readD324OwnerExport(pool, ids), /D324_EXPORT_QUERY_RESULT_REJECTED/);
  assert.deepEqual(statements.slice(-2), ['ROLLBACK', 'RELEASE']);
  await assert.rejects(preserveD324OwnerExport({ ...exportFile, sha256: '0'.repeat(64) }), /D324_EXPORT_DIGEST_REJECTED/);
  const saved = await preserveD324OwnerExport(exportFile);
  assert.deepEqual(await readFile(join(saved, 'owner-export.json')), exportFile.content);
  assert.equal(await readFile(join(saved, 'OWNER_EXPORT_SHA256'), 'utf8'), exportFile.sha256 + '\n');
});

test('live adapter reuses ordered step evidence and rejects duplicate identities and altered payload bytes', () => {
  const raw = Buffer.from('synthetic collection payload');
  const requestId = 'a'.repeat(64);
  const item = { operation: 'confirm_collection', batteryId: RUN1.batteryId,
    operationId: '00000000-0000-4000-8000-000000000033', transactionHash: 'b'.repeat(64), confirmationLedger: 7_700_003,
    confirmedBatteryState: 'COLLECTED', confirmedRewardState: 'NOT_ELIGIBLE', confirmationMode: 'OBSERVED',
    confirmedAt: new Date(fixed).toISOString(), requestId,
    payload: { manifestBase64: raw.toString('base64'), payloadHash: hash(raw) } };
  const previous = { requestId, ledger: item.confirmationLedger - 1 };
  assert.equal(d324ScopeFromStep(item, 2, previous, new Set(), new Set()).operationId, item.operationId);
  assert.throws(() => d324ScopeFromStep(item, 2, previous, new Set([item.operationId]), new Set()), /OPERATION_IDENTITY_REJECTED/);
  assert.throws(() => d324ScopeFromStep({ ...item, payload: { ...item.payload, payloadHash: '0'.repeat(64) } },
    2, previous, new Set(), new Set()), /ATTESTATION_BYTES_REJECTED/);
});

test('D3-24 fatal evidence preserves task and quiescence leaf instead of using the historical identity', () => {
  const diagnostics = createD324Diagnostics(() => fixed);
  diagnostics.event('PREFLIGHT_ENTER');
  diagnostics.event('PREFLIGHT_FAIL', undefined, 'VALIDATION', { leaf: 'SQL_QUIESCENCE_REJECTED', phase: 'STARTUP_FRESH' });
  const record = diagnostics.fatal('D324_RUN_STOPPED_RECONCILE');
  assert.equal(record.taskId, RUN1.taskId);
  assert.equal(record.leaf, 'SQL_QUIESCENCE_REJECTED');
  assert.equal(record.phase, 'STARTUP_FRESH');
});
