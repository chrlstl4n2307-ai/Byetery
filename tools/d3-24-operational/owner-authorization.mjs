import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { bytes, hash, read, SPEC } from '../d3-evidence-capture/common.mjs';
import { strictJson } from '../d3-evidence-capture/owner-export.mjs';
import { verifyDetachedEd25519 } from '../d3-24-activation/ed25519.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { canonicalGrant, exactRecord } from '../d3-run1-launcher/grant-schema.mjs';
import { OWNER_GRANT_PUBLIC_KEY, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT } from '../d3-run1-launcher/owner-grant-key.mjs';
import { encodeD324SessionControl, verifyD324SessionPins } from '../d3-run1-launcher/session-pins.mjs';
import { BOOTSTRAP_BINARIES } from './bootstrap-pins.mjs';
import { liveDeadline, verifyD324GrantScope, verifyD324K5 } from './policy.mjs';
import { D324_TIME } from '../../backend/src/application/d324-authority.ts';
import { observeV3Checkout } from './entry-bootstrap.mjs';

const asciiSignature = /^[A-Za-z0-9_-]{86}\n$/;
const utf8 = raw => new TextDecoder('utf-8', { fatal: true }).decode(raw);
const signedByOwner = (message, signature) => verifyDetachedEd25519(message, signature,
  OWNER_GRANT_PUBLIC_KEY, OWNER_GRANT_PUBLIC_KEY_FINGERPRINT);

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

const hex = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const roles = ['ADMIN','USER','COLLECTOR','RECYCLER'];
const wire = (domain, data) => Buffer.concat([Buffer.from(domain + '\n'), bytes(data)]);

// Check the exact documents the durable server consumes. This observation
// confers no admission: the server revalidates Auth, SQL and the runner proof.
export function checkV3ExecutionDocuments(input, manifest, now) {
  const grantBytes = verifyD324GrantScope(input.grant, manifest.target.sha, now);
  const { execution, live, grant } = input;
  check(exactRecord(execution, ['schema', ...Object.keys(RUN1), 'deploymentId', 'networkId', 'compositionSha',
    'instanceId', 'challenge', 'runnerPublicKey', 'issuedAt', 'executionNotAfter', 'sessions']) &&
    execution.schema === 'BYETERY_D324_EXECUTION_V1' && Object.entries(RUN1).every(([k,v]) => execution[k] === v) &&
    execution.deploymentId === SPEC.deployment && execution.networkId === SPEC.networkId &&
    execution.compositionSha === manifest.target.sha && [execution.instanceId, execution.challenge, execution.runnerPublicKey].every(v => typeof v === 'string' && hex.test(v)) &&
    Number.isSafeInteger(execution.issuedAt) && Number.isSafeInteger(execution.executionNotAfter) &&
    grant.issuedAt <= execution.issuedAt && execution.issuedAt <= now && now < execution.executionNotAfter &&
    execution.executionNotAfter - execution.issuedAt <= D324_TIME.executionMs &&
    Array.isArray(execution.sessions) && execution.sessions.length === roles.length &&
    execution.sessions.every((s,i) => exactRecord(s, ['role','authUserId','sessionId','tokenExpiresAt']) && s.role === roles[i] &&
      typeof s.authUserId === 'string' && uuid.test(s.authUserId) && typeof s.sessionId === 'string' && uuid.test(s.sessionId) &&
      Number.isSafeInteger(s.tokenExpiresAt) && execution.executionNotAfter <= s.tokenExpiresAt - D324_TIME.sessionMarginMs) &&
    new Set(execution.sessions.map(s => s.sessionId)).size === roles.length &&
    new Set(execution.sessions.map(s => s.authUserId)).size === roles.length, 'D324_V3_EXECUTION_REJECTED');
  const executionBytes = wire('BYETERY-D324-EXECUTION-V1', execution);
  check(exactRecord(live, ['schema','taskId','runId','deploymentId','manifestSha256','grantSha256','executionSha256',
    'instanceId','challenge','runnerPublicKey','issuedAt','expiresAt']) &&
    live.schema === 'BYETERY_D324_ONE_LIVE_APPROVAL_V3' && live.taskId === RUN1.taskId && live.runId === RUN1.runId &&
    live.deploymentId === SPEC.deployment && live.manifestSha256 === hash(bytes(manifest)) &&
    live.grantSha256 === hash(grantBytes) && live.executionSha256 === hash(executionBytes) &&
    ['instanceId','challenge','runnerPublicKey'].every(k => live[k] === execution[k]) &&
    Number.isSafeInteger(live.issuedAt) && Number.isSafeInteger(live.expiresAt) &&
    execution.issuedAt <= live.issuedAt && live.issuedAt <= now && now < live.expiresAt && live.expiresAt <= liveDeadline(grant),
  'D324_V3_LIVE_REJECTED');
  return { grantBytes, executionBytes, liveBytes: wire('BYETERY-D324-ONE-LIVE-APPROVAL-V3', live) };
}

export function verifyV3ExecutionDocuments(input, manifest, now = Date.now()) {
  const { grantBytes, executionBytes, liveBytes } = checkV3ExecutionDocuments(input, manifest, now);
  signedByOwner(grantBytes, input.grantSignature);
  signedByOwner(executionBytes, input.executionSignature);
  signedByOwner(liveBytes, input.liveSignature);
  return Object.freeze({ reviewOnly: true, liveAuthority: false });
}

export async function verifyV3OwnerPackage(directory, root) {
  const readFile = (name, size) => read(join(directory, name), size);
  const raw = readFile('activation-manifest.json', 8192);
  const signature = utf8(readFile('manifest-approval.sig', 87));
  check(asciiSignature.test(signature), 'D324_MANIFEST_APPROVAL_REJECTED');
  const manifestSha = hash(raw);
  signedByOwner(Buffer.from('BYETERY-D324-MANIFEST-APPROVAL-V3\n' + manifestSha + '\n'), signature.slice(0, -1));
  const { inspectV3BootstrapManifest } = await import('../d3-24-composition/manifest-v3.mjs');
  inspectV3BootstrapManifest(raw);
  const manifest = strictJson(utf8(raw));
  observeV3Checkout(root, manifest.target);
  const { verifyD324CaptureProfile } = await import('../d3-24-capture-profile/profile.mjs');
  await verifyD324CaptureProfile(root, {taskId: RUN1.taskId, manifestBytes: raw, manifestApproval: signature.slice(0, -1)});
  const { resolveD324Operator } = await import('./operator-binding.mjs');
  await resolveD324Operator(root, manifest.operatorRoot);
  await verifyBoundSession({root,head:manifest.target.sha,path:join(directory,'session-control.json'),
    expectedHash:manifest.sessionControlSha256});
  verifyD324K5(readFile('K5-UNSIGNED-TEMPLATE.txt',8192),manifest.k5Sha256,manifest.target.sha);
  const input = strictJson(utf8(readFile('execution-approval.json',8192)));
  check(exactRecord(input, ['grant','grantSignature','execution','executionSignature','live','liveSignature']), 'D324_V3_EXECUTION_REJECTED');
  return verifyV3ExecutionDocuments(input,manifest);
}
