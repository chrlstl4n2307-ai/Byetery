import { realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { bytes, hash, read } from '../d3-evidence-capture/common.mjs';
import { strictJson } from '../d3-evidence-capture/owner-export.mjs';
import { verifyD324ActivationManifest, observeD324Checkout } from '../d3-24-activation/manifest.mjs';
import { verifyDetachedEd25519 } from '../d3-24-activation/ed25519.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { canonicalGrant, exactRecord } from '../d3-run1-launcher/grant-schema.mjs';
import { OWNER_GRANT_PUBLIC_KEY, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT } from '../d3-run1-launcher/owner-grant-key.mjs';
import { encodeD324SessionControl, verifyD324SessionPins } from '../d3-run1-launcher/session-pins.mjs';
import { BOOTSTRAP_BINARIES } from './bootstrap-pins.mjs';
import { verifyD324OwnerEnvelope, liveDeadline } from './policy.mjs';
import { resolveD324Operator } from './operator-binding.mjs';

const asciiSignature = /^[A-Za-z0-9_-]{86}\n$/;
const utf8 = raw => new TextDecoder('utf-8', { fatal: true }).decode(raw);
const authorizations = new WeakSet();
const signedByOwner = (message, signature) => verifyDetachedEd25519(message, signature,
  OWNER_GRANT_PUBLIC_KEY, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT);
export const isD324OwnerAuthorization = value => authorizations.has(value);

export function verifyManifestApproval(raw, detached) {
  const signature = utf8(detached);
  check(asciiSignature.test(signature), 'D324_MANIFEST_APPROVAL_REJECTED');
  const digest = hash(raw);
  signedByOwner(Buffer.from('BYETERY-D324-MANIFEST-APPROVAL-V2\n' + digest + '\n'), signature.slice(0, -1));
  return digest;
}

export function checkLaunchScope(approval, manifestSha256, grant, at) {
  check(exactRecord(approval, ['schema', 'taskId', 'manifestSha256', 'grantSha256', 'api', 'issuedAt', 'expiresAt']) &&
    approval.schema === 'BYETERY_D324_ONE_LIVE_APPROVAL_V1' && approval.taskId === RUN1.taskId &&
    approval.manifestSha256 === manifestSha256 && approval.grantSha256 === hash(canonicalGrant(grant)) &&
    Number.isSafeInteger(approval.issuedAt) && Number.isSafeInteger(approval.expiresAt) &&
    approval.issuedAt >= grant.issuedAt && approval.issuedAt <= at && at < approval.expiresAt &&
    approval.expiresAt <= liveDeadline(grant), 'D324_LIVE_APPROVAL_SCOPE_REJECTED');
  const api = approval.api;
  check(exactRecord(api, ['origin', 'pid', 'startedAt']) && typeof api.origin === 'string' &&
    /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(api.origin) && Number(new URL(api.origin).port) > 0 &&
    Number.isSafeInteger(api.pid) && api.pid > 0 && typeof api.startedAt === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(api.startedAt) &&
    Number.isFinite(Date.parse(api.startedAt)) && Date.parse(api.startedAt) <= approval.issuedAt, 'D324_API_APPROVAL_REJECTED');
  return Buffer.concat([Buffer.from('BYETERY-D324-ONE-LIVE-APPROVAL-V1\n'), bytes(approval)]);
}

export async function verifyBoundSession({ root, head, path, expectedHash }) {
  const sessionBytes = read(path, 8192);
  const session = strictJson(utf8(sessionBytes));
  check(sessionBytes.equals(encodeD324SessionControl(session)) && hash(sessionBytes) === expectedHash &&
    session.node.sha256 === BOOTSTRAP_BINARIES.nodeSha256 &&
    session.pwsh.sha256 === BOOTSTRAP_BINARIES.pwshSha256, 'D324_SESSION_BOOTSTRAP_PIN_REJECTED');
  await verifyD324SessionPins({ BYETERY_D324_SESSION_CONTROL_PATH: path,
    BYETERY_D324_SESSION_CONTROL_SHA256: expectedHash }, { root, head });
  return session;
}

// No digest, public key, path to the operator, or approval is supplied by argv.
export async function loadD324OwnerAuthorization(root) {
  const local = process.env.LOCALAPPDATA;
  check(typeof local === 'string' && isAbsolute(local) && await realpath(local) === local, 'D324_OWNER_CUSTODY_REJECTED');
  const directory = join(local, 'OwnerKeyCustody', 'Byetery-D3-RUN1', 'live', RUN1.taskId);
  check(await realpath(directory) === directory, 'D324_OWNER_CUSTODY_REJECTED');
  const file = (name, max) => read(join(directory, name), max);
  const raw = file('activation-manifest.json', 8192);
  const manifestSha = verifyManifestApproval(raw, file('manifest-approval.sig', 87));
  const manifest = strictJson(utf8(raw));
  const operator = await resolveD324Operator(root, manifest.operatorRoot);
  const observed = await observeD324Checkout(root, operator.root);
  const proof = await verifyD324ActivationManifest(raw, manifestSha, { ...observed, operatorRoot: operator.root });
  const session = await verifyBoundSession({ root, head: proof.sha, path: join(directory, 'session-control.json'),
    expectedHash: proof.sessionControlSha256 });
  const envelope = strictJson(utf8(file('owner-grant.json', 4096)));
  const verified = verifyD324OwnerEnvelope(envelope, { compositionSha: proof.sha,
    k5Bytes: file('K5-UNSIGNED-TEMPLATE.txt', 8192), k5Sha256: proof.k5Sha256, now: Date.now() });
  const permit = strictJson(utf8(file('live-approval.json', 4096)));
  check(exactRecord(permit, ['approval', 'signature']), 'D324_LIVE_APPROVAL_REQUIRED');
  const signedBytes = checkLaunchScope(permit.approval, manifestSha, verified.grant, Date.now());
  signedByOwner(signedBytes, permit.signature);
  const result = Object.freeze({ manifestSha, sha: proof.sha, operator, ...verified,
    api: Object.freeze({ ...permit.approval.api }), nodePath: session.node.path, sessionControlSha256: proof.sessionControlSha256, approvalExpiresAt: permit.approval.expiresAt,
    continuity: hash(Buffer.concat([Buffer.from(manifestSha), canonicalGrant(verified.grant), signedBytes])) });
  authorizations.add(result);
  return result;
}
