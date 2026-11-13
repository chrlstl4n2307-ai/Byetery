import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { registerHooks } from 'node:module';
import { checkCaptureCheckout } from '../d3-run1-launcher/f1-checkout.mjs';
import { canonical, SPEC } from '../d3-evidence-capture/common.mjs';

const exec = promisify(execFile);
const root = resolve(fileURLToPath(new URL('../../../B24secure', import.meta.url)));
const legacy = resolve(fileURLToPath(new URL('../../../B24capture-legacy', import.meta.url)));
const profileUrl = new URL('./profile.mjs', import.meta.url).href;
const keys = generateKeyPairSync('ed25519');
const der = keys.publicKey.export({ type: 'spki', format: 'der' });
const hash = value => createHash('sha256').update(value).digest('hex');
const encode = value => Buffer.from(canonical(value) + '\n');
// Test-only module loader: no caller-supplied key or environment switch exists
// in the production verifier. Only this test's import receives synthetic pins.
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === profileUrl && specifier === '../d3-run1-launcher/owner-grant-key.mjs')
      return { url: 'test:d324-capture-owner', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'test:d324-capture-owner') return { format: 'module', shortCircuit: true,
      source: `export const OWNER_GRANT_PUBLIC_KEY=${JSON.stringify(der.toString('base64url'))};
        export const OWNER_GRANT_PUBLIC_KEY_FINGERPRINT=${JSON.stringify(hash(der))};` };
    return next(url, context);
  },
});
const { D324_CAPTURE_PROFILE: profile, D324_CAPTURE_PROFILE_SHA256: digest,
  verifyD324CaptureProfile: verifyProfile, assertD324CaptureContinuity: continuity } = await import(profileUrl);
const git = async (cwd, ...args) => (await exec('git', ['--no-replace-objects', ...args], { cwd, windowsHide: true })).stdout.trim();
const sha = await git(root, 'rev-parse', 'HEAD');
const target = { sha, parent: await git(root, 'rev-parse', sha + '^'), tree: await git(root, 'rev-parse', sha + '^{tree}') };
const operatorSha = 'c50e4eb1f7f538a231c5ecfc31d19283998dc234';
const paths = { wrapper: 'tools/d3-24-operational/launch.ps1', entry: 'tools/d3-24-operational/live.mjs',
  captureChild: 'tools/d3-24-activation/receipt-child.mjs', exportQuery: 'tools/d3-24-ratification/owner-export.sql' };
const manifest = {
  schema: 'BYETERY_D324_FINAL_ACTIVATION_V3', target,
  identity: { taskId: 'D3-24-RUN1', runId: 'RUN1', businessSha: operatorSha,
    planHash: '3c03cfe14ea2bb091fba229c378ebea859b8ebdadbdbb6ee739b23b1b831a02d',
    batteryId: 'BYE-D3-R1-20261111-DCDE088CA870', recipient: 'GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS' },
  networkId: SPEC.networkId, deploymentId: SPEC.deployment,
  operator: { sha: operatorSha, parent: await git(root, 'rev-parse', operatorSha + '^'), tree: await git(root, 'rev-parse', operatorSha + '^{tree}') },
  ledgerSha256: 'eaffd7521b905b995dba26150190c44592822e6e052509b3d65815adde25404d',
  budget: { historicalConfirmed: 5, limitWithoutContingency: 19, remaining: 14, runCap: 5, tx20Authorized: false },
  artifacts: { ...Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, hash(await fs.readFile(join(root, path)))]))), captureProfileSha256: digest },
  k5Sha256: 'a'.repeat(64), sessionControlSha256: 'b'.repeat(64), binaries: { nodeSha256: 'c'.repeat(64), pwshSha256: 'd'.repeat(64) },
  operatorRoot: resolve(root, '../B24op'),
};
function input(value = manifest) {
  const raw = encode(value);
  return { taskId: 'D3-24-RUN1', manifestBytes: raw,
    manifestApproval: sign(null, Buffer.from('BYETERY-D324-MANIFEST-APPROVAL-V3\n' + hash(raw) + '\n'), keys.privateKey).toString('base64url') };
}
const changed = change => { const m = structuredClone(manifest); change(m); return input(m); };

test('historical F1 accepts the legitimate original evidence and receipt trees', async () => {
  assert.equal(await git(legacy, 'rev-parse', 'HEAD:tools/d3-evidence-capture'), 'cccda6b882bba85f848064ef70d086588c65608b');
  await checkCaptureCheckout(legacy, await git(legacy, 'rev-parse', 'HEAD'));
});
test('historical F1 rejects D3-24 evidence instead of silently changing its pin', async () => {
  await assert.rejects(checkCaptureCheckout(root, sha), /RATIFIED_CAPTURE_REJECTED/);
});
test('D3-24 accepts exact signed composition with fixed profile and provides only read authority', async () => {
  const proof = await verifyProfile(root, input());
  assert.equal(proof.compositionSha, target.sha);
  assert.equal(proof.authority, 'CAPTURE_READ_ONLY');
  assert.equal(proof.liveAuthority, false);
  assert(Object.isFrozen(proof));
  await continuity(root, proof);
  await assert.rejects(continuity(root, { ...proof }), /D324_CAPTURE_PROOF_REJECTED/);
  await assert.rejects(continuity(legacy, proof), /D324_CAPTURE_PROOF_REJECTED/);
});
test('one-byte changes after the Git clean observation fail the physical blob check', async () => {
  const read = fs.readFile;
  let injected = false;
  fs.readFile = async (path, ...args) => {
    const raw = await read(path, ...args);
    if (String(path) === join(root, 'tools/d3-evidence-capture/verifier.mjs')) {
      injected = true; const altered = Buffer.from(raw); altered[0] ^= 1; return altered;
    }
    return raw;
  };
  try { await assert.rejects(verifyProfile(root, input()), /D324_CAPTURE_BYTES_REJECTED/); assert(injected); }
  finally { fs.readFile = read; }
});
test('continuity detects later byte changes rather than trusting a previously issued proof', async () => {
  const proof = await verifyProfile(root, input()), read = fs.readFile;
  fs.readFile = async (path, ...args) => {
    const raw = await read(path, ...args);
    return String(path) === join(root, 'tools/d3-receipt-capture/capture.mjs') ? Buffer.concat([raw, Buffer.from('x')]) : raw;
  };
  try { await assert.rejects(continuity(root, proof), /D324_CAPTURE_BYTES_REJECTED/); }
  finally { fs.readFile = read; }
});
for (const [label, change, error] of [
  ['task identity', m => { m.identity.taskId = 'D3-23-RUN1'; }, 'IDENTITY'],
  ['run identity', m => { m.identity.runId = 'RUN2'; }, 'IDENTITY'],
  ['battery identity', m => { m.identity.batteryId = 'BYE-OTHER'; }, 'IDENTITY'],
  ['recipient identity', m => { m.identity.recipient = 'OTHER'; }, 'IDENTITY'],
  ['operator identity consistency', m => { m.operator.sha = '1'.repeat(40); }, 'COMPOSITION'],
  ['coerced plan hash', m => { m.identity.planHash = [m.identity.planHash]; }, 'IDENTITY'],
  ['composition sha', m => { m.target.sha = '2'.repeat(40); }, 'GIT'],
  ['composition parent', m => { m.target.parent = '3'.repeat(40); }, 'COMPOSITION'],
  ['composition tree', m => { m.target.tree = '4'.repeat(40); }, 'COMPOSITION'],
  ['unbound profile', m => { delete m.artifacts.captureProfileSha256; }, 'PROFILE'],
  ['caller substituted profile', m => { m.artifacts.captureProfileSha256 = '5'.repeat(64); }, 'PROFILE'],
  ['manifest downgrade', m => { m.schema = 'BYETERY_D324_FINAL_ACTIVATION_V2'; }, 'MANIFEST'],
  ['wrong network', m => { m.networkId = '6'.repeat(64); }, 'MANIFEST'],
  ['wrong deployment', m => { m.deploymentId = '00000000-0000-0000-0000-000000000000'; }, 'MANIFEST'],
  ['budget expansion', m => { m.budget.limitWithoutContingency = 20; }, 'BUDGET'],
  ['contingency unlock', m => { m.budget.tx20Authorized = true; }, 'BUDGET'],
  ['ledger substitution', m => { m.ledgerSha256 = '7'.repeat(64); }, 'MANIFEST'],
  ['artifact substitution', m => { m.artifacts.entry = '8'.repeat(64); }, 'BYTES'],
]) test('D3-24 rejects ' + label + ' even with a synthetic test-owner signature', async () => {
  await assert.rejects(verifyProfile(root, changed(change)), new RegExp('D324_CAPTURE_' + error));
});
test('manifest absent, invalid, duplicate-key or incorrectly signed cannot issue proof', async () => {
  await assert.rejects(verifyProfile(root, { taskId: 'D3-24-RUN1' }), /IDENTITY/);
  await assert.rejects(verifyProfile(root, { ...input(), manifestBytes: Buffer.from('{}') }), /MANIFEST/);
  await assert.rejects(verifyProfile(root, { ...input(), manifestApproval: 'a'.repeat(86) }), /SIGNATURE/);
  const raw = input(); raw.manifestBytes = Buffer.from(raw.manifestBytes.toString().replace('{', '{"schema":"duplicate",'));
  await assert.rejects(verifyProfile(root, raw), /MANIFEST/);
});
test('no caller-provided pins and no identity downgrade can enter the verifier', async () => {
  await assert.rejects(verifyProfile(root, { ...input(), tree: '0'.repeat(40) }), /IDENTITY/);
  await assert.rejects(verifyProfile(root, { ...input(), taskId: 'D3-17-RUN1' }), /IDENTITY/);
});
test('a signature from a grant domain cannot approve a capture manifest', async () => {
  const p = input();
  p.manifestApproval = sign(null, Buffer.from('BYETERY-D3-RUN1-OWNER-GRANT-V1\n' + hash(p.manifestBytes) + '\n'), keys.privateKey).toString('base64url');
  await assert.rejects(verifyProfile(root, p), /OWNER_GRANT_SIGNATURE_REJECTED/);
});
test('D3-24 does not fall back to a historical checkout', async () => {
  await assert.rejects(verifyProfile(legacy, input()), /CHECKOUT/);
});
test('receipt capture tree and historical query are unchanged in both profiles', async () => {
  for (const dir of [root, legacy]) {
    assert.equal(await git(dir, 'rev-parse', 'HEAD:tools/d3-receipt-capture'), profile.receiptCaptureTree);
    const original = await git(dir, 'rev-parse', '84f1bdd145269c306008f2ae4a1c3648864dd347:tools/d3-receipt-capture');
    assert.equal(original, profile.receiptCaptureTree);
    assert.equal(await git(dir, 'rev-parse', 'HEAD:tools/d3-evidence-capture/sql/owner-export.sql'),
      await git(dir, 'rev-parse', '84f1bdd145269c306008f2ae4a1c3648864dd347:tools/d3-evidence-capture/sql/owner-export.sql'));
  }
});
test('production verifier without the test loader rejects the synthetic owner signature', async () => {
  const script = `import {verifyD324CaptureProfile} from ${JSON.stringify(profileUrl)};
    let raw=''; for await(const b of process.stdin)raw+=b;
    const p=JSON.parse(raw);
    try { await verifyD324CaptureProfile(p.root,{...p.input,manifestBytes:Buffer.from(p.input.manifestBytes,'base64')}); process.exitCode=2; }
    catch(e) { console.log(e.message); if(e.message!=='OWNER_GRANT_SIGNATURE_REJECTED')process.exitCode=3; }`;
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.resume();
  const p = input(); child.stdin.end(JSON.stringify({ root, input: { ...p, manifestBytes: p.manifestBytes.toString('base64') } }));
  assert.equal(await new Promise(r => child.once('close', r)), 0);
  assert.match(output, /OWNER_GRANT_SIGNATURE_REJECTED/);
});
