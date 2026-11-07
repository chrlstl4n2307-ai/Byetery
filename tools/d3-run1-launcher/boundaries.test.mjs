import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LIVE_EXECUTION_ENABLED, MAX_RECAPTURE_ATTEMPTS_AFTER_INITIAL_CAPTURE, RUN1,
  checkLiveActivation, createReadPreflight, createRuntimeCredentials, createSessionDeadline,
  createSingleAdmission, SESSION_SAFETY_MARGIN_SECONDS,
} from './boundaries.mjs';
import { launchLive, replayLauncher } from './launcher.mjs';
import { fixture, outputDirectory } from './replay.mjs';

const exec = promisify(execFile);
const nowMs = 1_800_000_000_000;
const cli = fileURLToPath(new URL('./replay.mjs', import.meta.url));
const config = { source: 'SUPABASE_PROJECT_AUTH_CONFIG', projectRef: 'aemxuqnnwfclzrwwiqfd',
  jwtExpirySeconds: 5400, observedAt: nowMs };
const approve = async () => ({
  action: 'AUTHORIZE_D3_17_RUN1_EXECUTION', identity: RUN1, expiresAt: Date.now() + 60_000,
});

test('default CLI fails closed with no output or network activation', async () => {
  await assert.rejects(exec(process.execPath, [cli], { env: {} }), { code: 2, stdout: '', stderr: 'OFFLINE_REPLAY_ONLY\n' });
  assert.equal(LIVE_EXECUTION_ENABLED, false);
});

test('future owner authorization missing rejects before runtime is touched', async () => {
  let started = 0;
  await assert.rejects(launchLive({ identity: RUN1 }, {
    createFrozenOperator: () => { started++; },
  }), /FUTURE_OWNER_AUTHORIZATION_REQUIRED/);
  assert.equal(started, 0);
});

for (const key of Object.keys(RUN1)) {
  test('wrong ' + key + ' rejects before reading the owner grant', async () => {
    let reads = 0;
    await assert.rejects(checkLiveActivation({ identity: { ...RUN1, [key]: 'OTHER' },
      ownerGrant: {}, verifyOwnerGrant: () => { reads++; } }), /RUN_IDENTITY_REJECTED/);
    assert.equal(reads, 0);
  });
}

for (const runId of ['D3-17-RUN2', 'D3-17-RUN3']) {
  test(runId + ' rejected', async () => {
    await assert.rejects(checkLiveActivation({ identity: { ...RUN1, runId } }), /RUN_IDENTITY_REJECTED/);
  });
}

test('owner grant independently binds all fields; even a matching mock grant is sealed', async () => {
  await assert.rejects(checkLiveActivation({ identity: RUN1, ownerGrant: {}, verifyOwnerGrant: async () =>
    ({ ...(await approve()), identity: { ...RUN1, batteryId: 'OTHER' } }) }), /RUN_IDENTITY_REJECTED/);
  await assert.rejects(launchLive({ identity: RUN1, ownerGrant: {}, verifyOwnerGrant: approve },
    new Proxy({}, { get() { throw new Error('UNREACHABLE_RUNTIME'); } })), /LIVE_EXECUTION_DISABLED/);
});

function preflightFixture({ requestId, requestedAt }, ledger = 7, pendingDispatches = 0) {
  return {
    requestId,
    preflight: { observedAt: requestedAt, taskId: RUN1.runId, runId: 'RUN1', mode: 'TESTNET',
      sameRuntimeSha: RUN1.businessSha, pendingDispatches },
    observations: [
      { source: 'LOCAL_GIT', observedAt: requestedAt, ledger: null },
      { source: 'STELLAR_RPC_TESTNET', observedAt: requestedAt, ledger },
      { source: 'SUPABASE_SQL_READ_ONLY', observedAt: requestedAt, ledger: null },
    ],
  };
}

test('readPreflight requests new underlying observations and retains provenance', async () => {
  const requests = [], retained = [];
  let time = nowMs;
  const read = createReadPreflight(async (request) => {
    requests.push(request.requestId);
    return preflightFixture(request, 7 + requests.length, requests.length - 1);
  }, { now: () => time++, retain: (evidence) => retained.push(evidence) });
  assert.equal((await read()).pendingDispatches, 0);
  assert.equal((await read()).pendingDispatches, 1);
  assert.notEqual(requests[0], requests[1]);
  assert.deepEqual(retained.map((item) => item.observations[1].ledger), [8, 9]);
});

test('cached preflight, rewritten nonce and failed new read never fall back', async () => {
  let time = nowMs, saved, calls = 0;
  const read = createReadPreflight(async (request) => {
    calls++;
    if (calls === 1) return saved = preflightFixture(request);
    if (calls === 2) return saved;
    if (calls === 3) return { ...saved, requestId: request.requestId };
    throw new Error('SOURCE_UNAVAILABLE');
  }, { now: () => time++ });
  await read();
  await assert.rejects(read(), /PREFLIGHT_FRESHNESS_REJECTED/);
  await assert.rejects(read(), /PREFLIGHT_FRESHNESS_REJECTED/);
  await assert.rejects(read(), /PREFLIGHT_SOURCES_UNAVAILABLE/);
  assert.equal(calls, 4);
});

test('credential port resolves each mock role once and emits only fixed errors', async () => {
  const sentinel = ['synthetic', 'must-stay-in-memory'].join('-');
  const reads = [];
  const credentials = createRuntimeCredentials({ async resolve(role) {
    reads.push(role);
    if (role === 'ADMIN') throw new Error(sentinel);
    return { email: 'synthetic', password: sentinel, extra: sentinel };
  } });
  assert.deepEqual(reads, []);
  assert.deepEqual(Object.keys(await credentials('USER')).sort(), ['email', 'password']);
  await assert.rejects(credentials('ADMIN'), (e) => !e.cause && e.message === 'CREDENTIALS_UNAVAILABLE' && !e.stack.includes(sentinel));
  await assert.rejects(credentials('USER'), /CREDENTIAL_ROLE_REJECTED/);
  await assert.rejects(credentials('SERVICE'), /CREDENTIAL_ROLE_REJECTED/);
  assert.deepEqual(reads, ['USER', 'ADMIN']);
});

test('deadline derives from provided duration minus explicit margin', () => {
  const session = createSessionDeadline(config, { operatorStart: nowMs, now: () => nowMs });
  assert.equal(session.deadline, nowMs + (5400 - SESSION_SAFETY_MARGIN_SECONDS) * 1000);
  session.check(5, true);
});

test('observed project duration 3600 stops before operator construction or admission', async () => {
  let actions = 0;
  const ports = fixture([]);
  const result = await replayLauncher({ ...ports,
    sessionConfig: { ...ports.sessionConfig, jwtExpirySeconds: 3600 },
    operatorFactory: () => { actions++; },
    admitOnce: () => { actions++; },
  });
  assert.equal(result.status, 'STOP_SESSION_GATE');
  assert.equal(actions, 0);
});

test('deadline exhaustion blocks the next step even while role metadata remains unchanged', async () => {
  let time = nowMs;
  const session = createSessionDeadline(config, { operatorStart: nowMs, now: () => time });
  session.check(5, true);
  time += 3000 * 1000;
  assert.throws(() => session.check(4), /SESSION_DEADLINE_INSUFFICIENT/);
});

test('expiry config unavailable or stale stops before operator construction', async () => {
  assert.throws(() => createSessionDeadline({ ...config, observedAt: nowMs - 600_001 },
    { operatorStart: nowMs, now: () => nowMs }), /SESSION_CONFIGURATION_UNAVAILABLE/);
  const ports = fixture([]);
  let started = 0;
  const result = await replayLauncher({ ...ports, sessionConfig: undefined,
    operatorFactory: () => { started++; },
  });
  assert.equal(result.status, 'STOP_SESSION_GATE');
  assert.equal(started, 0);
});

test('a second launcher cannot recover or create another instance after a crash', async () => {
  const directory = await outputDirectory();
  const claim = join(directory, 'synthetic-admission');
  let starts = 0, steps = 0;
  const ports = fixture([]);
  const options = { ...ports, admitOnce: createSingleAdmission(claim),
    operatorFactory: async () => {
      starts++;
      return { ...ports.operator, async step() { steps++; throw new Error('SYNTHETIC_CRASH'); } };
    } };
  const [first, second] = await Promise.all([replayLauncher(options), replayLauncher(options)]);
  assert.deepEqual([first.status, second.status].sort(), ['STOP_OPERATOR_REQUIRES_REVIEW', 'STOP_RUN_ADMISSION'].sort());
  assert.equal(starts, 1);
  assert.equal(steps, 1);
  // A fresh Node process cannot acquire the same persistent synthetic claim.
  const mod = new URL('./boundaries.mjs', import.meta.url).href;
  await assert.rejects(exec(process.execPath, ['--input-type=module', '-e',
    'const {createSingleAdmission}=await import(process.argv[1]);try {await createSingleAdmission(process.argv[2])();} catch {process.exit(14);}',
    mod, claim], { env: {} }), { code: 14 });
});

test('startup crash consumes the exclusive synthetic claim; restart never builds a new handle', async () => {
  const directory = await outputDirectory();
  const ports = fixture([]);
  let starts = 0;
  const options = { ...ports, admitOnce: createSingleAdmission(join(directory, 'synthetic-admission')),
    operatorFactory: () => { starts++; throw new Error('SYNTHETIC_STARTUP_CRASH'); } };
  assert.equal((await replayLauncher(options)).status, 'STOP_OPERATOR_START_REQUIRES_REVIEW');
  assert.equal((await replayLauncher(options)).status, 'STOP_RUN_ADMISSION');
  assert.equal(starts, 1);
});

test('no refresh, retry or replacement capability is invoked by default or after a crash', async (t) => {
  let fetches = 0, forbidden = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetches++; throw new Error('NETWORK_UNEXPECTED'); });
  const ports = fixture([]);
  const directory = await outputDirectory();
  const fail = () => { forbidden++; throw new Error('FORBIDDEN'); };
  const result = await replayLauncher({ ...ports,
    admitOnce: createSingleAdmission(join(directory, 'synthetic-admission')),
    operatorFactory: async () => ({
      ...ports.operator, step: () => { throw new Error('SYNTHETIC_STOP'); },
      refresh: fail, retry: fail, replace: fail, broadcast: fail,
    }),
  });
  assert.equal(result.status, 'STOP_OPERATOR_REQUIRES_REVIEW');
  assert.equal(forbidden, 0);
  assert.equal(fetches, 0);
  assert.equal(MAX_RECAPTURE_ATTEMPTS_AFTER_INITIAL_CAPTURE, 1);
});