import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { RUN1, admissionControlName, createRuntimeCredentials, createSingleAdmission, runControlPaths } from './boundaries.mjs';
import { createDiagnostics, persistFatal } from './diagnostics.mjs';
import { ARGV, runEntry } from './live.mjs';
import { assertNoRun1Controls, createRoleResolver } from './live-runtime.mjs';
import { createNoEcho, PromptFailure } from './no-echo.mjs';
import { verifySessionPins } from './session-pins.mjs';

const dummy = 'K7-DUMMY-CREDENTIAL-DO-NOT-LEAK';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const arm = t => t.mock.timers.tick(80);
const promptCode = code => error => error instanceof PromptFailure && error.code === code;
async function scratch(t) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'byetery-k7-offline-')));
  t.after(() => rm(dir, { recursive: true }));
  return dir;
}

function terminal(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const input = Object.assign(new EventEmitter(), {
    isTTY: true, isRaw: false,
    setRawMode(raw) { this.isRaw = raw; },
    setEncoding() {}, resume() {}, pause() {},
  });
  let stdout = '';
  const reader = createNoEcho(input, { isTTY: true, write: line => { stdout += line; } });
  t.after(() => {
    reader.close();
    assert.ok(!stdout.includes(dummy), 'credential leaked in prompt output');
    assert.equal(input.isRaw, false);
  });
  return { input, reader, send: value => input.emit('data', value) };
}

for (const [name, first, idle, arming] of [
  ['CR only', [dummy + '\r'], [], []],
  ['LF only', [dummy + '\n'], [], []],
  ['CRLF in a single chunk', [dummy + '\r\n'], [], []],
  ['split CRLF', [dummy + '\r'], ['\n'], []],
  ['CR and LF delivered across three chunks', [dummy, '\r'], ['\n'], []],
  ['stale LF queued at the next prompt', [dummy + '\r'], [], ['\n']],
]) {
  test(name + ' leaves the following prompt independent', async t => {
    const { reader, send } = terminal(t);
    const firstRead = reader.read('USER');
    arm(t);
    first.forEach(send);
    assert.ok(await firstRead === dummy);
    idle.forEach(send);
    const secondRead = reader.read('ADMIN');
    arming.forEach(send);
    arm(t);
    send(dummy + '\r');
    assert.ok(await secondRead === dummy);
  });
}

test('type-ahead is discarded before display, after CR, and while idle', async t => {
  const { reader, send } = terminal(t);
  const a = reader.read('USER');
  send(dummy + '\r');
  arm(t);
  send('a\r' + dummy + '\r');
  assert.equal(await a, 'a');
  send(dummy + '\r');
  const b = reader.read('ADMIN');
  send(dummy + '\r');
  arm(t);
  send('b\r');
  assert.equal(await b, 'b');
});

for (const [name, code, action] of [
  ['empty Enter', 'PROMPT_EMPTY', ({ send }) => send('\r')],
  ['30 second timeout', 'PROMPT_TIMEOUT', (_, t) => t.mock.timers.tick(30_000)],
  ['control character', 'PROMPT_CONTROL_CHAR', ({ send }) => send(dummy + '\x03')],
  ['stream end', 'PROMPT_STREAM_END', ({ input }) => input.emit('end')],
  ['stream error', 'PROMPT_STREAM_ERROR', ({ input }) => input.emit('error', Error(dummy))],
  ['more than 256 characters', 'PROMPT_TOO_LONG', ({ send }) => send('x'.repeat(257))],
]) {
  test(name + ' has its own prompt code', async t => {
    const tty = terminal(t);
    const failure = assert.rejects(tty.reader.read('USER'), promptCode(code));
    arm(t);
    action(tty, t);
    await failure;
  });
}

test('backspace on empty is deterministic and exactly 256 characters remain allowed', async t => {
  const { reader, send } = terminal(t);
  const result = reader.read('USER');
  arm(t);
  send('\b\x7f' + 'x'.repeat(256) + '\r');
  assert.equal((await result).length, 256);
});

function credentials(diagnostics, overrides = {}) {
  return createRuntimeCredentials(createRoleResolver({
    diagnostics, checkAdmission: async () => {}, lookup: async () => dummy,
    prompt: async () => dummy, ...overrides,
  }), diagnostics);
}
const startup = 'STOP_OPERATOR_START_REQUIRES_REVIEW';
for (const [label, stage, options] of [
  ['SQL failure', 'CREDENTIAL_SQL_FAIL', { lookup: async () => { throw Error(dummy); } }],
  ['prompt cancel', 'PROMPT_EMPTY', { prompt: async () => { throw new PromptFailure('PROMPT_EMPTY'); } }],
  ['prompt timeout', 'PROMPT_TIMEOUT', { prompt: async () => { throw new PromptFailure('PROMPT_TIMEOUT'); } }],
]) {
  test('USER ' + label + ' has a safe role and stage', async () => {
    const d = createDiagnostics();
    await assert.rejects(credentials(d, options)('USER'), /CREDENTIALS_UNAVAILABLE/);
    const fatal = d.fatal(startup);
    assert.equal(fatal.stage, stage);
    assert.equal(fatal.role, 'USER');
    assert.ok(!JSON.stringify(fatal).includes(dummy));
  });
}

test('ADMIN credential enter follows USER return and residual startup stays indeterminate', async () => {
  const d = createDiagnostics();
  const get = credentials(d);
  assert.ok((await get('USER')).password === dummy);
  assert.equal(d.fatal(startup).stage, 'STARTUP_OPERATOR_INDETERMINATE');
  await get('ADMIN');
  const events = d.fatal(startup).events;
  assert.deepEqual(events.slice(3, 5).map(x => [x.role, x.stage]),
    [['USER', 'CREDENTIAL_RETURN'], ['ADMIN', 'CREDENTIAL_ENTER']]);
});

test('step stop stays indeterminate unless launcher observed a preflight failure', () => {
  const d = createDiagnostics();
  const step = 'STOP_OPERATOR_REQUIRES_REVIEW';
  assert.equal(d.fatal(step).stage, 'STEP_OPERATOR_INDETERMINATE');
  d.event('PREFLIGHT_ENTER');
  d.event('PREFLIGHT_FAIL');
  assert.equal(d.fatal(step).stage, 'PREFLIGHT_FAIL');
});

test('fatal persistence hashes exact on-disk bytes and never serializes arbitrary errors', async t => {
  const dir = await scratch(t);
  const d = createDiagnostics();
  await assert.rejects(credentials(d, { lookup: async () => { throw Error(dummy); } })('USER'));
  assert.throws(() => d.event(dummy, 'USER'), /UNSAFE_DIAGNOSTIC_EVENT/);
  const result = await persistFatal(d, startup, 'a'.repeat(40), 'b'.repeat(64), dir);
  const bytes = await readFile(result.path);
  assert.equal(digest(bytes), result.sha256);
  assert.ok(!bytes.includes(dummy));
  assert.ok(!JSON.stringify(result).includes(dummy));
  const record = JSON.parse(bytes);
  assert.equal(record.errorName, 'K7Stop');
  assert.equal(record.errorCode, 'CREDENTIAL_SQL_FAIL');
  assert.deepEqual(Object.keys(record).sort(), [
    'compositionRootSha', 'errorCode', 'errorName', 'events', 'role', 'schemaVersion', 'sessionControlSha256',
    'stage', 'taskId', 'timestamp',
  ]);
});

test('old admission and empty journal stay intact and do not block distinct K7 controls', async t => {
  const dir = await scratch(t);
  const old = 'D3-17-RUN1';
  const marker = join(dir, 'byetery-d3-17-run1.launcher-admission');
  const journal = join(dir, 'byetery-d3-operator', old + '-' + RUN1.businessSha + '.jsonl');
  await mkdir(dirname(journal));
  await writeFile(marker, 'a'.repeat(64) + '\n');
  await writeFile(journal, '');
  const before = digest(await readFile(marker));
  const paths = runControlPaths(dir);
  assert.notEqual(paths.admission, marker);
  assert.notEqual(paths.journal, journal);
  await assertNoRun1Controls(dir);
  await createSingleAdmission(paths.admission, 'b'.repeat(64))();
  await assert.rejects(assertNoRun1Controls(dir), /RUN1_PRIOR_CONTROL_REJECTED/);
  assert.equal(digest(await readFile(marker)), before);
  assert.equal((await readFile(journal)).length, 0);
  assert.throws(() => admissionControlName(old), /EXACT_TASK_REQUIRED/);
  assert.equal(await runEntry(ARGV.map(x => x === RUN1.taskId ? old : x), {}, {
    composition: () => assert.fail('old task advanced past argv gate'),
  }), 'EXACT_ARGV_REQUIRED');
});

test('session manifest binds three hashes, physical paths, composition and actual parent', async t => {
  const root = await scratch(t);
  const directory = join(root, 'tools', 'd3-run1-launcher');
  await mkdir(directory, { recursive: true });
  const head = 'a'.repeat(40);
  const artifacts = [
    { path: join(directory, 'live.mjs'), sha256: digest('live fixture') },
    { path: join(directory, 'launch.ps1'), sha256: digest('wrapper fixture') },
    { path: join(root, 'pwsh.exe'), sha256: digest('shell fixture'), version: '7.6.9' },
  ];
  await Promise.all(artifacts.map((x, i) => writeFile(x.path, ['live fixture', 'wrapper fixture', 'shell fixture'][i])));
  const [live, wrapper, pwsh] = artifacts;
  const data = JSON.stringify({ schemaVersion: 1, taskId: RUN1.taskId, compositionRootSha: head, live, wrapper, pwsh });
  const manifest = join(root, 'control.json');
  await writeFile(manifest, data);
  const env = { BYETERY_K7_SESSION_CONTROL_PATH: manifest, BYETERY_K7_SESSION_CONTROL_SHA256: digest(data) };
  const options = { root, head, parentExecutable: async () => pwsh.path };
  assert.equal(await verifySessionPins(env, options), digest(data));
  assert.ok(!(await readFile(manifest)).includes(dummy));
  await assert.rejects(verifySessionPins(env, { ...options, head: 'b'.repeat(40) }), /SESSION_PINS_REJECTED/);
  await assert.rejects(verifySessionPins(env, { ...options, parentExecutable: async () => live.path }), /SESSION_PINS_REJECTED/);
  await assert.rejects(verifySessionPins({ ...env, BYETERY_K7_SESSION_CONTROL_SHA256: 'c'.repeat(64) }, options), /SESSION_PINS_REJECTED/);
  for (const [i, artifact] of artifacts.entries()) {
    const bytes = await readFile(artifact.path);
    await writeFile(artifact.path, 'changed ' + i);
    await assert.rejects(verifySessionPins(env, options), /SESSION_PINS_REJECTED/);
    await writeFile(artifact.path, bytes);
  }
});
