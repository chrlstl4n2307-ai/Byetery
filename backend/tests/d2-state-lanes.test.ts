import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { stateLanesFixture, disclosedLanes } from './d2-state-lanes-fixture.ts';
import models from '../../docs/instaward/d2/evidence/d2-007/state-read-models.json' with { type: 'json' };
import { harness } from './testnet-fixtures.ts';
import { Repository } from '../src/application/repository.ts';
import { h } from './fixtures.ts';
import { randomUUID } from 'node:crypto';

test('D2.3 actual battery-detail and profile reads preserve independent durable operation display', async t => {
  const f = await stateLanesFixture(), captured: Record<string, unknown>[] = [];
  try {
    const before = await f.snapshot();
    for (const item of f.cases) {
      const response = await f.call('USER', '/api/batteries/' + item.batteryId);
      assert.equal(response.status, 200);
      const b = response.body;
      captured.push({ case: item.spec.case, classification: 'LOCAL FIXTURE STATE', expected: item.spec, battery: disclosedLanes(b, item.spec.case) });
      await t.test(item.spec.case + ': ' + item.spec.lane, () => {
        assert.equal(b.confirmedBatteryState, item.spec.lifecycle);
        assert.equal(b.confirmedRewardState, item.spec.reward);
        const display = b.pendingOperation ?? b.latestTerminalOperation;
        assert.ok(display, 'terminal operation must remain visible in detail, not NO_PENDING_OPERATION');
        assert.equal(display.state, item.spec.operation);
        assert.equal(display.id, item.operationId);
        assert.equal(!!b.pendingOperation, !['CONFIRMED', 'REJECTED'].includes(item.spec.operation));
      });
    }
    const profile = await f.call('USER', '/api/me'); assert.equal(profile.status, 200);
    for (const item of f.cases) await t.test('profile ' + item.spec.case, () => {
      const row = profile.body.requests.find((r: any) => r.batteryId === item.batteryId);
      assert.ok(row);
      assert.equal((row.pendingOperation ?? row.latestTerminalOperation)?.id, item.operationId);
      assert.equal(!!row.pendingOperation, !['CONFIRMED', 'REJECTED'].includes(item.spec.operation));
    });
    const noOp = await f.call('USER', '/api/batteries/' + f.emptyBattery);
    captured.push({ case: 'N', classification: 'LOCAL FIXTURE STATE', expected: { lane: 'NO_PENDING_OPERATION' }, battery: disclosedLanes(noOp.body, 'N') });
    await t.test('projection without any operation never invents confirmation', () => {
      assert.equal(noOp.body.pendingOperation, null);
      assert.equal(noOp.body.latestTerminalOperation ?? null, null);
    });
    assert.deepEqual(await f.snapshot(), before, 'reads must not prepare, mutate business state or call a provider');
    assert.equal(f.externalCalls(), 0);
    await t.test('published sanitized read models match actual HTTP/SQL output', () => assert.deepEqual(captured, models.cases));
    await t.test('unresolved operation outranks a newer confirmed terminal in both reads', async () => {
      const item = f.cases.find(c => c.spec.case === 'B')!;
      await f.db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash,state,created_at)
        values($1::uuid,$2,$3,$1::text,'register_battery',$4,'{"kind":"register_battery"}',decode($5,'hex'),'CONFIRMED','2040-01-01T00:00:00Z')`,
        [randomUUID(), f.d, f.users.USER, item.batteryId, h(7)]);
      const b = (await f.call('USER', '/api/batteries/' + item.batteryId)).body;
      assert.equal(b.pendingOperation.id, item.operationId); assert.equal(b.latestTerminalOperation.state, 'CONFIRMED');
      const p = (await f.call('USER', '/api/me')).body.requests.find((r: any) => r.batteryId === item.batteryId);
      assert.equal(p.pendingOperation.id, item.operationId); assert.equal(p.latestTerminalOperation.state, 'CONFIRMED');
    });
    await t.test('terminal timestamp ties resolve by operation ID deterministically', async () => {
      const item = f.cases.find(c => c.spec.case === 'C')!;
      for (const id of ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'])
        await f.db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash,state,created_at)
          values($1::uuid,$2,$3,$1::text,'register_battery',$4,'{"kind":"register_battery"}',decode($5,'hex'),'REJECTED','2040-01-01T00:00:00Z')`,
          [id, f.d, f.users.USER, item.batteryId, h(7)]);
      for (let i = 0; i < 2; i++) {
        const b = (await f.call('USER', '/api/batteries/' + item.batteryId)).body;
        const p = (await f.call('USER', '/api/me')).body.requests.find((r: any) => r.batteryId === item.batteryId);
        assert.equal(b.latestTerminalOperation.id, '00000000-0000-4000-8000-000000000002');
        assert.equal(p.latestTerminalOperation.id, b.latestTerminalOperation.id); assert.equal(b.pendingOperation, null);
      }
    });
    await t.test('a rejection/error code alone does not manufacture confirmed chain failure', async () => {
      const item = f.cases.find(c => c.spec.case === 'G')!;
      await f.db.query("update app_private.stellar_operations set error_code='ConfirmedChainFailure' where id=$1", [item.operationId]);
      assert.equal((await f.call('USER', '/api/batteries/' + item.batteryId)).body.latestTerminalOperation.failureScope, 'APPLICATION');
    });
    await t.test('actual durable failed transport result is distinct and preserves lifecycle/reward', async () => {
      const fixture = await harness(f.db, true); fixture.transport.failChain = true;
      assert.equal(await fixture.worker.run(fixture.op, 'D2-007-OFFLINE-FAKE'), 'CONFIRMED_FAILED');
      const repo = Object.assign(Object.create(Repository.prototype) as Repository,
        { pool: f.repo.pool, deploymentId: fixture.d, mode: 'TESTNET' });
      const b = await repo.transaction(db => repo.view(db, fixture.battery)) as any;
      assert.equal(b.confirmedBatteryState, 'RECYCLED'); assert.equal(b.confirmedRewardState, 'PENDING');
      assert.equal(b.pendingOperation, null); assert.equal(b.latestTerminalOperation.state, 'REJECTED');
      assert.equal(b.latestTerminalOperation.failureScope, 'CHAIN'); assert.equal(b.lastAttempt.state, 'FAILED');
    });
  } finally {
    const dir = new URL('../../.tools/d2-007/', import.meta.url); await mkdir(dir, { recursive: true });
    await writeFile(new URL('read-model.json', dir), JSON.stringify({ task: 'D2.3', classification: 'LOCAL HTTP / SQL / MOCK FIXTURE; not live Testnet', cases: captured }, null, 2) + '\n');
    await f.close();
  }
});
