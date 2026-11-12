import { SPEC } from '../d3-evidence-capture/common.mjs';
import { strictJson } from '../d3-evidence-capture/owner-export.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { evaluateReadinessForRun } from '../d3-run1-launcher/live-readiness.mjs';
import { readChainForRun } from '../d3-run1-launcher/live-chain.mjs';
import { readSqlForRun } from '../d3-run1-launcher/live-sql.mjs';
import { hex, uuid, readD324Ledger, readD324Plan, RUN1, RUN_CAP } from './identity.mjs';

const states = ['REGISTERED', 'RETURNED', 'COLLECTED', 'RECYCLED', 'RECYCLED'];
const rewards = ['NOT_ELIGIBLE', 'NOT_ELIGIBLE', 'NOT_ELIGIBLE', 'PENDING', 'SENT'];
const modes = ['OBSERVED', 'RECONCILED_AFTER_OBSERVATION_EXPIRY'];

export function projectD324Journal(raw) {
  check(Buffer.isBuffer(raw) && raw.length <= 262_144, 'D324_JOURNAL_REJECTED');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  check(text === '' || text.endsWith('\n'), 'D324_JOURNAL_INCOMPLETE');
  const rows = text === '' ? [] : text.slice(0, -1).split('\n').map(strictJson);
  const final = [];
  let group = [];
  for (const row of rows) {
    const index = final.length;
    check(index < RUN_CAP && row?.taskId === RUN1.taskId && row.gitSha === RUN1.businessSha &&
      row.runId === RUN1.runId && row.batteryId === RUN1.batteryId && row.operation === SPEC.methods[index] &&
      (group.length === 0 ? row.phase === 'INTENT' : ['RESULT', 'UNKNOWN'].includes(row.phase)), 'D324_JOURNAL_SCOPE_REJECTED');
    group.push(row);
    if (!row.domainState) continue;
    check(row.phase === 'RESULT' && uuid.test(row.operationId ?? '') && hex.test(row.transactionHash ?? '') &&
      row.domainState === states[index] && row.rewardState === rewards[index] && modes.includes(row.confirmationMode) &&
      (index === 0 ? row.requestId === undefined : hex.test(row.requestId ?? '') &&
        (index === 1 || row.requestId === final[1].requestId)), 'D324_JOURNAL_FINAL_REJECTED');
    const reconciled = group.filter(item => item.reconciliation === 'CONFIRMED');
    check(reconciled.length === 1 && reconciled[0] === group.at(-2) && reconciled[0].phase === 'RESULT' &&
      reconciled[0].operationId === row.operationId && reconciled[0].transactionHash === row.transactionHash &&
      reconciled[0].confirmationMode === row.confirmationMode && group.every(item =>
        (item.operationId === undefined || item.operationId === row.operationId) &&
        (item.transactionHash === undefined || item.transactionHash === row.transactionHash)) &&
      !final.some(item => item.operationId === row.operationId || item.transactionHash === row.transactionHash),
    'D324_JOURNAL_OPERATION_IDENTITY_REJECTED');
    final.push(Object.freeze(row));
    group = [];
  }
  check(group.length === 0, 'D324_JOURNAL_INCOMPLETE');
  return Object.freeze(final);
}

export async function verifyD324Readiness({ sql, chain, journalBytes, baseline }) {
  return verifySnapshot({ sql, chain, journalBytes, baseline }, false);
}

export async function verifyD324Completion({ sql, chain, journalBytes, baseline }) {
  return verifySnapshot({ sql, chain, journalBytes, baseline }, true);
}

async function verifySnapshot({ sql, chain, journalBytes, baseline }, terminal) {
  const history = await readD324Ledger();
  readD324Plan();
  const journal = projectD324Journal(journalBytes);
  const readiness = evaluateReadinessForRun({ sql, chain, history, journal, baseline }, RUN1, { terminal });
  check(readiness.successfulTxCap === RUN_CAP && RUN_CAP <= history.remaining, 'D324_BUDGET_REJECTED');
  if (journal.length > 1) check(journal.at(-1).requestId === sql.battery?.requestId, 'D324_JOURNAL_REQUEST_REJECTED');
  if (terminal) return { taskId: RUN1.taskId, planHash: RUN1.planHash, completed: journal.length,
    remainingThisRun: 0, confirmedExternal: history.confirmedConsumed + journal.length, grantsExecutionAuthority: false };
  return { ...readiness, taskId: RUN1.taskId, planHash: RUN1.planHash, completed: journal.length,
    remainingThisRun: RUN_CAP - journal.length, grantsExecutionAuthority: false };
}

// Review tooling takes explicit reader ports and performs no reads on import.
export async function readD324Snapshots(pool, fetcher, now) {
  check(typeof fetcher === 'function', 'D324_EXPLICIT_READ_PORT_REQUIRED');
  const [sql, chain] = await Promise.all([readSqlForRun(pool, RUN1, { coordinate: true }), readChainForRun(RUN1, fetcher, now)]);
  return { sql, chain };
}
