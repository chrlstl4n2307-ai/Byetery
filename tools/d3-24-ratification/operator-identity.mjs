import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hash } from '../d3-evidence-capture/common.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { RUN1 } from './identity.mjs';

const path = 'backend/src/d3/live-operator.ts';
export const operatorCandidate = Object.freeze({
  sha: RUN1.businessSha, parent: 'c6ba2e837ed0f7b81373655b8106b58ecb86a8cd',
  tree: 'c6f55521670be39128bf5bee12b40574d206a66c', blob: '258c09b22196b152d55da5a6302291bca43fa149',
  sourceSha256: 'b4b215a9b1f7aaa6b2b36dd7f478c90022dd103a577fff7f09d2b57a7c01edb9',
});
const root = fileURLToPath(new URL('../../', import.meta.url));

// For the later authorized freeze. This command never writes an object or ref.
export function verifyD324OperatorCommit() {
  check(!Object.keys(process.env).some(key => /^GIT_/i.test(key) && key.toUpperCase() !== 'GIT_PAGER'), 'D324_GIT_ENV_REJECTED');
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const { sha, parent, tree, blob, sourceSha256 } = operatorCandidate;
  try { git('cat-file', '-e', sha + '^{commit}'); } catch { throw Error('D324_OPERATOR_COMMIT_NOT_MATERIALIZED'); }
  const revision = git('rev-list', '--parents', '-n', '1', sha).toString().trim();
  check(revision === sha + ' ' + parent && git('rev-parse', sha + '^{tree}').toString().trim() === tree &&
    git('rev-parse', sha + ':' + path).toString().trim() === blob &&
    git('diff', '--name-only', parent, sha).toString().trim() === path &&
    hash(git('show', sha + ':' + path)) === sourceSha256, 'D324_OPERATOR_COMMIT_IDENTITY_REJECTED');
  return operatorCandidate;
}
