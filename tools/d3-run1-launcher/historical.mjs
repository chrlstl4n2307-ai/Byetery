import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { verifyPortable } from '../d3-evidence-capture/capture.mjs';
import { PublicReads } from '../d3-evidence-capture/network.mjs';
import { verifyTx } from '../d3-evidence-capture/verifier.mjs';
import { captureDurableReceipt } from '../d3-receipt-capture/capture.mjs';
import { createReadOnlyReaders, createReplayReaders } from '../d3-receipt-capture/sources.mjs';
import { RUN1, requireThat } from './boundaries.mjs';
import { verifyCaptureInventory } from './launcher.mjs';

const HISTORICAL = Object.freeze({
  operationId: '2201faa3-980a-4250-8578-ec024272a022',
  transactionHash: 'fb159fc9e1646f257414f30034220876f14033ce7b92109102cc9ca530da68c1',
  ledger: 5599273,
  batteryId: 'BYE-D3-R1-20261106-9470F35DF6B1',
  method: 'register_battery',
});
const DEPLOYMENT = '5c0cad2f-5f25-4216-8068-6cb9d2d26325';
const TESTNET_ID = 'cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472';
const ARCHIVE = 'a926783d15bb509410ba00f8466ffc281e4104ace43d65bfed9e35e6695c83eb';
const RECEIPT_ARCHIVE_SHA = '8a3ad005a840d82779f9dd5e5e03a3fe5e38430398f3fedfefad27830072af2b';
const API_JOURNAL_SHA = 'd0398192c9742589f0f8e4606998030c216891f659668e531088e969f08540f9';
const ACK_SHA = '30aab1173d18a0034984a0ee427ef8e0fb2b74bdd84d7cc4c166e71e6f62be5d';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const parse = (file) => readFile(file).then((bytes) => JSON.parse(bytes));

const PROJECTION = `SELECT state, reward_state AS reward,
  encode(request_id, 'hex') AS request_id, confirmed_ledger AS ledger,
  encode(registration_hash, 'hex') AS registration_hash
FROM chain_private.batteries WHERE deployment_id = $1::uuid AND battery_id = $2`;
const QUIESCENCE = `SELECT
  (SELECT count(*)::int FROM api_private.testnet_source_leases
   WHERE network_id = decode($1, 'hex') AND lease_until > clock_timestamp()) AS leases,
  (SELECT count(*)::int FROM api_private.testnet_work
   WHERE deployment_id = $2::uuid AND state IN
   ('DISPATCH_INTENT','SUBMITTED_OR_UNKNOWN','EXPIRED_UNRESOLVED')) AS pending_dispatches,
  (SELECT count(*)::int FROM app_private.stellar_operations
   WHERE deployment_id = $2::uuid AND battery_id = $3) AS run1_operations`;

async function readProjection(pool) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN TRANSACTION READ ONLY');
    const setting = (await db.query("SELECT current_setting('transaction_read_only') AS value")).rows;
    requireThat(setting.length === 1 && setting[0].value === 'on', 'READ_ONLY_REQUIRED');
    const projected = (await db.query({
      text: PROJECTION, values: [DEPLOYMENT, HISTORICAL.batteryId], query_timeout: 4000,
    })).rows;
    const controls = (await db.query({
      text: QUIESCENCE, values: [TESTNET_ID, DEPLOYMENT, RUN1.batteryId], query_timeout: 4000,
    })).rows;
    requireThat(projected.length === 1 && controls.length === 1, 'SQL_PROJECTION_UNAVAILABLE');
    return { projected: projected[0], controls: controls[0] };
  } finally {
    try {
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  }
}

async function saveRaw(directory, name, bytes) {
  const file = await open(join(directory, name), 'wx', 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
}

async function loadArchive(bundle, apiAdmission) {
  const verified = verifyPortable(bundle);
  requireThat(verified.BUNDLE_SHA256 === ARCHIVE, 'HISTORICAL_BUNDLE_IDENTITY_REJECTED');
  const step = join(bundle, '01-register_battery');
  const rpc = await parse(join(step, 'rpc-transaction.json'));
  const archiveTx = await parse(join(step, 'transaction.json'));
  const rpcLedger = await parse(join(step, 'rpc-ledger.json'));
  const snapshots = await parse(join(step, 'ledger-entries.json'));
  requireThat(archiveTx.expected.hash === HISTORICAL.transactionHash && rpc.txHash === HISTORICAL.transactionHash &&
    rpc.ledger === HISTORICAL.ledger && rpc.status === 'SUCCESS' && Array.isArray(snapshots) &&
    snapshots.length > 0, 'HISTORICAL_ARCHIVE_SCOPE_REJECTED');
  const ackRaw = await readFile(apiAdmission);
  requireThat(sha(ackRaw) === ACK_SHA, 'API_ADMISSION_ARCHIVE_REJECTED');
  const ack = JSON.parse(ackRaw);
  requireThat(ack.source === 'TESTNET' && ack.httpStatus === 202 && ack.operationId === HISTORICAL.operationId &&
    ack.command === HISTORICAL.method && ack.transactionHash === null, 'API_ADMISSION_CORRELATION_REJECTED');

  const observedAt = verified.inventory.artifacts.find(
    (artifact) => artifact.path === '01-register_battery/rpc-transaction.json').observedAt;
  return { step, rpc, archiveTx, rpcLedger, snapshots, ack, observedAt };
}

function verifyArchivedTransaction(archive, horizon, horizonLedger) {
  const { archiveTx, rpc, rpcLedger, observedAt } = archive;
  return verifyTx({
    network: { passphrase: archiveTx.networkPassphrase, networkId: archiveTx.networkId },
    expected: { hash: HISTORICAL.transactionHash, method: HISTORICAL.method, batteryId: HISTORICAL.batteryId },
    rpc, rpcLedger, horizon, horizonLedger,
    provenance: { source: 'LOCAL_HISTORICAL', observedAt },
  });
}

function verifySqlReceipt(sql, ack) {
  const row = JSON.parse(sql.rawUtf8);
  requireThat(row.operationId === ack.operationId && row.method === ack.command &&
    row.applicationState === 'CONFIRMED' && row.durableState === 'PROJECTED' &&
    row.transactionHash === HISTORICAL.transactionHash && row.ledger === HISTORICAL.ledger,
  'HISTORICAL_SQL_CORRELATION_REJECTED');
}

// The preserved journal has the same hash as the sealed historical operator
// control. Its confirmation and state rows were emitted after separate API
// GET checks in the frozen operator. It contains projections of those
// responses, without their raw bodies or authorization headers.
export async function verifyHistoricalApiJournal(apiJournal, { state, rewardState }) {
  const bytes = await readFile(apiJournal);
  requireThat(sha(bytes) === API_JOURNAL_SHA, 'API_JOURNAL_IDENTITY_REJECTED');
  const rows = bytes.toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
  const matches = (row) => row.taskId === 'D3-16-RUN1' && row.gitSha === RUN1.businessSha &&
    row.runId === 'RUN1' && row.batteryId === HISTORICAL.batteryId &&
    row.operation === HISTORICAL.method && row.phase === 'RESULT' &&
    row.transactionHash === HISTORICAL.transactionHash;
  const confirmation = rows.findIndex((row) => matches(row) &&
    row.operationId === HISTORICAL.operationId && row.reconciliation === 'CONFIRMED' &&
    row.confirmationMode === 'OBSERVED');
  const view = rows.findIndex((row) => matches(row) &&
    row.domainState === state && row.rewardState === rewardState && row.confirmationMode === 'OBSERVED');
  requireThat(confirmation >= 0 && view > confirmation, 'API_JOURNAL_CORRELATION_REJECTED');
  return Object.freeze({
    apiSqlChainCorrelation: 'PASS',
    terminalApiState: 'VERIFIED_FROM_SEALED_OPERATOR_JOURNAL',
    apiJournalSha256: API_JOURNAL_SHA,
    freshApiGet: false,
  });
}

async function captureNormalized(directory, sql, rpc, classification) {
  const normalized = await captureDurableReceipt({
    expected: HISTORICAL,
    outputDirectory: join(directory, 'receipt'),
    readers: createReplayReaders([sql], [rpc], classification),
  });
  requireThat(normalized.status === 'DURABLE_RECEIPT_CONVERGED_NORMALIZED' &&
    normalized.reason === 'APPROVED_DIAGNOSTIC_VARIANCE', 'HISTORICAL_NORMALIZATION_REJECTED');
  return normalized;
}

function normalizationSummary(normalized, chain, archive) {
  return {
    historical: HISTORICAL,
    historicalCaptureReplay: 'PARTIAL',
    apiSqlChainCorrelation: 'PARTIAL',
    apiAdmissionCorrelation: 'PASS',
    terminalApiState: 'UNVERIFIED',
    ratifiedMetaNormalization: 'PASS',
    normalizedReason: normalized.reason,
    rawMetaDigests: normalized.finalObservations.comparison.rawMetaSha256,
    normalizedDigests: normalized.finalObservations.comparison.normalizedMetaSha256,
    receiptInventorySha256: normalized.inventorySha256,
    apiAdmissionSha256: ACK_SHA,
    archiveSha256: ARCHIVE,
    ledgerHeaderSha256: chain.verification.headerSha256,
    snapshotCount: archive.snapshots.length,
  };
}

async function loadSealedReceipt(receiptArchive, archive) {
  const sealed = await verifyCaptureInventory(receiptArchive, HISTORICAL, 'LIVE_READONLY_SQL_AND_TESTNET_RPC');
  requireThat(sealed.inventorySha256 === RECEIPT_ARCHIVE_SHA &&
    sealed.status === 'DURABLE_RECEIPT_CONVERGED_NORMALIZED', 'HISTORICAL_RECEIPT_ARCHIVE_REJECTED');
  const saved = await parse(join(receiptArchive, 'result.json'));
  const prefix = String(saved.attempts).padStart(2, '0');
  const rpc = { format: 'RPC_JSONRPC',
    rawUtf8: await readFile(join(receiptArchive, prefix + '-rpc.raw.utf8'), 'utf8') };
  const preservedReceipt = JSON.parse(rpc.rawUtf8).result;
  requireThat(preservedReceipt.txHash === HISTORICAL.transactionHash &&
    preservedReceipt.envelopeXdr === archive.rpc.envelopeXdr &&
    preservedReceipt.resultXdr === archive.rpc.resultXdr && preservedReceipt.ledger === archive.rpc.ledger,
  'HISTORICAL_RPC_ARCHIVE_CORRELATION_REJECTED');
  return { sealed, prefix, rpc };
}

// Separate, read-only L2 invocation. Historical RPC evidence is reused at its
// recorded observation time. All current HTTP traffic is Horizon GET.
export async function replayHistoricalCapture({ pool, bundle, apiAdmission, apiJournal, receiptArchive, directory }) {
  const archive = await loadArchive(bundle, apiAdmission);
  const { sealed, rpc } = await loadSealedReceipt(receiptArchive, archive);
  const publicReads = new PublicReads();
  const [horizon, horizonLedger, sql, { projected, controls }] = await Promise.all([
    publicReads.horizon('/transactions/' + HISTORICAL.transactionHash),
    publicReads.horizon('/ledgers/' + HISTORICAL.ledger),
    createReadOnlyReaders(pool).readSql(HISTORICAL, AbortSignal.timeout(8000)),
    readProjection(pool),
  ]);
  await saveRaw(directory, 'horizon-transaction.raw.json', horizon.raw);
  await saveRaw(directory, 'horizon-ledger.raw.json', horizonLedger.raw);

  const chain = verifyArchivedTransaction(archive, horizon.value, horizonLedger.value);
  verifySqlReceipt(sql, archive.ack);
  const state = chain.meta.after.battery;
  requireThat(state?.state === projected.state && state.rewardState === projected.reward &&
    state.registrationHash === projected.registration_hash && projected.request_id === null &&
    Number(projected.ledger) === HISTORICAL.ledger, 'HISTORICAL_SQL_CHAIN_STATE_REJECTED');
  requireThat(controls.leases === 0 && controls.pending_dispatches === 0 &&
    controls.run1_operations === 0, 'UNEXPECTED_ACTIVE_CONTROL');

  const apiProof = await verifyHistoricalApiJournal(apiJournal, { state: projected.state, rewardState: projected.reward });
  const normalized = await captureNormalized(directory, sql, rpc, 'FRESH_SQL_AND_SEALED_HISTORICAL_RPC');

  return Object.freeze({
    ...normalizationSummary(normalized, chain, archive),
    ...apiProof,
    historicalCaptureReplay: 'PASS',
    sqlChainCorrelation: 'PASS',
    originalReceiptInventorySha256: sealed.inventorySha256,
    freshSources: ['SQL_SELECT_READ_ONLY', 'HORIZON_GET_TRANSACTION_AND_LEDGER'],
    preservedSources: ['API_HTTP_202_ACK', 'API_OPERATOR_JOURNAL', 'TESTNET_RPC_RECEIPT', 'TESTNET_RPC_LEDGER', 'LEDGER_ENTRY_SNAPSHOTS'],
    sqlState: projected.state,
    rewardState: projected.reward,
    observedAt: horizon.provenance.observedAt,
    controls,
  });
}

// Independently re-evaluate immutable past observations. This result is never
// a substitute for the requested fresh SQL and Horizon reads.
export async function replaySealedHistoricalCapture({ bundle, apiAdmission, receiptArchive, directory }) {
  const archive = await loadArchive(bundle, apiAdmission);
  const { sealed, prefix, rpc } = await loadSealedReceipt(receiptArchive, archive);
  const sql = { format: 'SQL_RECEIPT_JSON',
    rawUtf8: await readFile(join(receiptArchive, prefix + '-sql.raw.utf8'), 'utf8') };
  verifySqlReceipt(sql, archive.ack);
  const chain = verifyArchivedTransaction(archive, await parse(join(archive.step, 'horizon-transaction.json')),
    await parse(join(archive.step, 'horizon-ledger.json')));
  const normalized = await captureNormalized(directory, sql, rpc, 'SEALED_HISTORICAL_ONLY');
  return Object.freeze({
    ...normalizationSummary(normalized, chain, archive),
    sqlChainCorrelation: 'PASS_PRESERVED_RECEIPT',
    freshSources: [],
    preservedSources: ['API_HTTP_202_ACK', 'SQL_RECEIPT', 'TESTNET_RPC_RECEIPT_AND_LEDGER',
      'HORIZON_TRANSACTION_AND_LEDGER', 'LEDGER_ENTRY_SNAPSHOTS'],
    originalReceiptInventorySha256: sealed.inventorySha256,
    chainState: chain.meta.after.battery.state,
    chainRewardState: chain.meta.after.battery.rewardState,
  });
}
