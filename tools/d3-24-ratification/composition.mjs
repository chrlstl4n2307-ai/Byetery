import { execFile } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertLocalRuntime } from '../../backend/src/d3/operator-guard.ts';
import { canonical, hash, read } from '../d3-evidence-capture/common.mjs';
import { strictJson } from '../d3-evidence-capture/owner-export.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { checkCaptureCheckout, checkedOutCommit, checkSharedGitDirectory } from '../d3-run1-launcher/f1-checkout.mjs';
import { replayD324Launcher } from '../d3-run1-launcher/launcher.mjs';
import { captureD324Receipt, verifyD324CapturedTransaction, verifyD324CaptureInventory } from './capture.mjs';
import { hex, OWNER_QUERY_SHA256, OWNER_QUERY_URL, readD324Ledger, readD324Plan, RUN1, RUN_CAP } from './identity.mjs';
import { verifyD324OperatorCommit } from './operator-identity.mjs';
import { verifyD324OwnerExport } from './owner-export.mjs';
import { projectD324Journal, readD324Snapshots, verifyD324Completion, verifyD324Readiness } from './readiness.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);
export const BASELINE = '864dd0c537fa6f0c6ff0eb9733323cc049278e20';
const manifestPath = 'tools/d3-24-ratification/composition-files.json';
const profileRoot = 'tools/d3-24-ratification/';
const historicalPlan = 'docs/instaward/d3/review/D3-17-FRESH-3RUN';
const review = 'OFFLINE_SYNTHETIC';
const commonChanges = new Set([
  'tools/d3-evidence-capture/owner-export.mjs',
  'tools/d3-evidence-capture/verifier.mjs',
  'tools/d3-run1-launcher/launcher.mjs',
  'tools/d3-run1-launcher/live-chain.mjs',
  'tools/d3-run1-launcher/live-readiness.mjs',
  'tools/d3-run1-launcher/live-sql.mjs',
  'tools/d3-run1-launcher/confirmed-journal.test.mjs',
]);
const validPath = path => /^[a-z0-9._/-]+$/i.test(path) &&
  !path.split('/').some(part => !part || part === '.' || part === '..') &&
  (commonChanges.has(path) || path.startsWith(profileRoot));

const git = async (...args) => (await exec('git', args, { cwd: root, windowsHide: true, timeout: 10_000 })).stdout;

export function d324ControlPaths(common) {
  check(isAbsolute(common), 'D324_CONTROL_DIRECTORY_REJECTED');
  const operator = join(common, 'byetery-d3-operator');
  return Object.freeze({
    admission: join(common, 'byetery-d3-24-run1.launcher-admission'),
    operatorLock: join(operator, 'operator.lock'),
    journal: join(operator, RUN1.taskId + '-' + RUN1.businessSha + '.jsonl'),
    budget: join(operator, RUN1.planHash + '.budget'),
    consumed: join(operator, RUN1.batteryId + '.consumed'),
  });
}

async function verifyFiles(expectedSha256) {
  check(typeof expectedSha256 === 'string' && hex.test(expectedSha256), 'D324_COMPOSITION_PIN_REQUIRED');
  const raw = read(join(root, manifestPath), 32_768);
  check(hash(raw) === expectedSha256, 'D324_COMPOSITION_MANIFEST_REJECTED');
  const manifest = strictJson(raw.toString('utf8'));
  check(raw.toString('utf8') === canonical(manifest) + '\n' &&
    Object.keys(manifest).sort().join(',') === 'baseline,files,identity,mode,schema' &&
    manifest.schema === 'BYETERY_D324_COMPOSITION_REVIEW_V1' && manifest.mode === 'REVIEW_ONLY' &&
    manifest.baseline === BASELINE && canonical(manifest.identity) === canonical(RUN1), 'D324_COMPOSITION_IDENTITY_REJECTED');
  const files = Object.entries(manifest.files);
  check(files.length > 0 && files.length <= 32 && files.every(([path, digest]) => validPath(path) &&
    path !== manifestPath && typeof digest === 'string' && hex.test(digest)), 'D324_COMPOSITION_SCOPE_REJECTED');
  const [tracked, untracked, staged, flags] = await Promise.all([
    git('diff', '--name-only', '-z', BASELINE), git('ls-files', '--others', '--exclude-standard', '-z'),
    git('diff', '--cached', '--name-only', '-z'), git('ls-files', '-v', '-z'),
  ]);
  const changed = [...new Set((tracked + untracked).split('\0').filter(Boolean))].sort();
  check(!staged && !flags.split('\0').some(line => /^[a-zS] /.test(line)) &&
    canonical(changed) === canonical([...files.map(([path]) => path), manifestPath].sort()),
  'D324_COMPOSITION_SCOPE_REJECTED');
  for (const [path, digest] of files) check(hash(read(join(root, path))) === digest, 'D324_COMPOSITION_FILE_REJECTED');
}

export async function reviewD324Composition({ operatorRoot, manifestSha256 }) {
  assertLocalRuntime();
  check(!Object.keys(process.env).some(key => /^GIT_/i.test(key) && key.toUpperCase() !== 'GIT_PAGER'), 'D324_GIT_ENV_REJECTED');
  check(typeof operatorRoot === 'string' && isAbsolute(operatorRoot) && resolve(operatorRoot) === operatorRoot &&
    await realpath(operatorRoot) === operatorRoot, 'D324_OPERATOR_PATH_REJECTED');
  check(await checkedOutCommit(root, ['backend', 'contracts', 'database', 'frontend', 'package.json', 'package-lock.json', historicalPlan]) === BASELINE,
    'D324_COMPOSITION_BASELINE_REJECTED');
  await checkCaptureCheckout(root, BASELINE);
  await verifyFiles(manifestSha256);
  const operator = verifyD324OperatorCommit();
  await checkSharedGitDirectory(root, operatorRoot);
  check(await checkedOutCommit(operatorRoot, ['.']) === operator.sha, 'D324_OPERATOR_CHECKOUT_REJECTED');
  const operatorFile = join(operatorRoot, 'backend/src/d3/live-operator.ts');
  const source = read(operatorFile).toString('utf8').replaceAll('\r\n', '\n');
  check(hash(source) === operator.sourceSha256, 'D324_OPERATOR_CHECKOUT_REJECTED');
  readD324Plan();
  const ledger = await readD324Ledger();
  check(hash(read(fileURLToPath(OWNER_QUERY_URL))) === OWNER_QUERY_SHA256 && ledger.txAuthorized === false &&
    ledger.contingencyAuthorized === false && ledger.runCap === RUN_CAP, 'D324_COMPOSITION_PROFILE_REJECTED');
  const common = await realpath((await git('rev-parse', '--path-format=absolute', '--git-common-dir')).trim());
  const controls = d324ControlPaths(common);
  for (const file of Object.values(controls)) {
    try { await lstat(file); throw Error('D324_PRIOR_CONTROL_REQUIRES_RECONCILIATION'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const descriptor = Object.freeze({ ...RUN1, baseline: BASELINE, manifestSha256, operator, operatorFile,
    historicalConfirmed: ledger.confirmedConsumed, remainingExternal: ledger.remaining, runCap: RUN_CAP,
    tx20Authorized: false, mode: 'REVIEW_ONLY', preLiveAuthority: false, liveAuthority: false });
  let replayed = false;
  return Object.freeze({
    descriptor,
    readSnapshots: readD324Snapshots,
    verifyCapture: verifyD324CapturedTransaction,
    verifyCompletion: verifyD324Completion,
    verifyReadiness: verifyD324Readiness,
    verifyOwnerExport: verifyD324OwnerExport,
    replay(options) {
      check(!replayed && options.identity === RUN1 && options.mode === review, 'D324_REPLAY_IDENTITY_REJECTED');
      replayed = true;
      let baseline;
      let completed = 0;
      const confirmReadiness = async () => {
        const snapshot = await options.readSnapshot();
        const verified = await verifyD324Readiness({ ...snapshot, baseline });
        check(verified.completed === completed, 'D324_REPLAY_PREFIX_REJECTED');
        baseline = verified.baseline;
      };
      return replayD324Launcher({
        ...options,
        // In-memory synthetic replay has no claim, admission or retry port.
        admitOnce: async () => {},
        operatorFactory: async () => {
          await confirmReadiness();
          const operator = await options.operatorFactory();
          return {
            async step(operation) {
              await confirmReadiness();
              const evidence = await operator.step(operation);
              const journal = projectD324Journal((await options.readSnapshot()).journalBytes);
              const row = journal.at(-1);
              check(journal.length === completed + 1 && row.operation === operation &&
                row.operationId === evidence.operationId && row.transactionHash === evidence.transactionHash &&
                row.domainState === evidence.confirmedBatteryState && row.rewardState === evidence.confirmedRewardState &&
                (row.requestId ?? null) === evidence.requestId, 'D324_REPLAY_JOURNAL_REJECTED');
              completed++;
              return evidence;
            },
            async countingDecision() {
              const snapshot = await options.readSnapshot();
              await verifyD324Completion({ ...snapshot, baseline });
              return operator.countingDecision();
            },
            close: () => operator.close(),
          };
        },
        capture: async (scope, attempt) => {
          const readers = options.receiptReaders(scope, attempt);
          check(readers?.classification === review, 'D324_SYNTHETIC_RECEIPT_REQUIRED');
          return captureD324Receipt(scope, readers);
        },
      }, {
        verifyPlan: readD324Plan,
        verifyCapture: ({ directory }, scope) => verifyD324CaptureInventory(directory, scope, review),
      });
    },
    verifyJournal: projectD324Journal,
  });
}
