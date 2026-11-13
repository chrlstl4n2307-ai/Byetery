import { canonical } from '../d3-evidence-capture/common.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';
import { resolveD324Operator } from '../d3-24-operational/operator-binding.mjs';
import { sessionIdentityDigest } from './session-control.mjs';
import { pathToFileURL } from 'node:url';

const check = (ok, code) => { if (!ok) throw Error(code); };
const expectedScope = Object.freeze({ taskId: RUN1.taskId, operatorSha: RUN1.businessSha, planHash: RUN1.planHash,
  batteryId: RUN1.batteryId, recipient: RUN1.recipient });

// Called by a trusted local composition controller. No credentials/receipts are
// read from env/files, no server endpoint is created, and no LIVE entry is enabled.
export async function prepareCompositionSessions({ root, operatorRoot, apiOrigin, publishableKey,
  credentials, fetcher, control }) {
  const pin = await resolveD324Operator(root, operatorRoot);
  const { prepareLocalRoleSessions } = await import(pathToFileURL(pin.path).href);
  let receipt, readHeaders, prepared;
  function describe(sessions) {
    const headers = {}, claims = [];
    for (const [role, session] of sessions) {
      const bearer = session.bearer();
      const c = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString());
      headers[role] = 'Bearer ' + bearer;
      claims.push({ role, authUserId: c.sub, sessionId: c.session_id, tokenExpiresAt: c.exp * 1000 });
    }
    return { headers, claims };
  }
  try {
    prepared = await prepareLocalRoleSessions({ apiOrigin, publishableKey, credentials, fetcher,
      verify: async sessions => {
        const { headers, claims } = describe(sessions);
        // Decoding is a consistency check. The server validates each exact bearer.
        receipt = await control.prepare(headers);
        check(receipt?.businessAuthority === false && receipt.taskId === RUN1.taskId && receipt.operatorSha === RUN1.businessSha &&
          receipt.planHash === RUN1.planHash && receipt.identityDigest === sessionIdentityDigest(claims) &&
          Number.isSafeInteger(receipt.effectiveNotAfter) && receipt.effectiveNotAfter > Date.now(), 'D324_SESSION_BINDING_REJECTED');
        if (control.admitRevalidated) {
          check(new Set(claims.map(claim => claim.authUserId)).size === 4 &&
            receipt.effectiveNotAfter <= Math.min(...claims.map(claim => claim.tokenExpiresAt)) - 120_000,
          'D324_SESSION_BINDING_REJECTED');
          readHeaders = () => describe(sessions).headers;
        }
      } });
  } catch (error) {
    if (receipt?.id) await control.discard?.(receipt.id);
    throw error;
  }
  let attempted = false, acknowledgement, closed = false;
  let closePromise;
  return Object.freeze({
    summary: Object.freeze({ ...receipt, businessAuthority: false }),
    async admit(signedInput) {
      check(!attempted && !closed && Date.now() < receipt.effectiveNotAfter, 'D324_SESSION_ADMISSION_CONSUMED');
      attempted = true;
      const ack = readHeaders
        ? await control.admitRevalidated(receipt.id, readHeaders(), signedInput)
        : await control.admit(receipt.id, signedInput);
      check(ack?.identityDigest === receipt.identityDigest && ack.taskId === RUN1.taskId &&
        ack.operatorSha === RUN1.businessSha && ack.planHash === RUN1.planHash, 'D324_SESSION_BINDING_REJECTED');
      await control.checkAdmission(ack);
      acknowledgement = ack;
      return Object.freeze({ admissionId: ack.admissionId, identityDigest: ack.identityDigest });
    },
    operatorBindings(proofFor) {
      check(!closed && acknowledgement && typeof proofFor === 'function', 'D324_ADMISSION_REQUIRED');
      return Object.freeze({ preparedSessions: prepared, d324Proofs: Object.freeze({
        async assertAdmission(scope) {
          check(!closed && canonical(scope) === canonical(expectedScope), 'D324_ADMISSION_IDENTITY_REJECTED');
          await control.checkAdmission(acknowledgement);
        },
        async proofFor(input) {
          check(!closed, 'D324_SESSION_CLOSED');
          await control.checkAdmission(acknowledgement);
          return proofFor(input, acknowledgement);
        },
      }) });
    },
    close() {
      closed = true;
      readHeaders = undefined;
      return closePromise ??= (async () => {
        try { await control.discard?.(receipt.id); }
        finally { await prepared.close(); }
      })();
    },
  });
}
