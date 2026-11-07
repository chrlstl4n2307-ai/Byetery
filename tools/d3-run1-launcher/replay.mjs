import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { runDecision } from '../../backend/src/d3/operator-control.ts';
import { createSingleAdmission } from './boundaries.mjs';
import {
  BATTERY_ID, CAPTURE_CHILD_TIMEOUT_MS, FROZEN_SHA, isDirect, replayLauncher,
} from './launcher.mjs';

const execute = promisify(execFile);
const child = fileURLToPath(new URL('./capture-child.mjs', import.meta.url));
const outputRoot = fileURLToPath(new URL('../../.tools/d3-run1-launcher-replay', import.meta.url));
const fixedClock = Date.UTC(2026, 10, 7, 17);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const fixtureUuid = (index) => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
const operations = [
  ['register_battery', 'REGISTERED', 'NOT_ELIGIBLE'],
  ['open_return', 'RETURNED', 'NOT_ELIGIBLE'],
  ['confirm_collection', 'COLLECTED', 'NOT_ELIGIBLE'],
  ['confirm_recycling', 'RECYCLED', 'PENDING'],
  ['pay_reward', 'RECYCLED', 'SENT'],
];

export async function outputDirectory() {
  await mkdir(outputRoot, { recursive: true });
  if (await realpath(outputRoot) !== outputRoot) throw new Error('OFFLINE_OUTPUT_ROOT_REJECTED');
  return mkdtemp(join(outputRoot, 'replay-'));
}

export async function captureInChild(directory, scope, pass, scenario) {
  const output = join(directory, scope.method + '-' + pass);
  // Fixed executable, file and switches. No shell or inherited app environment.
  let response;
  try {
    response = await execute(process.execPath,
      [child, '--offline-replay', scenario, output, JSON.stringify(scope)], {
        env: {},
        windowsHide: true,
        timeout: CAPTURE_CHILD_TIMEOUT_MS,
        maxBuffer: 4096,
      });
  } catch {
    return { output, unavailable: true };
  }
  const info = JSON.parse(response.stdout);
  if (info.mode !== 'OFFLINE_SYNTHETIC' || !Number.isSafeInteger(info.pid) || info.pid === process.pid) {
    throw new Error('CAPTURE_PROCESS_REJECTED');
  }
  return { output, pid: info.pid };
}

export async function preserveReplayIdentity(directory, scope, evidence) {
  const file = await open(join(directory, scope.method + '-identity.json'), 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify({
      classification: 'OFFLINE_SYNTHETIC',
      scope,
      requestId: evidence.requestId,
      confirmationMode: evidence.confirmationMode,
      confirmedAt: evidence.confirmedAt,
      lifecycle: evidence.confirmedBatteryState,
      reward: evidence.confirmedRewardState,
      ...(evidence.payload ? { payload: {
        manifestBase64: evidence.payload.manifestBase64,
        payloadHash: evidence.payload.payloadHash,
      } } : {}),
    }) + '\n');
    await file.sync();
  } finally {
    await file.close();
  }
}

export function fixture(events) {
  let step = 0;
  let closed = false;
  const sessions = ['USER', 'ADMIN', 'COLLECTOR', 'RECYCLER'].map((role, i) => ({
    role, validated: true, sessionId: fixtureUuid(50 + i), expiresAt: fixedClock + 90 * 60_000,
  }));
  return {
    now: () => fixedClock,
    sessionConfig: { source: 'SUPABASE_PROJECT_AUTH_CONFIG', projectRef: 'aemxuqnnwfclzrwwiqfd',
      jwtExpirySeconds: 5400, observedAt: fixedClock },
    observeSessions: () => structuredClone(sessions),
    operator: {
      async step(operation) {
        if (closed || operations[step]?.[0] !== operation) throw new Error('FAKE_SEQUENCE_REJECTED');
        events.push(['step', operation]);
        const [, confirmedBatteryState, confirmedRewardState] = operations[step];
        const index = step++;
        const manifest = Buffer.from('OFFLINE_SYNTHETIC:' + operation);
        return {
          operation, batteryId: BATTERY_ID,
          operationId: fixtureUuid(index + 1),
          transactionHash: sha('OFFLINE_SYNTHETIC:' + operation),
          requestId: index === 0 ? null : sha('OFFLINE_SYNTHETIC:request'),
          confirmedBatteryState, confirmedRewardState,
          confirmationLedger: index + 1,
          confirmedAt: new Date(fixedClock + index * 1000).toISOString(),
          confirmationMode: 'OBSERVED',
          ...(index === 2 || index === 3 ? {
            payload: { manifestBase64: manifest.toString('base64'), payloadHash: sha(manifest) },
          } : {}),
        };
      },
      async countingDecision() {
        events.push(['counting']);
        return runDecision(BATTERY_ID, FROZEN_SHA, FROZEN_SHA, true, step === 5 && !closed, false);
      },
      async close() {
        if (closed) throw new Error('FAKE_CLOSE_REJECTED');
        events.push(['close']);
        closed = true;
      },
    },
  };
}

if (isDirect(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--offline-replay') {
    process.stderr.write('OFFLINE_REPLAY_ONLY\n');
    process.exitCode = 2;
  } else {
    const events = [];
    const directory = await outputDirectory();
    const ports = fixture(events);
    const result = await replayLauncher({
      ...ports,
      operatorFactory: async () => ports.operator,
      admitOnce: createSingleAdmission(join(directory, 'synthetic-admission')),
      preserve: (scope, evidence) => preserveReplayIdentity(directory, scope, evidence),
      onPause: (scope) => events.push(['capture-pause', scope.method]),
      capture: async (scope, pass) => {
        const scenario = scope.method === 'open_return' && pass === 1 ? 'pending' : 'variant';
        const capture = await captureInChild(directory, scope, pass, scenario);
        events.push(['capture-child', scope.method, pass, capture.pid]);
        return capture;
      },
    });
    process.stdout.write(JSON.stringify({ ...result, output: directory, events }, null, 2) + '\n');
    if (result.status !== 'OFFLINE_CAPTURE_COMPLETE') process.exitCode = 1;
  }
}