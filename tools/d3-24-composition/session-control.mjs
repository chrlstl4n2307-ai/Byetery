import { randomUUID } from 'node:crypto';
import { prepareD324Sessions } from '../../backend/src/application/d324-sessions.ts';
import { D324 } from '../../backend/src/application/d324-scope.ts';
import { canonical, hash } from '../d3-evidence-capture/common.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';

const check = (ok, code) => { if (!ok) throw Error(code); };
const roles = ['ADMIN', 'COLLECTOR', 'RECYCLER', 'USER'];
export function sessionIdentityDigest(identities) {
  check(Array.isArray(identities) && identities.length === 4 &&
    identities.map(i => i.role).toSorted().join(',') === roles.join(','), 'D324_SESSION_SET_REJECTED');
  const normalized = identities.map(i => ({ role: i.role, authUserId: i.authUserId, sessionId: i.sessionId,
    tokenExpiresAt: i.tokenExpiresAt })).sort((a, b) => a.role.localeCompare(b.role));
  check(normalized.every(i => /^[a-f0-9-]{36}$/.test(i.authUserId) && /^[a-f0-9-]{36}$/.test(i.sessionId) &&
    Number.isSafeInteger(i.tokenExpiresAt)), 'D324_SESSION_SET_REJECTED');
  return hash(Buffer.from(canonical(normalized)));
}

// Internal server-side control object, NOT an HTTP endpoint or browser capability.
// Across processes only random routing IDs/summary digests travel; core receipts
// remain private. A routing ID alone never replaces runner/owner admission proofs.
export function createD324SessionControl({ repo, auth, authority, challenge }) {
  check(repo.mode === 'TESTNET' && repo.deploymentId === D324.deploymentId, 'D324_CONTROL_SCOPE_REJECTED');
  const receipts = new Map();
  return Object.freeze({
    async prepare(headers) {
      const core = await prepareD324Sessions(repo, auth, headers, authority.instanceId, challenge);
      const id = randomUUID(), identityDigest = sessionIdentityDigest(core.sessions);
      receipts.set(id, { core, identityDigest });
      return Object.freeze({ id, identityDigest, effectiveNotAfter: core.effectiveNotAfter, taskId: RUN1.taskId,
        operatorSha: RUN1.businessSha, planHash: RUN1.planHash, businessAuthority: false });
    },
    async admit(id, input) {
      const item = receipts.get(id);
      check(item, 'D324_SESSION_HANDLE_REJECTED');
      receipts.delete(id); // one attempt, including rejected/uncertain outcomes
      const admissionId = await authority.admit(repo, input, item.core);
      return Object.freeze({ admissionId, identityDigest: item.identityDigest, taskId: RUN1.taskId,
        operatorSha: RUN1.businessSha, planHash: RUN1.planHash });
    },
    async checkAdmission(ack) {
      check(ack?.taskId === RUN1.taskId && ack.operatorSha === RUN1.businessSha && ack.planHash === RUN1.planHash,
        'D324_ADMISSION_IDENTITY_REJECTED');
      check(typeof ack.admissionId === 'string' && /^[a-f0-9-]{36}$/.test(ack.admissionId) &&
        typeof ack.identityDigest === 'string' && /^[a-f0-9]{64}$/.test(ack.identityDigest), 'D324_ADMISSION_IDENTITY_REJECTED');
      return repo.transaction(async db => {
        const { rows } = await db.query(`select id,sessions from api_private.d324_admission
          where id=$1 and deployment_id=$2 and battery_id=$3 and instance_id=decode($4,'hex')
          and revoked_at is null and expires_at>clock_timestamp()`,
        [ack.admissionId, D324.deploymentId, D324.batteryId, authority.instanceId]);
        check(rows.length === 1 && sessionIdentityDigest(rows[0].sessions) === ack.identityDigest, 'D324_ADMISSION_IDENTITY_REJECTED');
      });
    },
    close() { receipts.clear(); },
  });
}
