import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { roleQrFixture } from './d2-role-qr-fixture.ts';
import { h } from './fixtures.ts';

export const laneCases = [
  { case: 'A', lifecycle: 'COLLECTED', operation: 'SUBMITTED', command: 'confirm_recycling', reward: 'NOT_ELIGIBLE', lane: 'PENDING' },
  { case: 'B', lifecycle: 'COLLECTED', operation: 'UNKNOWN', command: 'confirm_recycling', reward: 'NOT_ELIGIBLE', lane: 'UNCERTAIN' },
  { case: 'C', lifecycle: 'RECYCLED', operation: 'CONFIRMED', command: 'confirm_recycling', reward: 'PENDING', lane: 'CONFIRMED' },
  { case: 'D', lifecycle: 'RECYCLED', operation: 'UNKNOWN', command: 'pay_reward', reward: 'PENDING', lane: 'UNCERTAIN' },
  { case: 'E', lifecycle: 'RECYCLED', operation: 'REJECTED', command: 'pay_reward', reward: 'PENDING', lane: 'FAILED' },
  { case: 'F', lifecycle: 'RECYCLED', operation: 'CONFIRMED', command: 'pay_reward', reward: 'SENT', lane: 'CONFIRMED' },
  { case: 'G', lifecycle: 'COLLECTED', operation: 'REJECTED', command: 'confirm_recycling', reward: 'NOT_ELIGIBLE', lane: 'FAILED' },
  { case: 'Q', lifecycle: 'COLLECTED', operation: 'QUEUED', command: 'confirm_recycling', reward: 'NOT_ELIGIBLE', lane: 'QUEUED' },
] as const;

/** Actual migrated ephemeral SQL + Coordinator/MOCK fixtures. No live Auth/RPC/signing. */
export async function stateLanesFixture() {
  const f = await roleQrFixture();
  try {
  const cases: { spec: typeof laneCases[number]; batteryId: string; operationId: string; requestId: string }[] = [];
  for (const spec of laneCases) {
    // Existing harness invokes the real local Coordinator and MockStellarService.
    const { batteryId, requestId } = await f.ready('LANE-' + spec.case, spec.lifecycle);
    let operationId: string;
    if (spec.case === 'F') {
      assert.equal((await f.call('ADMIN', `/api/batteries/${batteryId}/reward`, {})).status, 200);
    }
    if (spec.operation === 'CONFIRMED') {
      operationId = (await f.db.query<{ id: string }>(`select id from app_private.stellar_operations
        where deployment_id=$1 and battery_id=$2 and command=$3 order by created_at desc,id desc limit 1`, [f.d, batteryId, spec.command])).rows[0].id;
    } else {
      operationId = randomUUID();
      await f.db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,
        request_id,parameters,parameters_hash,state,error_code,created_at)
        values($1::uuid,$2,$3,$1::text,$4,$5,decode($6,'hex'),$7,decode($8,'hex'),$9,$10,'2030-01-01T00:00:00Z')`,
      [operationId, f.d, f.users.USER, spec.command, batteryId, spec.command === 'pay_reward' ? null : requestId,
        JSON.stringify({ kind: spec.command, batteryId, fixture: 'D2-007-READ-MODEL-ONLY' }), h(7), spec.operation,
        spec.operation === 'REJECTED' ? 'AuthorizationRevoked' : null]);
      if (spec.command === 'pay_reward') {
        await f.db.query(`insert into app_private.reward_attempts(deployment_id,battery_id,request_id,
          operation_id,attempt_number) values($1,$2,decode($3,'hex'),$4,1)`, [f.d, batteryId, requestId, operationId]);
        await f.db.query('update app_private.reward_attempts set state=$2,error_code=$3 where operation_id=$1',
          [operationId, spec.case === 'E' ? 'FAILED' : 'UNKNOWN', spec.case === 'E' ? 'AuthorizationRevoked' : null]);
      }
    }
    cases.push({ spec, batteryId, operationId, requestId });
  }
  const emptyBattery = 'BYE-D2-007-NONE';
  await f.db.query('insert into app_private.battery_records(deployment_id,battery_id,created_by) values($1,$2,$3)', [f.d, emptyBattery, f.users.USER]);
  await f.db.query(`insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,reward_state,confirmed_ledger)
    values($1,$2,'REGISTERED',decode($3,'hex'),'NOT_ELIGIBLE',1)`, [f.d, emptyBattery, h(1)]);
  return { ...f, cases, emptyBattery };
  } catch (error) { await f.close(); throw error; }
}

/** Public screenshot/component fixture: whitelist only; operation UUIDs use display aliases. */
export function disclosedLanes(body: Record<string, any>, label: string) {
  const operation = (op: any) => op ? { ...op, id: `LOCAL-FIXTURE-${label}-${op.command}` } : null;
  return { batteryId: body.batteryId, confirmedBatteryState: body.confirmedBatteryState,
    confirmedRewardState: body.confirmedRewardState, pendingOperation: operation(body.pendingOperation),
    ...(Object.hasOwn(body, 'latestTerminalOperation') ? { latestTerminalOperation: operation(body.latestTerminalOperation) } : {}),
    lastAttempt: body.lastAttempt, source: body.source,
    metadata: { type: 'LOCAL FIXTURE — D2.3; no live Stellar transaction' } };
}
