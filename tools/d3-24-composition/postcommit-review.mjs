import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical } from '../d3-evidence-capture/common.mjs';
import { inspectV3ManifestFields, verifyMaterializedV3Capture } from './manifest-v3.mjs';
import { COMPONENTS } from './pins.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';
import { operatorCandidate } from '../d3-24-ratification/operator-identity.mjs';
import { D324_CAPTURE_PROFILE_SHA256 } from '../d3-24-capture-profile/profile.mjs';

// A PREVIOUSLY materialized, immutable review target. This is not the SHA of
// this new verifier patch or an approval for any descendant/operational launch.
export const MATERIALIZED_D324_PROFILE = Object.freeze({
  schema: 'BYETERY_D324_MATERIALIZED_REVIEW_V1',
  sha: 'a329c8d7c13530fefd0a4cdc821855f69759c0d9',
  parent: '21f5e3e7a27759d02a0477c374b7e37f35f96909',
  tree: 'cbc5181010663e2e36ae8e86d38f9fcef8908cf9',
  operatorSha: 'd85e54e00e98c8d8bc6294c883708a701ce55440',
  operatorParent: '4735b83a47d29ab8608f4ed8a1237e1fbe9c8636',
  operatorTree: 'e9f8887867b161e4e681f8533050735a928ca657',
  planHash: '0435d8436d13881ebbdf31e729cf36a80e538bc149300219353f68817b37d72d',
  captureProfileSha256: '8b4d53d22e0ea725550a1c43cd7a82bd2e8cb7f6b28dee06b1ec55f4fc4dd34d',
  evidenceTree: '0d67dddb9bca5d09bceb286115c67f43d4eddb92',
  receiptTree: '366c0da0ae557749e6fae10f96115888667237c4',
  ledgerSha256: 'eaffd7521b905b995dba26150190c44592822e6e052509b3d65815adde25404d',
});
const pin = MATERIALIZED_D324_PROFILE;
const check = (ok, code) => { if (!ok) throw Error(code); };
const hash = raw => createHash('sha256').update(raw).digest('hex');
function git(root, ...args) {
  check(!Object.keys(process.env).some(k => /^GIT_/i.test(k) && k.toUpperCase() !== 'GIT_PAGER'),
    'D324_MATERIALIZED_GIT_ENV_REJECTED');
  try {
    return execFileSync('git', ['--no-replace-objects', ...args], {
      cwd: root, windowsHide: true, timeout: 10000, maxBuffer: 4194304, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch { throw Error('D324_MATERIALIZED_GIT_REJECTED'); }
}
const text = (root, ...args) => git(root, ...args).toString('utf8').trim();
function rootPath(root) {
  check(typeof root === 'string' && isAbsolute(root) && resolve(root) === root && fs.realpathSync(root) === root,
    'D324_MATERIALIZED_ROOT_REJECTED');
  check(fs.realpathSync(text(root, 'rev-parse', '--show-toplevel')) === root, 'D324_MATERIALIZED_ROOT_REJECTED');
}
function unchanged(root) {
  check(text(root, 'rev-parse', 'HEAD') === pin.sha, 'D324_MATERIALIZED_SHA_REJECTED');
  check(!text(root, 'status', '--porcelain=v1', '--untracked-files=all') &&
    !text(root, 'ls-files', '-v').split('\n').some(line => /^[a-zS] /.test(line)) &&
    !text(root, 'for-each-ref', '--count=1', 'refs/replace'), 'D324_MATERIALIZED_CHECKOUT_REJECTED');
}

/** Exact read-only snapshot review, never manifest/custody/admission authority.
 * The caller may choose a physical checkout path, but cannot supply any pins. */
export async function reviewMaterializedComposition(root) {
  check(arguments.length === 1, 'D324_MATERIALIZED_OPTIONS_REJECTED');
  rootPath(root);
  unchanged(root);
  check(text(root, 'rev-list', '--parents', '-n', '1', pin.sha) === pin.sha + ' ' + pin.parent &&
    text(root, 'rev-parse', pin.sha + '^{tree}') === pin.tree && COMPONENTS.server === pin.parent,
    'D324_MATERIALIZED_OBJECT_REJECTED');
  check(operatorCandidate.sha === pin.operatorSha && RUN1.businessSha === pin.operatorSha && RUN1.planHash === pin.planHash &&
    operatorCandidate.parent === pin.operatorParent && operatorCandidate.tree === pin.operatorTree &&
    text(root, 'rev-list', '--parents', '-n', '1', pin.operatorSha) === pin.operatorSha + ' ' + pin.operatorParent &&
    text(root, 'rev-parse', pin.operatorSha + '^{tree}') === pin.operatorTree,
    'D324_MATERIALIZED_OPERATOR_REJECTED');
  check(hash(git(root, 'show', pin.operatorSha + ':backend/src/d3/live-operator.ts')) === operatorCandidate.sourceSha256,
    'D324_MATERIALIZED_OPERATOR_REJECTED');
  check(D324_CAPTURE_PROFILE_SHA256 === pin.captureProfileSha256 &&
    text(root, 'rev-parse', pin.sha + ':tools/d3-evidence-capture') === pin.evidenceTree &&
    text(root, 'rev-parse', pin.sha + ':tools/d3-receipt-capture') === pin.receiptTree,
    'D324_MATERIALIZED_CAPTURE_REJECTED');

  // Git status alone is insufficient: filters/assume-unchanged or a change
  // after the clean observation must not hide physical byte drift.
  const entries = git(root, 'ls-tree', '-rz', pin.sha).toString('utf8').split('\0').filter(Boolean);
  check(entries.length > 0 && entries.length <= 4096, 'D324_MATERIALIZED_TREE_REJECTED');
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    check(match && !isAbsolute(match[3]) && !/[\\:\r\n]/.test(match[3]) &&
      match[3].split('/').every(part => part && part !== '.' && part !== '..'), 'D324_MATERIALIZED_TREE_REJECTED');
    const path = join(root, ...match[3].split('/')), stat = fs.lstatSync(path);
    check(stat.isFile() && !stat.isSymbolicLink() && fs.realpathSync(path) === path, 'D324_MATERIALIZED_FILE_REJECTED');
    const raw = fs.readFileSync(path);
    check(createHash('sha1').update(Buffer.from('blob ' + raw.length + '\0')).update(raw).digest('hex') === match[2],
      'D324_MATERIALIZED_BYTES_REJECTED');
  }
  check(hash(fs.readFileSync(join(root, 'tools/d3-24-composition/plans/security-repair-v2.json'))) === pin.planHash,
    'D324_MATERIALIZED_PLAN_REJECTED');
  check(hash(fs.readFileSync(join(root, 'tools/d3-24-ratification/external-project-ledger.jsonl'))) === pin.ledgerSha256,
    'D324_MATERIALIZED_LEDGER_REJECTED');
  unchanged(root);
  return Object.freeze({ classification: 'MATERIALIZED_COMPOSITION_REVIEW_ONLY', profile: pin.schema,
    compositionSha: pin.sha, parent: pin.parent, tree: pin.tree, operatorSha: pin.operatorSha,
    planHash: pin.planHash, checkedFiles: entries.length, externalManifestApproved: false,
    custodyRiskAccepted: false, admissionAuthority: false, liveAuthority: false });
}

/** Shape inspection only. Does not authenticate a signature or approve V3. */
export function inspectPinnedMaterializedV3Fields(raw) {
  check(arguments.length === 1, 'D324_MATERIALIZED_OPTIONS_REJECTED');
  const inspected = inspectV3ManifestFields(raw);
  const manifest = JSON.parse(raw.toString('utf8'));
  check(canonical(manifest.target) === canonical({ sha: pin.sha, parent: pin.parent, tree: pin.tree }),
    'D324_MATERIALIZED_TARGET_REJECTED');
  check(manifest.operator.sha === pin.operatorSha && manifest.operator.parent === pin.operatorParent &&
    manifest.operator.tree === pin.operatorTree && manifest.identity.planHash === pin.planHash &&
    manifest.artifacts.captureProfileSha256 === pin.captureProfileSha256, 'D324_MATERIALIZED_MANIFEST_REJECTED');
  return Object.freeze({ ...inspected, targetSha: pin.sha, externalManifestApproved: false });
}

/** Strict pinned adapter; existing fixed-owner signature/physical capture
 * verifier still supplies any capture-only proof. Never grants LIVE. */
export async function verifyPinnedMaterializedV3Capture(root, input) {
  check(arguments.length === 2 && input && typeof input === 'object' && !Array.isArray(input) &&
    Object.keys(input).sort().join(',') === 'manifestApproval,manifestBytes,taskId' &&
    input.taskId === RUN1.taskId, 'D324_MATERIALIZED_INPUT_REJECTED');
  inspectPinnedMaterializedV3Fields(input.manifestBytes);
  await reviewMaterializedComposition(root);
  return verifyMaterializedV3Capture(root, input);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    check(process.argv.length === 4 && process.argv[2] === '--review-materialized', 'D324_MATERIALIZED_ARGV_REJECTED');
    console.log(JSON.stringify(await reviewMaterializedComposition(process.argv[3])));
  } catch (error) {
    console.log(/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'D324_MATERIALIZED_REVIEW_REJECTED');
    process.exitCode = 1;
  }
}
