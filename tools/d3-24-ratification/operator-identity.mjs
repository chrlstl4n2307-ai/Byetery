import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hash } from '../d3-evidence-capture/common.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { RUN1 } from './identity.mjs';

const path = 'backend/src/d3/live-operator.ts';
export const operatorCandidate = Object.freeze({
  sha: RUN1.businessSha, parent: '4735b83a47d29ab8608f4ed8a1237e1fbe9c8636',
  tree: 'e9f8887867b161e4e681f8533050735a928ca657', blob: 'abdd84e3b320ff0798b639a8293bc88101f6eb0c',
  sourceSha256: '57c67b72f247891f4cd5d8d93a3ce7587915f1333019a94fca81153a983eda4a',
});
const root = fileURLToPath(new URL('../../', import.meta.url));

// For the later authorized freeze. This command never writes an object or ref.
export function verifyD324OperatorCommit() {
  check(!Object.keys(process.env).some(key => /^GIT_/i.test(key) && key.toUpperCase() !== 'GIT_PAGER'), 'D324_GIT_ENV_REJECTED');
  const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const { sha, parent, tree, blob, sourceSha256 } = operatorCandidate;
  try { git('cat-file', '-e', sha + '^{commit}'); } catch { throw Error('D324_OPERATOR_COMMIT_NOT_MATERIALIZED'); }
  const revision = git('rev-list', '--parents', '-n', '1', sha).toString().trim();
  check(revision === sha + ' ' + parent && git('rev-parse', sha + '^{tree}').toString().trim() === tree &&
    git('rev-parse', sha + ':' + path).toString().trim() === blob &&
    git('diff', '--name-only', parent, sha).toString().trim() === path + '\nbackend/tests/d3-operator.test.ts' &&
    hash(git('show', sha + ':' + path)) === sourceSha256, 'D324_OPERATOR_COMMIT_IDENTITY_REJECTED');
  return operatorCandidate;
}
