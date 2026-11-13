import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { COMPONENTS, COMPOSITION_COMMIT, SIGNER } from './pins.mjs';
import { reviewCompositionCandidate, verifyCandidateSignerBinary } from './review.mjs';
import { inspectV3ManifestFields, verifyMaterializedV3Capture } from './manifest-v3.mjs';
import { sessionIdentityDigest } from './session-control.mjs';
import { RUN1, readD324Plan, readD324Ledger, OWNER_QUERY_SHA256 } from '../d3-24-ratification/identity.mjs';
import { verifyD324OperatorCommit } from '../d3-24-ratification/operator-identity.mjs';
import { bytes, SPEC } from '../d3-evidence-capture/common.mjs';
import { liveEntry, runD324Entry } from '../d3-24-operational/live.mjs';
import { D324_ARGV } from '../d3-24-operational/policy.mjs';
import { BOOTSTRAP_BINARIES } from '../d3-24-operational/bootstrap-pins.mjs';
import { D324_CAPTURE_PROFILE_SHA256 } from '../d3-24-capture-profile/profile.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const oldPlan = 'tools/d3-24-ratification/plan.json';
test('candidate joins exact sibling capture and server bytes without inventing a future commit', async () => {
  const r = await reviewCompositionCandidate(root);
  assert.equal(r.base, COMPONENTS.server); assert.equal(r.futureCommit, null); assert.equal(r.futureTree, null);
  assert.equal(r.operator.sha, COMPONENTS.operator); assert.equal(r.liveAuthority, false);
  assert.equal(r.planHash, RUN1.planHash); assert.equal(r.remainingExternal, 14);
});
test('new canonical plan binds the new independent operator; historical plan stays intact', () => {
  assert.equal(readD324Plan().input.gitSha, COMPONENTS.operator);
  const old = readFileSync(join(root, oldPlan));
  assert(old.equals(execFileSync('git', ['show', COMPONENTS.server + ':' + oldPlan], { cwd: root })));
  assert.throws(() => readD324Plan(old), /D324_PLAN_DIGEST_REJECTED/);
  assert.equal(verifyD324OperatorCommit().parent, COMPONENTS.operatorParent);
});
test('budget retains five historical transactions and refuses contingency', async () => {
  const ledger = await readD324Ledger();
  assert.equal(ledger.confirmedConsumed, 5); assert.equal(ledger.remaining, 14); assert.equal(ledger.runCap, 5);
  assert.equal(ledger.txAuthorized, false); assert.equal(ledger.contingencyAuthorized, false);
  assert.equal(ledger.historicalCandidateBinding.operatorSha, 'c50e4eb1f7f538a231c5ecfc31d19283998dc234');
  assert.equal(ledger.currentCandidateBinding.operatorSha, COMPONENTS.operator);
  assert.equal(ledger.currentCandidateBinding.status, 'REVIEW_ONLY');
});
const op = verifyD324OperatorCommit();
function v3() { return { schema: 'BYETERY_D324_FINAL_ACTIVATION_V3', identity: RUN1,
  target: { sha: 'a'.repeat(40), parent: COMPONENTS.server, tree: 'b'.repeat(40) },
  networkId: SPEC.networkId, deploymentId: SPEC.deployment,
  operator: { sha: op.sha, parent: op.parent, tree: op.tree }, ledgerSha256: 'eaffd7521b905b995dba26150190c44592822e6e052509b3d65815adde25404d',
  budget: { historicalConfirmed: 5, limitWithoutContingency: 19, remaining: 14, runCap: 5, tx20Authorized: false },
  artifacts: { exportQuery: OWNER_QUERY_SHA256, wrapper:'f'.repeat(64),entry:'e'.repeat(64),captureChild:'d'.repeat(64),
    captureProfileSha256:D324_CAPTURE_PROFILE_SHA256 }, k5Sha256: 'd'.repeat(64), sessionControlSha256: 'e'.repeat(64),
  binaries: BOOTSTRAP_BINARIES, operatorRoot:root }; }
test('V3 field inspection is explicitly review-only and cannot materialize or approve a manifest', async () => {
  const r = inspectV3ManifestFields(bytes(v3())); assert.equal(r.reviewOnly, true); assert.equal(r.liveAuthority, false);
  assert.equal(COMPOSITION_COMMIT, null);
  await assert.rejects(verifyMaterializedV3Capture(root, { manifestBytes: bytes(v3()) }), /D324_COMPOSITION_NOT_MATERIALIZED/);
});
for (const [name, mutate] of [
  ['V2 downgrade', m => { m.schema = 'BYETERY_D324_FINAL_ACTIVATION_V2'; }],
  ['old operator', m => { m.operator.sha = 'c50e4eb1f7f538a231c5ecfc31d19283998dc234'; }],
  ['old plan', m => { m.identity = { ...RUN1, planHash: '3c03cfe14ea2bb091fba229c378ebea859b8ebdadbdbb6ee739b23b1b831a02d' }; }],
  ['contingency', m => { m.budget.tx20Authorized = true; }],
  ['wrong parent', m => { m.target.parent = COMPONENTS.capture; }],
  ['wrong query', m => { m.artifacts.exportQuery = '0'.repeat(64); }],
]) test('V3 rejects ' + name, () => { const m = v3(); mutate(m); assert.throws(() => inspectV3ManifestFields(bytes(m)), /D324_V3_/); });
test('all Node LIVE entries remain closed even with exact argv', async () => {
  assert.equal(liveEntry(D324_ARGV), 'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  assert.equal(await runD324Entry(D324_ARGV), 'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  const r = spawnSync(process.execPath, ['tools/d3-24-operational/live.mjs', ...D324_ARGV], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 1); assert.equal(r.stdout.trim(), 'D324_OPERATIONAL_RATIFICATION_REQUIRED');
});
test('session digest binds exact four identities and expiry, independently of property order', () => {
  const a = ['ADMIN', 'USER', 'COLLECTOR', 'RECYCLER'].map((role, i) => ({role,
    authUserId: '00000000-0000-4000-8000-00000000000' + i,
    sessionId: '11111111-1111-4111-8111-11111111111' + i, tokenExpiresAt: 1800000000000 }));
  assert.equal(sessionIdentityDigest(a), sessionIdentityDigest(a.toReversed()));
  assert.notEqual(sessionIdentityDigest(a), sessionIdentityDigest(a.map((x, i) => i ? x : { ...x, tokenExpiresAt: x.tokenExpiresAt + 1 })));
  assert.throws(() => sessionIdentityDigest(a.slice(1)), /D324_SESSION_SET_REJECTED/);
});
test('signer candidate records source/binary identity without accepting custody risk', () => {
  assert.equal(SIGNER.sourceCommit, COMPONENTS.server); assert.equal(SIGNER.custodyRiskAccepted, false);
  assert.match(SIGNER.binarySha256, /^[a-f0-9]{64}$/);
});
