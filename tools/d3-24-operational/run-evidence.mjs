import { captureD324ReadOnlyInChild } from '../d3-24-activation/supervisor.mjs';
import { PublicReads } from '../d3-evidence-capture/network.mjs';
import { SPEC } from '../d3-evidence-capture/common.mjs';
import { verifyD324CapturedTransaction } from '../d3-24-ratification/capture.mjs';
import { RUN1, RUN_CAP } from '../d3-24-ratification/identity.mjs';
import { verifyD324OwnerExport } from '../d3-24-ratification/owner-export.mjs';
import { projectD324Journal } from '../d3-24-ratification/readiness.mjs';
import { d324ScopeFromStep } from '../d3-run1-launcher/launcher.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { readD324Journal } from './checkout.mjs';
import { preserveD324OwnerExport, readD324OwnerExport } from './export-readonly.mjs';

export function bindD324Evidence(pool, controls, fetcher) {
  const accepted = [], ids = new Set(), hashes = new Set();
  const reads = new PublicReads(fetcher);
  return Object.freeze({
    async probe() { await readD324OwnerExport(pool, []); },
    async record(evidence) {
      const previous = accepted.at(-1);
      const scope = d324ScopeFromStep(evidence, accepted.length, previous && {
        ...previous.scope, requestId: previous.observation.expected.requestId,
      }, ids, hashes);
      const rows = projectD324Journal(await readD324Journal(controls));
      const row = rows.at(-1);
      check(rows.length === accepted.length + 1 && accepted.every((item, index) =>
        rows[index].operationId === item.scope.operationId && rows[index].transactionHash === item.scope.transactionHash &&
        (rows[index].requestId ?? null) === item.observation.expected.requestId) &&
        row.operationId === scope.operationId &&
        row.transactionHash === scope.transactionHash && (row.requestId ?? null) === evidence.requestId &&
        row.confirmationMode === evidence.confirmationMode, 'D324_CAPTURE_JOURNAL_REJECTED');
      const { directory, proof } = await captureD324ReadOnlyInChild(pool, scope);
      const [network, horizon, ledger, rpcLedger] = await Promise.all([
        reads.rpc('getNetwork'), reads.horizon('/transactions/' + scope.transactionHash),
        reads.horizon('/ledgers/' + scope.ledger),
        reads.rpc('getLedgers', { startLedger: scope.ledger, pagination: { limit: 1 } }),
      ]);
      const observation = {
        network: { passphrase: network.value.passphrase, networkId: SPEC.networkId },
        horizon: horizon.value, horizonLedger: ledger.value, rpcLedger: rpcLedger.value, provenance: horizon.provenance,
        rpc: proof.receipt?.rpc, expected: { hash: scope.transactionHash, batteryId: RUN1.batteryId,
          method: scope.method, requestId: evidence.requestId, recipient: RUN1.recipient },
      };
      const verified = await verifyD324CapturedTransaction(directory, scope, evidence, observation);
      ids.add(scope.operationId);
      hashes.add(scope.transactionHash);
      accepted.push({ scope, observation, inventorySha256: verified.inventorySha256 });
    },
    async finish() {
      check(accepted.length === RUN_CAP, 'D324_EXPORT_INCOMPLETE');
      const scopes = accepted.map(item => item.scope);
      const output = await readD324OwnerExport(pool, scopes.map(item => item.operationId));
      await verifyD324OwnerExport(output.content, output.sha256, {
        scopes, journalBytes: await readD324Journal(controls), observations: accepted.map(item => item.observation),
      });
      return Object.freeze({ directory: await preserveD324OwnerExport(output),
        sha256: output.sha256, confirmed: scopes.length, grantsExecutionAuthority: false,
        receipts: Object.freeze(accepted.map(item => Object.freeze({ ...item.scope, inventorySha256: item.inventorySha256 }))) });
    },
  });
}
