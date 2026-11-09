import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { RUN1, requireThat } from './boundaries.mjs';
import { exactRecord } from './grant-schema.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = /^[a-f0-9]{64}$/;
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
  reject(typeof path === 'string' && isAbsolute(path) && await realpath(path) === resolve(path));
  const file = await lstat(path);
  reject(file.isFile() && file.size > 0 && file.size <= maxBytes);
  return readFile(path);
}

export async function verifySessionPins(env, { root, head, parentExecutable = parentPowerShell }) {
  const expected = env.BYETERY_K7_SESSION_CONTROL_SHA256;
  reject(typeof expected === 'string' && hex.test(expected));
  const bytes = await checkedFile(env.BYETERY_K7_SESSION_CONTROL_PATH, 8192);
  reject(digest(bytes) === expected);
  const session = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  reject(exactRecord(session, ['schemaVersion', 'taskId', 'compositionRootSha', 'live', 'wrapper', 'pwsh']) &&
    session.schemaVersion === 1 && session.taskId === RUN1.taskId && session.compositionRootSha === head);
  const directory = join(await realpath(root), 'tools', 'd3-run1-launcher');
  reject(exactRecord(session.live, ['path', 'sha256']) && session.live.path === join(directory, 'live.mjs'));
  reject(exactRecord(session.wrapper, ['path', 'sha256']) && session.wrapper.path === join(directory, 'launch.ps1'));
  reject(exactRecord(session.pwsh, ['path', 'sha256', 'version']) && session.pwsh.version === '7.6.9' &&
    typeof session.pwsh.path === 'string' && isAbsolute(session.pwsh.path) &&
    await realpath(await parentExecutable()) === session.pwsh.path);
  await Promise.all([session.live, session.wrapper, session.pwsh].map(async artifact => {
    reject(typeof artifact.sha256 === 'string' && hex.test(artifact.sha256) &&
      digest(await checkedFile(artifact.path)) === artifact.sha256);
  }));
  return expected;
}
