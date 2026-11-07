import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { replayLauncher, reviewedPlan, SESSION_MARGIN_MS, SESSION_PER_STEP_MS, BATTERY_ID } from './launcher.mjs';
import { createSingleAdmission } from './boundaries.mjs';
import { captureInChild, fixture, outputDirectory, preserveReplayIdentity } from './replay.mjs';

async function setup({ select = () => 'match', prepare = () => {}, onPause, afterCapture } = {}) {
  const events = [];
  const directory = await outputDirectory();
  const ports = fixture(events);
  prepare(ports);
  const result = await replayLauncher({
    ...ports,
    admitOnce: createSingleAdmission(join(directory, 'synthetic-admission')),
    operatorFactory: ports.operatorFactory ?? (async () => ports.operator),
    preserve: async (scope, evidence) => {
      events.push(['preserve', scope.method]);
      await preserveReplayIdentity(directory, scope, evidence);
    },
    onPause: (scope) => {
      events.push(['pause', scope.method]);
      onPause?.(scope);
    },
    capture: async (scope, pass) => {
      events.push(['capture', scope.method, pass, scope]);
      const capture = await captureInChild(directory, scope, pass, select(scope, pass));
      if (capture.unavailable) return capture;
      const { output, pid } = capture;
      assert.notEqual(pid, process.pid);
      await afterCapture?.(output, scope, pass);
      return capture;
    },
  });
  return { result, events, directory };
}

function eventOrder(events) {
  return events.map(([event, method, pass]) => [event, method, pass].filter(Boolean).join(':'));
}

function mutateStep(ports, method, transform) {
  const step = ports.operator.step;
  ports.operator.step = async (current) => {
    const evidence = await step(current);
    return current === method ? transform(evidence) : evidence;
  };
}

test('pinned frozen plan selects only the ratified RUN1', async () => {
  const run = await reviewedPlan();
  assert.equal(run.runId, 'RUN1');
  assert.equal(run.batteryId, BATTERY_ID);
});

test('single instance spans five steps; each durable capture gates advancement', async () => {
  const { result, events, directory } = await setup({
    select: (scope, pass) => scope.method === 'open_return' && pass === 1 ? 'pending' : 'variant',
  });
  assert.equal(result.status, 'OFFLINE_CAPTURE_COMPLETE');
  assert.equal(result.executionAuthority, false);
  assert.equal(result.accepted.length, 5);
  const captures = events.filter(([event, method]) => event === 'capture' && method === 'open_return');
  assert.equal(captures[0][3], captures[1][3]);
  assert.deepEqual(eventOrder(events), [
    'step:register_battery', 'preserve:register_battery', 'capture:register_battery:1',
    'step:open_return', 'preserve:open_return', 'capture:open_return:1', 'pause:open_return', 'capture:open_return:2',
    'step:confirm_collection', 'preserve:confirm_collection', 'capture:confirm_collection:1',
    'step:confirm_recycling', 'preserve:confirm_recycling', 'capture:confirm_recycling:1',
    'step:pay_reward', 'preserve:pay_reward', 'capture:pay_reward:1', 'counting', 'close',
  ]);
  const saved = JSON.parse(await readFile(join(directory, 'open_return-identity.json')));
  assert.match(saved.requestId, /^[0-9a-f]{64}$/);
  assert.deepEqual(saved.scope, captures[0][3]);
  assert.equal(saved.classification, 'OFFLINE_SYNTHETIC');
});

test('temporary NOT_FOUND on the original hash causes one read-only recapture', async () => {
  const { result, events } = await setup({
    select: (scope, pass) => scope.method === 'register_battery' && pass === 1 ? 'not-found' : 'match',
  });
  assert.equal(result.status, 'OFFLINE_CAPTURE_COMPLETE');
  assert.equal(events.filter(([name, method]) => name === 'step' && method === 'register_battery').length, 1);
  assert.ok(eventOrder(events).includes('pause:register_battery'));
});

test('C2 stops after exhausting two observations of the same identity', async () => {
  const { result, events } = await setup({ select: () => 'pending' });
  assert.equal(result.status, 'STOP_CAPTURE_UNVERIFIED');
  assert.equal(result.accepted.length, 0);
  assert.deepEqual(eventOrder(events), [
    'step:register_battery', 'preserve:register_battery', 'capture:register_battery:1',
    'pause:register_battery', 'capture:register_battery:2', 'close',
  ]);
});

test('contradictory receipt identity stops without a second capture', async () => {
  const { result, events } = await setup({ select: () => 'mismatch' });
  assert.equal(result.status, 'STOP_CAPTURE_UNVERIFIED');
  assert.deepEqual(eventOrder(events), [
    'step:register_battery', 'preserve:register_battery', 'capture:register_battery:1', 'close',
  ]);
});

test('a tampered raw capture file fails before progression', async () => {
  const { result, events } = await setup({
    afterCapture: (output) => appendFile(join(output, '01-rpc.raw.utf8'), ' '),
  });
  assert.equal(result.status, 'STOP_CAPTURE_UNVERIFIED');
  assert.equal(events.filter(([kind]) => kind === 'step').length, 1);
  assert.equal(events.filter(([kind]) => kind === 'capture').length, 1);
});

test('the operator stopping internally during TX2 never authorizes TX3', async () => {
  const { result, events } = await setup({
    prepare: (ports) => mutateStep(ports, 'open_return', () => { throw new Error('OperatorStoppedRequiresReview'); }),
  });
  assert.equal(result.status, 'STOP_OPERATOR_REQUIRES_REVIEW');
  assert.equal(result.accepted.length, 1);
  assert.deepEqual(eventOrder(events).slice(-2), ['step:open_return', 'close']);
});

test('missing session role stops before TX1', async () => {
  const { result, events } = await setup({
    prepare: (ports) => {
      const original = ports.observeSessions;
      ports.observeSessions = () => original().slice(1);
    },
  });
  assert.equal(result.status, 'STOP_SESSION_GATE');
  assert.deepEqual(events, [['close']]);
});

test('all four sessions need more than the conservative window before TX1', async () => {
  const { result, events } = await setup({
    prepare: (ports) => {
      const original = ports.observeSessions;
      ports.observeSessions = () => original().map((item) => item.role === 'RECYCLER' ? {
        ...item, expiresAt: ports.now() + SESSION_PER_STEP_MS * 5 + SESSION_MARGIN_MS,
      } : item);
    },
  });
  assert.equal(result.status, 'STOP_SESSION_GATE');
  assert.deepEqual(events, [['close']]);
});

test('no session rotation during C2 pause', async () => {
  let rotated = false;
  const { result, events } = await setup({
    select: (_, pass) => pass === 1 ? 'pending' : 'match',
    onPause: () => { rotated = true; },
    prepare: (ports) => {
      const original = ports.observeSessions;
      ports.observeSessions = () => original().map((item) => rotated && item.role === 'USER' ? {
        ...item, sessionId: '00000000-0000-4000-8000-000000000555',
      } : item);
    },
  });
  assert.equal(result.status, 'STOP_SESSION_GATE');
  assert.equal(result.accepted.length, 1);
  assert.equal(events.filter(([kind]) => kind === 'step').length, 1);
});

test('an expired session permits only reconciliation of the existing receipt', async () => {
  let elapsed = 0;
  const { result, events } = await setup({
    select: (_, pass) => pass === 1 ? 'pending' : 'match',
    onPause: () => { elapsed = 91 * 60_000; },
    prepare: (ports) => {
      const original = ports.now;
      ports.now = () => original() + elapsed;
    },
  });
  assert.equal(result.status, 'STOP_SESSION_GATE');
  assert.equal(result.accepted.length, 1);
  assert.deepEqual(events.filter(([kind]) => kind === 'capture').map((entry) => entry[2]), [1, 2]);
});

test('recycling does not imply reward sent', async () => {
  const { result, events } = await setup({
    prepare: (ports) => mutateStep(ports, 'confirm_recycling', (e) => ({ ...e, confirmedRewardState: 'SENT' })),
  });
  assert.equal(result.status, 'STOP_INVALID_OPERATOR_EVIDENCE');
  assert.equal(result.accepted.length, 3);
  assert.ok(!eventOrder(events).includes('step:pay_reward'));
});

test('request, operation ID and hash must remain consistent and distinct', async () => {
  for (const key of ['requestId', 'operationId', 'transactionHash']) {
    const { result } = await setup({
      prepare: (ports) => {
        let first;
        mutateStep(ports, 'register_battery', (e) => { first = e; return e; });
        mutateStep(ports, 'open_return', (e) => ({ ...e, [key]: first[key] }));
      },
    });
    assert.equal(result.status, 'STOP_INVALID_OPERATOR_EVIDENCE');
    assert.equal(result.accepted.length, 1);
  }
});

test('attestation manifest hash is verified before capture', async () => {
  const { result } = await setup({
    prepare: (ports) => mutateStep(ports, 'confirm_collection', (e) => ({
      ...e, payload: { ...e.payload, payloadHash: '0'.repeat(64) },
    })),
  });
  assert.equal(result.status, 'STOP_INVALID_OPERATOR_EVIDENCE');
  assert.equal(result.accepted.length, 2);
});

test('CLI has no live path', () => {
  const cli = fileURLToPath(new URL('./replay.mjs', import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [cli, '--live'], {
    env: {}, windowsHide: true, stdio: 'pipe',
  }), (error) => error.status === 2 && error.stderr.toString() === 'OFFLINE_REPLAY_ONLY\n');
});
test('failed capture child triggers one separate read of the original identity', async () => {
  const { result, events } = await setup({
    select: (scope, pass) => scope.method === 'register_battery' && pass === 1 ? 'unavailable' : 'match',
  });
  assert.equal(result.status, 'OFFLINE_CAPTURE_COMPLETE');
  assert.deepEqual(eventOrder(events).slice(0, 6), [
    'step:register_battery', 'preserve:register_battery', 'capture:register_battery:1',
    'pause:register_battery', 'capture:register_battery:2', 'step:open_return',
  ]);
});