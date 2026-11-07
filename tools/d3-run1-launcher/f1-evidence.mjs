import { fork } from 'node:child_process';
import { mkdir, mkdtemp, open, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SPEC } from '../d3-evidence-capture/common.mjs';
import { PublicReads } from '../d3-evidence-capture/network.mjs';
import { verifyTx } from '../d3-evidence-capture/verifier.mjs';
import { createReadOnlyReaders } from '../d3-receipt-capture/sources.mjs';
import { MAX_RECAPTURE_ATTEMPTS_AFTER_INITIAL_CAPTURE, RUN1, requireThat } from './boundaries.mjs';

const captureRoot = fileURLToPath(new URL('../../.tools/d3-run1-f1-capture', import.meta.url));
const childModule = fileURLToPath(new URL('./f1-capture-child.mjs', import.meta.url));

export function bindLiveEvidence(pool, timeoutMs) {
  const sql = createReadOnlyReaders(pool);
  let directory;
  async function preserve(scope, evidence) {
    if (!directory) {
      await mkdir(captureRoot, { recursive: true });
      requireThat(await realpath(captureRoot) === captureRoot, 'CAPTURE_ROOT_REJECTED');
      directory = await mkdtemp(join(captureRoot, 'capture-'));
    }
    const file = await open(join(directory, scope.method + '-identity.json'), 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify({ scope, requestId: evidence.requestId, confirmedAt: evidence.confirmedAt,
        ...(evidence.payload ? { payload: { manifestBase64: evidence.payload.manifestBase64,
          payloadHash: evidence.payload.payloadHash } } : {}) }) + '\n');
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async function capture(scope, attempt) {
    requireThat(directory && scope.batteryId === RUN1.batteryId && Number.isInteger(attempt) &&
      attempt >= 1 && attempt <= 1 + MAX_RECAPTURE_ATTEMPTS_AFTER_INITIAL_CAPTURE, 'CAPTURE_SCOPE_REJECTED');
    const output = join(directory, scope.method + '-' + attempt);
    const child = fork(childModule, [basename(directory), String(attempt), JSON.stringify(scope)],
      { env: {}, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); child.kill(); }, timeoutMs);
    let reads = 0;
    child.on('message', async message => {
      if (message?.kind !== 'READ_RECEIPT' || message.id !== ++reads || reads > 3) {
        child.kill();
        return;
      }
      let receipt;
      try {
        receipt = (await sql.readSql(scope, AbortSignal.any([controller.signal, AbortSignal.timeout(3_000)]))).rawUtf8;
      } catch { /* The child receives only a read failure. */ }
      if (child.connected) child.send({ id: message.id, receipt }, () => {});
    });
    try {
      const exit = await new Promise(resolve => {
        child.once('error', () => resolve(1));
        child.once('exit', resolve);
      });
      return { output, unavailable: exit !== 0 };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return Object.freeze({ preserve, capture });
}

export function corroborateSharedFacts(scope, api, sql, chain) {
  const battery = chain.meta.after.battery;
  const request = chain.meta.after.request;
  requireThat(api.operationId === scope.operationId && api.transactionHash === scope.transactionHash &&
    api.confirmationLedger === scope.ledger && api.operation === scope.method && api.batteryId === scope.batteryId &&
    sql.operationId === scope.operationId && sql.transactionHash === scope.transactionHash &&
    sql.receiptTransactionHash === scope.transactionHash && sql.batteryId === scope.batteryId &&
    sql.ledger === scope.ledger && sql.method === scope.method && sql.status === 'SUCCESS' &&
    sql.applicationState === 'CONFIRMED' && sql.durableState === 'PROJECTED' &&
    chain.verification.TX_IDENTITY_VERIFIED === 'PASS' && chain.verification.ledger === scope.ledger &&
    battery?.state === api.confirmedBatteryState && battery.rewardState === api.confirmedRewardState &&
    battery.requestId === api.requestId, 'CAPTURE_CORROBORATION_REJECTED');
  if (request) requireThat(request.batteryId === scope.batteryId && request.recipient === RUN1.recipient,
    'CAPTURE_REQUEST_RECIPIENT_REJECTED');
  if (scope.method === 'pay_reward') requireThat(chain.meta.returnNative.recipient === RUN1.recipient,
    'CAPTURE_REWARD_RECIPIENT_REJECTED');
  return true;
}

export async function verifyLiveCorroboration(scope, api, proof) {
  const { sql, rpc } = proof.receipt;
  const reads = new PublicReads();
  const [network, horizon, ledger] = await Promise.all([
    reads.rpc('getNetwork'), reads.horizon('/transactions/' + scope.transactionHash),
    reads.horizon('/ledgers/' + scope.ledger),
  ]);
  const chain = verifyTx({ network: { passphrase: network.value.passphrase, networkId: SPEC.networkId },
    rpc, horizon: horizon.value, horizonLedger: ledger.value,
    expected: { hash: scope.transactionHash, batteryId: scope.batteryId, method: scope.method,
      requestId: api.requestId, recipient: RUN1.recipient },
    provenance: horizon.provenance });
  return corroborateSharedFacts(scope, api, sql, chain);
}