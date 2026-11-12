import { execFileSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, hash, read, SPEC } from '../d3-evidence-capture/common.mjs';
import { strictJson } from '../d3-evidence-capture/owner-export.mjs';
import { exactRecord } from '../d3-run1-launcher/grant-schema.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { checkedOutCommit, checkSharedGitDirectory } from '../d3-run1-launcher/f1-checkout.mjs';
import { RUN1, RUN_CAP, hex, readD324Ledger, readD324Plan, OWNER_QUERY_SHA256 } from '../d3-24-ratification/identity.mjs';
import { verifyD324OperatorCommit } from '../d3-24-ratification/operator-identity.mjs';
import { ACTIVATION_PARENT, BOOTSTRAP_BINARIES } from '../d3-24-operational/bootstrap-pins.mjs';

export const BASE_COMMIT = 'da230383715e615b6c45f814c75fa88eb7d63147';
const parentComposition = 'ae50b48399aefdc68339ac55d3f214adc77349a4';
const baseTree = '0a298cb74299f07cb7b602a2879c737485ebc297';
const commit = /^[a-f0-9]{40}$/;

const artifacts = Object.freeze({
  wrapper: 'tools/d3-24-operational/launch.ps1',
  entry: 'tools/d3-24-operational/live.mjs',
  captureChild: 'tools/d3-24-activation/receipt-child.mjs',
  exportQuery: 'tools/d3-24-ratification/owner-export.sql',
});
const manifestKeys = ['schema', 'target', 'identity', 'networkId', 'deploymentId', 'operator', 'ledgerSha256', 'budget',
  'artifacts', 'k5Sha256', 'sessionControlSha256'];

const reviewProofs = new WeakSet();
export const isD324ReviewBinding = value => reviewProofs.has(value);

function gitAt(root, ...args) {
  return execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, windowsHide: true, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
}

// Local Git observations. The final checkout must be clean. Use the previously
// audited checkout for the baseline while the candidate is an uncommitted diff.
export async function observeD324Checkout(root, operatorRoot) {
  check(await realpath(root) === root && await realpath(operatorRoot) === operatorRoot &&
    !Object.keys(process.env).some(k => /^GIT_/i.test(k) && k.toUpperCase() !== 'GIT_PAGER'), 'D324_CHECKOUT_REJECTED');
  const revision = (...args) => gitAt(root, ...args).toString().trim();
  check(revision('rev-list', '--parents', '-n', '1', BASE_COMMIT) === BASE_COMMIT + ' ' + parentComposition &&
    revision('rev-parse', BASE_COMMIT + '^{tree}') === baseTree, 'D324_OPERATIONAL_BASE_REJECTED');
  const sha = await checkedOutCommit(root, ['.']);
  const parents = revision('rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
  check(parents.length === 1, 'D324_CHECKOUT_REJECTED');
  const target = { sha, parent: parents[0], tree: revision('rev-parse', sha + '^{tree}') };
  check(!revision('for-each-ref', '--count=1', 'refs/replace'), 'D324_GIT_REPLACEMENTS_REJECTED');
  const operator = verifyD324OperatorCommit();
  await checkSharedGitDirectory(root, operatorRoot);
  check(root !== operatorRoot && await checkedOutCommit(operatorRoot, ['.']) === operator.sha, 'D324_OPERATOR_CHECKOUT_REJECTED');
  const files = {};
  for (const [name, path] of Object.entries(artifacts)) {
    // The base has no activation capture child; that object must be present in the future child.
    if (sha === BASE_COMMIT && name === 'captureChild') continue;
    const file = join(root, path);
    const digest = hash(read(file, 65_536));
    check(await realpath(file) === file && digest === hash(gitAt(root, 'show', sha + ':' + path)), 'D324_CHECKOUT_ARTIFACT_REJECTED');
    files[name] = digest;
  }
  check(await checkedOutCommit(root, ['.']) === sha, 'D324_CHECKOUT_CHANGED');
  return { target, operator: { sha: operator.sha, parent: operator.parent, tree: operator.tree }, artifacts: files };

}

// The digest is an independent owner-approved pin in the future design. This
// validator returns review facts only, even when every pin matches.
export async function verifyD324RatificationManifest(raw, independentlyPinnedSha256, observed) {
  return verifyManifest(raw, independentlyPinnedSha256, observed, false);
}

export function verifyD324ActivationManifest(raw, approvedDigest, observed) {
  return verifyManifest(raw, approvedDigest, observed, true);
}

async function verifyManifest(raw, independentlyPinnedSha256, observed, final) {
  check(Buffer.isBuffer(raw) && raw.length <= 8192 && hex.test(independentlyPinnedSha256 ?? '') &&
    hash(raw) === independentlyPinnedSha256, 'D324_MANIFEST_DIGEST_REJECTED');
  const data = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  const fields = final ? [...manifestKeys, 'binaries', 'operatorRoot'] : manifestKeys;
  const expectedSchema = final ? 'BYETERY_D324_FINAL_ACTIVATION_V2' : 'BYETERY_D324_ACTIVATION_REVIEW_V1';
  check(raw.equals(Buffer.from(canonical(data) + '\n')) && exactRecord(data, fields) &&
    data.schema === expectedSchema, 'D324_MANIFEST_SCHEMA_REJECTED');
  const { target, operator, identity, budget } = data;
  check(exactRecord(target, ['sha', 'parent', 'tree']) && Object.values(target).every(x => typeof x === 'string' && commit.test(x)) &&
    target.parent === (final ? ACTIVATION_PARENT : BASE_COMMIT) && target.sha !== target.parent &&
    canonical(target) === canonical(observed?.target),
  'D324_MANIFEST_TARGET_REJECTED');
  const pinnedOperator = verifyD324OperatorCommit();
  const pin = { sha: pinnedOperator.sha, parent: pinnedOperator.parent, tree: pinnedOperator.tree };
  check(canonical(operator) === canonical(pin) && canonical(operator) === canonical(observed?.operator),
    'D324_MANIFEST_OPERATOR_REJECTED');
  readD324Plan();
  const ledger = await readD324Ledger();
  check(canonical(identity) === canonical(RUN1) && data.networkId === SPEC.networkId &&
    data.deploymentId === SPEC.deployment && data.ledgerSha256 === ledger.ledgerSha256, 'D324_MANIFEST_PROFILE_REJECTED');
  check(canonical(budget) === canonical({ historicalConfirmed: ledger.confirmedConsumed,
    limitWithoutContingency: 19, remaining: ledger.remaining, runCap: RUN_CAP, tx20Authorized: false }), 'D324_MANIFEST_BUDGET_REJECTED');
  check(exactRecord(data.artifacts, Object.keys(artifacts)) &&
    Object.values(data.artifacts).every(value => typeof value === 'string' && hex.test(value)) &&
    canonical(data.artifacts) === canonical(observed?.artifacts) && data.artifacts.exportQuery === OWNER_QUERY_SHA256 &&
    typeof data.k5Sha256 === 'string' && hex.test(data.k5Sha256) &&
    typeof data.sessionControlSha256 === 'string' && hex.test(data.sessionControlSha256), 'D324_MANIFEST_ARTIFACT_REJECTED');
  if (final) check(canonical(data.binaries) === canonical(BOOTSTRAP_BINARIES) &&
    typeof data.operatorRoot === 'string' && data.operatorRoot === observed?.operatorRoot, 'D324_MANIFEST_RUNTIME_REJECTED');
  const proof = Object.freeze({ sha: target.sha, manifestSha256: independentlyPinnedSha256,
    k5Sha256: data.k5Sha256, sessionControlSha256: data.sessionControlSha256, liveAuthority: false });
  reviewProofs.add(proof);
  return proof;
}
