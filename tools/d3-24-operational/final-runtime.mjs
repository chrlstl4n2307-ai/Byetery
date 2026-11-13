import { createRequire } from 'node:module';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { settings } from '../../backend/src/application/config.ts';
import { assertLocalRuntime } from '../../backend/src/d3/operator-guard.ts';
import { SPEC, read } from '../d3-evidence-capture/common.mjs';
import { bindD324EvidenceReview } from '../d3-24-activation/evidence.mjs';
import { observeD324Checkout } from '../d3-24-activation/manifest.mjs';
import { d324ControlPaths } from '../d3-24-ratification/composition.mjs';
import { RUN1, RUN_CAP } from '../d3-24-ratification/identity.mjs';
import { createRuntimeCredentials, createSessionDeadline, createSingleAdmission, requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { createD324Diagnostics, persistFatal } from '../d3-run1-launcher/diagnostics.mjs';
import { gitRead } from '../d3-run1-launcher/live.mjs';
import { d324ScopeFromStep } from '../d3-run1-launcher/launcher.mjs';
import { checkPublicSigners, createRoleResolver } from '../d3-run1-launcher/live-runtime.mjs';
import { lookupRole } from '../d3-run1-launcher/live-sql.mjs';
import { createNoEcho } from '../d3-run1-launcher/no-echo.mjs';
import { bindD324Readiness } from './bindings.mjs';
import { assertD324Unused } from './checkout.mjs';
import { checkLocalD324Api } from './api-continuity.mjs';
import { preserveD324OwnerExport, readD324OwnerExport } from './export-readonly.mjs';
import { loadD324Operator } from './operator-binding.mjs';
import { isD324OwnerAuthorization, loadD324OwnerAuthorization } from './owner-authorization.mjs';
import { D324_ARGV } from './policy.mjs';
import { prepareD324Bridge } from './prelive-bridge.mjs';
import { isD324PrivateSessionClient } from './private-session-channel.mjs';

const { Pool } = createRequire(new URL('../../backend/package.json', import.meta.url))('pg');

// V3 candidate binding. The historical entrypoints still reject activation.
// The published bridge owns orchestration and restricts its port to fixtures.
export async function prepareD324RuntimeV3Review({ channel, sessionOptions, localControl, port }) {
  check(isD324PrivateSessionClient(channel) && port.classification === 'OFFLINE_SYNTHETIC',
    'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  const { onFixtureHeaders, ...options } = sessionOptions;
  const control = Object.freeze({ ...channel, async prepare(headers) {
    const receipt = await channel.prepare(headers);
    // The synthetic proof port needs the same bearers in process memory.
    onFixtureHeaders?.(headers, receipt);
    return receipt;
  } });
  return prepareD324Bridge({ sessionOptions: { ...options, control }, localControl, port });
}

// This function has no caller-injected runtime, submitter, grant verifier or
// credential source. The owner authorization brand is minted only by custody.
export async function executeD324ApprovedRun(root, authorization) {
  assertLocalRuntime();
  check(isD324OwnerAuthorization(authorization) && process.argv.slice(2).join('\0') === D324_ARGV.join('\0'),
    'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  check(process.stdin.isTTY && process.stdout.isTTY && typeof process.stdin.setRawMode === 'function' &&
    !Object.keys(process.env).some(key => /^(?:PG|DATABASE_URL$|SUPABASE_SERVICE_ROLE_KEY$)/i.test(key)),
  'D324_LOCAL_BINDINGS_REQUIRED');
  const config = await settings();
  check(config.mode === 'TESTNET' && config.deploymentId === SPEC.deployment, 'D324_SQL_CONFIG_TARGET_REJECTED');
  const common = await realpath(await gitRead(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const controls = d324ControlPaths(common);
  const pool = new Pool({ ...config.database, max: 2, connectionTimeoutMillis: 5000, query_timeout: 9000, statement_timeout: 9000,
    options: '-c default_transaction_read_only=on', application_name: 'byetery-d324-readonly' });
  pool.on('error', () => {});
  const diagnostics = createD324Diagnostics();
  const prompt = createNoEcho();
  let operator;
  let admitted = false;
  let sessionDeadline;
  let remaining = RUN_CAP;
  let status;
  const checkCheckout = async () => {
    const fact = await observeD324Checkout(root, authorization.operator.root);
    check(fact.target.sha === authorization.sha && fact.operator.sha === RUN1.businessSha, 'D324_RUNTIME_CHECKOUT_CHANGED');
    await checkLocalD324Api(root, authorization.api, authorization.nodePath);
  };
  const authorizeStart = async () => {
    const current = await loadD324OwnerAuthorization(root);
    check(current.continuity === authorization.continuity && Date.now() < current.approvalExpiresAt,
      'D324_START_APPROVAL_CHANGED');
    await checkLocalD324Api(root, authorization.api, authorization.nodePath);
  };
  const markerContents = authorization.grant.nonce + '\n';
  const markerMatches = () => admitted && read(controls.admission, 65).toString('utf8') === markerContents;
  const readiness = bindD324Readiness({ pool, fetcher: fetch, checkCheckout, controls,
    readSignerIdentities: () => checkPublicSigners(authorization.operator.root, process.env), diagnostics,
    phaseOf: n => n <= 2 ? 'PRE_ADMISSION' : n === 3 ? 'STARTUP_FRESH' : 'OPERATOR_STEP' });
  const evidence = bindD324EvidenceReview({ pool, fetcher: fetch, controls });
  const credentials = createRuntimeCredentials(createRoleResolver({
    async checkAdmission() { check(markerMatches(), 'D324_CREDENTIALS_BEFORE_ADMISSION'); },
    lookup: role => lookupRole(pool, role), prompt: prompt.read, diagnostics,
  }), diagnostics);
  try {
    await assertD324Unused(controls);
    await authorizeStart();
    await readD324OwnerExport(pool, []);
    await readiness.readPreflight();
    await authorizeStart();
    await readiness.readPreflight();
    await assertD324Unused(controls);
    check(Date.now() < authorization.approvalExpiresAt, 'D324_LIVE_APPROVAL_EXPIRED');
    createSessionDeadline(authorization.sessionConfig, { operatorStart: Date.now() }).check(RUN_CAP, true);
    await createSingleAdmission(controls.admission, authorization.grant.nonce)();
    admitted = true;
    // The marker is deliberately retained on every subsequent outcome.
    const pinned = await loadD324Operator(root, authorization.operator.root);
    await authorizeStart();
    check(markerMatches(), 'D324_MARKER_CHANGED');
    sessionDeadline = createSessionDeadline(authorization.sessionConfig, { operatorStart: Date.now() });
    sessionDeadline.check(RUN_CAP, true);
    operator = await pinned.createLocalOperator({
      root: pinned.root, argv: D324_ARGV,
      publicPlanFile: join(root, 'tools', 'd3-24-ratification', 'plan.json'),
      apiOrigin: authorization.api.origin, publishableKey: config.publicKey,
      readPreflight: async () => {
        check(markerMatches(), 'D324_MARKER_CHANGED');
        sessionDeadline.check(remaining);
        return readiness.readPreflight();
      },
      credentials,
    });
    const ids = [];
    const seenOperations = new Set(), seenHashes = new Set();
    let previous;
    for (const [index, operation] of SPEC.methods.entries()) {
      const api = await operator.step(operation);
      const scope = d324ScopeFromStep(api, index, previous, seenOperations, seenHashes);
      const proof = await evidence.capture(scope, api);
      check(proof.chainVerified === true, 'D324_CAPTURE_UNCONFIRMED');
      seenOperations.add(scope.operationId);
      seenHashes.add(scope.transactionHash);
      previous = { ...scope, requestId: api.requestId };
      ids.push(scope.operationId);
      sessionDeadline.check(--remaining);
    }
    await readiness.verifyCompletion();
    const exportFile = await readD324OwnerExport(pool, ids);
    const exported = await evidence.verifyExport(exportFile.content, exportFile.sha256);
    check(exported.status === 'SQL_INTEGRITY_PASS', 'D324_EXPORT_UNCONFIRMED');
    const decision = await operator.countingDecision();
    check(decision.countable === true && decision.sha === RUN1.businessSha && markerMatches(), 'D324_OPERATOR_DECISION_REJECTED');
    await preserveD324OwnerExport(exportFile);
    status = 'D324_LIVE_CAPTURE_COMPLETE';
  } catch {
    status = admitted ? 'D324_RUN_STOPPED_RECONCILE' : 'D324_PRE_ADMISSION_REJECTED';
  } finally {
    try { await operator?.close(); }
    catch { status = 'D324_RUN_STOPPED_RECONCILE'; }
    try { prompt.close(); }
    finally {
      try { await pool.end(); }
      catch { status = admitted ? 'D324_RUN_STOPPED_RECONCILE' : 'D324_PRE_ADMISSION_REJECTED'; }
    }
  }
  if (status !== 'D324_LIVE_CAPTURE_COMPLETE') {
    try { await persistFatal(diagnostics, status, authorization.sha, authorization.sessionControlSha256); }
    catch { /* No arbitrary diagnostic output. */ }
  }
  return status;
}
