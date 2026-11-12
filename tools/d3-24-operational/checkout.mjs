import { execFileSync } from 'node:child_process';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, read } from '../d3-evidence-capture/common.mjs';
import { strictJson } from '../d3-evidence-capture/owner-export.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { checkedOutCommit, checkSharedGitDirectory } from '../d3-run1-launcher/f1-checkout.mjs';
import { BASELINE, d324ControlPaths } from '../d3-24-ratification/composition.mjs';
import { verifyD324OperatorCommit } from '../d3-24-ratification/operator-identity.mjs';
import { readD324Ledger, readD324Plan, OWNER_QUERY_SHA256, OWNER_QUERY_URL } from '../d3-24-ratification/identity.mjs';
import { NORMAL_JWT_EXPIRY_SECONDS, RATIFIED_OPERATIONAL_COMMIT } from './policy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reviewCommit = 'ae50b48399aefdc68339ac55d3f214adc77349a4';
const reviewTree = 'b78dc38db7e9c4579cb63fa2952659119c1928e7';
const manifestPath = 'tools/d3-24-ratification/composition-files.json';
const manifestSha = 'd77a5e9477723d09350d85ad19002ba1d44c0f40496fbeb238379439a2680250';
const operationalPaths = [
  ...['README.md', 'bindings.mjs', 'checkout.mjs', 'launch.ps1', 'live.mjs', 'operational.test.mjs', 'policy.mjs',
    'postgres.test.mjs'].map(file => 'A\ttools/d3-24-operational/' + file),
  'M\ttools/d3-run1-launcher/boundaries.mjs',
  'M\ttools/d3-run1-launcher/session-pins.mjs',
].sort().join('\n');

async function entry(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function checkControlDirectory(controls) {
  const directory = dirname(controls.journal);
  const info = await entry(directory);
  check(!info || info.isDirectory() && !info.isSymbolicLink() && await realpath(directory) === directory,
    'D324_CONTROL_DIRECTORY_REJECTED');
}

export async function readD324Journal(controls) {
  await checkControlDirectory(controls);
  const info = await entry(controls.journal);
  if (!info) return Buffer.alloc(0);
  check(info.isFile() && !info.isSymbolicLink() && await realpath(controls.journal) === controls.journal,
    'D324_JOURNAL_REJECTED');
  const file = await open(controls.journal, 'r');
  try {
    const stat = await file.stat();
    check(stat.isFile() && stat.size <= 262_144, 'D324_JOURNAL_REJECTED');
    const bytes = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    check(bytesRead === stat.size, 'D324_JOURNAL_REJECTED');
    return bytes.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

export async function assertD324Unused(controls) {
  await checkControlDirectory(controls);
  for (const path of Object.values(controls)) {
    check(!await entry(path), 'D324_PRIOR_CONTROL_REQUIRES_RECONCILIATION');
  }
}

// Local review accepts the original composition with a draft, or its clean
// direct child with exactly the operational patch. Neither confers authority.
export async function reviewD324Checkout(operatorRoot) {
  check(!Object.keys(process.env).some(key => /^GIT_/i.test(key) && key.toUpperCase() !== 'GIT_PAGER'),
    'D324_GIT_ENV_REJECTED');
  const git = (...args) => execFileSync('git', args, { cwd: root, timeout: 10_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const revision = args => git(...args).toString().trim();
  check(revision(['rev-list', '-n', '1', '--parents', reviewCommit]) === reviewCommit + ' ' + BASELINE &&
    revision(['rev-parse', reviewCommit + '^{tree}']) === reviewTree, 'D324_REVIEW_COMMIT_REJECTED');
  const checkoutCommit = await checkedOutCommit(root, ['backend', 'contracts', 'database', 'frontend', 'package.json', 'package-lock.json',
    'tools/d3-24-ratification', 'tools/d3-receipt-capture', 'tools/d3-evidence-capture',
    'docs/instaward/d3/review/D3-17-FRESH-3RUN']);
  if (checkoutCommit !== reviewCommit) {
    const lineage = revision(['rev-list', '-n', '1', '--parents', checkoutCommit]);
    const scope = revision(['diff', '--name-status', '--no-renames', reviewCommit, checkoutCommit]).split(/\r?\n/).sort().join('\n');
    check(lineage === checkoutCommit + ' ' + reviewCommit && scope === operationalPaths &&
      await checkedOutCommit(root, ['.']) === checkoutCommit, 'D324_REVIEW_CHECKOUT_REJECTED');
  }
  check(revision(['rev-parse', reviewCommit + ':tools/d3-receipt-capture']) === '366c0da0ae557749e6fae10f96115888667237c4' &&
    revision(['rev-parse', reviewCommit + ':tools/d3-evidence-capture']) === '0d67dddb9bca5d09bceb286115c67f43d4eddb92',
  'D324_CAPTURE_CHECKOUT_REJECTED');
  const raw = read(join(root, manifestPath), 32_768);
  check(hash(raw) === manifestSha && raw.equals(git('show', reviewCommit + ':' + manifestPath)), 'D324_REVIEW_MANIFEST_REJECTED');
  for (const [path, digest] of Object.entries(strictJson(raw.toString('utf8')).files)) {
    check(hash(git('show', reviewCommit + ':' + path)) === digest && hash(read(join(root, path))) === digest,
      'D324_REVIEW_FILE_REJECTED');
  }
  const operator = verifyD324OperatorCommit();
  check(typeof operatorRoot === 'string' && resolve(operatorRoot) === operatorRoot && await realpath(operatorRoot) === operatorRoot &&
    await checkedOutCommit(operatorRoot, ['.']) === operator.sha, 'D324_OPERATOR_CHECKOUT_REJECTED');
  await checkSharedGitDirectory(root, operatorRoot);
  readD324Plan();
  const ledger = await readD324Ledger();
  check(hash(read(fileURLToPath(OWNER_QUERY_URL))) === OWNER_QUERY_SHA256, 'D324_OWNER_QUERY_REJECTED');
  const common = await realpath(revision(['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const controls = d324ControlPaths(common);
  await assertD324Unused(controls);
  return Object.freeze({ operator, checkoutCommit, reviewCommit, reviewTree, manifestSha, controls, ledger,
    normalJwtExpirySeconds: NORMAL_JWT_EXPIRY_SECONDS, operationalCommit: RATIFIED_OPERATIONAL_COMMIT, liveAuthority: false });
}
