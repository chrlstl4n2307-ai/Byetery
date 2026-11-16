import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { Coordinator } from '../../backend/src/application/coordinator.ts';
import { D324Authority } from '../../backend/src/application/d324-authority.ts';
import { D324 } from '../../backend/src/application/d324-scope.ts';
import { deferredSigning } from '../../backend/src/application/deferred-signing.ts';
import { api } from '../../backend/src/application/http.ts';
import { RpcHistoryReader } from '../../backend/src/history/verify.ts';
import { TestnetRpc } from '../../backend/src/testnet/rpc.ts';
import { TestnetStellarService } from '../../backend/src/testnet/service.ts';
import { SIGNER } from '../d3-24-composition/pins.mjs';
import { createD324BridgeSessionControl } from '../d3-24-composition/session-control.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { serveD324PrivateSessions } from './private-session-channel.mjs';

async function verifyHelper(binary) {
  check(isAbsolute(binary) && await realpath(binary) === binary, 'D324_SIGNER_PIN_REJECTED');
  const info = await lstat(binary);
  check(info.isFile() && info.size === SIGNER.bytes, 'D324_SIGNER_PIN_REJECTED');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(binary)) digest.update(chunk);
  check(digest.digest('hex') === SIGNER.binarySha256, 'D324_SIGNER_PIN_REJECTED');
}

// Construction does not listen, start a scheduler, connect to SQL or load keys.
// This adapter is not reachable from either published CLI while on HOLD.
export function bindD324ServerWorker({ repo, workerRepo, auth, authority, admissionInput, signerBinary, fetcher }) {
  const apiPool = repo.pool.options, workerPool = workerRepo.pool.options;
  check(authority instanceof D324Authority && repo.pool !== workerRepo.pool &&
    [repo, workerRepo].every(r => r.mode === 'TESTNET' && r.deploymentId === D324.deploymentId) &&
    ['host','port','database'].every(field => apiPool[field] === workerPool[field]) &&
    typeof apiPool.user === 'string' && typeof workerPool.user === 'string' && apiPool.user !== workerPool.user &&
    typeof admissionInput === 'function' && typeof fetcher === 'function' &&
    typeof signerBinary === 'string' && isAbsolute(signerBinary), 'D324_CONTROL_SCOPE_REJECTED');
  const signer = deferredSigning(async () => {
    check(SIGNER.custodyRiskAccepted === true, 'D324_CUSTODY_RATIFICATION_REQUIRED');
    // Verify before entering the signing phase. The approved helper must be
    // non-replaceable by the service identity throughout the window.
    await verifyHelper(signerBinary);
    const { LocalSecureStoreSigner, signerProcess } = await import('../../backend/src/local-secure-store-signer.ts');
    return new LocalSecureStoreSigner(signerProcess(signerBinary));
  });
  const service = new TestnetStellarService(workerRepo, new TestnetRpc(fetcher), signer, undefined, authority.instanceId);
  const coordinator = new Coordinator(repo, {}, undefined, service, authority, true);
  const control = createD324BridgeSessionControl({ repo, auth, authority, challenge: authority.challenge });
  return Object.freeze({
    http: api(auth, coordinator, new RpcHistoryReader(fetcher)),
    supervisor: coordinator.supervisor,
    reconcile: () => coordinator.reconcile('periodic'),
    attachSessions: () => serveD324PrivateSessions(control, admissionInput),
  });
}
