import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const reviewSha = '3ee1e4e5b5d047ccac6782459aa405a37ead983b';
const reviewParent = '2ae596c578deff3a0eb2a3a9ac3dd8e9c9a74732';
const reviewTree = '0b0119d2adb42aa767490908751c7bb236dd2e93';
const rejected = 'D324_OPERATIONAL_RATIFICATION_REQUIRED';
const demand = ok => { if (!ok) throw Error('D324_BOOTSTRAP_REJECTED'); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const nodeSha = 'b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3';
const pwshSha = '2a6769a3330dc1084d0154bfde7d164ab750ca7f700f313f9d417c1be78b2233';

export function observeV3Checkout(directory, target, { review = false } = {}) {
  demand(!Object.keys(process.env).some(k => /^(?:GIT_|NODE_OPTIONS$|NODE_PATH$)/i.test(k) && k !== 'GIT_PAGER'));
  const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 10_000, windowsHide: true,
  }).trim();
  demand(realpathSync(directory) === directory && realpathSync(git('rev-parse', '--show-toplevel')) === directory &&
    !git('for-each-ref', '--count=1', 'refs/replace') && !git('ls-files', '-v').split('\n').some(row => /^[a-zS] /.test(row)));
  const [sha, parent, ...otherParents] = git('rev-list', '-1', '--parents', 'HEAD').split(' ');
  const actual = { sha, parent, tree: git('rev-parse', 'HEAD^{tree}') };
  demand(parent && otherParents.length === 0 && ['sha', 'parent', 'tree'].every(key => target?.[key] === actual[key]));
  if (review) {
    demand(actual.sha === reviewSha && actual.parent === reviewParent && actual.tree === reviewTree);
  } else {
    demand(actual.parent === reviewSha && !git('status', '--porcelain=v1', '--untracked-files=all') &&
      !git('diff','--name-only','--no-ext-diff','--no-textconv',actual.sha,'--', 'backend','database','contracts','tools/d3-receipt-capture','tools/d3-evidence-capture'));
  }
  return actual;
}

function verifyPowerShellParent(mode) {
  demand(process.platform === 'win32' && process.ppid > 0 && process.execArgv.length === 0);
  const system = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const stdout = execFileSync(system, ['-NoProfile','-NonInteractive','-Command',
    "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); " +
    '$p=Get-CimInstance Win32_Process -Filter "ProcessId = ' + process.ppid + '"; ' +
    '@{path=$p.ExecutablePath; command=$p.CommandLine} | ConvertTo-Json -Compress'],
  { stdio: ['ignore','pipe','pipe'], encoding: 'utf8', timeout: 10_000, windowsHide: true });
  const parent = JSON.parse(stdout);
  const wrapper = join(root, 'tools', 'd3-24-operational', 'launch.ps1');
  const quoted = s => '"' + s + '"';
  const paths = [wrapper, quoted(wrapper)];
  const suffixes = paths.map(path => `-NoProfile -NonInteractive -File ${path} ${mode}`.toLowerCase());
  const command = /^(?:"[^"]+"|\S+)\s+(.+)$/.exec(parent.command ?? '');
  demand(command && suffixes.includes(command[1].trim().toLowerCase()) &&
    hash(readFileSync(realpathSync(parent.path))) === pwshSha &&
    hash(readFileSync(realpathSync(process.execPath))) === nodeSha);
}

function controlFile(directory, name, max) {
  const file = join(directory, name);
  const stat = lstatSync(file);
  demand(stat.isFile() && realpathSync(file) === file && stat.size > 0 && stat.size <= max);
  return readFileSync(file);
}

// Authenticate the external target before loading application modules. Even a
// valid package is a review result until the operational server is ratified.
async function reviewOwnerPackage() {
  const local = process.env.LOCALAPPDATA;
  demand(typeof local === 'string' && isAbsolute(local) && realpathSync(local) === local);
  const directory = join(local, 'OwnerKeyCustody', 'Byetery-D3-RUN1', 'live', 'D3-24-RUN1');
  demand(realpathSync(directory) === directory);
  const raw = controlFile(directory, 'activation-manifest.json', 8192);
  const encoded = controlFile(directory, 'manifest-approval.sig', 87).toString('ascii');
  const der = Buffer.from('MCowBQYDK2VwAyEAYarOLAmvZ9dpaCKhkTRIy1ly8CAuz8WsZtQ-NZRJi38', 'base64url');
  demand(/^[A-Za-z0-9_-]{86}\n$/.test(encoded) && hash(der) === '6dfd3b7cef2c39bae0fd8e9b3625d94f1e20bd16331efcbcf3393d5d551d48b6');
  const sig = Buffer.from(encoded.trimEnd(), 'base64url');
  demand(sig.length === 64 && sig.toString('base64url') + '\n' === encoded && verify(null,
    Buffer.from('BYETERY-D324-MANIFEST-APPROVAL-V3\n' + hash(raw) + '\n'),
    createPublicKey({key:der,type:'spki',format:'der'}), sig));
  const manifest = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  demand(manifest.schema === 'BYETERY_D324_FINAL_ACTIVATION_V3');
  observeV3Checkout(root, manifest.target);
  // Bind the imported entry modules to the approved Git objects as well as HEAD.
  for (const name of ['entry-bootstrap.mjs', 'owner-authorization.mjs', 'final-runtime.mjs', 'private-session-channel.mjs', 'prelive-bridge.mjs']) {
    const path = 'tools/d3-24-operational/' + name;
    const blob = execFileSync('git', ['--no-replace-objects','show',manifest.target.sha + ':' + path],
      {cwd:root,stdio:['ignore','pipe','pipe'],timeout:10000,windowsHide:true});
    demand(controlFile(join(root,'tools','d3-24-operational'),name,65536).equals(blob));
  }
  const { verifyV3OwnerPackage } = await import('./owner-authorization.mjs');
  await verifyV3OwnerPackage(directory, root);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2).join('\0');
    if (args === '--v3-verify-package') {
      verifyPowerShellParent('-V3VerifyPackage');
      await reviewOwnerPackage();
      process.stdout.write('D324_V3_PACKAGE_VERIFIED_REVIEW_ONLY\n');
      process.exit(0);
    }
    demand(args === '--v3-review');
    verifyPowerShellParent('-V3Review');
    observeV3Checkout(root, {sha:reviewSha,parent:reviewParent,tree:reviewTree}, {review:true});
    // Authorization stays external. This review command opens no server port.
    const bootstrap = fileURLToPath(import.meta.url);
    demand(lstatSync(bootstrap).isFile() && realpathSync(bootstrap) === bootstrap);
    process.stdout.write('D324_V3_BOOTSTRAP_REVIEW_PASS\n');
  } catch {
    process.stdout.write(rejected + '\n');
    process.exitCode = 1;
  }
}
