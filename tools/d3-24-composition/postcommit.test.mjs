import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { canonical, SPEC } from '../d3-evidence-capture/common.mjs';
import { checkCaptureCheckout } from '../d3-run1-launcher/f1-checkout.mjs';
import { BOOTSTRAP_BINARIES } from '../d3-24-operational/bootstrap-pins.mjs';
import { RUN1, OWNER_QUERY_SHA256 } from '../d3-24-ratification/identity.mjs';
import { operatorCandidate } from '../d3-24-ratification/operator-identity.mjs';

const target = process.env.D324_TEST_MATERIALIZED_ROOT ?? fileURLToPath(new URL('../../../B24composition-21f5', import.meta.url));
const draft = process.env.D324_TEST_DRAFT_ROOT ?? fileURLToPath(new URL('../../../B24verifiers-draft', import.meta.url));
const fixture = process.env.D324_TEST_MUTATION_ROOT ?? fileURLToPath(new URL('../../../B24verifiers-fixture', import.meta.url));
const candidate = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '');
const legacy = fileURLToPath(new URL('../../../B24capture-legacy', import.meta.url));
const moduleUrl = new URL('./postcommit-review.mjs', import.meta.url).href;
const profileUrl = new URL('../d3-24-capture-profile/profile.mjs', import.meta.url).href;
const keys = generateKeyPairSync('ed25519');
const der = keys.publicKey.export({ type: 'spki', format: 'der' });
const hash = raw => createHash('sha256').update(raw).digest('hex');
const encode = value => Buffer.from(canonical(value) + '\n');

// Synthetic owner ONLY in this test process. Production has no key/pin argument,
// environment override or loader switch. A separate process tests the real pin.
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === profileUrl && specifier === '../d3-run1-launcher/owner-grant-key.mjs')
      return { url: 'test:d324-postcommit-owner', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'test:d324-postcommit-owner') return { format: 'module', shortCircuit: true,
      source: `export const OWNER_GRANT_PUBLIC_KEY=${JSON.stringify(der.toString('base64url'))};
        export const OWNER_GRANT_PUBLIC_KEY_FINGERPRINT=${JSON.stringify(hash(der))};` };
    return next(url, context);
  },
});
const { MATERIALIZED_D324_PROFILE: pin, reviewMaterializedComposition: review,
  inspectPinnedMaterializedV3Fields: inspect, verifyPinnedMaterializedV3Capture: verify } = await import(moduleUrl);
const artifactPaths = { wrapper: 'tools/d3-24-operational/launch.ps1', entry: 'tools/d3-24-operational/live.mjs',
  captureChild: 'tools/d3-24-activation/receipt-child.mjs', exportQuery: 'tools/d3-24-ratification/owner-export.sql' };
function manifest() { return {
  schema: 'BYETERY_D324_FINAL_ACTIVATION_V3', identity: RUN1,
  target: { sha: pin.sha, parent: pin.parent, tree: pin.tree }, networkId: SPEC.networkId, deploymentId: SPEC.deployment,
  operator: { sha: pin.operatorSha, parent: pin.operatorParent, tree: pin.operatorTree }, ledgerSha256: pin.ledgerSha256,
  budget: { historicalConfirmed: 5, limitWithoutContingency: 19, remaining: 14, runCap: 5, tx20Authorized: false },
  artifacts: { ...Object.fromEntries(Object.entries(artifactPaths).map(([key, path]) =>
    [key, hash(fs.readFileSync(join(target, path)))])), captureProfileSha256: pin.captureProfileSha256 },
  k5Sha256: 'd'.repeat(64), sessionControlSha256: 'e'.repeat(64), binaries: BOOTSTRAP_BINARIES,
  operatorRoot: fileURLToPath(new URL('../../../B24repair-op', import.meta.url)),
}; }
function input(value = manifest(), prefix = 'BYETERY-D324-MANIFEST-APPROVAL-V3\n') {
  const raw = encode(value);
  return { taskId: RUN1.taskId, manifestBytes: raw,
    manifestApproval: sign(null, Buffer.from(prefix + hash(raw) + '\n'), keys.privateKey).toString('base64url') };
}
const git = (root, ...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, windowsHide: true });

test('materialized profile checks exact SHA parent tree and all physical tracked bytes without approving V3', async () => {
  const result = await review(target);
  assert.equal(result.compositionSha, pin.sha); assert.equal(result.parent, pin.parent); assert.equal(result.tree, pin.tree);
  assert.equal(result.checkedFiles, 790); assert.equal(result.operatorSha, operatorCandidate.sha);
  for (const key of ['externalManifestApproved', 'custodyRiskAccepted', 'admissionAuthority', 'liveAuthority'])
    assert.equal(result[key], false);
  assert(Object.isFrozen(result));
});
test('draft and dirty verifier patch cannot be mistaken for the pinned materialized target', async () => {
  await assert.rejects(review(draft), /D324_MATERIALIZED_SHA_REJECTED/);
  // Keep the target HEAD fixed independently of whether this TOOL has committed.
  // An untracked patch in the disposable target reproduces the dirty condition.
  assert.notEqual(fs.realpathSync(fixture), fs.realpathSync(target));
  assert.equal(git(fixture, 'rev-parse', 'HEAD').toString().trim(), pin.sha);
  assert.equal(git(fixture, 'status', '--porcelain=v1', '--untracked-files=all').toString(), '');
  const dirtyPatch = join(fixture, 'd324-untracked-verifier-fixture.mjs');
  fs.writeFileSync(dirtyPatch, '// synthetic verifier patch; not operational\n', { flag: 'wx' });
  try { await assert.rejects(review(fixture), /D324_MATERIALIZED_CHECKOUT_REJECTED/); }
  finally { fs.unlinkSync(dirtyPatch); }
});
test('caller cannot select pins or mutate the materialized profile', async () => {
  await assert.rejects(review(target, { sha: 'f'.repeat(40) }), /D324_MATERIALIZED_OPTIONS_REJECTED/);
  assert.throws(() => { pin.sha = 'f'.repeat(40); }, TypeError);
  assert.throws(() => inspect(encode(manifest()), { target: {} }), /D324_MATERIALIZED_OPTIONS_REJECTED/);
});
for (const field of ['sha', 'parent', 'tree']) test('materialized V3 rejects substituted target ' + field, () => {
  const m = manifest(); m.target[field] = 'f'.repeat(40);
  assert.throws(() => inspect(encode(m)), /D324_(?:V3_SCOPE|MATERIALIZED_TARGET)_REJECTED/);
});
test('materialized V3 rejects wrong independent operator and planHash', () => {
  const wrongOperator = manifest(); wrongOperator.operator.sha = 'c50e4eb1f7f538a231c5ecfc31d19283998dc234';
  assert.throws(() => inspect(encode(wrongOperator)), /D324_V3_SCOPE_REJECTED/);
  const wrongPlan = manifest(); wrongPlan.identity = { ...RUN1, planHash: 'f'.repeat(64) };
  assert.throws(() => inspect(encode(wrongPlan)), /D324_V3_SCOPE_REJECTED/);
});
test('materialized V3 rejects capture profile substitution and V2 downgrade', () => {
  const wrongCapture = manifest(); wrongCapture.artifacts.captureProfileSha256 = 'f'.repeat(64);
  assert.throws(() => inspect(encode(wrongCapture)), /D324_V3_BINDINGS_REJECTED/);
  const downgrade = manifest(); downgrade.schema = 'BYETERY_D324_FINAL_ACTIVATION_V2';
  assert.throws(() => inspect(encode(downgrade)), /D324_V3_MANIFEST_REJECTED/);
});
test('missing manifest or missing approval never becomes a capture approval', async () => {
  assert.throws(() => inspect(undefined), /D324_V3_MANIFEST_REJECTED/);
  await assert.rejects(verify(target, undefined), /D324_MATERIALIZED_INPUT_REJECTED/);
  await assert.rejects(verify(target, { taskId: RUN1.taskId, manifestBytes: encode(manifest()) }), /D324_MATERIALIZED_INPUT_REJECTED/);
  const unsigned = input(); unsigned.manifestApproval = '';
  await assert.rejects(verify(target, unsigned), /OWNER_GRANT_SIGNATURE_REJECTED/);
});
test('extra caller pins in input are rejected rather than ignored', async () => {
  await assert.rejects(verify(target, { ...input(), captureProfile: pin }), /D324_MATERIALIZED_INPUT_REJECTED/);
});
test('exact synthetic V3 delegates to fixed-owner verifier and grants only capture read authority', async () => {
  const fields = inspect(encode(manifest())); assert.equal(fields.externalManifestApproved, false);
  const proof = await verify(target, input());
  assert.equal(proof.compositionSha, pin.sha); assert.equal(proof.authority, 'CAPTURE_READ_ONLY');
  assert.equal(proof.liveAuthority, false);
  // The review report and a caller-cloned proof have no private continuity receipt.
  const { assertD324CaptureContinuity } = await import(profileUrl);
  await assertD324CaptureContinuity(target, proof);
  await assert.rejects(assertD324CaptureContinuity(target, { ...proof }), /D324_CAPTURE_PROOF_REJECTED/);
  await assert.rejects(assertD324CaptureContinuity(target, await review(target)), /D324_CAPTURE_PROOF_REJECTED/);
});
test('grant-domain signature cannot approve the materialized V3 manifest', async () => {
  await assert.rejects(verify(target, input(manifest(), 'BYETERY-D3-RUN1-OWNER-GRANT-V1\n')), /OWNER_GRANT_SIGNATURE_REJECTED/);
});
test('even synthetic-owner-signed artifact mismatch fails physical capture binding', async () => {
  const altered = manifest(); altered.artifacts.entry = 'f'.repeat(64);
  await assert.rejects(verify(target, input(altered)), /D324_CAPTURE_BYTES_REJECTED/);
});
test('budget and contingency remain closed under the materialized profile', () => {
  const expanded = manifest(); expanded.budget.remaining = 15;
  assert.throws(() => inspect(encode(expanded)), /D324_V3_BUDGET_REJECTED/);
  const contingency = manifest(); contingency.budget.tx20Authorized = true;
  assert.throws(() => inspect(encode(contingency)), /D324_V3_BUDGET_REJECTED/);
  assert.equal(manifest().artifacts.exportQuery, OWNER_QUERY_SHA256);
});
test('legacy capture pins accept their exact old checkout and continue rejecting a329', async () => {
  const legacySha = '864dd0c537fa6f0c6ff0eb9733323cc049278e20';
  assert.equal(git(legacy, 'rev-parse', 'HEAD').toString().trim(), legacySha);
  await checkCaptureCheckout(legacy, legacySha);
  await assert.rejects(checkCaptureCheckout(target, pin.sha), /RATIFIED_CAPTURE_REJECTED/);
  await assert.rejects(review(legacy), /D324_MATERIALIZED_SHA_REJECTED/);
});
test('modified capture bytes in the disposable checkout reject and are restored', async () => {
  assert.notEqual(fixture, target); assert.equal(git(fixture, 'rev-parse', 'HEAD').toString().trim(), pin.sha);
  const path = join(fixture, 'tools/d3-evidence-capture/verifier.mjs'), before = fs.readFileSync(path);
  try {
    const modified = Buffer.from(before); modified[0] ^= 1; fs.writeFileSync(path, modified);
    await assert.rejects(review(fixture), /D324_MATERIALIZED_CHECKOUT_REJECTED/);
  } finally { fs.writeFileSync(path, before); }
  assert.equal(git(fixture, 'status', '--porcelain=v1', '--untracked-files=all').toString(), '');
});
test('capture drift after clean Git observation still fails raw blob comparison', async () => {
  const original = fs.readFileSync, watched = join(fixture, 'tools/d3-evidence-capture/verifier.mjs'); let observed = false;
  fs.readFileSync = function(path, ...args) {
    const raw = original.call(this, path, ...args);
    if (String(path) === watched) { observed = true; const altered = Buffer.from(raw); altered[0] ^= 1; return altered; }
    return raw;
  };
  try { await assert.rejects(review(fixture), /D324_MATERIALIZED_BYTES_REJECTED/); }
  finally { fs.readFileSync = original; }
  assert.equal(observed, true);
});
for (const flag of ['assume-unchanged', 'skip-worktree']) test('materialized review rejects index flag ' + flag, async () => {
  const path = 'tools/d3-evidence-capture/verifier.mjs';
  try {
    git(fixture, 'update-index', '--' + flag, '--', path);
    await assert.rejects(review(fixture), /D324_MATERIALIZED_CHECKOUT_REJECTED/);
  } finally { git(fixture, 'update-index', '--no-' + flag, '--', path); }
});
test('production process without the synthetic loader rejects the synthetic owner signature', () => {
  const signed = input();
  const script = `import {verifyPinnedMaterializedV3Capture} from ${JSON.stringify(moduleUrl)};
    let s='';for await(const b of process.stdin)s+=b;const i=JSON.parse(s);i.manifestBytes=Buffer.from(i.manifestBytes,'base64');
    try{await verifyPinnedMaterializedV3Capture(${JSON.stringify(target)},i);console.log('UNEXPECTED_APPROVAL');process.exitCode=2;}
    catch(e){console.log(e.message==='OWNER_GRANT_SIGNATURE_REJECTED'?'FIXED_OWNER_PIN_REJECTED':'UNEXPECTED_ERROR');}`;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
    cwd: candidate, windowsHide: true, encoding: 'utf8',
    input: JSON.stringify({ ...signed, manifestBytes: signed.manifestBytes.toString('base64') }), timeout: 30000,
  });
  assert.equal(result.status, 0); assert.equal(result.stdout.trim(), 'FIXED_OWNER_PIN_REJECTED');
});
