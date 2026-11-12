import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { Repository } from '../../backend/src/application/repository.ts';
import { SPEC } from '../d3-evidence-capture/common.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';
import { readSqlForRun } from '../d3-run1-launcher/live-sql.mjs';

const port = Number(process.env.BYETERY_D324_TEST_PG_PORT);
const localFixture = Number.isInteger(port) && port >= 49152 && port <= 65535;
const { Pool } = createRequire(new URL('../../backend/package.json', import.meta.url))('pg');
const lock = (client, type, id) => client.query('select pg_advisory_xact_lock' + type + '(hashtextextended($1,0))', [id]);
const db = { host: '127.0.0.1', port, database: 'postgres', user: 'byetery_d324_fixture',
  ssl: false, max: 6, connectionTimeoutMillis: 3000 };

test('real external exclusive lock fails the D3-24 coordinated SQL read', { skip: !localFixture }, async () => {
  const pool = new Pool(db);
  const external = await pool.connect();
  try {
    await external.query('begin');
    await lock(external, '', SPEC.deployment);
    await assert.rejects(readSqlForRun(pool, RUN1, { coordinate: true }), /^Error: SQL_QUIESCENCE_REJECTED$/);
  } finally {
    await external.query('rollback');
    external.release();
    await pool.end();
  }
});

test('periodic repository scans leave zero waiters and manual reconciliation still waits', { skip: !localFixture }, async () => {
  const repository = new Repository({ database: db, deploymentId: SPEC.deployment, mode: 'TESTNET' });
  const pool = repository.pool;
  const observer = await pool.connect();
  const waiters = async () => (await pool.query(
    'select count(*)::int as n from pg_locks where locktype=\'advisory\' and not granted'
  )).rows[0].n;
  let manual;
  try {
    for (let n = 0; n < 30; n++) {
      await observer.query('begin');
      await lock(observer, '_shared', SPEC.deployment);
      const scans = await Promise.all(Array.from({ length: 3 }, () =>
        repository.tryPeriodicReconcileScan(() => assert.fail('periodic scan should skip'))));
      assert.deepEqual(scans, [undefined, undefined, undefined]);
      assert.equal(await waiters(), 0);
      await observer.query('rollback');
    }
    assert.equal(await repository.tryPeriodicReconcileScan(async () => 'SCANNED'), 'SCANNED');
    await observer.query('begin');
    await lock(observer, '_shared', SPEC.deployment);
    manual = repository.transaction(async () => 'MANUAL_SCANNED');
    // Wait only for the test observer to see the known blocking manual scan.
    const until = Date.now() + 5000;
    let count;
    do { count = await waiters(); } while (count === 0 && Date.now() < until);
    assert.equal(count, 1);
    await observer.query('rollback');
    assert.equal(await manual, 'MANUAL_SCANNED');
    assert.equal(await waiters(), 0);
  } finally {
    await observer.query('rollback');
    observer.release();
    try { await manual; } finally { await pool.end(); }
  }
});
