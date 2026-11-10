import assert from 'node:assert/strict';
import test from 'node:test';
import { createReadPreflight } from './boundaries.mjs';
import { createDiagnostics } from './diagnostics.mjs';
import { createRoleResolver } from './live-runtime.mjs';
import { assertRoleIdentities, lookupRole, readSql } from './live-sql.mjs';
import { SPEC } from '../d3-evidence-capture/common.mjs';

function poolFixture(respond) {
  const calls = [];
  const pool = { connect: async () => ({
    async query(query, args) {
      const text = typeof query === 'string' ? query : query.text;
      const values = typeof query === 'string' ? args : query.values;
      calls.push({ text, values });
      return { rows: (await respond(text, values)) ?? [] };
    },
    release() { calls.push({ text: 'release' }); },
  }) };
  return { pool, calls };
}

test('guard uses one shared transaction lock before one read-only snapshot and preserves other lock counts', async () => {
  const state = { read_only: 'on', reconciliation_locks: 1, wallets: [] };
  const { pool, calls } = poolFixture(text => text.includes('current_setting') ? [state] : []);
  assert.deepEqual(await readSql(pool, { coordinate: true }), state);
  assert.deepEqual(calls.map(call => call.text).slice(0, 3), [
    'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY',
    "SET LOCAL lock_timeout='3s'",
    'select pg_advisory_xact_lock_shared(hashtextextended($1::text,0))',
  ]);
  assert.deepEqual(calls[2].values, [SPEC.deployment]);
  assert.equal(calls[3].values[3], true);
  assert.match(calls[3].text, /not \(\$4::boolean and l.pid=pg_backend_pid\(\) and l.mode='ShareLock' and l.granted\)/);
  assert.deepEqual(calls.slice(4).map(call => call.text), ['ROLLBACK', 'release']);
});

test('lock timeout stops the same fresh read without retry or a snapshot', async () => {
  const { pool, calls } = poolFixture(text => {
    if (text.includes('pg_advisory_xact_lock_shared')) throw Object.assign(Error('fixture'), { code: '55P03' });
  });
  const diagnostics = createDiagnostics();
  const fresh = createReadPreflight(() => readSql(pool, { coordinate: true }), {
    diagnostics, phaseOf: () => 'STARTUP_FRESH',
  });
  await assert.rejects(fresh(), /PREFLIGHT_SOURCES_UNAVAILABLE/);
  const fatal = diagnostics.fatal('STOP_OPERATOR_START_REQUIRES_REVIEW');
  assert.equal(fatal.leaf, 'SQL_QUIESCENCE_REJECTED');
  assert.equal(fatal.phase, 'STARTUP_FRESH');
  assert.equal(calls.filter(call => call.text.includes('pg_advisory_xact_lock_shared')).length, 1);
  assert.ok(!calls.some(call => call.text.includes('current_setting')));
  assert.deepEqual(calls.slice(-2).map(call => call.text), ['ROLLBACK', 'release']);
});

test('ADMIN uses a null app actor while COLLECTOR and RECYCLER retain exact Stellar bindings', async () => {
  const { pool, calls } = poolFixture(text => text.includes('count(*)::int as eligible') ? [{ eligible: 1 }] :
    text.includes('select a.email') ? [{ email: 'offline-fixture@example.invalid' }] : []);
  await assertRoleIdentities(pool);
  await lookupRole(pool, 'ADMIN');
  const roles = calls.filter(call => call.values).map(call => call.values.slice(1, 3));
  assert.deepEqual(roles, [
    ['USER', null], ['ADMIN', null], ['COLLECTOR', SPEC.actors.collector],
    ['RECYCLER', SPEC.actors.recycler], ['ADMIN', null],
  ]);
});

test('pre-admission role check rejects zero and ambiguous results, without collecting credentials', async () => {
  for (const eligible of [0, 2]) {
    const { pool, calls } = poolFixture(text => text.includes('count(*)::int as eligible') ? [{ eligible }] : []);
    await assert.rejects(assertRoleIdentities(pool), /ROLE_IDENTITY_NOT_UNIQUE/);
    assert.equal(calls.filter(call => call.values).length, 1);
    assert.deepEqual(calls.slice(-2).map(call => call.text), ['ROLLBACK', 'release']);
  }
});

test('credential SQL failure preserves the allowlisted role and leaf only', async () => {
  const diagnostics = createDiagnostics();
  const resolver = createRoleResolver({ diagnostics, checkAdmission: async () => {},
    lookup: async () => { throw Error('ROLE_IDENTITY_NOT_UNIQUE'); },
    prompt: async () => assert.fail('must not prompt on lookup failure') });
  await assert.rejects(resolver.resolve('ADMIN'), /ROLE_IDENTITY_NOT_UNIQUE/);
  const fatal = diagnostics.fatal('STOP_OPERATOR_START_REQUIRES_REVIEW');
  assert.equal(fatal.stage, 'CREDENTIAL_SQL_FAIL');
  assert.equal(fatal.leaf, 'ROLE_IDENTITY_NOT_UNIQUE');
  assert.equal(fatal.role, 'ADMIN');
});
