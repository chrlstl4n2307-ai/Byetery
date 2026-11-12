import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { canonical, SPEC } from '../d3-evidence-capture/common.mjs';
import { verifyDetachedEd25519 } from '../d3-24-activation/ed25519.mjs';
import { OWNER_GRANT_PUBLIC_KEY, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT } from '../d3-run1-launcher/owner-grant-key.mjs';

const exec = promisify(execFile);
const hex40 = /^[a-f0-9]{40}$/;
const hex64 = /^[a-f0-9]{64}$/;
const base = '725d25202c9085882ef80904a669bd39f0f1b39d';
const ledgerPath = 'tools/d3-24-ratification/external-project-ledger.jsonl';
const ledgerSha256 = 'eaffd7521b905b995dba26150190c44592822e6e052509b3d65815adde25404d';
const receipts = new WeakMap();
const artifacts = Object.freeze({
  wrapper: 'tools/d3-24-operational/launch.ps1',
  entry: 'tools/d3-24-operational/live.mjs',
  captureChild: 'tools/d3-24-activation/receipt-child.mjs',
  exportQuery: 'tools/d3-24-ratification/owner-export.sql',
});
export const D324_CAPTURE_PROFILE = Object.freeze({
  schema: 'BYETERY_D324_CAPTURE_PROFILE_V1',
  taskId: 'D3-24-RUN1', runId: 'RUN1',
  receiptCaptureTree: '366c0da0ae557749e6fae10f96115888667237c4',
  evidenceCaptureTree: '0d67dddb9bca5d09bceb286115c67f43d4eddb92',
});
const bytes = value => Buffer.from(canonical(value) + '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
export const D324_CAPTURE_PROFILE_SHA256 = hash(bytes(D324_CAPTURE_PROFILE));
function requireThat(ok, code) { if (!ok) throw Error(code); }
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');

async function git(root, ...args) {
  requireThat(!Object.keys(process.env).some(k => /^GIT_/i.test(k) && k.toUpperCase() !== 'GIT_PAGER'),
    'D324_CAPTURE_GIT_ENV_REJECTED');
  try {
    return (await exec('git', ['--no-replace-objects', ...args], {
      cwd: root, windowsHide: true, timeout: 10_000, encoding: 'buffer', maxBuffer: 2_097_152,
    })).stdout;
  } catch { throw Error('D324_CAPTURE_GIT_REJECTED'); }
}
const gitText = async (root, ...args) => (await git(root, ...args)).toString('utf8').trim();

async function physicalRoot(input) {
  requireThat(typeof input === 'string' && isAbsolute(input) && resolve(input) === input,
    'D324_CAPTURE_ROOT_REJECTED');
  const root = await fs.realpath(input);
  requireThat(root === input && await fs.realpath(await gitText(root, 'rev-parse', '--show-toplevel')) === root,
    'D324_CAPTURE_ROOT_REJECTED');
  return root;
}

async function exactFile(root, name, blob, sha256) {
  const file = join(root, ...name.split('/'));
  const info = await fs.lstat(file);
  requireThat(info.isFile() && !info.isSymbolicLink() && info.size <= 2_097_152 && await fs.realpath(file) === file,
    'D324_CAPTURE_FILE_REJECTED');
  const raw = await fs.readFile(file);
  const object = createHash('sha1').update(Buffer.from('blob ' + raw.length + '\0')).update(raw).digest('hex');
  requireThat(object === blob && (!sha256 || hash(raw) === sha256), 'D324_CAPTURE_BYTES_REJECTED');
}

async function checkSnapshot(root, binding) {
  const { target } = binding;
  requireThat(await gitText(root, 'rev-parse', '--verify', target.sha + '^{commit}') === target.sha &&
    await gitText(root, 'rev-parse', target.sha + '^{tree}') === target.tree &&
    await gitText(root, 'rev-list', '--parents', '-n', '1', target.sha) === target.sha + ' ' + target.parent,
  'D324_CAPTURE_COMPOSITION_REJECTED');
  await git(root, 'merge-base', '--is-ancestor', base, target.sha);
  requireThat(!await gitText(root, 'for-each-ref', '--count=1', 'refs/replace'), 'D324_CAPTURE_REPLACEMENT_REJECTED');
  // HEAD is a continuity observation, never the source of the approved pin.
  requireThat(await gitText(root, 'rev-parse', 'HEAD') === target.sha &&
    !await gitText(root, 'status', '--porcelain=v1', '--untracked-files=all') &&
    !(await gitText(root, 'ls-files', '-v')).split('\n').some(line => /^[a-zS] /.test(line)),
  'D324_CAPTURE_CHECKOUT_REJECTED');
  for (const [directory, tree] of [
    ['tools/d3-receipt-capture', D324_CAPTURE_PROFILE.receiptCaptureTree],
    ['tools/d3-evidence-capture', D324_CAPTURE_PROFILE.evidenceCaptureTree],
  ]) {
    requireThat(await gitText(root, 'rev-parse', target.sha + ':' + directory) === tree,
      'D324_CAPTURE_TREE_REJECTED');
    const entries = (await git(root, 'ls-tree', '-rz', target.sha, '--', directory)).toString('utf8').split('\0').filter(Boolean);
    requireThat(entries.length > 0 && entries.length <= 100, 'D324_CAPTURE_TREE_REJECTED');
    for (const row of entries) {
      const parsed = /^(100644|100755) blob ([a-f0-9]{40})\t([A-Za-z0-9_./-]+)$/.exec(row);
      requireThat(parsed && parsed[3].startsWith(directory + '/') && !parsed[3].split('/').includes('..'),
        'D324_CAPTURE_TREE_REJECTED');
      await exactFile(root, parsed[3], parsed[2]);
    }
  }
  for (const [name, path] of Object.entries(artifacts)) {
    await exactFile(root, path, await gitText(root, 'rev-parse', target.sha + ':' + path), binding.artifacts[name]);
  }
  await exactFile(root, ledgerPath, await gitText(root, 'rev-parse', target.sha + ':' + ledgerPath), ledgerSha256);
  requireThat(await gitText(root, 'rev-parse', 'HEAD') === target.sha &&
    !await gitText(root, 'status', '--porcelain=v1', '--untracked-files=all'), 'D324_CAPTURE_CHECKOUT_CHANGED');
}

/** Capture-only approval. No grant, Auth, signing, admission or dispatch port.
 * The caller cannot select a key, tree, profile digest or composition pin.
 * Manifest fields are trusted only after the fixed owner's V3 signature. */
export async function verifyD324CaptureProfile(rootInput, input) {
  requireThat(exact(input, ['taskId', 'manifestBytes', 'manifestApproval']) &&
    input.taskId === D324_CAPTURE_PROFILE.taskId, 'D324_CAPTURE_IDENTITY_REJECTED');
  requireThat(Buffer.isBuffer(input.manifestBytes) && input.manifestBytes.length > 0 && input.manifestBytes.length <= 8192,
    'D324_CAPTURE_MANIFEST_REJECTED');
  const raw = Buffer.from(input.manifestBytes);
  let manifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { throw Error('D324_CAPTURE_MANIFEST_REJECTED'); }
  requireThat(raw.equals(bytes(manifest)) && exact(manifest, ['schema', 'target', 'identity', 'networkId', 'deploymentId',
    'operator', 'ledgerSha256', 'budget', 'artifacts', 'k5Sha256', 'sessionControlSha256', 'binaries', 'operatorRoot']),
  'D324_CAPTURE_MANIFEST_REJECTED');
  verifyDetachedEd25519(Buffer.from('BYETERY-D324-MANIFEST-APPROVAL-V3\n' + hash(raw) + '\n'), input.manifestApproval,
    OWNER_GRANT_PUBLIC_KEY, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT);
  requireThat(manifest.schema === 'BYETERY_D324_FINAL_ACTIVATION_V3' && manifest.networkId === SPEC.networkId &&
    manifest.deploymentId === SPEC.deployment, 'D324_CAPTURE_MANIFEST_REJECTED');
  const id = manifest.identity;
  requireThat(exact(id, ['taskId', 'runId', 'businessSha', 'planHash', 'batteryId', 'recipient']) &&
    id.taskId === D324_CAPTURE_PROFILE.taskId && id.runId === D324_CAPTURE_PROFILE.runId &&
    id.batteryId === 'BYE-D3-R1-20261111-DCDE088CA870' &&
    id.recipient === 'GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS' &&
    typeof id.businessSha === 'string' && hex40.test(id.businessSha) &&
    typeof id.planHash === 'string' && hex64.test(id.planHash), 'D324_CAPTURE_IDENTITY_REJECTED');
  requireThat(exact(manifest.target, ['sha', 'parent', 'tree']) && Object.values(manifest.target).every(v => typeof v === 'string' && hex40.test(v)) &&
    exact(manifest.operator, ['sha', 'parent', 'tree']) && Object.values(manifest.operator).every(v => typeof v === 'string' && hex40.test(v)) &&
    manifest.operator.sha === id.businessSha, 'D324_CAPTURE_COMPOSITION_REJECTED');
  requireThat(exact(manifest.artifacts, [...Object.keys(artifacts), 'captureProfileSha256']) &&
    Object.values(manifest.artifacts).every(v => typeof v === 'string' && hex64.test(v)) &&
    manifest.artifacts.captureProfileSha256 === D324_CAPTURE_PROFILE_SHA256, 'D324_CAPTURE_PROFILE_REJECTED');
  requireThat(canonical(manifest.budget) === canonical({ historicalConfirmed: 5, limitWithoutContingency: 19,
    remaining: 14, runCap: 5, tx20Authorized: false }), 'D324_CAPTURE_BUDGET_REJECTED');
  requireThat([manifest.ledgerSha256, manifest.k5Sha256, manifest.sessionControlSha256].every(v => typeof v === 'string' && hex64.test(v)) &&
    manifest.ledgerSha256 === ledgerSha256 &&
    exact(manifest.binaries, ['nodeSha256', 'pwshSha256']) && Object.values(manifest.binaries).every(v => typeof v === 'string' && hex64.test(v)) &&
    typeof manifest.operatorRoot === 'string' && isAbsolute(manifest.operatorRoot), 'D324_CAPTURE_MANIFEST_REJECTED');
  const root = await physicalRoot(rootInput);
  const binding = { root, target: Object.freeze({ ...manifest.target }), artifacts: Object.freeze({ ...manifest.artifacts }) };
  await checkSnapshot(root, binding);
  const proof = Object.freeze({ taskId: id.taskId, compositionSha: manifest.target.sha,
    manifestSha256: hash(raw), captureProfileSha256: D324_CAPTURE_PROFILE_SHA256, authority: 'CAPTURE_READ_ONLY', liveAuthority: false });
  receipts.set(proof, binding);
  return proof;
}

/** Recheck mutable checkout bytes before each read-only capture. A serialized
 * proof or a token from another root cannot authorize a different checkout. */
export async function assertD324CaptureContinuity(rootInput, proof) {
  const binding = receipts.get(proof);
  requireThat(binding && await physicalRoot(rootInput) === binding.root, 'D324_CAPTURE_PROOF_REJECTED');
  await checkSnapshot(binding.root, binding);
}
