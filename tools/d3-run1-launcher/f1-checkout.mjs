import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { RUN1, requireThat } from './boundaries.mjs';

const run = promisify(execFile);
const critical = ['backend', 'contracts', 'database', 'frontend', 'tools', 'package.json', 'package-lock.json',
  'docs/instaward/d3/review/D3-17-FRESH-3RUN'];
const captureCommit = '84f1bdd145269c306008f2ae4a1c3648864dd347';
const captureTree = '366c0da0ae557749e6fae10f96115888667237c4';
const evidenceTree = 'cccda6b882bba85f848064ef70d086588c65608b';

async function git(root, args) {
  requireThat(!Object.keys(process.env).some(key => /^GIT_/i.test(key) && key.toUpperCase() !== 'GIT_PAGER'), 'GIT_ENV_OVERRIDE_REJECTED');
  try {
    return (await run('git', args, { cwd: root, windowsHide: true, timeout: 10_000 })).stdout.trim();
  } catch {
    throw new Error('GIT_CHECKOUT_UNAVAILABLE');
  }
}

export async function checkedOutCommit(root, paths = critical) {
  requireThat(await realpath(await git(root, ['rev-parse', '--show-toplevel'])) === await realpath(root),
    'GIT_WORKTREE_REJECTED');
  const commit = await git(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const status = await git(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...paths]);
  const index = await git(root, ['ls-files', '-v', '--', ...paths]);
  requireThat(!status && !index.split('\n').some(line => /^[a-zS] /.test(line)), 'DIRTY_EXECUTION_CHECKOUT');
  requireThat(/^[a-f0-9]{40}$/.test(commit), 'GIT_WORKTREE_REJECTED');
  return commit;
}

export async function checkCaptureCheckout(root, sha) {
  requireThat(await git(root, ['rev-parse', captureCommit + ':tools/d3-receipt-capture']) === captureTree &&
    await git(root, ['rev-parse', sha + ':tools/d3-receipt-capture']) === captureTree &&
    await git(root, ['rev-parse', sha + ':tools/d3-evidence-capture']) === evidenceTree, 'RATIFIED_CAPTURE_REJECTED');
}

export async function frozenOperatorPath(root) {
  requireThat(await checkedOutCommit(root, ['.']) === RUN1.businessSha, 'FROZEN_OPERATOR_SHA_REJECTED');
  const file = join(await realpath(root), 'backend/src/d3/live-operator.ts');
  requireThat(await realpath(file) === file, 'FROZEN_OPERATOR_PATH_REJECTED');
  return file;
}
export async function checkSharedGitDirectory(root, frozenRoot) {
  const args = ['rev-parse', '--path-format=absolute', '--git-common-dir'];
  requireThat(await realpath(await git(root, args)) === await realpath(await git(frozenRoot, args)),
    'FROZEN_OPERATOR_GIT_DIRECTORY_REJECTED');
}
