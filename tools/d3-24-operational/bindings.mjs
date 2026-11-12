import { activationArguments, preflight } from '../../backend/src/d3/operator-control.ts';
import { SPEC } from '../d3-evidence-capture/common.mjs';
import { captureD324Receipt, verifyD324CaptureInventory, verifyD324CapturedTransaction } from '../d3-24-ratification/capture.mjs';
import { RUN1, readD324Plan } from '../d3-24-ratification/identity.mjs';
import { verifyD324OwnerExport } from '../d3-24-ratification/owner-export.mjs';
import { projectD324Journal, readD324Snapshots, verifyD324Completion, verifyD324Readiness } from '../d3-24-ratification/readiness.mjs';
import { createD324ReadPreflight, requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { assertRoleIdentities } from '../d3-run1-launcher/live-sql.mjs';
import { D324_ARGV } from './policy.mjs';
import { readD324Journal } from './checkout.mjs';

export { verifyD324SessionPins } from '../d3-run1-launcher/session-pins.mjs';

// Bound read ports. This adapter has no admission, credentials, submission or
// operator factory. The eventual ratified launcher must supply the reviewed ports.
export function bindD324Readiness({ pool, fetcher, checkCheckout, controls, readSignerIdentities, now = Date.now, diagnostics }) {
  const plan = readD324Plan();
  const args = activationArguments(D324_ARGV);
  let baseline;
  const read = async () => {
    await checkCheckout();
    const gitAt = now();
    const journalBytes = await readD324Journal(controls);
    const snapshots = await readD324Snapshots(pool, fetcher, now);
    return { ...snapshots, journalBytes, baseline, gitAt, sqlAt: now() };
  };
  const readPreflight = createD324ReadPreflight(async ({ requestId }) => {
    const facts = await read();
    const readiness = await verifyD324Readiness(facts);
    await assertRoleIdentities(pool);
    const signers = await readSignerIdentities();
    const { baseline: next, ...fields } = readiness;
    const observation = {
      ...fields, taskId: RUN1.taskId, runId: RUN1.runId, observedAt: now(),
      git: { sha: RUN1.businessSha, clean: true }, sameRuntimeSha: RUN1.businessSha, mode: 'TESTNET',
      networkId: SPEC.networkId, contractId: SPEC.contract, wasmSha256: SPEC.wasm, deploymentId: SPEC.deployment,
      payer: SPEC.contract, unresolved: 0, pendingDispatches: 0, signers, uniqueBatteryIds: true, simulationBeforeSend: true,
    };
    preflight(plan, args, observation, process.env, now());
    baseline = next;
    return { requestId, preflight: observation, observations: [
      { source: 'LOCAL_GIT', observedAt: facts.gitAt, ledger: null },
      { source: 'SUPABASE_SQL_READ_ONLY', observedAt: facts.sqlAt, ledger: null },
      { source: 'STELLAR_RPC_TESTNET', observedAt: facts.chain.observedAt, ledger: facts.chain.ledger },
    ] };
  }, { now, diagnostics });

  return Object.freeze({ readPreflight, async verifyCompletion() {
    check(baseline, 'D324_BASELINE_REQUIRED');
    return verifyD324Completion(await read());
  } });
}

export const evidenceBindings = Object.freeze({
  projectJournal: projectD324Journal,
  captureReceipt: captureD324Receipt,
  verifyInventory: verifyD324CaptureInventory,
  verifyTransaction: verifyD324CapturedTransaction,
  verifyOwnerExport: verifyD324OwnerExport,
});
