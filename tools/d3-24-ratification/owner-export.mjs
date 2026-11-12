import { SPEC } from '../d3-evidence-capture/common.mjs';
import { verifyD324ExportRows } from '../d3-evidence-capture/owner-export.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { verifyD324ChainState, verifyFreshD324Scopes } from './capture.mjs';
import { RUN1, RUN_CAP } from './identity.mjs';
import { projectD324Journal } from './readiness.mjs';

export async function verifyD324OwnerExport(raw, expectedHash, { journalBytes, scopes, observations }) {
  const journal = projectD324Journal(journalBytes);
  check(journal.length === RUN_CAP && scopes.length === RUN_CAP && observations.length === RUN_CAP, 'D324_EXPORT_INCOMPLETE');
  const operations = await verifyFreshD324Scopes(scopes);
  const scope = { deployment_id: SPEC.deployment, operations: [] };
  const bound = [];
  for (const [index, operation] of operations.entries()) {
    const row = journal[index];
    const chain = observations[index];
    check(row.operation === operation.method && row.operationId === operation.operationId &&
      row.transactionHash === operation.transactionHash && chain.rpc?.ledger === operation.ledger &&
      chain.expected?.hash === operation.transactionHash && chain.expected?.batteryId === RUN1.batteryId &&
      chain.expected?.method === operation.method, 'D324_EXPORT_OPERATION_IDENTITY_REJECTED');
    scope.operations.push({ operation_id: operation.operationId, transaction_hash: operation.transactionHash,
      command: operation.method, battery_id: RUN1.batteryId });
    bound.push({ ...chain, expected: { hash: operation.transactionHash, batteryId: RUN1.batteryId,
      method: operation.method, requestId: row.requestId, recipient: RUN1.recipient,
      domainState: row.domainState, rewardState: row.rewardState } });
  }
  return { ...verifyD324ExportRows(raw, expectedHash, scope, bound, verifyD324ChainState),
    taskId: RUN1.taskId, planHash: RUN1.planHash, grantsExecutionAuthority: false };
}
