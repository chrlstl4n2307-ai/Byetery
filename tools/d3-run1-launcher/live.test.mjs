import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { localDb } from '../../backend/tests/testnet-fixtures.ts';
import { SPEC } from '../d3-evidence-capture/common.mjs';
import { createReadPreflight, RUN1 } from './boundaries.mjs';
import { createDiagnostics } from './diagnostics.mjs';
import { verifyOwnerGrant } from './grant-verifier.mjs';
import { ARGV, K7, ROOT, runEntry } from './live.mjs';
import { readChain } from './live-chain.mjs';
import { evaluateReadiness, readLedger } from './live-readiness.mjs';
import { readSql } from './live-sql.mjs';

const history = await readLedger(ROOT);
const compositionSha = 'a'.repeat(40);
const envelope = { grant: { fixture: 'offline' }, signature: 'offline-fixture' };
const fakeSecret = 'fixture-secret-with-sensitive-diagnostics';

function snapshots() {
  return {
    history, journal: [],
    sql: {
      read_only: 'on', occupied: 0, active_leases: 0, pending: 0, uncertain: 0, reconciliation_locks: 0,
      foreign_holds: 0, review_intents: 0, battery: null, requests: [],
      deployment: { mode: 'TESTNET', network: SPEC.networkId, contract: SPEC.contract, wasm: SPEC.wasm,
        admin: SPEC.actors.admin, service: SPEC.actors.service, sac: SPEC.token, reward: '100000000' },
      wallets: SPEC.wallets.map(address => ({ address, verified: true, active_links: 1, matching_owner_links: 2 })),
      operations: [...history.confirmed.map(row => ({
        id: row.operationId, hash: row.txHash, receiptHash: row.txHash, ledger: row.ledger, battery: row.batteryId,
        command: row.step, dispatches: 1, state: 'CONFIRMED', work: 'PROJECTED',
      })), {
        id: history.excludedPreDispatch.operationId, battery: history.excludedPreDispatch.batteryId,
        state: 'CANCELLED_LOCAL', work: 'ABORTED_PRE_DISPATCH', dispatches: 0, hash: null,
      }],
    },
    chain: {
      ledger: 6_000_000, battery: null, pool: 700_000_000n, minimumTtl: 10_000,
      sources: Object.entries(SPEC.actors).map(([role, address]) => ({ role, address, sequence: '12', available: 300_000_000n })),
      wallets: SPEC.wallets.map(address => ({ address, balance: 0n, capacity: 300_000_000n })),
    },
  };
}

function harness(change = () => {}) {
  const observations = snapshots();
  change(observations);
  const events = [];
  const sqlPool = { connect() { assert.fail('unexpected direct SQL access'); } };
  const secureStore = { resolve() { assert.fail('pre-admission credential lookup'); } };
  const runtime = {
    frozenRoot: resolve(ROOT, 'fixture-frozen-root'), apiOrigin: 'http://127.0.0.1:3001', publishableKey: 'fixture-public-key',
    readSources: async ({ requestId, identity }) => {
      events.push('preflight');
      assert.equal(identity, RUN1);
      evaluateReadiness(observations);
      const observedAt = Date.now();
      return { requestId, preflight: { mode: 'TESTNET', taskId: RUN1.taskId, runId: RUN1.runId, sameRuntimeSha: RUN1.businessSha, observedAt },
        observations: [
          { source: 'LOCAL_GIT', observedAt, ledger: null },
          { source: 'SUPABASE_SQL_READ_ONLY', observedAt, ledger: null },
          { source: 'STELLAR_RPC_TESTNET', observedAt, ledger: observations.chain.ledger },
        ] };
    },
    secureStore, sqlPool,
  };
  let verified;
  const ports = {
    composition: async () => compositionSha,
    verifyPins: async () => {},
    readEnvelope: async () => JSON.stringify(envelope),
    verifyGrant(value, head) {
      assert.equal(head, compositionSha);
      assert.deepEqual(value, envelope);
      if (verified) assert.equal(verified, value);
      verified = value;
      events.push('verify');
    },
    async bindRuntime() {
      events.push('bind');
      return { runtime, preAdmission: async () => events.push('controls'), close: async () => events.push('close') };
    },
    ready: () => events.push('ready'),
    async launch(grant, suppliedRuntime) {
      assert.equal(grant, verified);
      assert.equal(suppliedRuntime, runtime);
      events.push('launch');
      return { status: 'LIVE_CAPTURE_COMPLETE' };
    },
  };
  return { ports, runtime, events };
}

test('the offline fixture reaches the call boundary with all six bindings and the exact envelope object', async () => {
  const h = harness();
  assert.equal(await runEntry(ARGV, {}, h.ports), 'LIVE_CAPTURE_COMPLETE');
  assert.deepEqual(h.events, ['verify', 'bind', 'controls', 'preflight', 'controls', 'verify', 'ready', 'launch', 'close']);
});

for (const input of ['', '{', '{}', '{"grant":{}}', '{"grant":{},"signature":"fake","extra":true}']) {
  test('rejects malformed or non-exact envelope fixture ' + input, async () => {
    const h = harness();
    h.ports.readEnvelope = async () => input;
    assert.equal(await runEntry(ARGV, {}, h.ports), 'OWNER_GRANT_REJECTED');
    assert.deepEqual(h.events, []);
  });
}

test('the real downstream pinned verifier rejects an invalid grant schema', async () => {
  const h = harness();
  h.ports.verifyGrant = verifyOwnerGrant;
  assert.equal(await runEntry(ARGV, {}, h.ports), 'OWNER_GRANT_REJECTED');
  assert.deepEqual(h.events, []);
});

test('rejects an additional argv token without loading the envelope', async () => {
  const h = harness();
  h.ports.readEnvelope = () => assert.fail('envelope read');
  assert.equal(await runEntry([...ARGV, '--envelope'], {}, h.ports), 'EXACT_ARGV_REQUIRED');
  assert.deepEqual(h.events, []);
});

test('refuses hosted, CI, production and Git environment overrides before reading the envelope', async () => {
  for (const env of [{ VERCEL: '' }, { CI: '' }, { NODE_ENV: 'production' }, { GIT_DIR: 'fixture' }]) {
    const h = harness();
    h.ports.readEnvelope = () => assert.fail('envelope read');
    assert.equal(await runEntry(ARGV, env, h.ports), 'LOCAL_EXECUTION_REJECTED');
    assert.deepEqual(h.events, []);
  }
});

test('a missing runtime port and a non-loopback origin stop before preflight', async () => {
  for (const corrupt of [runtime => delete runtime.sqlPool, runtime => { runtime.apiOrigin = 'https://localhost:3001'; }]) {
    const h = harness();
    corrupt(h.runtime);
    assert.equal(await runEntry(ARGV, {}, h.ports), 'RUNTIME_BINDING_REJECTED');
    assert.deepEqual(h.events, ['verify', 'bind', 'close']);
  }
});

test('dirty composition and an unexpected HEAD both fail before runtime', async () => {
  const dirty = harness();
  dirty.ports.composition = async () => { throw Error('DIRTY_EXECUTION_CHECKOUT'); };
  assert.equal(await runEntry(ARGV, {}, dirty.ports), 'COMPOSITION_CHECKOUT_REJECTED');
  const wrong = harness();
  wrong.ports.composition = async () => K7;
  assert.equal(await runEntry(ARGV, {}, wrong.ports), 'OWNER_GRANT_REJECTED');
  assert.deepEqual(dirty.events, []);
  assert.deepEqual(wrong.events, []);
});

test('frozen business checkout failure stops before the launch boundary', async () => {
  const h = harness();
  h.ports.bindRuntime = async () => { throw Error('FROZEN_OPERATOR_SHA_REJECTED'); };
  assert.equal(await runEntry(ARGV, {}, h.ports), 'RUNTIME_BINDING_REJECTED');
  assert.deepEqual(h.events, ['verify']);
});

for (const [label, corrupt] of [
  ['SQL battery collision', ({ sql }) => { sql.occupied = 1; }],
  ['Testnet battery collision', ({ chain }) => { chain.battery = {}; }],
  ['active source lease', ({ sql }) => { sql.active_leases = 1; }],
  ['foreign reservation', ({ sql }) => { sql.foreign_holds = 1; }],
  ['reconciliation lock', ({ sql }) => { sql.reconciliation_locks = 1; }],
  ['uncertainty marker', ({ sql }) => { sql.uncertain = 1; }],
  ['pending dispatch', ({ sql }) => { sql.pending = 1; }],
  ['external ledger mismatch', ({ sql }) => { sql.operations[0].hash = '1'.repeat(64); }],
  ['deployment identity mismatch', ({ sql }) => { sql.deployment.sac = SPEC.contract; }],
  ['Testnet source identity mismatch', ({ chain }) => { chain.sources[0].address = SPEC.wallets[0]; }],
  ['insufficient reward pool', ({ chain }) => { chain.pool = 1n; }],
  ['insufficient Wallet A trustline capacity', ({ chain }) => { chain.wallets[0].capacity = 0n; }],
]) {
  test(label + ' stops before launcher and does not retry', async () => {
    const h = harness(corrupt);
    assert.equal(await runEntry(ARGV, {}, h.ports), 'PRE_ADMISSION_READS_REJECTED');
    assert.deepEqual(h.events, ['verify', 'bind', 'controls', 'preflight', 'close']);
  });
}

test('no credentials are resolved before launcher and a startup error is sanitized with no retry', async () => {
  const h = harness();
  h.runtime.secureStore.resolve = async () => ({ email: 'fixture', password: fakeSecret });
  h.ports.launch = async (_grant, runtime) => {
    h.events.push('launch');
    const credentials = await runtime.secureStore.resolve('USER');
    assert.equal(credentials.password, fakeSecret);
    throw Error(fakeSecret);
  };
  const result = await runEntry(ARGV, {}, h.ports);
  assert.equal(result, 'RUN1_STOP_REQUIRES_RECONCILIATION');
  assert.ok(!result.includes(fakeSecret));
  assert.deepEqual(h.events, ['verify', 'bind', 'controls', 'preflight', 'controls', 'verify', 'ready', 'launch', 'close']);
});

test('a changed composition after preflight stops before launch', async () => {
  const h = harness();
  const heads = [compositionSha, 'b'.repeat(40)];
  h.ports.composition = async () => heads.shift();
  assert.equal(await runEntry(ARGV, {}, h.ports), 'COMPOSITION_CHECKOUT_REJECTED');
  assert.deepEqual(h.events, ['verify', 'bind', 'controls', 'preflight', 'controls', 'close']);
});

test('SQL opens a read-only transaction, uses one snapshot SELECT and rolls back', async () => {
  const calls = [];
  const pool = { async connect() {
    return {
      async query(query) {
        calls.push(typeof query === 'string' ? query : query.text);
        return { rows: typeof query === 'object' && query.text.includes('current_setting') ? [{ read_only: 'on', wallets: [] }] : [] };
      },
      release() { calls.push('release'); },
    };
  } };
  assert.deepEqual(await readSql(pool), { read_only: 'on', wallets: [] });
  assert.equal(calls[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(calls.length, 4);
  assert.match(calls[1], /^\s*with/i);
  assert.doesNotMatch(calls[1], /\b(?:insert|update|delete|grant|alter)\b/i);
  assert.deepEqual(calls.slice(2), ['ROLLBACK', 'release']);
});

test('the readiness SELECTs run against the migrated local PostgreSQL fixture', async () => {
  const db = await localDb();
  try {
    // D2's review table is deployed separately from Foundation migrations.
    const ddl = readFileSync(new URL('../../database/review/d2-008b1-registration-intents.sql', import.meta.url), 'utf8');
    const intents = ddl.match(/create table review_private\.registration_intents \([\s\S]*?\r?\n\);/)[0];
    await db.exec('create schema review_private;\n' + intents);
    const pool = { connect: async () => ({
      query: query => typeof query === 'string' ? db.query(query) : db.query(query.text, query.values),
      release() {},
    }) };
    const result = await readSql(pool);
    assert.equal(result.read_only, 'on');
    assert.equal(result.occupied, 0);
    assert.equal(result.active_leases, 0);
    assert.equal(result.uncertain, 0);
    assert.deepEqual(result.operations, []);
    assert.deepEqual(result.wallets, []);
  } finally {
    await db.close();
  }
});

test('the chain reader uses only fixed public read routes and rejects the wrong network', async () => {
  const requests = [];
  await assert.rejects(readChain(async (rawUrl, options) => {
    const url = new URL(rawUrl);
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    if (options.method === 'GET') {
      assert.equal(url.origin, 'https://horizon-testnet.stellar.org');
      assert.ok([...Object.values(SPEC.actors), ...SPEC.wallets].some(address => url.pathname === '/accounts/' + address));
      requests.push('public-account');
      return Response.json({});
    }
    assert.equal(url.origin, 'https://soroban-testnet.stellar.org');
    const { method } = JSON.parse(options.body);
    assert.ok(['getNetwork', 'getLedgerEntries'].includes(method));
    assert.equal(['sendTransaction', 'simulateTransaction', 'getLatestLedger'].includes(method), false);
    requests.push(method);
    return Response.json({ jsonrpc: '2.0', id: 1, result: { passphrase: 'offline-wrong-network-fixture' } });
  }), /TESTNET_IDENTITY_REJECTED/);
  assert.equal(requests.filter(method => method === 'public-account').length, 6);
  assert.equal(requests.filter(method => method === 'sendTransaction' || method === 'simulateTransaction').length, 0);
  assert.deepEqual(requests.filter(method => method !== 'public-account').sort(),
    ['getLedgerEntries', 'getNetwork']);
});

test('a later lifecycle read must match the already confirmed journal identity', () => {
  const s = snapshots();
  s.baseline = evaluateReadiness(s).baseline;
  const row = { id: 'fixture-id', hash: 'f'.repeat(64), receiptHash: 'f'.repeat(64), ledger: s.chain.ledger,
    battery: RUN1.batteryId, command: 'register_battery', source: SPEC.actors.admin, sequence: '13',
    dispatches: 1, state: 'CONFIRMED', work: 'PROJECTED' };
  s.sql.operations.push(row);
  s.sql.battery = { state: 'REGISTERED', reward: 'NOT_ELIGIBLE', requestId: null };
  s.chain.battery = { state: ['Registered'], reward_state: ['NotEligible'], request_id: null };
  s.chain.sources.find(source => source.role === 'admin').sequence = '13';
  assert.throws(() => evaluateReadiness(s), /RUN1_OPERATION_IDENTITY_REJECTED/);
  s.journal.push({ operation: row.command, operationId: row.id, transactionHash: row.hash,
    domainState: 'REGISTERED', rewardState: 'NOT_ELIGIBLE' });
  assert.equal(evaluateReadiness(s).successfulTxCap, 5);
});

test('grant schema, verifier and owner key remain byte-identical to K6', () => {
  const K6 = '24b0276689667ce2b7d259f493c9069d3bab6c78';
  for (const name of ['grant-verifier.mjs', 'grant-schema.mjs', 'owner-grant-key.mjs']) {
    const file = 'tools/d3-run1-launcher/' + name;
    const baseline = execFileSync('git', ['show', K6 + ':' + file], { cwd: ROOT, windowsHide: true });
    assert.deepEqual(readFileSync(resolve(ROOT, file)), baseline);
  }
});


const LEDGER = 5_000_000;
const OBSERVED_AT = Date.parse('2026-11-09T20:00:10Z');

function chainFetcher({
  ledger = LEDGER,
  closedAt = '2026-11-09T20:00:00Z',
  sequence = ledger,
  reserve = 50_000_000,
  ledgerStatus = 200,
  ledgerThrow,
  ledgerBodyStream,
} = {}) {
  const rpcMethods = [];
  const fetcher = async (rawUrl, options) => {
    const url = new URL(rawUrl);
    if (options.method === 'GET' && url.pathname.startsWith('/accounts/')) {
      return Response.json({});
    }
    if (options.method === 'GET' && url.pathname === '/ledgers/' + ledger) {
      if (ledgerThrow) throw ledgerThrow;
      if (ledgerBodyStream) {
        return {
          ok: true, status: 200, body: ledgerBodyStream,
          headers: new Headers({ 'content-type': 'application/json' }),
        };
      }
      if (ledgerStatus !== 200) return new Response('missing', { status: ledgerStatus });
      const body = { sequence, base_reserve_in_stroops: reserve };
      if (closedAt !== null) body.closed_at = closedAt;
      return Response.json(body);
    }
    assert.equal(url.origin, 'https://soroban-testnet.stellar.org');
    const { method } = JSON.parse(options.body);
    assert.ok(['getNetwork', 'getLedgerEntries'].includes(method));
    assert.equal(['sendTransaction', 'simulateTransaction', 'getLatestLedger'].includes(method), false);
    rpcMethods.push(method);
    if (method === 'getNetwork') {
      return Response.json({ jsonrpc: '2.0', id: 1, result: { passphrase: SPEC.network } });
    }
    return Response.json({ jsonrpc: '2.0', id: 1, result: { latestLedger: ledger, entries: [] } });
  };
  fetcher.rpcMethods = rpcMethods;
  return fetcher;
}

for (const [label, options, pattern] of [
  ['closed_at older than 90s', { closedAt: '2026-11-09T19:58:40Z' }, /CHAIN_READINESS_REJECTED/],
  ['closed_at more than 10s in the future', { closedAt: '2026-11-09T20:00:21Z' }, /CHAIN_READINESS_REJECTED/],
  ['malformed closed_at with milliseconds', { closedAt: '2026-11-09T20:00:00.000Z' }, /CHAIN_READINESS_REJECTED/],
  ['malformed closed_at with offset', { closedAt: '2026-11-09T20:00:00+00:00' }, /CHAIN_READINESS_REJECTED/],
  ['malformed closed_at missing Z', { closedAt: '2026-11-09T20:00:00' }, /CHAIN_READINESS_REJECTED/],
  ['absent closed_at', { closedAt: null }, /CHAIN_READINESS_REJECTED/],
  ['ledger sequence mismatch', { sequence: LEDGER + 1 }, /CHAIN_READINESS_REJECTED/],
  ['Horizon ledger 404', { ledgerStatus: 404 }, /PUBLIC_READ_UNAVAILABLE/],
  ['Horizon ledger fetch abort', { ledgerThrow: Object.assign(new Error('aborted'), { name: 'AbortError' }) },
    /PUBLIC_READ_UNAVAILABLE/],
  ['Horizon ledger fetch timeout', { ledgerThrow: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) },
    /PUBLIC_READ_UNAVAILABLE/],
]) {
  test('the chain reader stops when ' + label, async () => {
    const fetcher = chainFetcher(options);
    await assert.rejects(readChain(fetcher, () => OBSERVED_AT), pattern);
    assert.equal(fetcher.rpcMethods.includes('getLatestLedger'), false);
    assert.equal(fetcher.rpcMethods.includes('sendTransaction'), false);
    assert.equal(fetcher.rpcMethods.includes('simulateTransaction'), false);
  });
}

test('a mid-body AbortError from Horizon ledger bytes is a raw TIMEOUT-class abort', async () => {
  const body = {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{');
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    },
  };
  const fetcher = chainFetcher({ ledgerBodyStream: body });
  await assert.rejects(readChain(fetcher, () => OBSERVED_AT), error => {
    assert.equal(error.name, 'AbortError');
    assert.match(error.message, /aborted/);
    return true;
  });
});

test('a mid-body AbortError becomes TIMEOUT on PREFLIGHT_FAIL, not UNKNOWN', async () => {
  const body = {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{');
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    },
  };
  const diagnostics = createDiagnostics();
  const read = createReadPreflight(async () => readChain(chainFetcher({ ledgerBodyStream: body }), () => OBSERVED_AT),
    { diagnostics });
  await assert.rejects(read(), /PREFLIGHT_SOURCES_UNAVAILABLE/);
  const fail = diagnostics.fatal('STOP_OPERATOR_REQUIRES_REVIEW');
  assert.equal(fail.stage, 'PREFLIGHT_FAIL');
  assert.equal(fail.events.at(-1).innerCode, 'TIMEOUT');
  assert.equal(Object.hasOwn(fail, 'innerCode'), false);
});
