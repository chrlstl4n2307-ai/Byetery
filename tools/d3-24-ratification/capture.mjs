import { lstat, mkdir, mkdtemp, open, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytes, read } from '../d3-evidence-capture/common.mjs';
import { strictJson } from '../d3-evidence-capture/owner-export.mjs';
import { verifyTx } from '../d3-evidence-capture/verifier.mjs';
import { captureDurableReceipt } from '../d3-receipt-capture/capture.mjs';
import { isReadOnlyReaders } from '../d3-receipt-capture/sources.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { corroborateSharedFacts } from '../d3-run1-launcher/f1-evidence.mjs';
import { verifyCaptureInventory } from '../d3-run1-launcher/launcher.mjs';
import { assertD324Scope, hex, readD324Ledger, RUN1, RUN_CAP } from './identity.mjs';

const root = resolve(fileURLToPath(new URL('../../.tools/d3-24-capture', import.meta.url)));
const live = 'LIVE_READONLY_SQL_AND_TESTNET_RPC';
const allowed = [live, 'OFFLINE_SYNTHETIC'];
const binding = (scope, classification, inventorySha256) => ({
  schema: 'BYETERY_D324_RECEIPT_BINDING_V1', identity: RUN1, scope, classification, inventorySha256,
  grantsExecutionAuthority: false,
});

export async function verifyFreshD324Scopes(scopes) {
  check(Array.isArray(scopes) && scopes.length > 0 && scopes.length <= RUN_CAP, 'D324_CAPTURE_SCOPE_REJECTED');
  const history = await readD324Ledger();
  const pinned = scopes.map(assertD324Scope);
  const ids = pinned.map(item => item.operationId);
  const hashes = pinned.map(item => item.transactionHash);
  check(new Set(ids).size === pinned.length && new Set(hashes).size === pinned.length &&
    !ids.includes(history.excludedPreDispatch.operationId) &&
    history.confirmed.every(row => !ids.includes(row.operationId) && !hashes.includes(row.txHash)),
  'D324_HISTORICAL_OR_DUPLICATE_RECEIPT');
  return pinned;
}

export async function captureD324Receipt(expected, readers) {
  const [scope] = await verifyFreshD324Scopes([expected]);
  check(isReadOnlyReaders(readers) && allowed.includes(readers.classification), 'D324_CAPTURE_READER_REJECTED');
  await mkdir(root, { recursive: true });
  check(await realpath(root) === root, 'D324_CAPTURE_DIRECTORY_REJECTED');
  const directory = await mkdtemp(join(root, RUN1.taskId + '-'));
  const result = await captureDurableReceipt({ expected: scope, outputDirectory: join(directory, 'receipt'), readers });
  const file = await open(join(directory, 'identity.json'), 'wx', 0o600);
  try {
    await file.writeFile(bytes(binding(scope, readers.classification, result.inventorySha256)));
    await file.sync();
  } finally {
    await file.close();
  }
  return { directory, status: result.status, grantsExecutionAuthority: false };
}

export async function verifyD324CaptureInventory(directory, expected, classification) {
  const [scope] = await verifyFreshD324Scopes([expected]);
  const path = resolve(directory);
  check(allowed.includes(classification) && dirname(path) === root && /^D3-24-RUN1-[A-Za-z0-9]+$/.test(basename(path)) &&
    await realpath(path) === path, 'D324_CAPTURE_DIRECTORY_REJECTED');
  const receiptDir = join(path, 'receipt');
  const contents = await readdir(path);
  check(contents.length === 2 && contents.includes('identity.json') && contents.includes('receipt') &&
    (await lstat(receiptDir)).isDirectory() && await realpath(receiptDir) === receiptDir, 'D324_CAPTURE_DIRECTORY_REJECTED');
  const raw = read(join(path, 'identity.json'), 4096);
  const record = strictJson(raw.toString('utf8'));
  check(hex.test(record.inventorySha256 ?? '') && raw.equals(bytes(binding(scope, classification, record.inventorySha256))),
    'D324_CAPTURE_BINDING_REJECTED');
  const result = await verifyCaptureInventory(receiptDir, scope, classification);
  check(result.inventorySha256 === record.inventorySha256, 'D324_CAPTURE_BINDING_REJECTED');
  return { ...result, classification, chainVerified: false, grantsExecutionAuthority: false };
}

export function verifyD324ChainState(expected, chain) {
  const { battery, request } = chain.meta.after;
  check(chain.meta.entries.some(entry => entry.kind === 'Battery' && entry.id === RUN1.batteryId &&
    ['ledgerEntryCreated', 'ledgerEntryUpdated'].includes(entry.change)) &&
    chain.meta.entries.filter(entry => entry.kind === 'Battery').every(entry => entry.id === RUN1.batteryId) &&
    battery?.state === expected.domainState && battery?.rewardState === expected.rewardState &&
    battery.requestId === (expected.requestId ?? null) &&
    (!request || request.batteryId === RUN1.batteryId && request.recipient === RUN1.recipient) &&
    (expected.method !== 'pay_reward' || chain.meta.returnNative?.recipient === RUN1.recipient),
  'D324_CHAIN_STATE_REJECTED');
}

export async function verifyD324CapturedTransaction(directory, expected, api, observations) {
  const scope = assertD324Scope(expected);
  const proof = await verifyD324CaptureInventory(directory, scope, live);
  check(proof.status === 'DURABLE_RECEIPT_CONVERGED_NORMALIZED' && proof.receipt &&
    (scope.method === 'register_battery' ? api.requestId === null : hex.test(api.requestId ?? '')),
  'D324_CAPTURE_UNCONFIRMED');
  const chain = verifyTx({
    network: observations.network, horizon: observations.horizon, horizonLedger: observations.horizonLedger,
    rpcLedger: observations.rpcLedger, provenance: observations.provenance, rpc: proof.receipt.rpc,
    expected: { hash: scope.transactionHash, batteryId: RUN1.batteryId, method: scope.method,
      requestId: api.requestId, recipient: RUN1.recipient },
  });
  verifyD324ChainState({ method: scope.method, domainState: api.confirmedBatteryState,
    rewardState: api.confirmedRewardState, requestId: api.requestId }, chain);
  corroborateSharedFacts(scope, api, proof.receipt.sql, chain);
  return { inventorySha256: proof.inventorySha256, chainVerified: true, grantsExecutionAuthority: false };
}
