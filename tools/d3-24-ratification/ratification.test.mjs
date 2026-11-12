import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { bytes, hash, SPEC } from '../d3-evidence-capture/common.mjs';
import { OWNER_QUERY_SHA256 as HISTORICAL_QUERY, parseOwnerExport } from '../d3-evidence-capture/owner-export.mjs';
import { X, native } from '../d3-evidence-capture/xdr-reader.mjs';
import { verifyTx } from '../d3-evidence-capture/verifier.mjs';
import { createReplayReaders } from '../d3-receipt-capture/sources.mjs';
import { runEntry } from '../d3-run1-launcher/live.mjs';
import { fixture as sessionFixture } from '../d3-run1-launcher/replay.mjs';
import { d324ControlPaths, reviewD324Composition } from './composition.mjs';
import { reviewEntry } from './review.mjs';
import { captureD324Receipt, verifyD324CapturedTransaction, verifyD324CaptureInventory, verifyD324ChainState,
  verifyFreshD324Scopes } from './capture.mjs';
import { OWNER_QUERY_SHA256, OWNER_QUERY_URL, readD324Ledger, readD324Plan, retired, RUN1 } from './identity.mjs';
import { verifyD324OwnerExport } from './owner-export.mjs';
import { operatorCandidate, verifyD324OperatorCommit } from './operator-identity.mjs';
import { projectD324Journal, readD324Snapshots, verifyD324Completion, verifyD324Readiness } from './readiness.mjs';

const history = await readD324Ledger();
const methodStates = ['REGISTERED', 'RETURNED', 'COLLECTED', 'RECYCLED', 'RECYCLED'];
const rewardStates = ['NOT_ELIGIBLE', 'NOT_ELIGIBLE', 'NOT_ELIGIBLE', 'PENDING', 'SENT'];
const chainStates = ['Registered', 'Returned', 'Collected', 'Recycled', 'Recycled'];
const chainRewards = ['NotEligible', 'NotEligible', 'NotEligible', 'Pending', 'Sent'];
const sources = ['admin', 'service', 'service', 'recycler', 'service'];
const requestId = 'a'.repeat(64);
const scopes = SPEC.methods.map((method, index) => ({ method, batteryId: RUN1.batteryId, ledger: 7_000_001 + index,
  operationId: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'), transactionHash: hash('synthetic D3-24 ' + method) }));

function rowsFor(completed) {
  return scopes.slice(0, completed).flatMap((scope, index) => {
    const base = { taskId: RUN1.taskId, gitSha: RUN1.businessSha, batteryId: RUN1.batteryId, runId: RUN1.runId, operation: scope.method };
    const id = { operationId: scope.operationId, transactionHash: scope.transactionHash, confirmationMode: 'OBSERVED' };
    return [{ ...base, phase: 'INTENT' }, { ...base, phase: 'RESULT', operationId: scope.operationId, httpStatus: 202 },
      { ...base, phase: 'RESULT', ...id, reconciliation: 'CONFIRMED' },
      { ...base, phase: 'RESULT', ...id, domainState: methodStates[index], rewardState: rewardStates[index],
        ...(index ? { requestId } : {}) }];
  });
}
const journal = rows => Buffer.from(rows.map(row => JSON.stringify(row) + '\n').join(''));

function snapshots(completed) {
  const request = completed > 1 ? requestId : null;
  const pos = completed - 1;
  const ops = scopes.slice(0, completed).map((scope, i) => ({
    id: scope.operationId, hash: scope.transactionHash, receiptHash: scope.transactionHash,
    ledger: scope.ledger, battery: scope.batteryId, command: scope.method, source: SPEC.actors[sources[i]],
    sequence: String(12 + sources.slice(0, i + 1).filter(role => role === sources[i]).length),
    dispatches: 1, state: 'CONFIRMED', work: 'PROJECTED',
  }));
  return {
    journalBytes: journal(rowsFor(completed)),
    sql: { read_only: 'on', occupied: completed ? 1 : 0, active_leases: 0, pending: 0, uncertain: 0, reconciliation_locks: 0,
      foreign_holds: 0, review_intents: 0,
      deployment: { mode: 'TESTNET', network: SPEC.networkId, contract: SPEC.contract, wasm: SPEC.wasm,
        admin: SPEC.actors.admin, service: SPEC.actors.service, sac: SPEC.token, reward: '100000000' },
      wallets: SPEC.wallets.map(address => ({ address, verified: true, active_links: 1, matching_owner_links: 2 })),
      battery: completed ? { state: methodStates[pos], reward: rewardStates[pos], requestId: request } : null,
      requests: request ? [{ id: request, recipient: RUN1.recipient, state: completed === 2 ? 'HELD' : 'CONSUMED' }] : [],
      operations: [...history.confirmed.map(row => ({ id: row.operationId, hash: row.txHash, receiptHash: row.txHash, ledger: row.ledger,
        battery: row.batteryId, command: row.step, dispatches: 1, state: 'CONFIRMED', work: 'PROJECTED' })),
      { id: history.excludedPreDispatch.operationId, battery: history.excludedPreDispatch.batteryId, hash: null, dispatches: 0,
        state: 'CANCELLED_LOCAL', work: 'ABORTED_PRE_DISPATCH' }, ...ops],
    },
    chain: { ledger: 7_000_010, battery: completed ?
      { state: [chainStates[pos]], reward_state: [chainRewards[pos]], request_id: request } : null,
      pool: completed === 5 ? 600_000_000n : 700_000_000n, minimumTtl: 10_000,
      sources: Object.entries(SPEC.actors).map(([role, address]) => ({
        role, address, sequence: String(12 + sources.slice(0, completed).filter(item => item === role).length), available: 300_000_000n })),
      wallets: SPEC.wallets.map(address => ({ address, balance: completed === 5 && address === RUN1.recipient ? 100_000_000n : 0n,
        capacity: 300_000_000n })),
    },
  };
}

test('candidate plan and append-only history are exact; RUN1 cap 5 and contingency remains locked', async () => {
  assert.equal(readD324Plan().planHash, RUN1.planHash);
  assert.equal(history.confirmedConsumed, 5);
  assert.equal(history.remaining, 14);
  assert.equal(history.runCap, 5);
  assert.equal(history.txAuthorized, false);
  assert.equal(history.contingencyAuthorized, false);
  assert.throws(() => readD324Plan(Buffer.from('{}')), /D324_PLAN_DIGEST_REJECTED/);
  const candidate = readFileSync(new URL('./external-project-ledger.jsonl', import.meta.url));
  const edited = Buffer.from(candidate.toString().replace('"contingencyAuthorized":false','"contingencyAuthorized":true'));
  await assert.rejects(readD324Ledger(edited), /D324_LEDGER_DIGEST_REJECTED/);
});

test('operator identity requires a real object after a future authorized freeze', () => {
  assert.equal(operatorCandidate.sha, RUN1.businessSha);
  const check = spawnSync('git', ['cat-file', '-e', RUN1.businessSha + '^{commit}'], {
    cwd: new URL('../../', import.meta.url), stdio: 'ignore',
  });
  assert.equal(check.error, undefined);
  if (check.status === 0) assert.equal(verifyD324OperatorCommit(), operatorCandidate);
  else assert.throws(verifyD324OperatorCommit, /D324_OPERATOR_COMMIT_NOT_MATERIALIZED/);
});

test('candidate readiness reconciles SQL and Testnet snapshots across five serial steps', async () => {
  let baseline;
  for (let step = 0; step < scopes.length; step++) {
    const result = await verifyD324Readiness({ ...snapshots(step), baseline });
    assert.equal(result.taskId, RUN1.taskId);
    assert.equal(result.completed, step);
    assert.equal(result.remainingThisRun, 5 - step);
    assert.equal(result.grantsExecutionAuthority, false);
    baseline = result.baseline;
  }
  assert.equal(projectD324Journal(journal(rowsFor(5))).length, 5);
  await assert.rejects(verifyD324Readiness({ ...snapshots(5), baseline }), /RUN1_OPERATION_IDENTITY_REJECTED/);
  assert.equal((await verifyD324Completion({ ...snapshots(5), baseline })).confirmedExternal, 10);
  const wrongBalance = snapshots(5);
  wrongBalance.chain.wallets[0].balance = 0n;
  await assert.rejects(verifyD324Completion({ ...wrongBalance, baseline }), /REWARD_READINESS_REJECTED/);
  const unexpected = snapshots(5);
  unexpected.sql.operations.push({ ...unexpected.sql.operations[0], id: 'unexpected-consumption' });
  await assert.rejects(verifyD324Completion({ ...unexpected, baseline }), /EXTERNAL_LEDGER_CONSUMPTION_REJECTED/);
});

test('retired history cannot be dropped or treated as new; unexpected included work stops', async () => {
  for (const mutate of [
    s => { s.sql.operations = s.sql.operations.filter(row => row.id !== retired.operationId); },
    s => { s.sql.operations.find(row => row.id === retired.operationId).battery = RUN1.batteryId; },
    s => { s.sql.operations.find(row => row.id === retired.operationId).receiptHash = '0'.repeat(64); },
    s => { s.sql.operations.push({ ...s.sql.operations[0], id: '00000000-0000-4000-8000-000000000099' }); },
  ]) {
    const s = snapshots(0); mutate(s);
    await assert.rejects(verifyD324Readiness(s), /EXTERNAL_LEDGER_CONSUMPTION_REJECTED/);
  }
});

test('journal rejects absent, repeated, changed and partial identities, and rejects historical namespaces', async () => {
  for (const mutate of [
    rows => { delete rows[3].operationId; },
    rows => { rows[3].transactionHash = scopes[1].transactionHash; },
    rows => { rows.push(rows[7]); },
    rows => { rows[4].taskId = 'D3-23-RUN1'; },
    rows => { rows[6].gitSha = 'c6ba2e837ed0f7b81373655b8106b58ecb86a8cd'; },
    rows => { rows[6].batteryId = retired.batteryId; },
    rows => { rows.pop(); },
    rows => { for (const row of rows.slice(4)) if (row.operationId) row.operationId = scopes[0].operationId; },
  ]) {
    const rows = rowsFor(2); mutate(rows);
    assert.throws(() => projectD324Journal(journal(rows)), /D324_JOURNAL_|DUPLICATE_JSON_KEY/);
  }
  const s = snapshots(1);
  s.sql.operations.at(-1).id = scopes[1].operationId;
  await assert.rejects(verifyD324Readiness(s), /RUN1_OPERATION_IDENTITY_REJECTED/);
});

test('read ports scope SQL and RPC keys to candidate battery, with coordinated read-only SQL', async () => {
  const calls = [], requests = [];
  const pool = { async connect() { return { async query(statement, parameters) {
    calls.push({ statement, parameters }); return { rows: [{ read_only: 'on' }] };
  }, release() { calls.push({ statement: 'release' }); } }; } };
  const read = async (url, options) => {
    if (!url.includes('/accounts/')) requests.push(JSON.parse(options.body));
    return new Response(null, { status: 503 });
  };
  await assert.rejects(readD324Snapshots(pool, read));
  assert.equal(calls[0].statement, 'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY');
  assert(calls.some(({ statement }) => typeof statement === 'string' && statement.includes('pg_advisory_xact_lock_shared')));
  const snapshot = calls.find(({ statement }) => typeof statement === 'object').statement;
  assert.equal(snapshot.values[1], RUN1.batteryId);
  assert(calls.some(({ statement }) => statement === 'ROLLBACK'));
  const keys = requests.find(call => call.method === 'getLedgerEntries').params.keys;
  const batteryKeys = keys.map(key => X.LedgerKey.fromXDR(key, 'base64')).filter(key => key.type === 'contractData')
    .map(key => native(key.contractData.key)).filter(key => key?.[0] === 'Battery');
  assert.deepEqual(batteryKeys, [['Battery', RUN1.batteryId]]);
});

test('receipt capture is create-only in the candidate namespace and offline proof cannot become chain evidence', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../d3-receipt-capture/fixtures/tx1-public-values.json', import.meta.url)));
  const scope = scopes[0];
  const receipt = { ...scope, receiptTransactionHash: scope.transactionHash, status: 'SUCCESS', applicationState: 'CONFIRMED',
    durableState: 'PROJECTED', resultXdr: fixture.resultXdr, resultMetaXdr: fixture.resultMetaXdr };
  const output = await captureD324Receipt(scope, createReplayReaders([receipt], [receipt]));
  assert.equal(output.status, 'DURABLE_RECEIPT_CONVERGED_NORMALIZED');
  const proof = await verifyD324CaptureInventory(output.directory, scope, 'OFFLINE_SYNTHETIC');
  assert.equal(proof.chainVerified, false);
  await assert.rejects(verifyD324CapturedTransaction(output.directory, scope, {}, {}), /D324_CAPTURE_BINDING_REJECTED/);
  await assert.rejects(verifyFreshD324Scopes([{ ...scope, operationId: retired.operationId }]), /HISTORICAL_OR_DUPLICATE/);
  await assert.rejects(verifyFreshD324Scopes([{ ...scope, transactionHash: retired.txHash }]), /HISTORICAL_OR_DUPLICATE/);
  await assert.rejects(verifyFreshD324Scopes([scope, scope]), /HISTORICAL_OR_DUPLICATE/);
  await assert.rejects(verifyD324CaptureInventory(tmpdir(), scope, 'OFFLINE_SYNTHETIC'), /D324_CAPTURE_DIRECTORY_REJECTED/);
  const sidecar = join(output.directory, 'identity.json');
  const original = readFileSync(sidecar);
  const changed = JSON.parse(original); changed.identity.taskId = 'D3-23-RUN1';
  writeFileSync(sidecar, bytes(changed));
  await assert.rejects(verifyD324CaptureInventory(output.directory, scope, 'OFFLINE_SYNTHETIC'), /D324_CAPTURE_BINDING_REJECTED/);
  writeFileSync(sidecar, original);
  assert.deepEqual(readFileSync(sidecar), original);
});

test('captured contract data must use the candidate battery and approved reward recipient', () => {
  const expected = { method: 'pay_reward', domainState: 'RECYCLED', rewardState: 'SENT', requestId };
  const chain = { meta: { entries: [{ kind: 'Battery', id: RUN1.batteryId, change: 'ledgerEntryUpdated' }],
    after: { battery: { state: 'RECYCLED', rewardState: 'SENT', requestId } }, returnNative: { recipient: RUN1.recipient } } };
  assert.doesNotThrow(() => verifyD324ChainState(expected, chain));
  for (const wrong of [
    { ...chain.meta, entries: [{ kind: 'Battery', id: retired.batteryId, change: 'ledgerEntryUpdated' }] },
    { ...chain.meta, returnNative: { recipient: SPEC.wallets[1] } },
    { ...chain.meta, after: { battery: { ...chain.meta.after.battery, requestId: 'b'.repeat(64) } } },
  ]) assert.throws(() => verifyD324ChainState(expected, { meta: wrong }), /D324_CHAIN_STATE_REJECTED/);
});

test('an authentic historical Testnet envelope cannot verify under the D3-24 battery identity', () => {
  const { items: [historical] } = JSON.parse(readFileSync(new URL('../d3-evidence-capture/fixtures/historical.json', import.meta.url)));
  assert.equal(verifyTx(historical).verification.TX_IDENTITY_VERIFIED, 'PASS');
  assert.throws(() => verifyTx({ ...historical, expected: { ...historical.expected, batteryId: RUN1.batteryId } }), /WRONG_BATTERY/);
});

test('old launcher rejects candidate argv before any operational port is reached', async () => {
  const ports = new Proxy({}, { get() { assert.fail('unexpected operational port'); } });
  assert.equal(await runEntry(['--live', '--task-id', RUN1.taskId, '--expected-sha', RUN1.businessSha], {}, ports), 'EXACT_ARGV_REQUIRED');
});

const manifestUrl = new URL('./composition-files.json', import.meta.url);
const reviewPin = () => hash(readFileSync(manifestUrl));
const operatorRoot = () => realpathSync(resolve(process.env.BYETERY_D324_TEST_OPERATOR_ROOT ?? '../B24op'));
const reviewComposition = () => reviewD324Composition({ operatorRoot: operatorRoot(), manifestSha256: reviewPin() });

test('review command verifies composition and commit while rejecting operational or mismatched identity', async () => {
  const argv = ['--review', '--task-id', RUN1.taskId, '--expected-sha', RUN1.businessSha, '--plan-hash',
    RUN1.planHash, '--battery', RUN1.batteryId, '--operator-root', operatorRoot(), '--manifest-sha256', reviewPin()];
  for (const [index, value] of [[0, '--live'], [2, 'D3-23-RUN1'], [4, operatorCandidate.parent],
    [6, '0'.repeat(64)], [8, retired.batteryId]]) {
    const wrong = argv.with(index, value);
    await assert.rejects(reviewEntry(wrong), /D324_REVIEW_ARGS_REJECTED/);
  }
  await assert.rejects(reviewEntry(argv.with(argv.length - 1, '0'.repeat(64))), /D324_COMPOSITION_MANIFEST_REJECTED/);
  const descriptor = await reviewEntry(argv);
  assert.equal(descriptor.operator.sha, RUN1.businessSha);
  assert.equal(descriptor.runCap, 5);
  assert.equal(descriptor.remainingExternal, 14);
  assert.equal(descriptor.tx20Authorized, false);
  assert.equal(descriptor.liveAuthority, false);
  const controls = d324ControlPaths(operatorRoot());
  assert(controls.admission.endsWith('byetery-d3-24-run1.launcher-admission'));
  assert(controls.journal.endsWith(RUN1.taskId + '-' + RUN1.businessSha + '.jsonl'));
  assert(controls.consumed.endsWith(RUN1.batteryId + '.consumed'));
});

function replayFixture({ crashAt, tamperAt, unexpectedHistory } = {}) {
  const tx = JSON.parse(readFileSync(new URL('../d3-receipt-capture/fixtures/tx1-public-values.json', import.meta.url)));
  const actions = [];
  const captures = [];
  let completed = 0;
  let stopped = false;
  const { now, sessionConfig, observeSessions } = sessionFixture([]);
  return { actions, captures, options: {
    identity: RUN1, mode: 'OFFLINE_SYNTHETIC', now, sessionConfig, observeSessions,
    readSnapshot() {
      const result = snapshots(completed);
      if (completed === tamperAt) {
        const rows = rowsFor(completed); delete rows.at(-1).operationId; result.journalBytes = journal(rows);
      }
      if (unexpectedHistory) result.sql.operations.push({ ...result.sql.operations[0], id: 'unexpected-consumption' });
      return result;
    },
    preserve: async () => {},
    receiptReaders(scope, attempt) {
      captures.push({ scope, attempt });
      const receipt = { ...scope, receiptTransactionHash: scope.transactionHash, status: 'SUCCESS',
        applicationState: 'CONFIRMED', durableState: 'PROJECTED', resultXdr: tx.resultXdr, resultMetaXdr: tx.resultMetaXdr };
      return createReplayReaders([receipt], [receipt]);
    },
    operatorFactory: async () => ({
      async step(method) {
        const index = completed;
        const scope = scopes[index];
        assert.equal(method, scope.method);
        actions.push(method);
        if (index === crashAt) throw Error('SYNTHETIC_CRASH');
        completed++;
        const payload = Buffer.from('OFFLINE_SYNTHETIC:' + method);
        return {
          operation: method, batteryId: scope.batteryId, operationId: scope.operationId,
          transactionHash: scope.transactionHash, requestId: index ? requestId : null,
          confirmedBatteryState: methodStates[index], confirmedRewardState: rewardStates[index],
          confirmationLedger: scope.ledger, confirmedAt: new Date(now()).toISOString(), confirmationMode: 'OBSERVED',
          ...(index === 2 || index === 3 ? { payload: { manifestBase64: payload.toString('base64'), payloadHash: hash(payload) } } : {}),
        };
      },
      countingDecision: async () => ({ batteryId: RUN1.batteryId, sha: RUN1.businessSha, status: 'COMPLETED', countable: completed === 5 }),
      close: async () => { assert.equal(stopped, false); stopped = true; },
    }),
  } };
}

test('pinned composition runs the five-step launcher only in synthetic mode and validates each journal and capture', async () => {
  const composition = await reviewComposition();
  const { options, actions, captures } = replayFixture();
  assert.throws(() => composition.replay({ ...options, mode: 'LIVE' }), /D324_REPLAY_IDENTITY_REJECTED/);
  const result = await composition.replay(options);
  assert.equal(result.status, 'OFFLINE_CAPTURE_COMPLETE');
  assert.equal(result.executionAuthority, false);
  assert.deepEqual(actions, SPEC.methods);
  assert.equal(captures.length, 5);
  assert.deepEqual(result.accepted.map(row => row.operationId), scopes.map(row => row.operationId));
  assert.throws(() => composition.replay(options), /D324_REPLAY_IDENTITY_REJECTED/);
});

test('pinned composition stops on crash, wrong journal identity or unexpected consumption without another business attempt', async () => {
  for (const [scenario, count] of [[{ crashAt: 1 }, 2], [{ tamperAt: 1 }, 1], [{ unexpectedHistory: true }, 0]]) {
    const composition = await reviewComposition();
    const { options, actions } = replayFixture(scenario);
    assert.match((await composition.replay(options)).status, /^STOP_OPERATOR_/);
    assert.equal(actions.length, count);
    assert.throws(() => composition.replay(options), /D324_REPLAY_IDENTITY_REJECTED/);
  }
});

function exportInput() {
  return {
    journalBytes: journal(rowsFor(5)), scopes,
    observations: scopes.map(scope => ({ expected: { hash: scope.transactionHash, batteryId: RUN1.batteryId, method: scope.method },
      rpc: { ledger: scope.ledger } })),
  };
}
function exportRecord(overrides = {}) {
  return { schema: 'BYETERY_D324_OWNER_EXPORT_V1', rows: [], metadata: {
    query_sha256: OWNER_QUERY_SHA256, export_time: '2026-11-11T23:00:00Z', deployment_id: SPEC.deployment,
    database: 'SUPABASE_DEV', project_ref: 'aemxuqnnwfclzrwwiqfd', transaction_read_only: 'on',
    business_execution_sha: RUN1.businessSha, task_id: RUN1.taskId, plan_hash: RUN1.planHash, battery_id: RUN1.batteryId,
    requested_operation_ids: scopes.map(scope => scope.operationId), ...overrides,
  } };
}

test('owner export requires all five exact IDs and rejects historical profile, plan, query and battery', async () => {
  assert.equal(hash(readFileSync(OWNER_QUERY_URL)), OWNER_QUERY_SHA256);
  assert.notEqual(OWNER_QUERY_SHA256, HISTORICAL_QUERY);
  const input = exportInput();
  const checks = [
    [{ task_id: 'D3-23-RUN1' }, /OWNER_EXPORT_PROFILE_REJECTED/],
    [{ plan_hash: '0'.repeat(64) }, /OWNER_EXPORT_PROFILE_REJECTED/],
    [{ battery_id: retired.batteryId }, /OWNER_EXPORT_PROFILE_REJECTED/],
    [{ business_execution_sha: 'c6ba2e837ed0f7b81373655b8106b58ecb86a8cd' }, /UNVERIFIED_OWNER_EXPORT_PROVENANCE/],
    [{ query_sha256: HISTORICAL_QUERY }, /WRONG_OWNER_QUERY_HASH/],
    [{}, /OWNER_EXPORT_ROWS_MISSING/],
  ];
  for (const [overrides, error] of checks) {
    const raw = bytes(exportRecord(overrides));
    await assert.rejects(verifyD324OwnerExport(raw, hash(raw), input), error);
  }
  const raw = bytes(exportRecord());
  await assert.rejects(verifyD324OwnerExport(raw, hash(raw), { ...input, scopes: scopes.slice(0,4) }), /D324_EXPORT_INCOMPLETE/);
  await assert.rejects(verifyD324OwnerExport(raw, hash(raw), { ...input, scopes: scopes.toReversed() }), /D324_EXPORT_OPERATION_IDENTITY_REJECTED/);
  assert.throws(() => parseOwnerExport(raw, hash(raw), { deployment_id: SPEC.deployment,
    operations: scopes.map(s => ({ operation_id: s.operationId, transaction_hash: s.transactionHash, command: s.method, battery_id: s.batteryId })) }),
  /MALFORMED_OWNER_EXPORT/);
});

test('candidate SQL export query selects only its battery and refuses non-read-only transactions', async () => {
  const require = createRequire(new URL('../../backend/package.json', import.meta.url));
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  const ids = JSON.stringify(scopes.map(scope => scope.operationId));
  const source = readFileSync(OWNER_QUERY_URL, 'utf8');
  const prefix = "WITH fixture_work AS (SELECT $3::uuid deployment_id,$4::uuid operation_id,$5::text battery_id," +
    "'register_battery'::text command,''::text source_account,'PROJECTED'::text state,'{}'::jsonb confirmation,NULL::jsonb state_evidence)," +
    "fixture_operations AS (SELECT $3::uuid deployment_id,$4::uuid id,'CONFIRMED'::text state)," +
    "fixture_envelopes AS (SELECT $3::uuid deployment_id,$4::uuid operation_id,''::bytea transaction_hash,''::bytea signed_envelope,''::bytea network_id,''::text contract_address)," +
    "fixture_observations AS (SELECT NULL::uuid deployment_id,NULL::uuid operation_id,NULL::bigint id,NULL::text kind,NULL::jsonb evidence," +
    "NULL::bigint observation_ledger,NULL::bigint confirmation_ledger,NULL::bigint state_read_ledger WHERE false), ";
  const query = source.slice(source.indexOf('WITH ')).replace('WITH ', prefix)
    .replaceAll(":'operation_ids'", '$1').replaceAll(":'query_sha256'", '$2')
    .replaceAll('api_private.testnet_work', 'fixture_work').replaceAll('app_private.stellar_operations', 'fixture_operations')
    .replaceAll('api_private.testnet_envelopes', 'fixture_envelopes').replaceAll('api_private.testnet_observations', 'fixture_observations');
  const params = [ids, OWNER_QUERY_SHA256, SPEC.deployment, scopes[0].operationId, RUN1.batteryId];
  try {
    assert.equal((await db.query(query, params)).rows.length, 0);
    await db.exec('BEGIN TRANSACTION READ ONLY');
    const [result] = (await db.query(query, params)).rows;
    assert.equal(result.owner_export.metadata.task_id, RUN1.taskId);
    assert.equal(result.owner_export.metadata.plan_hash, RUN1.planHash);
    assert.equal(result.owner_export.rows.length, 1);
    const [old] = (await db.query(query, [...params.slice(0,-1), retired.batteryId])).rows;
    assert.deepEqual(old.owner_export.rows, []);
    const extra = JSON.stringify([...JSON.parse(ids), '00000000-0000-4000-8000-000000000099']);
    const [over] = (await db.query(query, [extra, ...params.slice(1)])).rows;
    assert.deepEqual(over.owner_export.rows, []);
    await db.exec('ROLLBACK');
  } finally { await db.close(); }
});
