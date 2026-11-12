import { hash, SPEC } from '../d3-evidence-capture/common.mjs';
import { X } from '../d3-evidence-capture/xdr-reader.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';

const rows = [
  ['ADMIN', 'admin', 'REGISTERED', 'NOT_ELIGIBLE', 'Registered', 'NotEligible'],
  ['USER', 'service', 'RETURNED', 'NOT_ELIGIBLE', 'Returned', 'NotEligible'],
  ['COLLECTOR', 'service', 'COLLECTED', 'NOT_ELIGIBLE', 'Collected', 'NotEligible'],
  ['RECYCLER', 'recycler', 'RECYCLED', 'PENDING', 'Recycled', 'Pending'],
  ['USER', 'service', 'RECYCLED', 'SENT', 'Recycled', 'Sent'],
];
const fixtureHash = label => hash('D324_OFFLINE_SYNTHETIC:' + label);
export const requestId = fixtureHash('request');
export const steps = Object.freeze(rows.map(([role, source, state, reward, chainState, chainReward], i) => Object.freeze({
  role, source, state, reward, chainState, chainReward,
  scope: Object.freeze({ method: SPEC.methods[i], batteryId: RUN1.batteryId, ledger: 7_700_001 + i,
    operationId: '00000000-0000-4000-8000-' + String(330 + i).padStart(12, '0'), transactionHash: fixtureHash(SPEC.methods[i]) }),
})));

export function fixtureReads(history, count) {
  const done = steps.slice(0, count);
  const last = done.at(-1);
  const request = count > 1 ? requestId : null;
  const sequence = (role, offset = count) => String(31 + steps.slice(0, offset).filter(step => step.source === role).length);
  const projected = { state: 'CONFIRMED', work: 'PROJECTED', dispatches: 1 };
  return {
    sql: { read_only: 'on', occupied: count ? 1 : 0, active_leases: 0, pending: 0, uncertain: 0,
      reconciliation_locks: 0, foreign_holds: 0, review_intents: 0,
      deployment: { mode: 'TESTNET', network: SPEC.networkId, contract: SPEC.contract, wasm: SPEC.wasm,
        admin: SPEC.actors.admin, service: SPEC.actors.service, sac: SPEC.token, reward: '100000000' },
      wallets: SPEC.wallets.map(address => ({ address, verified: true, active_links: 1, matching_owner_links: 2 })),
      battery: last ? { state: last.state, reward: last.reward, requestId: request } : null,
      requests: request ? [{ id: request, recipient: RUN1.recipient, state: count === 2 ? 'HELD' : 'CONSUMED' }] : [],
      operations: [
        ...history.confirmed.map(row => ({ id: row.operationId, battery: row.batteryId, command: row.step,
          hash: row.txHash, receiptHash: row.txHash, ledger: row.ledger, ...projected })),
        { id: history.excludedPreDispatch.operationId, battery: history.excludedPreDispatch.batteryId, hash: null,
          state: 'CANCELLED_LOCAL', work: 'ABORTED_PRE_DISPATCH', dispatches: 0 },
        ...done.map(({ scope, source }, i) => ({
          id: scope.operationId, hash: scope.transactionHash, receiptHash: scope.transactionHash, ledger: scope.ledger,
          battery: scope.batteryId, command: scope.method, source: SPEC.actors[source], sequence: sequence(source, i + 1), ...projected,
        })),
      ],
    },
    chain: {
      ledger: 7_700_030, minimumTtl: 10_000, pool: count === 5 ? 600_000_000n : 700_000_000n,
      battery: last ? { state: [last.chainState], reward_state: [last.chainReward], request_id: request } : null,
      sources: Object.entries(SPEC.actors).map(([role, address]) => ({
        role, address, sequence: sequence(role), available: 300_000_000n,
      })),
      wallets: SPEC.wallets.map(address => ({ address, balance: count === 5 && address === RUN1.recipient ? 100_000_000n : 0n,
        capacity: 300_000_000n })),
    },
  };
}

export function fixtureReceipts(scope, fault) {
  const xdr = {
    resultXdr: X.TransactionResult.fromXdrObject({ feeCharged: 0n, result: { code: 0, results: [] }, ext: { v: 0 } }).toXDR('base64'),
    resultMetaXdr: X.TransactionMeta.fromXdrObject({ v: 0, operations: [] }).toXDR('base64'),
  };
  const sql = { ...scope, receiptTransactionHash: scope.transactionHash, status: 'SUCCESS',
    applicationState: 'CONFIRMED', durableState: 'PROJECTED', ...xdr };
  const rpc = { format: 'RPC_JSONRPC', value: { jsonrpc: '2.0', id: 1, result: {
    status: 'SUCCESS', txHash: fault ? fixtureHash('different hash') : scope.transactionHash, ledger: scope.ledger, ...xdr,
  } } };
  return { sql, rpc };
}
