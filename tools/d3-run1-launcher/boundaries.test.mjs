import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_RECAPTURE_ATTEMPTS_AFTER_INITIAL_CAPTURE, RUN1, admitLiveOnce,
  checkLiveSessionConfig, classifyPreflightInnerCode, createReadPreflight, createRuntimeCredentials,
  createSessionDeadline, createSingleAdmission, PREFLIGHT_INNER_CODES, SESSION_SAFETY_MARGIN_SECONDS,
  preflightLeafCode, sanitizePreflightLeafCode, sanitizePreflightPhase,
} from './boundaries.mjs';
import { createDiagnostics, persistFatal } from './diagnostics.mjs';
import { replayLauncher } from './launcher.mjs';
import { fixture, outputDirectory } from './replay.mjs';

const exec = promisify(execFile);
const nowMs = 1_800_000_000_000;
const cli = fileURLToPath(new URL('./replay.mjs', import.meta.url));
const config = { source: 'SUPABASE_PROJECT_AUTH_CONFIG', projectRef: 'aemxuqnnwfclzrwwiqfd',
  jwtExpirySeconds: 5400, observedAt: nowMs };
test('default CLI fails closed with no output or network activation', async () => {
  await assert.rejects(exec(process.execPath, [cli], { env: {} }), { code: 2, stdout: '', stderr: 'OFFLINE_REPLAY_ONLY\n' });
  await assert.rejects(exec(process.execPath, [cli, '--live'], { env: {} }), { code: 2, stdout: '' });
});

test('fresh 5400 observation passes, including exactly ten minutes', () => {
  checkLiveSessionConfig(config, nowMs);
  checkLiveSessionConfig(config, nowMs + 600_000);
  assert.throws(() => checkLiveSessionConfig(config, nowMs + 600_001), /SESSION_CONFIGURATION_UNAVAILABLE/);
  assert.throws(() => checkLiveSessionConfig(config, nowMs - 1), /SESSION_CONFIGURATION_UNAVAILABLE/);
});

test('startup requires strictly more than the unchanged 4080-second budget', () => {
  const gate = (jwtExpirySeconds) => createSessionDeadline({ ...config, jwtExpirySeconds },
    { operatorStart: nowMs, now: () => nowMs }).check(5, true);
  assert.throws(() => gate(4199), /SESSION_DEADLINE_INSUFFICIENT/);
  assert.throws(() => gate(4200), /SESSION_DEADLINE_INSUFFICIENT/);
  gate(4201);
  gate(5400);
});

test('live claim is fixed to the Git common directory and refuses duplicate invocation in a fixture', async () => {
  const directory = await outputDirectory();
  await exec('git', ['init', '--quiet', directory]);
  const nested = join(directory, 'nested');
  await mkdir(nested);
  const nonce = 'b'.repeat(64);
  const results = await Promise.allSettled([admitLiveOnce(directory, nonce), admitLiveOnce(nested, nonce)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message,
    /RUN_ALREADY_CLAIMED_OR_ADMISSION_UNAVAILABLE/);
  assert.equal(await readFile(join(directory, '.git/byetery-d3-23-run1.launcher-admission'), 'utf8'), nonce + '\n');
  await assert.rejects(admitLiveOnce(directory, 'a'.repeat(64)), /RUN_ALREADY_CLAIMED/);
});

function preflightFixture({ requestId, requestedAt }, ledger = 7, pendingDispatches = 0) {
  return {
    requestId,
    preflight: { observedAt: requestedAt, taskId: RUN1.taskId, runId: RUN1.runId, mode: 'TESTNET',
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

test('preflight innerCode maps each closed class and never copies raw details', async () => {
  const samples = [
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), 'TIMEOUT'],
    [Object.assign(new Error('timeout'), { name: 'TimeoutError' }), 'TIMEOUT'],
    [Object.assign(new Error('outer'), { cause: Object.assign(new Error('nested'), { name: 'AbortError' }) }), 'TIMEOUT'],
    [Object.assign(new Error('PUBLIC_READ_UNAVAILABLE'), { name: 'CaptureError', code: 'PUBLIC_READ_UNAVAILABLE' }), 'NET'],
    [Object.assign(new Error('HORIZON_ACCOUNT_UNAVAILABLE'), { name: 'Error' }), 'HTTP_STATUS'],
    [Object.assign(new Error('RPC_REJECTED'), { name: 'CaptureError', code: 'RPC_REJECTED' }), 'RPC_REJECTED'],
    [Object.assign(new Error('RESPONSE_TOO_LARGE'), { name: 'CaptureError', code: 'RESPONSE_TOO_LARGE' }), 'TOO_LARGE'],
    [Object.assign(new Error('HORIZON_ACCOUNT_RESPONSE_TOO_LARGE'), { name: 'Error' }), 'TOO_LARGE'],
    [Object.assign(new Error('INVALID_PUBLIC_JSON'), { name: 'CaptureError', code: 'INVALID_PUBLIC_JSON' }), 'JSON'],
    [new SyntaxError('Unexpected token'), 'JSON'],
    [new Error('CHAIN_READINESS_REJECTED'), 'VALIDATION'],
    [new Error('TESTNET_IDENTITY_REJECTED'), 'VALIDATION'],
    [new Error('SQL_READONLY_REQUIRED'), 'VALIDATION'],
    [new Error('POOL_OR_TTL_REJECTED'), 'VALIDATION'],
    [new Error('SOURCE_SEQUENCE_OR_FUNDING_REJECTED'), 'VALIDATION'],
    [new Error('PREFLIGHT_FRESHNESS_REJECTED'), 'VALIDATION'],
    [new Error('not a classified failure'), 'UNKNOWN'],
  ];
  for (const [error, expected] of samples) {
    assert.equal(classifyPreflightInnerCode(error), expected);
  }
  assert.deepEqual([...PREFLIGHT_INNER_CODES],
    ['TIMEOUT', 'NET', 'HTTP_STATUS', 'RPC_REJECTED', 'TOO_LARGE', 'VALIDATION', 'JSON', 'UNKNOWN']);
});

test('PREFLIGHT_FAIL records sanitized innerCode for each class and B-class maps to VALIDATION', async () => {
  const cases = [
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), 'TIMEOUT'],
    [Object.assign(new Error('PUBLIC_READ_UNAVAILABLE'), { code: 'PUBLIC_READ_UNAVAILABLE' }), 'NET'],
    [new Error('HORIZON_ACCOUNT_UNAVAILABLE'), 'HTTP_STATUS'],
    [Object.assign(new Error('RPC_REJECTED'), { code: 'RPC_REJECTED' }), 'RPC_REJECTED'],
    [Object.assign(new Error('RESPONSE_TOO_LARGE'), { code: 'RESPONSE_TOO_LARGE' }), 'TOO_LARGE'],
    [new SyntaxError('Unexpected token'), 'JSON'],
    [new Error('unclassified'), 'UNKNOWN'],
  ];
  for (const [error, expected] of cases) {
    const diagnostics = createDiagnostics();
    const read = createReadPreflight(async () => { throw error; }, { now: () => nowMs, diagnostics });
    await assert.rejects(read(), /PREFLIGHT_SOURCES_UNAVAILABLE/);
    assert.equal(diagnostics.fatal('STOP_OPERATOR_REQUIRES_REVIEW').events.at(-1).innerCode, expected);
  }
  const freshness = createDiagnostics();
  let time = nowMs, saved;
  const read = createReadPreflight(async (request) => {
    if (!saved) return saved = preflightFixture(request);
    return saved;
  }, { now: () => time++, diagnostics: freshness });
  await read();
  await assert.rejects(read(), /PREFLIGHT_FRESHNESS_REJECTED/);
  const fail = freshness.fatal('STOP_OPERATOR_REQUIRES_REVIEW');
  assert.equal(fail.stage, 'PREFLIGHT_FAIL');
  assert.equal(fail.events.at(-1).innerCode, 'VALIDATION');
  assert.equal(Object.hasOwn(fail, 'innerCode'), false);
});

test('PREFLIGHT_FAIL redacts secrets and rejects a non-whitelist innerCode', async () => {
  const leak = [
    'postgres://user:pw@db.abcdefghijklmnop.supabase.co:5432/postgres',
    'https://abcdefghijklmnop.supabase.com/rest/v1',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb',
    'GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS',
  ].join(' ');
  const error = new Error(leak);
  error.stack = leak + '\n    at classify (/workspace/secret.js:1:1)';
  const diagnostics = createDiagnostics();
  const read = createReadPreflight(async () => { throw error; }, { now: () => nowMs, diagnostics });
  await assert.rejects(read(), /PREFLIGHT_SOURCES_UNAVAILABLE/);
  const result = await persistFatal(diagnostics, 'STOP_OPERATOR_REQUIRES_REVIEW', 'a'.repeat(40), 'b'.repeat(64));
  const bytes = await readFile(result.path);
  const text = bytes.toString('utf8');
  assert.ok(!text.includes('postgres://'));
  assert.ok(!text.includes('user:pw'));
  assert.ok(!text.includes('supabase.co'));
  assert.ok(!text.includes('supabase.com'));
  assert.ok(!text.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
  assert.ok(!text.includes('GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS'));
  assert.ok(!text.includes(leak));
  const record = JSON.parse(text);
  assert.equal(record.events.at(-1).innerCode, 'UNKNOWN');
  assert.equal(record.events.at(-1).leaf, 'UNKNOWN_LEAF');
  assert.equal(record.leaf, 'UNKNOWN_LEAF');
  assert.equal(record.phase, 'PRE_ADMISSION');
  assert.equal(record.readNumber, 1);
  assert.deepEqual(Object.keys(record).sort(), [
    'compositionRootSha', 'errorCode', 'errorName', 'events', 'leaf', 'phase', 'readNumber',
    'schemaVersion', 'sessionControlSha256', 'stage', 'taskId', 'timestamp',
  ]);
  const raw = createDiagnostics();
  raw.event('PREFLIGHT_FAIL', undefined, 'NOT_A_REAL_CODE', { leaf: 'user:pw leaked', phase: 'free text phase' });
  const payload = JSON.stringify(raw.fatal('STOP_OPERATOR_REQUIRES_REVIEW'));
  assert.ok(!payload.includes('NOT_A_REAL_CODE'));
  assert.ok(!payload.includes('user:pw leaked'));
  assert.ok(!payload.includes('free text phase'));
  assert.equal(Object.hasOwn(raw.fatal('STOP_OPERATOR_REQUIRES_REVIEW').events.at(-1), 'innerCode'), false);
  assert.equal(raw.fatal('STOP_OPERATOR_REQUIRES_REVIEW').events.at(-1).leaf, 'UNKNOWN_LEAF');
  assert.equal(Object.hasOwn(raw.fatal('STOP_OPERATOR_REQUIRES_REVIEW').events.at(-1), 'phase'), false);
});

test('PREFLIGHT_FAIL fatal records requireThat leaf and phase without values or secrets', async () => {
  assert.equal(preflightLeafCode(new Error('SQL_QUIESCENCE_REJECTED')), 'SQL_QUIESCENCE_REJECTED');
  assert.equal(preflightLeafCode(Object.assign(new Error('outer'), { cause: new Error('CHAIN_READINESS_REJECTED') })),
    'CHAIN_READINESS_REJECTED');
  assert.equal(preflightLeafCode(new Error('password=super-secret')), 'UNKNOWN_LEAF');
  assert.equal(sanitizePreflightLeafCode('SOURCE_SEQUENCE_OR_FUNDING_REJECTED'), 'SOURCE_SEQUENCE_OR_FUNDING_REJECTED');
  assert.equal(sanitizePreflightLeafCode('not a code'), 'UNKNOWN_LEAF');
  assert.equal(sanitizePreflightLeafCode('SQL_SECRET_LOOKING_VALUE'), 'UNKNOWN_LEAF');
  assert.equal(sanitizePreflightLeafCode('VALIDATION=pool:123'), 'UNKNOWN_LEAF');
  assert.equal(sanitizePreflightPhase('PRE_ADMISSION'), 'PRE_ADMISSION');
  assert.equal(sanitizePreflightPhase('reviewed'), undefined);
  assert.equal(sanitizePreflightPhase('sql said occupied=1'), undefined);

  const cases = [
    [new Error('SQL_QUIESCENCE_REJECTED'), 'SQL_QUIESCENCE_REJECTED', 'VALIDATION', 'PRE_ADMISSION', 1],
    [new Error('CHAIN_READINESS_REJECTED'), 'CHAIN_READINESS_REJECTED', 'VALIDATION', 'PRE_ADMISSION', 1],
    [new Error('SOURCE_SEQUENCE_OR_FUNDING_REJECTED'), 'SOURCE_SEQUENCE_OR_FUNDING_REJECTED', 'VALIDATION', 'PRE_ADMISSION', 1],
    [Object.assign(new Error('PUBLIC_READ_UNAVAILABLE'), { code: 'PUBLIC_READ_UNAVAILABLE' }),
      'PUBLIC_READ_UNAVAILABLE', 'NET', 'PRE_ADMISSION', 1],
    [Object.assign(new Error('timeout'), { name: 'TimeoutError' }), 'UNKNOWN_LEAF', 'TIMEOUT', 'PRE_ADMISSION', 1],
  ];
  for (const [error, leaf, inner, phase, readNumber] of cases) {
    const diagnostics = createDiagnostics();
    const read = createReadPreflight(async () => { throw error; }, { now: () => nowMs, diagnostics });
    await assert.rejects(read(), /PREFLIGHT_SOURCES_UNAVAILABLE/);
    const fatal = diagnostics.fatal('STOP_OPERATOR_REQUIRES_REVIEW');
    const event = fatal.events.at(-1);
    assert.equal(fatal.stage, 'PREFLIGHT_FAIL');
    assert.equal(fatal.leaf, leaf);
    assert.equal(fatal.phase, phase);
    assert.equal(fatal.readNumber, readNumber);
    assert.equal(event.leaf, leaf);
    assert.equal(event.innerCode, inner);
    assert.equal(event.phase, phase);
    assert.equal(event.readNumber, readNumber);
  }

  const operator = createDiagnostics();
  let calls = 0;
  const read = createReadPreflight(async (request) => {
    calls += 1;
    if (calls < 3) return preflightFixture(request, 7 + calls);
    throw new Error('SQL_QUIESCENCE_REJECTED');
  }, {
    now: () => nowMs + calls,
    diagnostics: operator,
    phaseOf: n => (n === 1 ? 'REVIEWED' : 'STARTUP_FRESH'),
  });
  await read();
  await read();
  await assert.rejects(read(), /PREFLIGHT_SOURCES_UNAVAILABLE/);
  const startup = operator.fatal('STOP_OPERATOR_START_REQUIRES_REVIEW');
  assert.equal(startup.stage, 'PREFLIGHT_FAIL');
  assert.equal(startup.leaf, 'SQL_QUIESCENCE_REJECTED');
  assert.equal(startup.phase, 'STARTUP_FRESH');
  assert.equal(startup.readNumber, 3);
  assert.equal(startup.events.at(-1).innerCode, 'VALIDATION');

  const freshness = createDiagnostics();
  let time = nowMs, saved;
  const again = createReadPreflight(async (request) => {
    if (!saved) return saved = preflightFixture(request);
    return saved;
  }, { now: () => time++, diagnostics: freshness, phaseOf: n => (n === 1 ? 'REVIEWED' : 'STARTUP_FRESH') });
  await again();
  await assert.rejects(again(), /PREFLIGHT_FRESHNESS_REJECTED/);
  const stale = freshness.fatal('PRE_ADMISSION_READS_REJECTED');
  assert.equal(stale.leaf, 'PREFLIGHT_FRESHNESS_REJECTED');
  assert.equal(stale.phase, 'STARTUP_FRESH');
  assert.equal(stale.readNumber, 2);

  const leak = 'postgres://user:pw@db.example.invalid:5432/postgres value=42';
  const dirty = createDiagnostics();
  dirty.event('PREFLIGHT_FAIL', undefined, leak, { leaf: leak, phase: leak, readNumber: leak });
  const serialized = JSON.stringify(dirty.fatal('PRE_ADMISSION_READS_REJECTED'));
  assert.ok(!serialized.includes('postgres://'));
  assert.ok(!serialized.includes('user:pw'));
  assert.ok(!serialized.includes('value=42'));
  assert.equal(dirty.fatal('PRE_ADMISSION_READS_REJECTED').leaf, 'UNKNOWN_LEAF');
  assert.equal(Object.hasOwn(dirty.fatal('PRE_ADMISSION_READS_REJECTED'), 'phase'), false);
  assert.equal(Object.hasOwn(dirty.fatal('PRE_ADMISSION_READS_REJECTED'), 'readNumber'), false);
});
