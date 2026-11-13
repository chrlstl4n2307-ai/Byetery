import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { prepareOfflineController } from './controller.mjs';
import { prepareD324Bridge } from '../d3-24-operational/prelive-bridge.mjs';
import { createOfflineLocalControl, verifyBridgeLauncher } from './local-control.mjs';
import { loadD324Operator } from '../d3-24-operational/operator-binding.mjs';
import { D324_ARGV } from '../d3-24-operational/policy.mjs';
import { runD324Entry } from '../d3-24-operational/live.mjs';
import { RUN1, RUN_CAP, readD324Plan } from '../d3-24-ratification/identity.mjs';
import { projectD324Journal } from '../d3-24-ratification/readiness.mjs';
import { SPEC } from '../d3-evidence-capture/common.mjs';
import { captureD324Receipt, verifyD324CaptureInventory } from '../d3-24-ratification/capture.mjs';
import { createReplayReaders } from '../d3-receipt-capture/sources.mjs';
import { D324_CAPTURE_PROFILE_SHA256, verifyD324CaptureProfile } from '../d3-24-capture-profile/profile.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = process.env.OFFLINE_ORIGIN;
const scenario = process.env.OFFLINE_SCENARIO;
const directory = process.env.OFFLINE_CASE_DIR;
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(resolve(directory, '..'), resolve(root, '.test-output'));
const bridge = process.argv[2] === '--bridge-review';
if (bridge) process.argv.splice(2, 1);
assert.deepEqual(process.argv.slice(2), D324_ARGV);
if (bridge) await verifyBridgeLauncher(root, process.env.OFFLINE_PWSH);
assert.equal(await runD324Entry(D324_ARGV), 'D324_OPERATIONAL_RATIFICATION_REQUIRED');
const capability = process.env.OFFLINE_CAPABILITY;
assert.match(capability ?? '', /^[a-f0-9]{64}$/);

const networkFetch = globalThis.fetch;
const observationStop = new AbortController();
globalThis.fetch = (url, options = {}) => {
  assert.equal(new URL(String(url)).origin, origin, 'OFFLINE_EGRESS_REJECTED');
  const headers = new Headers(options.headers);
  headers.set('x-fixture-capability', capability);
  return networkFetch(url, { ...options, headers, redirect: 'error', credentials: 'omit',
    signal: options.signal ?? AbortSignal.timeout(10_000) }).then(async response => {
    if (scenario === 'uncertain-retry' && /^\/api\/operations\/[^/]+$/.test(new URL(String(url)).pathname)) {
      const receipt = await response.clone().json();
      if (receipt.submissionEvidence === 'DURABLE_INTENT' && receipt.transactionHash && !receipt.terminal) {
        setTimeout(() => observationStop.abort(), 100);
      }
    }
    return response;
  });
};
async function post(path, body) {
  const response = await fetch(origin + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.code ?? data.error?.code ?? 'SyntheticHttpRejected');
  return data;
}
const state = async () => (await fetch(origin + '/state')).json();
const operatorRoot = join(directory, 'operator');
const compositionRoot = join(directory, 'composition');
const operator = await loadD324Operator(compositionRoot, operatorRoot);
const journal = join(operatorRoot, '.git', 'byetery-d3-operator', RUN1.taskId + '-' + RUN1.businessSha + '.jsonl');
const lock = join(operatorRoot, '.git', 'byetery-d3-operator', 'operator.lock');
const planFile = join(root, 'tools/d3-24-composition/plans/security-repair-v2.json');
const plan = readD324Plan();
const localControl = await createOfflineLocalControl({ root, directory, pwshPath: process.env.OFFLINE_PWSH, bridge });
const preflight = () => ({
  taskId: RUN1.taskId, runId: RUN1.runId, observedAt: Date.now(),
  git: { sha: operator.sha, clean: true }, networkId: SPEC.networkId, contractId: SPEC.contract,
  wasmSha256: SPEC.wasm, deploymentId: SPEC.deployment, mode: 'TESTNET', unresolved: 0,
  pendingDispatches: 0, signers: Object.values(SPEC.actors).map(address => ({ address, available: true })),
  sources: ['admin', 'service', 'recycler'].map(role => ({ address: SPEC.actors[role], sequence: '1',
    reviewedSequence: '1', xlmReady: true })),
  wallets: SPEC.wallets.map(address => ({ address, approvedMapping: true, trustlineAuthorized: true,
    capacityBaseUnits: '1000000000' })),
  payer: SPEC.contract, payerBaseUnits: '1000000000', marginBaseUnits: '100000000',
  ttlMargin: 10000, requiredTtlMargin: 100, successfulTxCap: RUN_CAP, failedBroadcastCap: 0,
  setupCap: 0, maintenanceCap: 0, runtimeFeeCap: '50000000', approvedFeeCap: '50000000',
  requestedFee: '50000000', uniqueBatteryIds: true, simulationBeforeSend: true, sameRuntimeSha: operator.sha,
});
const credentials = async role => ({ email: role.toLowerCase() + '@synthetic.invalid', password: 'synthetic-only' });
const sessionFetch = (url, options) => {
  const target = new URL(String(url));
  if (target.origin === 'https://aemxuqnnwfclzrwwiqfd.supabase.co') {
    assert.ok(['/auth/v1/token', '/auth/v1/logout'].includes(target.pathname));
    return fetch(origin + target.pathname + target.search, options);
  }
  return fetch(url, options);
};
let headers, usedHandle, active, running, ordinal = 0;
const captures = [];
const roles = ['ADMIN', 'USER', 'COLLECTOR', 'RECYCLER', 'USER'];
const sessionOptions = {
  root: compositionRoot, operatorRoot, apiOrigin: origin, publishableKey: 'sb_publishable_fixture',
  credentials, fetcher: sessionFetch,
  control: {
    prepare: async value => { headers = value; return post('/prepare', { headers }); },
    admit: async (id, input) => { usedHandle = id; return post('/admit', { id, ...input }); },
    ...(bridge ? { admitRevalidated: async (id, current, input) => {
      usedHandle = id;
      return post('/admit', { id, headers: current, ...input });
    },
    discard: id => post('/discard', { id }) } : {}),
    checkAdmission: ack => post('/admission-check', { ack }),
  },
};
const operatorOptions = {
  root: operatorRoot, argv: D324_ARGV, apiOrigin: origin, publishableKey: sessionOptions.publishableKey,
  publicPlanFile: planFile, readPreflight: async () => preflight(),
  credentials: async () => assert.fail('Operator must use the already prepared sessions'),
  observationSignal: observationStop.signal,
};

const port = {
  classification: 'OFFLINE_SYNTHETIC',
  proofFor: async (input, ack) => post('/proof', {
    role: roles[ordinal - 1], ordinal, header: headers[roles[ordinal - 1]], ack,
    action: input.action, body: input.body, key: input.idempotencyKey,
  }).then(result => result.proof),
  async start(bindings) { running = await operator.createLocalOperator({ ...operatorOptions, ...bindings }); },
  async step(method) {
    ordinal++;
    const value = await running.step(method);
    assert.equal(value.operation, method);
    assert.equal(value.batteryId, RUN1.batteryId);
    const projected = projectD324Journal(await readFile(journal));
    assert.equal(projected.length, ordinal);
    assert.equal(projected.at(-1).transactionHash, value.transactionHash);
    return { operationId: value.operationId, transactionHash: value.transactionHash, method,
      batteryId: value.batteryId, ledger: value.confirmationLedger };
  },
  async reconcile(original) {
    if (scenario === 'crash-reconcile') process.exit(73);
    const sql = await post('/receipt', original);
    const observation = await post('/observation', original);
    assert.equal(sql.applicationState, 'CONFIRMED');
    assert.equal(observation.transactionHash, original.transactionHash);
    assert.equal(sql.ledger, observation.ledger);
    return 'CONFIRMED';
  },
  async capture(original) {
    const sql = await post('/receipt', original);
    const observation = await post('/observation', original);
    const output = await captureD324Receipt(original, createReplayReaders([sql], [observation]));
    assert.equal(output.status, 'DURABLE_RECEIPT_CONVERGED_NORMALIZED');
    const verified = await verifyD324CaptureInventory(output.directory, original, 'OFFLINE_SYNTHETIC');
    captures.push({ scope: original, directory: output.directory, inventorySha256: verified.inventorySha256 });
    return { ...verified, classification: 'OFFLINE_SYNTHETIC' };
  },
  async close() { await running?.close(); },
};

const expectedNegative = {
  'expired-session': 'OperatorSessionPreparationStopped', 'wrong-role': 'OperatorSessionPreparationStopped',
  'changed-session': 'D324SessionScopeRejected', 'missing-manifest': 'D324AuthorityMalformed',
  'wrong-plan': 'D324GrantScopeRejected', 'expired-grant': 'D324GrantExpired',
  unauthorized: 'D324AuthorityMalformed', 'busy-quiescence': 'SQL_QUIESCENCE_REJECTED',
  'revoke-before-sign': 'OperatorStoppedRequiresReview', 'uncertain-retry': 'OperatorStoppedRequiresReview',
  'k5-tamper': 'D324_K5_REJECTED', 'session-control-tamper': 'SESSION_PINS_REJECTED',
  'missing-grant': 'D324AuthorityMalformed', 'auth-revoked-at-admission': 'InvalidSession',
  'shorter-sql-session': 'D324_SESSION_REVALIDATION_REJECTED', 'partial-login': 'OperatorSessionPreparationStopped',
  'execution-exceeds-prepared': 'D324_SESSION_WINDOW_REJECTED', 'legacy-admission': 'D324SessionScopeRejected',
  'nonfixture-input': 'D324_BRIDGE_FIXTURE_REQUIRED',
};

async function assertLockReleased() {
  await assert.rejects(stat(lock), { code: 'ENOENT' });
}

if (scenario === 'outside-battery' || scenario === 'reserved-battery-wrong-task') {
  const taskId = scenario === 'outside-battery' ? RUN1.taskId : 'D3-9-RUN1';
  const args = D324_ARGV.map((value, index) => index === 2 ? taskId : value);
  const path = join(directory, 'wrong-scope-plan.json');
  const input = JSON.parse(await readFile(planFile, 'utf8'));
  if (scenario === 'outside-battery') input.runs[0].batteryId = 'BYE-D324-OFFLINE-R1';
  await writeFile(path, JSON.stringify(input), { flag: 'wx', mode: 0o600 });
  process.argv.splice(2, 5, ...args);
  await assert.rejects(operator.createLocalOperator({
    ...operatorOptions, argv: args, publicPlanFile: path, readPreflight: async () => ({ ...preflight(), taskId }),
  }), { message: 'D324OperatorScopeRejected' });
  await assertLockReleased();
  const counts = await state();
  assert.equal(counts.logins + counts.admissions + counts.operations + counts.sends, 0);
  console.log(JSON.stringify({ scenario, result: 'PASS', code: 'D324OperatorScopeRejected' }));
} else {
  let failure;
  try {
    const options = { classification: 'OFFLINE_SYNTHETIC', sessionOptions, localControl, port };
    active = await (bridge ? prepareD324Bridge(options) : prepareOfflineController(options));
    const prepared = await state();
    assert.equal(prepared.logins, 4);
    assert.equal(prepared.operations + prepared.admissions, 0);
    assert.equal(active.summary.businessAuthority, false);
    if (bridge) {
      assert.equal(active.summary.operatorSha, RUN1.businessSha);
      assert.equal(active.summary.planHash, RUN1.planHash);
      assert.equal(active.summary.maximumExecutionMs, 4_500_000);
      assert.equal(active.summary.sessionMarginMs, 120_000);
      assert.equal(active.summary.effectiveNotAfter, prepared.expectedEffectiveNotAfter);
      assert.equal(prepared.authReads, 8);
      assert.doesNotMatch(JSON.stringify(active.summary), /Bearer|eyJ|password|email|authUserId|sessionId/);
    }
    await assert.rejects(verifyD324CaptureProfile(root, { taskId: RUN1.taskId }), /D324_CAPTURE_IDENTITY_REJECTED/);
    if (scenario === 'k5-tamper') await writeFile(localControl.k5Path, 'tampered');
    if (scenario === 'session-control-tamper') await writeFile(localControl.sessionPath, '{}');
    if (scenario === 'legacy-admission') {
      await sessionOptions.control.admit(prepared.lastPreparation, {});
      assert.fail('Bridge accepted a legacy admission request');
    } else if (scenario === 'prepared-close') {
      await Promise.all([active.close(), active.close()]);
      await assert.rejects(active.execute({ fixtureOnly: true }), /OFFLINE_CONTROLLER_CONSUMED/);
      await assert.rejects(sessionOptions.control.admit(prepared.lastPreparation, {}), /HANDLE/);
    } else {
      const result = await active.execute(scenario === 'nonfixture-input' ? { grant: {} } : { fixtureOnly: true });
      assert.equal(result.confirmed.length, RUN_CAP);
    }
  } catch (error) {
    failure = error;
  } finally {
    await active?.close();
  }
  await assertLockReleased();
  if (scenario === 'prepared-close') {
    if (failure) throw failure;
    const counts = await state();
    assert.equal(counts.admissions + counts.operations + counts.sends, 0);
    assert.equal(counts.logouts, 4);
    console.log(JSON.stringify({ scenario, result: 'PASS', admissions: 0, logouts: 4, sends: 0 }));
  } else if (expectedNegative[scenario]) {
    const actual = failure?.message ?? 'NO_REJECTION';
    assert.equal(actual, expectedNegative[scenario], 'Unexpected bridge rejection: '+actual);
    const counts = await state();
    const started = ['revoke-before-sign', 'uncertain-retry'].includes(scenario) ? 1 : 0;
    assert.equal(counts.admissions, started);
    assert.equal(counts.operations, started);
    assert.equal(counts.logouts, counts.logins);
    assert.equal(counts.leases, 0);
    const sent = scenario === 'uncertain-retry' ? 1 : 0;
    assert.equal(counts.sends, sent);
    assert.equal(counts.signatures, sent);
    if (scenario === 'partial-login') assert.equal(counts.logouts, 3);
    if (scenario === 'auth-revoked-at-admission' || scenario === 'shorter-sql-session') assert.equal(counts.authReads, 12);
    if (scenario === 'uncertain-retry') {
      await assert.rejects(active.execute({ fixtureOnly: true }), /OFFLINE_CONTROLLER_CONSUMED/);
      process.exit(73);
    }
    console.log(JSON.stringify({ scenario, result: 'PASS', code: failure.message, sends: counts.sends }));
  } else {
    if (failure) throw failure;
    await assert.rejects(active.execute({ fixtureOnly: true }), /OFFLINE_CONTROLLER_CONSUMED/);
    await assert.rejects(sessionOptions.control.admit(usedHandle, {}), /HANDLE/);
    const counts = await state();
    assert.equal(counts.admissions, 1);
    assert.equal(counts.operations, RUN_CAP);
    assert.equal(counts.steps, RUN_CAP);
    assert.equal(counts.sends, RUN_CAP);
    assert.equal(counts.logouts, 4);
    assert.equal(counts.leases, 0);
    assert.equal(counts.quiescenceReads, RUN_CAP + 1);
    if (bridge) assert.equal(counts.admissionAuthReads, 4);
    assert.equal(projectD324Journal(await readFile(journal)).length, RUN_CAP);
    const exportPath = join(directory, 'OFFLINE-export.json');
    await writeFile(exportPath, JSON.stringify({
      classification: 'OFFLINE_SYNTHETIC', taskId: RUN1.taskId, planHash: plan.planHash,
      profileSha256: D324_CAPTURE_PROFILE_SHA256, chainVerified: false, grantsExecutionAuthority: false, captures,
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ scenario, result: 'PASS', publishedLauncherClosed: true,
      operatorSha: operator.sha, steps: RUN_CAP, captures: captures.length, released: true,
      journal: join(directory, 'operator-state', RUN1.taskId + '-' + RUN1.businessSha + '.jsonl'), exportPath }));
  }
}
