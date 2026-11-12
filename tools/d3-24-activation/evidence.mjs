import { SPEC } from '../d3-evidence-capture/common.mjs';
import { PublicReads } from '../d3-evidence-capture/network.mjs';
import { assertD324Scope, RUN1, RUN_CAP } from '../d3-24-ratification/identity.mjs';
import { projectD324Journal } from '../d3-24-ratification/readiness.mjs';
import { verifyD324CapturedTransaction } from '../d3-24-ratification/capture.mjs';
import { verifyD324OwnerExport } from '../d3-24-ratification/owner-export.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { readD324Journal } from '../d3-24-operational/checkout.mjs';
import { captureD324ReadOnlyInChild } from './supervisor.mjs';

// Prepared read-only evidence binding. No launcher imports this port to run
// live. It can observe an existing transaction, and cannot submit one.
export function bindD324EvidenceReview({ pool, fetcher, controls }) {
  check(typeof fetcher === 'function', 'D324_EXPLICIT_READ_PORT_REQUIRED');
  const reads = new PublicReads(fetcher);
  const receipts = [];
  let pending = false;
  let stopped = false;
  return Object.freeze({
    async capture(expected, api) {
      check(!pending && !stopped && receipts.length < RUN_CAP, 'D324_EVIDENCE_PROGRESS_REJECTED');
      pending = true;
      try {
        const scope = assertD324Scope(expected);
        const index = receipts.length;
        const journalBytes = await readD324Journal(controls);
        const journal = projectD324Journal(journalBytes);
        const row = journal[index];
        check(journal.length === index + 1 && row.operation === scope.method &&
          row.operationId === scope.operationId && row.transactionHash === scope.transactionHash &&
          row.domainState === api?.confirmedBatteryState && row.rewardState === api?.confirmedRewardState &&
          (row.requestId ?? null) === api?.requestId && api?.operationId === scope.operationId &&
          api?.transactionHash === scope.transactionHash && api?.confirmationLedger === scope.ledger &&
          api?.batteryId === scope.batteryId && api?.operation === scope.method, 'D324_CAPTURE_JOURNAL_REJECTED');
        const { directory, proof } = await captureD324ReadOnlyInChild(pool, scope);
        check(proof.status === 'DURABLE_RECEIPT_CONVERGED_NORMALIZED' && proof.receipt?.rpc, 'D324_CAPTURE_UNCONFIRMED');
        const [network, horizon, ledger] = await Promise.all([
          reads.rpc('getNetwork'), reads.horizon('/transactions/' + scope.transactionHash), reads.horizon('/ledgers/' + scope.ledger),
        ]);
        const observations = {
          network: { passphrase: network.value.passphrase, networkId: SPEC.networkId },
          horizon: horizon.value, horizonLedger: ledger.value, provenance: horizon.provenance,
          rpc: proof.receipt.rpc, expected: { hash: scope.transactionHash, batteryId: RUN1.batteryId, method: scope.method },
        };
        const verified = await verifyD324CapturedTransaction(directory, scope, api, observations);
        check(journalBytes.equals(await readD324Journal(controls)), 'D324_CAPTURE_JOURNAL_CHANGED');
        receipts.push({ scope, observations });
        return verified;
      } catch (error) {
        stopped = true;
        throw error;
      } finally {
        pending = false;
      }
    },
    async verifyExport(raw, digest) {
      check(!pending && !stopped && receipts.length === RUN_CAP, 'D324_EXPORT_INCOMPLETE');
      return verifyD324OwnerExport(raw, digest, {
        journalBytes: await readD324Journal(controls), scopes: receipts.map(r => r.scope),
        observations: receipts.map(r => r.observations),
      });
    },
  });
}
