import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { RUN1, requireThat } from './boundaries.mjs';
import { exactRecord } from './grant-schema.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = /^[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
const reject = condition => requireThat(condition, 'SESSION_PINS_REJECTED');
const exec = promisify(execFile);

async function parentPowerShell() {
  reject(process.platform === 'win32' && Number.isSafeInteger(process.ppid) && process.ppid > 0);
  const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await exec(powershell, ['-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); " +
    '(Get-Process -Id ' + process.ppid + ').Path'],
  { windowsHide: true, timeout: 10_000, encoding: 'utf8' });
  return stdout.trim();
}

async function checkedFile(path, maxBytes = Infinity) {
  reject(typeof path === 'string' && isAbsolute(path) && path === resolve(path) && await realpath(path) === path);
  const file = await lstat(path);
  reject(file.isFile() && file.size > 0 && file.size <= maxBytes);
  return readFile(path);
}

function canonicalPin(pin, hasVersion = false) {
  reject(exactRecord(pin, hasVersion ? ['path', 'sha256', 'version'] : ['path', 'sha256']) &&
    typeof pin.path === 'string' && isAbsolute(pin.path) && typeof pin.sha256 === 'string' && hex.test(pin.sha256));
  const { path, sha256, version } = pin;
  return hasVersion ? { path, sha256, version } : { path, sha256 };
}

export function encodeSessionControl(session) {
  reject(exactRecord(session, ['schemaVersion', 'taskId', 'compositionRootSha', 'live', 'wrapper', 'pwsh', 'node']) &&
    session.schemaVersion === 2 && session.taskId === RUN1.taskId &&
    typeof session.compositionRootSha === 'string' && commit.test(session.compositionRootSha));
  const { schemaVersion, taskId, compositionRootSha } = session;
  const live = canonicalPin(session.live);
  const wrapper = canonicalPin(session.wrapper);
  const pwsh = canonicalPin(session.pwsh, true);
  const node = canonicalPin(session.node, true);
  reject(pwsh.version === '7.6.9' && typeof node.version === 'string' && /^v\d+\.\d+\.\d+$/.test(node.version));
  return Buffer.from(JSON.stringify({ schemaVersion, taskId, compositionRootSha, live, wrapper, pwsh, node }) + '\n', 'utf8');
}

export async function verifySessionPins(env, { root, head, parentExecutable = parentPowerShell,
  nodeExecutable = { path: process.execPath, version: process.version } }) {
  const expected = env.BYETERY_K7_SESSION_CONTROL_SHA256;
  reject(typeof expected === 'string' && hex.test(expected));
  const bytes = await checkedFile(env.BYETERY_K7_SESSION_CONTROL_PATH, 8192);
  reject(digest(bytes) === expected);
  const session = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  reject(bytes.equals(encodeSessionControl(session)) && session.compositionRootSha === head);
  const directory = join(await realpath(root), 'tools', 'd3-run1-launcher');
  reject(session.live.path === join(directory, 'live.mjs') && session.wrapper.path === join(directory, 'launch.ps1'));
  reject(await realpath(await parentExecutable()) === session.pwsh.path);
  reject(await realpath(nodeExecutable.path) === session.node.path && nodeExecutable.version === session.node.version);
  await Promise.all([session.live, session.wrapper, session.pwsh, session.node].map(async artifact => {
    reject(digest(await checkedFile(artifact.path)) === artifact.sha256);
  }));
  return expected;
}
