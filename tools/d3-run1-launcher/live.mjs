import { execFile } from 'node:child_process';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { assertLocalRuntime } from '../../backend/src/d3/operator-guard.ts';
import { RUN1, createReadPreflight, requireThat } from './boundaries.mjs';
import { checkCaptureCheckout, checkedOutCommit } from './f1-checkout.mjs';
import { exactRecord } from './grant-schema.mjs';
import { verifyOwnerGrant } from './grant-verifier.mjs';

export const K4B = 'ca936a661a8666b808e463c905ed8a7a251a9872';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ARGV = Object.freeze(['--live', '--task-id', RUN1.runId, '--expected-sha', RUN1.businessSha]);
const runtimeFields = ['apiOrigin', 'frozenRoot', 'publishableKey', 'readSources', 'secureStore', 'sqlPool'];
const exec = promisify(execFile);
const maxEnvelopeBytes = 4096;

export function localOrigin(value) {
  const url = new URL(value);
  requireThat(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname) &&
    url.port && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash, 'LOOPBACK_REQUIRED');
  return url.origin;
}

export async function gitRead(root, args) {
  return (await exec('git', args, { cwd: root, windowsHide: true, timeout: 10_000, encoding: 'utf8' })).stdout.trim();
}

async function composition() {
  const head = await checkedOutCommit(ROOT);
  const [branch, parent, dirty] = await Promise.all([
    gitRead(ROOT, ['branch', '--show-current']),
    gitRead(ROOT, ['log', '-1', '--format=%P']),
    gitRead(ROOT, ['status', '--porcelain', '--untracked-files=no']),
  ]);
  // The owner grant pins the actual K6 commit. Hardcoding a commit's own SHA here is impossible.
  requireThat(branch === 'instaward/d2-web-mvp' && parent === K4B && !dirty, 'K6_CHECKOUT_REJECTED');
  await checkCaptureCheckout(ROOT, head);
  return head;
}

async function readEnvelope(env) {
  requireThat(typeof env.LOCALAPPDATA === 'string' && isAbsolute(env.LOCALAPPDATA), 'OWNER_CUSTODY_PATH_REQUIRED');
  const base = await realpath(env.LOCALAPPDATA);
  const path = join(base, 'OwnerKeyCustody', 'Byetery-D3-RUN1', 'live', 'RUN1-owner-grant-envelope.json');
  requireThat(await realpath(path) === path && (await lstat(path)).isFile(), 'OWNER_CUSTODY_FILE_REQUIRED');
  const file = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(maxEnvelopeBytes + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await file.read(bytes, size, bytes.length - size, null);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    requireThat(size > 0 && size <= maxEnvelopeBytes && !bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])),
      'ENVELOPE_SIZE_OR_ENCODING_REJECTED');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
  } finally {
    await file.close();
  }
}

function runtimeReady(runtime) {
  requireThat(exactRecord(runtime, runtimeFields) && localOrigin(runtime.apiOrigin) === runtime.apiOrigin &&
    typeof runtime.frozenRoot === 'string' && isAbsolute(runtime.frozenRoot) &&
    typeof runtime.publishableKey === 'string' && runtime.publishableKey.length > 0 &&
    typeof runtime.readSources === 'function' && typeof runtime.secureStore?.resolve === 'function' &&
    typeof runtime.sqlPool?.connect === 'function', 'RUNTIME_BINDING_REJECTED');
}

// Only the direct CLI supplies the real ports. Test callers exercise the same gates without network or admission.
export async function runEntry(argv, env, ports) {
  let stage = 'LOCAL_EXECUTION_REJECTED';
  let binding;
  try {
    assertLocalRuntime(env);
    requireThat(!Object.keys(env).some(key => /^GIT_/i.test(key) && key.toUpperCase() !== 'GIT_PAGER'), 'GIT_ENV_REJECTED');
    stage = 'EXACT_ARGV_REQUIRED';
    requireThat(argv.length === ARGV.length && ARGV.every((arg, index) => arg === argv[index]), stage);
    stage = 'COMPOSITION_CHECKOUT_REJECTED';
    const head = await ports.composition();
    stage = 'OWNER_GRANT_REJECTED';
    const envelope = JSON.parse(await ports.readEnvelope(env));
    requireThat(exactRecord(envelope, ['grant', 'signature']), stage);
    ports.verifyGrant(envelope, head);
    stage = 'RUNTIME_BINDING_REJECTED';
    binding = await ports.bindRuntime({ head, env });
    runtimeReady(binding.runtime);
    requireThat(typeof binding.preAdmission === 'function' && typeof binding.close === 'function', stage);
    stage = 'PRE_ADMISSION_READS_REJECTED';
    await binding.preAdmission();
    await createReadPreflight(binding.runtime.readSources)();
    await binding.preAdmission();
    stage = 'COMPOSITION_CHECKOUT_REJECTED';
    requireThat(await ports.composition() === head, stage);
    stage = 'OWNER_GRANT_REJECTED';
    ports.verifyGrant(envelope, head);
    stage = 'RUN1_STOP_REQUIRES_RECONCILIATION';
    ports.ready();
    const result = await ports.launch(envelope, binding.runtime);
    return result?.status === 'LIVE_CAPTURE_COMPLETE' ? 'LIVE_CAPTURE_COMPLETE' : stage;
  } catch {
    return stage;
  } finally {
    if (typeof binding?.close === 'function') {
      try { await binding.close(); } catch { /* Keep runtime diagnostics out of stdout and stderr. */ }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const status = await runEntry(process.argv.slice(2), process.env, {
    composition,
    readEnvelope,
    verifyGrant: verifyOwnerGrant,
    bindRuntime: async options => (await import('./live-runtime.mjs')).bindRuntime({
      ...options, root: ROOT, gitRead, localOrigin,
    }),
    ready: () => process.stdout.write('RUN1_PRE_ADMISSION_READS=PASS\n'),
    launch: async (envelope, runtime) => (await import('./launcher.mjs')).launchRun1(envelope, runtime),
  });
  process.stdout.write(status + '\n');
  process.exitCode = status === 'LIVE_CAPTURE_COMPLETE' ? 0 : 1;
}
