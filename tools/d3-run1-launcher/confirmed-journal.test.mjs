import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempDisposableSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { SPEC, hash } from '../d3-evidence-capture/common.mjs';
import { RUN1 } from './boundaries.mjs';
import { evaluateReadiness, readLedger } from './live-readiness.mjs';
import { operatorCandidate } from '../d3-24-ratification/operator-identity.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const planPath = join(root, 'docs/instaward/d3/review/D3-17-FRESH-3RUN/new-plan.json');
const battery = 'BYE-D324-OFFLINE-R1';
const requestId = 'f'.repeat(64);
const task = 'D3-24-RUN1';
const walletLinkId = '77777777-7777-4777-8777-777777777777';
const origin = 'http://127.0.0.1:9';
const operations = [
  ['register_battery', '/api/batteries', 'ADMIN', 'admin', 'REGISTERED', 'NOT_ELIGIBLE', 'Registered', 'NotEligible'],
  ['open_return', '/api/batteries/' + battery + '/returns', 'USER', 'service', 'RETURNED', 'NOT_ELIGIBLE', 'Returned', 'NotEligible'],
  ['confirm_collection', '/api/returns/' + requestId + '/collection', 'COLLECTOR', 'service', 'COLLECTED', 'NOT_ELIGIBLE', 'Collected', 'NotEligible'],
  ['confirm_recycling', '/api/returns/' + requestId + '/recycling', 'RECYCLER', 'recycler', 'RECYCLED', 'PENDING', 'Recycled', 'Pending'],
  ['pay_reward', '/api/batteries/' + battery + '/reward', 'USER', 'service', 'RECYCLED', 'SENT', 'Recycled', 'Sent'],
].map(([operation, path, role, source, state, reward, chainState, chainReward], index) => ({
  operation, path, role, source, state, reward, chainState, chainReward,
  id: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
  hash: hash('offline-transaction-' + index), ledger: 7_000_000 + index,
}));
const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|HOME)$/i.test(key)));

function setup(t) {
  const ignored = join(root, '.tools');
  mkdirSync(ignored, { recursive: true });
  const scratch = mkdtempDisposableSync(join(ignored, 'byetery-journal-fixture-'));
  t.after(() => scratch.remove());
  const dir = scratch.path;
  const repo = join(dir, 'fixture');
  mkdirSync(repo);
  const hooks = join(dir, 'empty-hooks');
  mkdirSync(hooks);
  const globalConfig = join(dir, 'empty-gitconfig');
  writeFileSync(globalConfig, '');
  const env = { ...safeEnv, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalConfig };
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=' + hooks,
    '-c', 'init.templateDir=' + hooks, ...args], { cwd: repo, env, encoding: 'utf8' }).trim();
  git('init', '-q');
  const originGit = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim();
  const objects = originGit('rev-parse', '--path-format=absolute', '--git-path', 'objects');
  const sha = originGit('rev-parse', operatorCandidate.sha + '^{commit}');
  assert.equal(sha, operatorCandidate.sha);
  writeFileSync(join(repo, '.git/objects/info/alternates'), objects + '\n');
  git('sparse-checkout', 'set', '--cone', 'backend');
  git('checkout', '--detach', '--quiet', sha);
  assert.equal(git('rev-parse', 'HEAD:backend/src/d3/live-operator.ts'), operatorCandidate.blob);
  assert.equal(git('status', '--porcelain'), '');
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  plan.gitSha = sha;
  for (const run of plan.runs) run.batteryId = 'BYE-D324-OFFLINE-R' + run.runId.at(-1);
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
  const control = join(repo, '.git/byetery-d3-operator');
  const journal = join(control, task + '-' + sha + '.jsonl');
  const marker = join(dir, 'fixture-admission-marker');
  const trace = join(dir, 'submissions.json');
  writeFileSync(marker, 'synthetic marker\n');
  writeFileSync(trace, '[]\n');
  return { dir, control, marker, journal, trace, sha, env };
}

function runFixture(fixture, mode) {
  return spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--live', '--task-id', task,
    '--expected-sha', fixture.sha], {
    env: { ...fixture.env, BYETERY_JOURNAL_TEST_DIR: fixture.dir, BYETERY_JOURNAL_TEST_MODE: mode },
    encoding: 'utf8', timeout: 45_000, windowsHide: true,
  });
}

function readRows(path) {
  const text = readFileSync(path, 'utf8');
  assert(text === '' || text.endsWith('\n'));
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

async function exerciseFixture(dir, mode) {
  const repo = join(dir, 'fixture');
  const sha = process.argv.at(-1);
  const journal = join(repo, '.git/byetery-d3-operator', task + '-' + sha + '.jsonl');
  const trace = join(dir, 'submissions.json');
  const keys = JSON.parse(readFileSync(trace, 'utf8'));
  const confirmed = operations.slice(0, keys.length);
  const history = await readLedger(root);
  let baseline;
  let postCalls = 0;
  const response = (value, status = 200) => Response.json({ source: 'TESTNET', ...value }, { status });
  const actorCount = role => confirmed.filter(item => item.source === role).length;
  function observations(rows) {
    const last = confirmed.at(-1);
    const request = confirmed.length > 1 ? requestId : null;
    return {
      history, baseline, journal: rows,
      sql: {
        read_only: 'on', occupied: confirmed.length ? 1 : 0, active_leases: 0, pending: 0, uncertain: 0,
        reconciliation_locks: 0, foreign_holds: 0, review_intents: 0,
        deployment: { mode: 'TESTNET', network: SPEC.networkId, contract: SPEC.contract, wasm: SPEC.wasm,
          admin: SPEC.actors.admin, service: SPEC.actors.service, sac: SPEC.token, reward: '100000000' },
        wallets: SPEC.wallets.map(address => ({ address, verified: true, active_links: 1, matching_owner_links: 2 })),
        battery: last ? { state: last.state, reward: last.reward, requestId: request } : null,
        requests: request ? [{ id: request, recipient: RUN1.recipient, state: confirmed.length === 2 ? 'HELD' : 'CONSUMED' }] : [],
        operations: [...history.confirmed.map(item => ({ id: item.operationId, battery: item.batteryId, command: item.step,
          hash: item.txHash, receiptHash: item.txHash, ledger: item.ledger, dispatches: 1, state: 'CONFIRMED', work: 'PROJECTED' })), {
          id: history.excludedPreDispatch.operationId, battery: history.excludedPreDispatch.batteryId,
          state: 'CANCELLED_LOCAL', work: 'ABORTED_PRE_DISPATCH', dispatches: 0, hash: null,
        }, ...confirmed.map((item, index) => ({
          // This pure verifier still pins the historical battery; every HTTP and filesystem action uses the synthetic battery.
          id: item.id, battery: RUN1.batteryId, command: item.operation, source: SPEC.actors[item.source],
          sequence: String(12 + confirmed.slice(0, index + 1).filter(row => row.source === item.source).length),
          hash: item.hash, receiptHash: item.hash, ledger: item.ledger, dispatches: 1, state: 'CONFIRMED', work: 'PROJECTED',
        }))],
      },
      chain: {
        ledger: 7_000_010, pool: 700_000_000n, minimumTtl: 10_000,
        battery: last ? { state: [last.chainState], reward_state: [last.chainReward], request_id: request } : null,
        sources: Object.entries(SPEC.actors).map(([role, address]) => ({
          role, address, sequence: String(12 + actorCount(role)), available: 300_000_000n,
        })),
        wallets: SPEC.wallets.map(address => ({ address, balance: 0n, capacity: 300_000_000n })),
      },
    };
  }
  globalThis.fetch = async (url, options) => {
    const { method, headers, body } = options;
    const target = new URL(url);
    const token = headers.Authorization?.replace('Bearer fixture-', '');
    if (target.origin === 'https://aemxuqnnwfclzrwwiqfd.supabase.co') {
      if (method === 'POST' && target.pathname === '/auth/v1/token' && target.search === '?grant_type=password') {
        const login = JSON.parse(body);
        assert.equal(login.password, 'offline-fixture');
        return response({ access_token: 'fixture-' + login.email.split('@')[0] });
      }
      assert.equal(target.pathname + target.search, '/auth/v1/logout?scope=local');
      return response({});
    }
    assert.equal(target.origin, origin, 'The fixture cannot forward external HTTP');
    if (target.pathname === '/api/me') {
      return response({ roles: [token], membershipStatus: 'ENABLED', wallets: [{ address: RUN1.recipient, id: walletLinkId }] });
    }
    if (method === 'POST') {
      postCalls++;
      const item = operations[confirmed.length];
      assert.equal(target.pathname, item.path);
      assert.equal(token, item.role);
      const key = headers['Idempotency-Key'];
      assert.match(key, /^d3:[a-f0-9]{64}$/);
      assert(!keys.includes(key));
      keys.push(key);
      confirmed.push(item);
      writeFileSync(trace, JSON.stringify(keys), { flush: true });
      return response({ operationId: item.id, transactionHash: null }, 202);
    }
    const item = confirmed.at(-1);
    if (target.pathname === '/api/operations/' + item.id) {
      return response({ deploymentId: SPEC.deployment, operationId: item.id, transactionHash: item.hash,
        class: 'CONFIRMED', terminal: true, submissionEvidence: 'DURABLE_INTENT', result: 'SUCCESS' });
    }
    if (target.pathname === '/api/batteries/' + battery + '/history') {
      return response({ deploymentId: SPEC.deployment, contractAddress: SPEC.contract, network: 'STELLAR TESTNET', batteryId: battery,
        entries: confirmed.map(row => ({ operationId: row.id, transactionHash: row.hash, ledger: row.ledger,
          kind: row.operation === 'pay_reward' ? 'REWARD' : row.state, category: row.operation === 'pay_reward' ? 'REWARD' : 'LIFECYCLE',
          persistedState: 'CONFIRMED', verification: 'CONFIRMED', chainResult: 'SUCCESS', confirmedAt: '2026-01-01T00:00:00Z' })) });
    }
    assert.equal(target.pathname, '/api/batteries/' + battery);
    if (mode === 'crash') process.exit(77);
    return response({ confirmedBatteryState: item.state, confirmedRewardState: item.reward,
      pendingOperation: null, ownRequest: confirmed.length > 1 ? { requestId } : null });
  };
  const fixtureSource = pathToFileURL(join(repo, 'backend/src/')).href;
  const sdkResolution = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@stellar/stellar-sdk' && context.parentURL?.startsWith(fixtureSource)) {
        return nextResolve(specifier, { ...context, parentURL: pathToFileURL(join(root, 'backend/package.json')).href });
      }
      return nextResolve(specifier, context);
    },
  });
  const { createLocalOperator } = await import(pathToFileURL(join(repo, 'backend/src/d3/live-operator.ts')));
  sdkResolution.deregister();
  const options = {
    root: repo, argv: process.argv.slice(2), publicPlanFile: join(dir, 'plan.json'), apiOrigin: origin,
    publishableKey: 'sb_publishable_offline_fixture',
    async credentials(role) { return { email: role + '@example.invalid', password: 'offline-fixture' }; },
    async readPreflight() {
      // Same final-state row selection as live-runtime.mjs. The test does not enrich missing fields.
      if (mode === 'restart') return { taskId: task, runId: 'RUN1' };
      const rows = confirmed.length ? readRows(journal).filter(row => row.phase === 'RESULT' && row.domainState) : [];
      const facts = observations(rows);
      const readiness = evaluateReadiness(facts);
      if (confirmed.length === 1) {
        const [row] = rows;
        assert.throws(() => evaluateReadiness({ ...facts, journal: [{ ...row, operationId: operations[1].id }] }),
          /RUN1_OPERATION_IDENTITY_REJECTED/);
        const { operationId, ...withoutIdentity } = row;
        assert.equal(operationId, operations[0].id);
        assert.throws(() => evaluateReadiness({ ...facts, journal: [withoutIdentity] }), /RUN1_OPERATION_IDENTITY_REJECTED/);
        assert.throws(() => evaluateReadiness({ ...facts, journal: [row, row] }), /RUN1_OPERATION_IDENTITY_REJECTED/);
        assert.throws(() => evaluateReadiness({ ...facts, journal: [{ ...row, transactionHash: operations[1].hash }] }),
          /RUN1_OPERATION_IDENTITY_REJECTED/);
      }
      if (confirmed.length === 2) {
        assert.throws(() => evaluateReadiness({ ...facts, journal: [rows[0], { ...rows[1], operationId: rows[0].operationId }] }),
          /RUN1_OPERATION_IDENTITY_REJECTED/);
      }
      baseline = readiness.baseline;
      return { ...readiness, taskId: task, runId: 'RUN1', observedAt: Date.now(), git: { sha, clean: true }, sameRuntimeSha: sha,
        mode: 'TESTNET', networkId: SPEC.networkId, contractId: SPEC.contract, wasmSha256: SPEC.wasm, deploymentId: SPEC.deployment,
        payer: SPEC.contract, unresolved: 0, pendingDispatches: 0, uniqueBatteryIds: true, simulationBeforeSend: true,
        signers: Object.values(SPEC.actors).map(address => ({ address, available: true })) };
    },
  };
  if (mode === 'restart') {
    await assert.rejects(createLocalOperator(options), { code: 'EEXIST' });
    assert.equal(postCalls, 0);
    return;
  }
  const operator = await createLocalOperator(options);
  for (const [index, item] of operations.entries()) {
    const result = await operator.step(item.operation);
    assert.equal(result.operationId, item.id);
    assert.equal(result.transactionHash, item.hash);
    if (result.payload) assert.equal(hash(Buffer.from(result.payload.manifestBase64, 'base64')), result.payload.payloadHash);
    const finalRows = readRows(journal).filter(row => row.phase === 'RESULT' && row.domainState);
    assert.equal(finalRows.length, index + 1);
    const row = finalRows[index];
    assert.equal(row.operationId, item.id);
    assert.equal(row.transactionHash, item.hash);
    assert.equal(row.confirmationMode, result.confirmationMode);
    assert.equal(row.domainState, result.confirmedBatteryState);
    assert.equal(row.rewardState, result.confirmedRewardState);
    assert.equal(row.requestId, result.requestId ?? undefined);
  }
  assert.equal((await operator.countingDecision()).countable, true);
  await assert.rejects(operator.step(operations[0].operation), /OperatorStoppedRequiresReview/);
  await assert.rejects(operator.step(operations[0].operation), /OperatorStoppedRequiresReview/);
  assert.equal(postCalls, 5);
  await operator.close();
}

if (process.env.BYETERY_JOURNAL_TEST_DIR) {
  await exerciseFixture(process.env.BYETERY_JOURNAL_TEST_DIR, process.env.BYETERY_JOURNAL_TEST_MODE);
} else {
  test('all five isolated confirmations retain their identity and registration passes the next preflight', t => {
    const fixture = setup(t);
    const run = runFixture(fixture, 'complete');
    assert.equal(run.status, 0, run.error?.message ?? run.stderr);
    const finalRows = readRows(fixture.journal).filter(row => row.phase === 'RESULT' && row.domainState);
    assert.equal(finalRows.length, 5);
    for (const [index, row] of finalRows.entries()) {
      const item = operations[index];
      assert.equal(row.operation, item.operation);
      assert.equal(row.operationId, item.id);
      assert.equal(row.transactionHash, item.hash);
      assert.equal(row.confirmationMode, 'OBSERVED');
      assert.equal(row.domainState, item.state);
      assert.equal(row.rewardState, item.reward);
      assert.equal(row.requestId, index === 0 ? undefined : requestId);
    }
    assert.equal(JSON.parse(readFileSync(fixture.trace, 'utf8')).length, 5);
  });

  test('a crash after confirmation preserves the journal, budget and markers and cannot resubmit', t => {
    const fixture = setup(t);
    const run = runFixture(fixture, 'crash');
    assert.equal(run.status, 77, run.error?.message ?? run.stderr);
    const keys = JSON.parse(readFileSync(fixture.trace, 'utf8'));
    assert.equal(keys.length, 1);
    const rows = readRows(fixture.journal);
    const confirmed = rows.at(-1);
    assert.equal(confirmed.reconciliation, 'CONFIRMED');
    assert.equal(confirmed.operationId, operations[0].id);
    assert.equal(confirmed.transactionHash, operations[0].hash);
    assert.equal(confirmed.domainState, undefined);
    const budgetFiles = readdirSync(fixture.control).filter(name => name.endsWith('.budget'));
    assert.equal(budgetFiles.length, 1);
    const budget = join(fixture.control, budgetFiles[0]);
    assert.equal(readFileSync(budget, 'utf8'), keys[0] + '\n');
    const preserved = [fixture.marker, fixture.journal, fixture.trace,
      budget, join(fixture.control, battery + '.consumed'), join(fixture.control, 'operator.lock')];
    const before = preserved.map(file => hash(readFileSync(file)));
    const restart = runFixture(fixture, 'restart');
    assert.equal(restart.status, 0, restart.error?.message ?? restart.stderr);
    assert.deepEqual(preserved.map(file => hash(readFileSync(file))), before);
  });
}
