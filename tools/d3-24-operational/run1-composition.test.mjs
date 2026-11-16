import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { ACTORS, invocation } from '../../backend/src/testnet/abi.ts';
import { prepareD324Sessions } from '../../backend/src/application/d324-sessions.ts';
import { LocalTransactionWorker } from '../../backend/src/testnet/worker.ts';
import { F } from '../d3-24-offline-controller/fixture-loader.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';
import { projectD324Journal } from '../d3-24-ratification/readiness.mjs';
import { bindD324ApprovedServer, executeD324ApprovedRun } from './final-runtime.mjs';
import { readReviewedV3Package } from './owner-authorization.mjs';
import { bindD324Evidence } from './run-evidence.mjs';
import { bindD324ServerWorker } from './server-worker.mjs';
import { D324_ARGV } from './policy.mjs';

function call(server, role, operation, body, key, proof) {
  return new Promise(resolve => {
    const request = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(request, { method: 'POST', url: operation, headers: {
      authorization: 'Bearer ' + role, 'idempotency-key': key,
      'content-type': 'application/json', 'x-byetery-d324-proof': proof,
    } });
    let status;
    server.emit('request', request, {
      writeHead(value) { status = value; },
      end(value) { resolve({ status, body: JSON.parse(value) }); },
    });
  });
}

test('public startup gates reject before touching runtime dependencies', async () => {
  const options = new Proxy({}, { get() { assert.fail('Dependency accessed while HOLD'); } });
  assert.throws(() => bindD324ApprovedServer(options), /D324_OPERATIONAL_RATIFICATION_REQUIRED/);
  await assert.rejects(executeD324ApprovedRun('', options), /D324_OPERATIONAL_RATIFICATION_REQUIRED/);
  assert.throws(() => readReviewedV3Package({ reviewOnly: true, liveAuthority: false }, process.cwd()),
    /D324_VERIFIED_PACKAGE_REQUIRED/);
  const exec = script => {
    try {
      execFileSync(process.execPath, ['tools/d3-24-operational/' + script, ...D324_ARGV], { encoding: 'utf8' });
      assert.fail('LIVE unexpectedly accepted');
    } catch (error) {
      assert.equal(error.status, 1);
      return error.stdout.trim();
    }
  };
  assert.equal(exec('entry-bootstrap.mjs'), 'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  assert.equal(exec('live.mjs'), 'D324_OPERATIONAL_RATIFICATION_REQUIRED');
});

test('D324 server binds the real RPC processor and denies work outside its admission', async () => {
  const f = await F.local();
  const calls = [];
  const approval = F.fixtureApproval(f.identities);
  const options = user => ({ host: '127.0.0.1', port: 9, database: 'embedded', user });
  f.repo.pool.options = options('fixture-api');
  const workerPool = Object.assign(Object.create(f.repo.pool), { options: options('fixture-worker') });
  const workerRepo = Object.assign(Object.create(f.repo), { pool: workerPool });
  const config = {
    repo: f.repo, workerRepo, auth: { validate: async h => f.identities[h.slice(7)] },
    authority: approval.authority, admissionInput: () => assert.fail('No IPC expected in this test'),
    signerBinary: process.execPath,
    fetcher: async (_url, input) => {
      calls.push(JSON.parse(input.body).method);
      throw Error('SYNTHETIC_RPC_OUTAGE');
    },
  };
  try {
    assert.throws(() => bindD324ServerWorker({ ...config, workerRepo: f.repo }), /D324_CONTROL_SCOPE_REJECTED/);
    const runtime = bindD324ServerWorker(config);
    await runtime.reconcile();
    assert.deepEqual(calls, []);
    const wrong = await call(runtime.http, 'ADMIN', '/api/batteries', { batteryId: 'BYE-D333-OUTSIDE' }, 'outside-scope');
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.error.code, 'D324RuntimeScopeRejected');
    const { rows: [empty] } = await f.db.query('select count(*) n from app_private.stellar_operations');
    assert.equal(Number(empty.n), 0);

    const headers = Object.fromEntries(Object.keys(f.identities).map(role => [role, 'Bearer ' + role]));
    const receipt = await prepareD324Sessions(f.repo, config.auth, headers, approval.authority.instanceId,
      approval.authority.challenge);
    const admissionId = await approval.authority.admit(f.repo, approval.input, receipt);
    const grant = { ...approval, id: admissionId };
    const body = { batteryId: RUN1.batteryId }, register = { kind: 'register' };
    const post = await call(runtime.http, 'ADMIN', '/api/batteries', body, 'register-d333',
      F.prove(grant, f.identities.ADMIN, 1, register, body, 'register-d333'));
    assert.equal(post.status, 202);
    await runtime.reconcile();
    assert(calls.length > 0 && calls.every(method => method.startsWith('get')));

    const store = F.transportFixture(f.repo, approval.authority.instanceId);
    const productionWork = await store.work(post.body.operationId);
    assert.equal(productionWork.sourceAccount, ACTORS.admin);
    assert.equal(await store.identity(post.body.operationId), null);
    // The fake signs with an ephemeral account, so use a second fixture for
    // the successful prefix. The real store rejects changing a queued source.
    await assert.rejects(F.queueFake(store, post.body.operationId, f.repo), /QueueContextConflict/);
  } finally { await f.db.close(); }
});

test('open_return requires the confirmed register and projects the original synthetic identity', async () => {
  const f = await F.local();
  const approval = F.fixtureApproval(f.identities);
  const { Coordinator } = await import('../../backend/src/application/coordinator.ts');
  const { api } = await import('../../backend/src/application/http.ts');
  const auth = { validate: async h => f.identities[h.slice(7)] };
  const processor = { process() { assert.fail('Fixture process must be explicit'); } };
  const http = api(auth, new Coordinator(f.repo, {}, undefined, processor, approval.authority, true));
  try {
    const headers = Object.fromEntries(Object.keys(f.identities).map(role => [role, 'Bearer ' + role]));
    const receipt = await prepareD324Sessions(f.repo, auth, headers, approval.authority.instanceId,
      approval.authority.challenge);
    const admissionId = await approval.authority.admit(f.repo, approval.input, receipt);
    const grant = { ...approval, id: admissionId };
    const body = { batteryId: RUN1.batteryId }, register = { kind: 'register' };
    const post = await call(http, 'ADMIN', '/api/batteries', body, 'register-d333',
      F.prove(grant, f.identities.ADMIN, 1, register, body, 'register-d333'));
    assert.equal(post.status, 202);
    const store = F.transportFixture(f.repo, approval.authority.instanceId);
    const fake = await F.queueFake(store, post.body.operationId, f.repo);
    const wallet = randomUUID(), user = f.users.USER;
    await f.db.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
      values($1,$2,decode($3,'hex'),$4,$5,'d333-fixture',now())`,
    [wallet, f.repo.deploymentId, (await store.work(post.body.operationId)).networkId, user, RUN1.recipient]);
    const registrationHash = (await store.work(post.body.operationId)).command.registrationHash;
    const project = async (db, work) => {
      const cmd = work.command;
      const returning = cmd.kind === 'open_return';
      const requestId = returning ? cmd.requestId : null;
      const state = returning ? 'RETURNED' : 'REGISTERED';
      await f.repo.project(db, {
        getBattery: async () => ({ state, requestId, registrationHash, rewardState: 'NOT_ELIGIBLE',
          collector: null, collectionHash: null, recycler: null, recyclingHash: null }),
        getReturnRequest: async () => returning ? { batteryId: RUN1.batteryId, recipient: RUN1.recipient, state: 'OPEN' } : null,
      }, cmd, work.confirmation.confirmationLedger);
    };
    // The transport fixture stands in for Stellar only for this confirmed prefix.
    const confirm = async (id, transport) => {
      transport.success = true;
      return new LocalTransactionWorker(store, transport, project, () => Number(transport.closeTime)).run(id, 'd333-fixture');
    };
    const path = '/api/batteries/' + RUN1.batteryId + '/returns';
    const action = { kind: 'return', resource: RUN1.batteryId }, input = { walletLinkId: wallet }, key = 'open-return-d333';
    const proof = F.prove(grant, f.identities.USER, 2, action, input, key);
    const before = await call(http, 'USER', path, input, key, proof);
    assert.equal(before.body.error.code, 'D324UnconfirmedPrefix');
    assert.equal(await confirm(post.body.operationId, fake), 'PROJECTED');
    const result = await call(http, 'USER', path, input, key, proof);
    assert.equal(result.status, 202);
    const { rows: [queued] } = await f.db.query('select parameters,principal from app_private.stellar_operations where id=$1',
      [result.body.operationId]);
    assert.equal(queued.principal, user);
    assert.equal(queued.parameters.kind, 'open_return');
    assert.equal(queued.parameters.batteryId, RUN1.batteryId);
    assert.equal(queued.parameters.recipient, RUN1.recipient);
    assert.match(queued.parameters.requestId, /^[0-9a-f]{64}$/);
    assert.deepEqual(invocation(queued.parameters).signers, [ACTORS.service]);
    const replay = await call(http, 'USER', path, input, key, proof);
    assert.equal(replay.body.operationId, result.body.operationId);
    const returned = await F.queueFake(store, result.body.operationId, f.repo);
    assert.equal(await confirm(result.body.operationId, returned), 'PROJECTED');
    const original = await store.identity(result.body.operationId);
    assert.equal(original.sourceAccount, returned.key.publicKey());
    assert.equal(returned.submitted.length, 1);
    assert(returned.observed.includes(original.transactionHash));
    const { rows: [battery] } = await f.db.query(`select state,encode(request_id,'hex') request
      from chain_private.batteries where deployment_id=$1 and battery_id=$2`, [f.repo.deploymentId, RUN1.batteryId]);
    assert.deepEqual(battery, { state: 'RETURNED', request: queued.parameters.requestId });
  } finally { await f.db.close(); }
});

test('capture refuses an open_return journal with a substituted original hash before RPC', async () => {
  const output = join(process.cwd(), '.test-output');
  await mkdir(output, { recursive: true });
  const root = await mkdtemp(join(output, 'd333-journal-'));
  const journal = join(root, 'run.jsonl');
  const rows = ['register_battery', 'open_return'].flatMap((operation, index) => {
    const base = { taskId: RUN1.taskId, gitSha: RUN1.businessSha, runId: RUN1.runId, batteryId: RUN1.batteryId, operation };
    const tie = { operationId: randomUUID(), transactionHash: String(index + 1).repeat(64), confirmationMode: 'OBSERVED' };
    return [{ ...base, phase: 'INTENT' }, { ...base, ...tie, phase: 'RESULT', reconciliation: 'CONFIRMED' },
      { ...base, ...tie, phase: 'RESULT', domainState: index ? 'RETURNED' : 'REGISTERED', rewardState: 'NOT_ELIGIBLE',
        ...(index ? { requestId: '3'.repeat(64) } : {}) }];
  });
  const bytes = () => Buffer.from(rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  assert.equal(projectD324Journal(bytes())[1].requestId, '3'.repeat(64));
  rows.at(-1).transactionHash = '0'.repeat(64);
  await writeFile(journal, bytes());
  assert.throws(() => projectD324Journal(bytes()), /D324_JOURNAL_OPERATION_IDENTITY_REJECTED/);
  const evidence = bindD324Evidence({}, { journal }, () => assert.fail('RPC contacted'));
  const row = rows[2];
  await assert.rejects(evidence.record({ operation: row.operation, batteryId: row.batteryId, operationId: row.operationId,
    transactionHash: row.transactionHash, requestId: null, confirmationMode: row.confirmationMode,
    confirmedBatteryState: row.domainState, confirmedRewardState: row.rewardState,
    confirmedAt: new Date().toISOString(), confirmationLedger: 6000000 }),
  /D324_JOURNAL_OPERATION_IDENTITY_REJECTED/);
  await assert.rejects(evidence.finish(), /D324_EXPORT_INCOMPLETE/);
});
