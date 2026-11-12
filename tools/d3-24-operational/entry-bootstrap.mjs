import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The wrapper pins this dependency-free bootstrap before invoking Node.
// This public key is the same owner pin used by the grant verifier.
const ownerKey = 'MCowBQYDK2VwAyEAYarOLAmvZ9dpaCKhkTRIy1ly8CAuz8WsZtQ-NZRJi38';
const ownerFingerprint = '6dfd3b7cef2c39bae0fd8e9b3625d94f1e20bd16331efcbcf3393d5d551d48b6';
const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const launcher = dirname(fileURLToPath(import.meta.url));
const entry = join(launcher, 'live.mjs');
const digest = data => createHash('sha256').update(data).digest('hex');
const safeHex = /^[a-f0-9]{64}$/;
const sha = /^[a-f0-9]{40}$/;
const liveArgs = ['--live', '--task-id', 'D3-24-RUN1', '--expected-sha', 'c50e4eb1f7f538a231c5ecfc31d19283998dc234'];
const activationParent = '436061d6381fccb52e94ae57123c31803ede30e2';

function demand(ok) {
  if (!ok) throw Error('D324_BOOTSTRAP_REJECTED');
}

function read(path, max) {
  const st = lstatSync(path);
  demand(st.isFile() && !st.isSymbolicLink() && st.size > 0 && st.size <= max && realpathSync(path) === path);
  return readFileSync(path);
}

function json(path, max) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read(path, max)));
}

function verifyCleanGit(target) {
  demand(target && sha.test(target.sha) && sha.test(target.tree) && target.parent === activationParent);
  const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 10_000, windowsHide: true }).trim();
  demand(realpathSync(git('rev-parse', '--show-toplevel')) === root &&
    git('rev-list', '-n', '1', '--parents', 'HEAD') === target.sha + ' ' + target.parent &&
    git('rev-parse', 'HEAD^{tree}') === target.tree &&
    !git('status', '--porcelain=v1', '--untracked-files=all') &&
    !git('ls-files', '-v').split('\n').some(line => /^[a-zS] /.test(line)));
}

function approvedEntry() {
  const local = process.env.LOCALAPPDATA;
  demand(typeof local === 'string' && isAbsolute(local) && realpathSync(local) === local);
  const directory = join(local, 'OwnerKeyCustody', 'Byetery-D3-RUN1', 'live', 'D3-24-RUN1');
  demand(realpathSync(directory) === directory);
  const raw = read(join(directory, 'activation-manifest.json'), 8192);
  const encoded = read(join(directory, 'manifest-approval.sig'), 87).toString('ascii');
  demand(/^[A-Za-z0-9_-]{86}\n$/.test(encoded));
  const der = Buffer.from(ownerKey, 'base64url');
  const sig = Buffer.from(encoded.slice(0, -1), 'base64url');
  const key = createPublicKey({ key: der, type: 'spki', format: 'der' });
  demand(digest(der) === ownerFingerprint && sig.length === 64 && sig.toString('base64url') + '\n' === encoded &&
    verify(null, Buffer.from('BYETERY-D324-MANIFEST-APPROVAL-V2\n' + digest(raw) + '\n'), key, sig));
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  demand(manifest.schema === 'BYETERY_D324_FINAL_ACTIVATION_V2' && manifest.identity?.taskId === 'D3-24-RUN1');
  verifyCleanGit(manifest.target);
  demand(safeHex.test(manifest.artifacts?.entry) && digest(read(entry, 65536)) === manifest.artifacts.entry &&
    digest(read(join(launcher, 'launch.ps1'), 65536)) === manifest.artifacts.wrapper);
}

const args = process.argv.slice(2);
const offline = args.length === 2 && args[0] === '--offline-wrapper-check';
try {
  demand(process.execArgv.length === 0 && !Object.keys(process.env).some(k => /^(?:GIT_|NODE_OPTIONS$|NODE_PATH$)/i.test(k) && k.toUpperCase() !== 'GIT_PAGER'));
  if (offline) {
    const dir = args[1];
    demand(isAbsolute(dir) && realpathSync(dir) === dir && dirname(dir) === join(root, '.tools') &&
      /^d324-wrapper-fixture-[A-Za-z0-9]+$/.test(dir.slice(dirname(dir).length + 1)));
    const fixture = json(join(dir, 'fixture.json'), 8192);
    demand(fixture.schema === 'D324_WRAPPER_OFFLINE_FIXTURE_V1' && safeHex.test(fixture.entrySha256) &&
      digest(read(entry, 65536)) === fixture.entrySha256);
  } else {
    demand(args.length === liveArgs.length && liveArgs.every((value, i) => value === args[i]));
    approvedEntry();
  }
  const { runD324Entry } = await import(pathToFileURL(entry).href);
  const result = await runD324Entry(args);
  process.stdout.write(result + '\n');
  process.exitCode = ['D324_WRAPPER_OFFLINE_PASS', 'D324_LIVE_CAPTURE_COMPLETE'].includes(result) ? 0 : 1;
} catch {
  process.stdout.write(offline ? 'D324_OFFLINE_BOOTSTRAP_REJECTED\n' : 'D324_OPERATIONAL_RATIFICATION_REQUIRED\n');
  process.exitCode = 1;
}
