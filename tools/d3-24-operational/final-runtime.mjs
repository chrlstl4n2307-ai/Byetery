import { createSingleAdmission, requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { prepareD324Bridge } from './prelive-bridge.mjs';
import { isD324PrivateSessionClient } from './private-session-channel.mjs';
import { bindD324Readiness } from './bindings.mjs';
import { loadD324Operator } from './operator-binding.mjs';
import { bindD324Evidence } from './run-evidence.mjs';
import { prepareCompositionSessions } from '../d3-24-composition/session-wrapper.mjs';
import { d324ControlPaths } from '../d3-24-ratification/composition.mjs';
import { RUN1, RUN_CAP } from '../d3-24-ratification/identity.mjs';
import { SPEC } from '../d3-evidence-capture/common.mjs';
import { D324_ARGV } from './policy.mjs';
import { assertD324Unused } from './checkout.mjs';
import { fileURLToPath } from 'node:url';
import { realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { observeV3Checkout } from './entry-bootstrap.mjs';
import { readReviewedV3Package } from './owner-authorization.mjs';
import { bindD324ServerWorker } from './server-worker.mjs';
import { prepareD324H2Supervisor, readD324H2ReviewBinding, requireD324RatifiedH2Binding } from './h2-review.mjs';
import { createPublicKey, randomBytes } from 'node:crypto';
import { D324Authority } from '../../backend/src/application/d324-authority.ts';
import { OWNER_GRANT_PUBLIC_KEY, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT } from '../d3-run1-launcher/owner-grant-key.mjs';
import { bytes, canonical, hash } from '../d3-evidence-capture/common.mjs';
import { readD324Snapshots, verifyD324Readiness } from '../d3-24-ratification/readiness.mjs';

// V3 candidate binding. The historical entrypoints still reject activation.
// The published bridge owns orchestration and restricts its port to fixtures.
export async function prepareD324RuntimeV3Review({ channel, sessionOptions, localControl, port, h2FixtureRoot }) {
  check(isD324PrivateSessionClient(channel) && port.classification === 'OFFLINE_SYNTHETIC',
    'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  const h2Review = readD324H2ReviewBinding();
  const h2Supervisor = h2FixtureRoot === undefined ? undefined : prepareD324H2Supervisor(h2FixtureRoot);
  const { onFixtureHeaders, ...options } = sessionOptions;
  const control = Object.freeze({ ...channel, async prepare(headers) {
    const receipt = await channel.prepare(headers);
    // The synthetic proof port needs the same bearers in process memory.
    onFixtureHeaders?.(headers, receipt);
    return receipt;
  } });
  const review = await prepareD324Bridge({ sessionOptions: { ...options, control }, localControl, port });
  return Object.freeze({ ...review, h2Review, h2Supervisor });
}

const planFile = fileURLToPath(new URL('../d3-24-composition/plans/security-repair-v2.json', import.meta.url));
const operationalBindingRatified = false;

export function bindD324ApprovedServer(options) {
  check(operationalBindingRatified, 'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  const { root, verifiedPackage, evidencePool, ...server } = options;
  const pack = readReviewedV3Package(verifiedPackage, root);
  observeV3Checkout(root, pack.target);
  requireD324RatifiedH2Binding(pack);
  check(evidencePool && evidencePool !== server.repo.pool && evidencePool !== server.workerRepo.pool,
    'D324_EVIDENCE_POOL_REQUIRED');
  const instanceId = randomBytes(32).toString('hex'), challenge = randomBytes(32).toString('hex');
  const authority = new D324Authority({
    compositionSha: pack.target.sha, operatorSha: RUN1.businessSha, planHash: RUN1.planHash,
    manifestSha256: pack.manifestSha256, ownerKeyFingerprint: OWNER_GRANT_PUBLIC_KEY_FINGERPRINT,
    ownerPublicKey: createPublicKey({ key: Buffer.from(OWNER_GRANT_PUBLIC_KEY, 'base64url'), format: 'der', type: 'spki' }),
    instanceId, challenge,
  }, async () => {
    observeV3Checkout(root, pack.target);
    const snapshots = await readD324Snapshots(evidencePool, server.fetcher, Date.now);
    const readiness = await verifyD324Readiness({ ...snapshots, journalBytes: Buffer.alloc(0) });
    check(readiness.completed === 0, 'SQL_QUIESCENCE_REJECTED');
  });
  const binding = bindD324ServerWorker({ ...server, authority, signerBinary: pack.signer.path, admissionInput(input) {
    check(input && Object.keys(input).sort().join(',') === 'admissionProof,documents', 'D324_ADMISSION_PROOF_REQUIRED');
    return pack.verifyExecution(input.documents, input.admissionProof);
  } });
  return Object.freeze({ ...binding, instanceId, challenge });
}

// Future internal runner. A composition must ratify its bootstrap and Auth/H2
// before making this reachable. The signed input still needs server admission.
async function executeBoundRun({ sessionOptions, channel, evidencePool, fetcher,
  continuity, readSignerIdentities, obtainExecution, pack, proofFor, observationSignal }) {
  check(isD324PrivateSessionClient(channel), 'D324_IPC_PARENT_REQUIRED');
  const common = await realpath(execFileSync('git', ['--no-replace-objects', 'rev-parse',
    '--path-format=absolute', '--git-common-dir'], { cwd: sessionOptions.root, encoding: 'utf8',
    windowsHide: true, timeout: 10000 }).trim());
  const controls = d324ControlPaths(common);
  const readiness = bindD324Readiness({ pool: evidencePool, fetcher, checkCheckout: continuity, controls, readSignerIdentities });
  const evidence = bindD324Evidence(evidencePool, controls, fetcher);
  const { root, operatorRoot, apiOrigin, publishableKey } = sessionOptions;
  const factory = await loadD324Operator(root, operatorRoot);
  let sessions, operator;
  try {
    await assertD324Unused(controls);
    await readiness.readPreflight();
    await evidence.probe();
    sessions = await prepareCompositionSessions({ ...sessionOptions, control: channel });
    const claims = sessions.executionBinding();
    const { documents, admissionProof } = await obtainExecution(sessions.summary, claims);
    const approval = pack.verifyExecution(documents, admissionProof);
    check(canonical(approval.execution.sessions) === canonical(claims) &&
      approval.execution.executionNotAfter <= sessions.summary.effectiveNotAfter, 'D324_SESSION_BINDING_REJECTED');
    await continuity();
    await assertD324Unused(controls);
    await readiness.readPreflight();
    const liveHash = hash(Buffer.concat([Buffer.from('BYETERY-D324-ONE-LIVE-APPROVAL-V3\n'), bytes(approval.live)]));
    await createSingleAdmission(controls.admission, approval.grant.nonce)();
    await sessions.admit({ documents, admissionProof });
    operator = await factory.createLocalOperator({
      root: operatorRoot, argv: D324_ARGV, publicPlanFile: planFile, apiOrigin, publishableKey,
      readPreflight: readiness.readPreflight, observationSignal,
      credentials() { throw Error('D324_PREPARED_SESSIONS_REQUIRED'); },
      ...sessions.operatorBindings((input, acknowledgement) => proofFor(input, { ...acknowledgement, liveHash })),
    });
    for (const method of SPEC.methods) await evidence.record(await operator.step(method));
    const complete = await readiness.verifyCompletion();
    check(complete.completed === RUN_CAP && (await operator.countingDecision()).countable === true,
      'D324_OPERATOR_DECISION_REJECTED');
    return await evidence.finish();
  } finally {
    try { await operator?.close(); }
    finally {
      try { await sessions?.close(); }
      finally { channel.close(); }
    }
  }
}

// Keep the blocker unconditional until the owner-approved production bootstrap
// is materialized. Neither the review receipt nor a caller flag grants entry.
export async function executeD324ApprovedRun(root, options) {
  check(operationalBindingRatified, 'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  const pack = readReviewedV3Package(options?.verifiedPackage, root);
  check(options?.sessionOptions?.root === root && options.sessionOptions.operatorRoot === pack.operatorRoot,
    'D324_CONTROL_SCOPE_REJECTED');
  observeV3Checkout(root, pack.target);
  requireD324RatifiedH2Binding(pack);
  return executeBoundRun({ ...options, pack,
    async continuity() {
      observeV3Checkout(root, pack.target);
      await options.continuity();
    } });
}
