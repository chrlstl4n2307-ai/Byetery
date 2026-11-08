import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SPEC, hash } from '../d3-evidence-capture/common.mjs';
import { RUN1, requireThat } from './boundaries.mjs';

const ledgerFileSha256 = 'a45ed3d36a12c08d64df0ad6f50338e58404526eb1983530a191174bc18b2633';
const cap = 5;
const fee = 50_000_000n;
const reward = 100_000_000n;
const payerMargin = 100_000_000n;
const steps = ['register_battery', 'open_return', 'confirm_collection', 'confirm_recycling', 'pay_reward'];
const sourceRoles = ['admin', 'service', 'service', 'recycler', 'service'];
const states = ['REGISTERED', 'RETURNED', 'COLLECTED', 'RECYCLED', 'RECYCLED'];
const rewards = ['NOT_ELIGIBLE', 'NOT_ELIGIBLE', 'NOT_ELIGIBLE', 'PENDING', 'SENT'];
const chainRewards = { NotEligible: 'NOT_ELIGIBLE', Pending: 'PENDING', Sent: 'SENT' };
const txHash = /^[0-9a-f]{64}$/;

export async function readLedger(root) {
  const bytes = await readFile(join(root, 'docs/instaward/d3/review/D3-17-FRESH-3RUN/external-project-ledger.jsonl'));
  requireThat(hash(bytes) === ledgerFileSha256, 'EXTERNAL_LEDGER_DIGEST_REJECTED');
  const [policy, history, , , candidate] = bytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line).payload);
  requireThat(policy.externalCap === 20 && policy.authorizedReserved === 0 &&
    policy.executionLimitWithoutMarginAuth === 19 && policy.contingencyStatus === 'LOCKED_OWNER_AUTHORIZATION_REQUIRED' &&
    policy.txAuthorized === false && history.confirmedConsumed === 4 && history.confirmed.length === 4 &&
    history.confirmedConsumed + cap <= policy.executionLimitWithoutMarginAuth &&
    candidate.planHash === RUN1.planHash && candidate.internalBudgetPrestate === 0 &&
    candidate.runs[0].batteryId === RUN1.batteryId && candidate.runs[0].recipient === RUN1.recipient,
  'EXTERNAL_LEDGER_POLICY_REJECTED');
  return history;
}

function verifiedOperation(row) {
  return row.state === 'CONFIRMED' && row.work === 'PROJECTED' && row.dispatches === 1 &&
    typeof row.hash === 'string' && txHash.test(row.hash) && row.receiptHash === row.hash &&
    Number.isSafeInteger(row.ledger) && row.ledger > 0;
}

function verifyHistory(operations, history) {
  const old = operations.filter(row => row.battery !== RUN1.batteryId);
  requireThat(old.length === history.confirmed.length + 1 &&
    history.confirmed.every(item => old.some(row => row.id === item.operationId && row.hash === item.txHash &&
      row.battery === item.batteryId && row.command === item.step && row.ledger === item.ledger && verifiedOperation(row))),
  'EXTERNAL_LEDGER_CONSUMPTION_REJECTED');
  const excluded = old.find(row => row.id === history.excludedPreDispatch.operationId);
  requireThat(excluded?.battery === history.excludedPreDispatch.batteryId && excluded.state === 'CANCELLED_LOCAL' &&
    excluded.work === 'ABORTED_PRE_DISPATCH' && excluded.dispatches === 0 && excluded.hash === null,
  'NONCOUNTING_OPERATION_REJECTED');
}

function verifyLifecycle(sql, chain, own, journal) {
  const completed = own.length;
  requireThat(completed === journal.length && completed < cap &&
    own.every((row, index) => verifiedOperation(row) && row.command === steps[index] &&
      row.source === SPEC.actors[sourceRoles[index]] && row.ledger <= chain.ledger &&
      journal[index].operation === row.command && journal[index].operationId === row.id &&
      journal[index].transactionHash === row.hash && journal[index].domainState === states[index] &&
      journal[index].rewardState === rewards[index]), 'RUN1_OPERATION_IDENTITY_REJECTED');
  if (completed === 0) {
    requireThat(sql.occupied === 0 && sql.battery === null && chain.battery === null && sql.requests.length === 0,
      'RUN1_BATTERY_COLLISION');
    return;
  }
  const request = sql.requests[0];
  requireThat(sql.battery?.state === states[completed - 1] && sql.battery.reward === rewards[completed - 1] &&
    chain.battery?.state?.[0]?.toUpperCase() === sql.battery.state &&
    chainRewards[chain.battery.reward_state?.[0]] === sql.battery.reward &&
    chain.battery.request_id === sql.battery.requestId, 'RUN1_CHAIN_SQL_STATE_MISMATCH');
  requireThat(completed === 1 ? sql.requests.length === 0 && sql.battery.requestId === null :
    sql.requests.length === 1 && txHash.test(request.id) && request.id === sql.battery.requestId &&
    request.recipient === RUN1.recipient && request.state === (completed === 2 ? 'HELD' : 'CONSUMED'),
  'RUN1_RESERVATION_REJECTED');
}

export function evaluateReadiness({ sql, chain, history, journal, baseline }) {
  const expected = { mode: 'TESTNET', network: SPEC.networkId, contract: SPEC.contract, wasm: SPEC.wasm,
    admin: SPEC.actors.admin, service: SPEC.actors.service, sac: SPEC.token, reward: reward.toString() };
  requireThat(sql.read_only === 'on' && Object.entries(expected).every(([name, value]) => sql.deployment?.[name] === value),
    'SQL_DEPLOYMENT_REJECTED');
  requireThat(['active_leases', 'reconciliation_locks', 'pending', 'uncertain', 'foreign_holds', 'review_intents']
    .every(key => sql[key] === 0), 'SQL_QUIESCENCE_REJECTED');
  requireThat(sql.wallets.length === 2 && SPEC.wallets.every(address =>
    sql.wallets.some(row => row.address === address && row.verified === true &&
      row.active_links === 1 && row.matching_owner_links === 2)), 'WALLET_LINK_REJECTED');
  verifyHistory(sql.operations, history);
  const own = sql.operations.filter(row => row.battery === RUN1.batteryId);
  verifyLifecycle(sql, chain, own, journal);
  requireThat(chain.pool >= 3n * reward + payerMargin && Number.isSafeInteger(chain.minimumTtl) && chain.minimumTtl >= 720,
    'POOL_OR_TTL_REJECTED');
  const before = baseline ?? {
    sequences: Object.fromEntries(chain.sources.map(item => [item.role, item.sequence])),
    balances: chain.wallets.map(item => item.balance),
    pool: chain.pool,
  };
  requireThat(chain.pool === before.pool && chain.wallets.length === 2 && chain.wallets.every((wallet, index) =>
    wallet.address === SPEC.wallets[index] && wallet.balance === before.balances[index] &&
    wallet.capacity >= (index === 0 ? 2n : 1n) * reward), 'REWARD_READINESS_REJECTED');
  requireThat(chain.sources.length === 4 && Object.entries(SPEC.actors).every(([role, address]) =>
    chain.sources.some(item => item.role === role && item.address === address)), 'CHAIN_SOURCE_IDENTITY_REJECTED');
  const sources = chain.sources.flatMap(item => {
    const completed = sourceRoles.slice(0, own.length).filter(role => role === item.role).length;
    const remaining = sourceRoles.filter(role => role === item.role).length - completed;
    const expectedSequence = (BigInt(before.sequences[item.role]) + BigInt(completed)).toString();
    requireThat(item.sequence === expectedSequence && item.available >= BigInt(remaining) * fee,
      'SOURCE_SEQUENCE_OR_FUNDING_REJECTED');
    if (completed > 0) {
      const last = own.findLast(row => row.source === item.address);
      requireThat(last.sequence === expectedSequence, 'DURABLE_SOURCE_SEQUENCE_REJECTED');
    }
    return item.role === 'collector' ? [] :
      [{ address: item.address, sequence: item.sequence, reviewedSequence: expectedSequence, xlmReady: true }];
  });
  return { baseline: before, sources, wallets: chain.wallets.map(wallet => ({
    address: wallet.address, approvedMapping: true, trustlineAuthorized: true, capacityBaseUnits: wallet.capacity.toString(),
  })), payerBaseUnits: chain.pool.toString(), marginBaseUnits: payerMargin.toString(),
  ttlMargin: chain.minimumTtl, requiredTtlMargin: 720, successfulTxCap: cap,
  failedBroadcastCap: 0, setupCap: 0, maintenanceCap: 0, runtimeFeeCap: fee.toString(),
  approvedFeeCap: fee.toString(), requestedFee: fee.toString() };
}
