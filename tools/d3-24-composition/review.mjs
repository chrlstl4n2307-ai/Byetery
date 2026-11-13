import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { COMPONENTS, COMPOSITION_COMMIT, SIGNER } from './pins.mjs';
import { RUN1, readD324Plan, readD324Ledger } from '../d3-24-ratification/identity.mjs';
import { verifyD324OperatorCommit } from '../d3-24-ratification/operator-identity.mjs';

const hash = raw => createHash('sha256').update(raw).digest('hex');
const check = (ok, code) => { if (!ok) throw Error(code); };
function git(root, ...args) {
  check(!Object.keys(process.env).some(k => /^GIT_/i.test(k) && k !== 'GIT_PAGER'), 'D324_GIT_ENV_REJECTED');
  return execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, windowsHide: true, timeout: 10000 });
}
const revision = (root, ...args) => git(root, ...args).toString().trim();
function paths(root, commit) { return revision(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', commit).split('\n'); }

export async function reviewCompositionCandidate(root) {
  check(isAbsolute(root) && realpathSync(root) === resolve(root), 'D324_CANDIDATE_ROOT_REJECTED');
  check(revision(root, 'rev-parse', 'HEAD') === COMPONENTS.server, 'D324_CANDIDATE_BASE_REJECTED');
  check(!revision(root, 'diff', '--cached', '--name-only'), 'D324_CANDIDATE_INDEX_REJECTED');
  check(!revision(root, 'for-each-ref', '--count=1', 'refs/replace') &&
    !revision(root, 'ls-files', '-v').split('\n').some(line => /^[a-zS] /.test(line)), 'D324_CANDIDATE_INDEX_REJECTED');
  for (const key of ['server', 'operator', 'capture']) {
    check(revision(root, 'rev-list', '--parents', '-n', '1', COMPONENTS[key]) ===
      COMPONENTS[key] + ' ' + COMPONENTS[key + 'Parent'], 'D324_COMPONENT_PARENT_REJECTED');
  }
  for (const [key, count] of [['server', 16], ['capture', 4]]) {
    const list = paths(root, COMPONENTS[key]);
    check(list.length === count, 'D324_COMPONENT_SCOPE_REJECTED');
    for (const path of list) check(readFileSync(join(root, path)).equals(git(root, 'show', COMPONENTS[key] + ':' + path)),
      'D324_COMPONENT_BYTES_REJECTED');
  }
  for (const path of ['tools/d3-24-ratification/plan.json', 'tools/d3-24-ratification/external-project-ledger.jsonl']) {
    check(readFileSync(join(root, path)).equals(git(root, 'show', COMPONENTS.server + ':' + path)), 'D324_HISTORY_REJECTED');
  }
  const operator = verifyD324OperatorCommit(), plan = readD324Plan(), ledger = await readD324Ledger();
  check(operator.sha === COMPONENTS.operator && plan.input.gitSha === operator.sha && ledger.confirmedConsumed === 5 &&
    ledger.runCap === 5 && ledger.remaining === 14 && !ledger.contingencyAuthorized, 'D324_CANDIDATE_SCOPE_REJECTED');
  check(revision(root, 'rev-parse', 'HEAD:tools/d3-evidence-capture') === '0d67dddb9bca5d09bceb286115c67f43d4eddb92' &&
    revision(root, 'rev-parse', 'HEAD:tools/d3-receipt-capture') === '366c0da0ae557749e6fae10f96115888667237c4', 'RATIFIED_CAPTURE_REJECTED');
  return Object.freeze({ classification: 'UNCOMMITTED_COMPOSITION_REVIEW', base: COMPONENTS.server,
    futureCommit: COMPOSITION_COMMIT, futureTree: null, operator, planHash: plan.planHash, taskId: RUN1.taskId,
    batteryId: RUN1.batteryId, remainingExternal: ledger.remaining, tx20Authorized: false, liveAuthority: false });
}

export async function verifyCandidateSignerBinary(root, binary) {
  await reviewCompositionCandidate(root);
  check(isAbsolute(binary) && realpathSync(binary) === resolve(binary), 'D324_SIGNER_PATH_REJECTED');
  const info = lstatSync(binary);
  check(info.isFile() && !info.isSymbolicLink() && info.size === SIGNER.bytes, 'D324_SIGNER_BINARY_REJECTED');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(binary)) digest.update(chunk);
  check(digest.digest('hex') === SIGNER.binarySha256, 'D324_SIGNER_BINARY_REJECTED');
  const source = {};
  for (const line of revision(root, 'ls-tree', '-r', '--name-only', SIGNER.sourceCommit, '--', 'tools/stellar-secure-store-signer').split('\n')) {
    check(readFileSync(join(root, line)).equals(git(root, 'show', SIGNER.sourceCommit + ':' + line)), 'D324_SIGNER_SOURCE_REJECTED');
    source[line] = hash(readFileSync(join(root, line)));
  }
  return Object.freeze({ sourceCommit: SIGNER.sourceCommit, source, binarySha256: SIGNER.binarySha256,
    bytes: info.size, custodyRiskAccepted: false, liveAuthority: false });
}
