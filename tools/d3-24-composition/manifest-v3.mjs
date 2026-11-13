import { canonical, hash, SPEC } from '../d3-evidence-capture/common.mjs';
import { strictJson } from '../d3-evidence-capture/owner-export.mjs';
import { verifyD324CaptureProfile, D324_CAPTURE_PROFILE_SHA256 } from '../d3-24-capture-profile/profile.mjs';
import { RUN1, OWNER_QUERY_SHA256 } from '../d3-24-ratification/identity.mjs';
import { verifyD324OperatorCommit } from '../d3-24-ratification/operator-identity.mjs';
import { COMPONENTS } from './pins.mjs';
import { BOOTSTRAP_BINARIES } from '../d3-24-operational/bootstrap-pins.mjs';
import { execFileSync } from 'node:child_process';
import { isAbsolute } from 'node:path';

const exact = (obj, names) => obj && typeof obj === 'object' && !Array.isArray(obj) &&
  Object.keys(obj).sort().join(',') === names.toSorted().join(',');
const check = (ok, code) => { if (!ok) throw Error(code); };
// This pure review never authenticates an approval or grants execution authority.
export function inspectV3ManifestFields(raw) {
  check(Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= 8192, 'D324_V3_MANIFEST_REJECTED');
  const manifest = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  check(raw.equals(Buffer.from(canonical(manifest) + '\n')) && exact(manifest, ['schema', 'target', 'identity', 'networkId',
    'deploymentId', 'operator', 'ledgerSha256', 'budget', 'artifacts', 'k5Sha256', 'sessionControlSha256', 'binaries', 'operatorRoot']) &&
    manifest.schema === 'BYETERY_D324_FINAL_ACTIVATION_V3', 'D324_V3_MANIFEST_REJECTED');
  const operator = verifyD324OperatorCommit();
  check(canonical(manifest.identity) === canonical(RUN1) && manifest.networkId === SPEC.networkId &&
    manifest.deploymentId === SPEC.deployment && canonical(manifest.operator) === canonical({ sha: operator.sha, parent: operator.parent, tree: operator.tree }) &&
    exact(manifest.target, ['sha', 'parent', 'tree']) && manifest.target.parent === COMPONENTS.server &&
    manifest.target.sha !== manifest.target.parent && /^[a-f0-9]{40}$/.test(manifest.target?.sha ?? '') &&
    /^[a-f0-9]{40}$/.test(manifest.target?.tree ?? '') && manifest.artifacts?.exportQuery === OWNER_QUERY_SHA256,
  'D324_V3_SCOPE_REJECTED');
  check(canonical(manifest.budget) === canonical({ historicalConfirmed: 5, limitWithoutContingency: 19, remaining: 14,
    runCap: 5, tx20Authorized: false }), 'D324_V3_BUDGET_REJECTED');
  check(exact(manifest.artifacts, ['wrapper','entry','captureChild','exportQuery','captureProfileSha256']) &&
    Object.values(manifest.artifacts).every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)) &&
    manifest.artifacts.captureProfileSha256 === D324_CAPTURE_PROFILE_SHA256 &&
    manifest.ledgerSha256 === 'eaffd7521b905b995dba26150190c44592822e6e052509b3d65815adde25404d' &&
    [manifest.k5Sha256,manifest.sessionControlSha256].every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)) &&
    canonical(manifest.binaries) === canonical(BOOTSTRAP_BINARIES) &&
    typeof manifest.operatorRoot === 'string' && isAbsolute(manifest.operatorRoot), 'D324_V3_BINDINGS_REJECTED');
  return Object.freeze({ sha256: hash(raw), reviewOnly: true, liveAuthority: false });
}

export async function verifyMaterializedV3Capture(root, input) {
  inspectV3ManifestFields(input.manifestBytes);
  // A dirty review checkout is never a materialized target. Future SHA/parent/tree
  // come from the independently signed external manifest, never a self-hash in code.
  const dirty = execFileSync('git', ['--no-replace-objects','status','--porcelain=v1','--untracked-files=all'],
    {cwd:root,windowsHide:true,timeout:10000}).toString();
  check(!dirty, 'D324_COMPOSITION_NOT_MATERIALIZED');
  return verifyD324CaptureProfile(root, input);
}
