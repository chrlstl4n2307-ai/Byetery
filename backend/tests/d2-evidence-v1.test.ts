import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Account, Address, Contract, Networks, StrKey, TransactionBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import disclosure from '../../docs/instaward/d2/evidence/d2-006/historical-recycling.json' with { type: 'json' };
import vector from './contract-evidence-vector.json' with { type: 'json' };
import { evidenceCommitment } from '../src/evidence.ts';
import { evidenceV1Disclosure, verifyEvidenceV1, type EvidenceV1Input } from '../src/evidence-verifier.ts';
import { HorizonEvidenceReader, verifyEvidenceV1Provenance, type EvidenceProvenanceInput } from '../src/evidence-provenance.ts';
import { ACTORS, CONTRACT, evidenceValue } from '../src/testnet/abi.ts';
import { HISTORY_DEPLOYMENT_ID, type HistoryRow } from '../src/history/model.ts';
import type { HistoryChainReader, HistoryReceipt } from '../src/history/verify.ts';

const input = evidenceV1Disclosure(disclosure)!;
const original = JSON.parse(readFileSync(new URL('../../docs/instaward/week1/BYE-W1-004-results.json', import.meta.url), 'utf8'));
const sha = (v: Uint8Array) => createHash('sha256').update(v).digest('hex');
const context: EvidenceProvenanceInput = { ...input, deploymentId: HISTORY_DEPLOYMENT_ID, payloadHash: disclosure.payloadHash };

test('D2.5 exact historical bytes reproduce the original disclosed payload and commitment', () => {
  assert.deepEqual(input.manifestBytes, Buffer.from(original.evidence.manifestUtf8, 'utf8'));
  assert.equal(input.manifestBytes.length, 398);
  assert.equal(sha(input.manifestBytes), original.evidence.payloadSha256);
  assert.equal(input.expectedCommitment, original.evidence.canonicalCommitment);
  assert.deepEqual(verifyEvidenceV1(input), { status: 'VERIFIED', reason: 'COMMITMENT_MATCH',
    payloadHash: disclosure.payloadHash, computedCommitment: disclosure.expectedCommitment });
});
test('D2.5 change exactly byte 0 from 0x7b to 0x7a, same expected commitment fails', () => {
  const changed = Buffer.from(input.manifestBytes); changed[0] ^= 1;
  assert.equal(input.manifestBytes[0], 0x7b); assert.equal(changed[0], 0x7a);
  assert.equal(changed.filter((b, i) => b !== input.manifestBytes[i]).length, 1);
  const result = verifyEvidenceV1({ ...input, manifestBytes: changed });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.notEqual(result.computedCommitment, input.expectedCommitment);
  assert.equal(input.expectedCommitment, disclosure.expectedCommitment);
});
for (const [label, change] of [
  ['truncate', { manifestBytes: input.manifestBytes.subarray(0, -1) }],
  ['append', { manifestBytes: Buffer.concat([input.manifestBytes, Buffer.from([0])]) }],
  ['whitespace', { manifestBytes: Buffer.concat([input.manifestBytes, Buffer.from('\n')]) }],
  ['JSON property order', { manifestBytes: Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(Buffer.from(input.manifestBytes).toString('utf8'))).reverse()))) }],
  ['other valid contract', { contractAddress: StrKey.encodeContract(Buffer.alloc(32, 7)) }],
  ['other valid network', { networkId: '07'.repeat(32) }],
  ['other domain', { domain: 'OTHER_EVIDENCE_V1' }],
  ['other battery', { batteryId: 'BYE-OTHER' }],
  ['other request', { requestId: '07'.repeat(32) }],
  ['other kind', { kind: 'COLLECTION' }],
] as const) test(`D2.5 valid but different ${label} is NOT_VERIFIED`, () => {
  assert.equal(verifyEvidenceV1({ ...input, ...change }).status, 'NOT_VERIFIED');
});
for (const [label, change] of [
  ['malformed hash', { expectedCommitment: 'z'.repeat(64) }],
  ['short hash', { expectedCommitment: 'ab'.repeat(31) }],
  ['long hash', { expectedCommitment: 'ab'.repeat(33) }],
  ['uppercase hash', { expectedCommitment: input.expectedCommitment.toUpperCase() }],
  ['short network', { networkId: 'ab'.repeat(31) }],
  ['malformed network', { networkId: 'z'.repeat(64) }],
  ['malformed contract', { contractAddress: 'CINVALID' }],
  ['account instead of contract', { contractAddress: ACTORS.service }],
  ['empty evidence', { manifestBytes: Buffer.alloc(0) }],
  ['oversize application disclosure', { manifestBytes: Buffer.alloc(16385) }],
  ['unsupported version', { version: 2 }],
  ['missing domain', { domain: '' }],
  ['invalid battery', { batteryId: 'lower case' }],
  ['malformed request', { requestId: '01' }],
] as const) test(`D2.5 ${label} is INVALID_INPUT`, () => {
  assert.deepEqual(verifyEvidenceV1({ ...input, ...change }), {
    status: 'INVALID_INPUT', reason: 'INVALID_INPUT', payloadHash: null, computedCommitment: null,
  });
});
test('D2.5 untyped malformed inputs are rejected without throwing', () => {
  for (const value of [null, {}, { ...input, kind: 'REGISTRATION' }, { ...input, manifestBytes: 'text' },
    { ...input, version: '1' }, { ...input, expectedCommitment: 10 }]) {
    assert.equal(verifyEvidenceV1(value as EvidenceV1Input).status, 'INVALID_INPUT');
  }
});
test('D2.5 deterministic repeated verification never changes bytes/context', () => {
  const before = Buffer.from(input.manifestBytes), result = verifyEvidenceV1(input);
  for (let i = 0; i < 10; i++) assert.deepEqual(verifyEvidenceV1(input), result);
  assert.deepEqual(input.manifestBytes, before);
});
test('D2.5 preserves the existing frozen Rust/WASM XDR serialization vector', () => {
  // This vector specifies a payload hash, not its original manifest preimage.
  assert.equal(evidenceCommitment(vector, { version: 1, kind: 'COLLECTION', batteryId: vector.batteryId,
    requestId: vector.requestId, payloadHash: vector.payloadHash }), vector.commitment);
});
test('D2.5 disclosure container rejects permissive/noncanonical base64 and malformed shape', () => {
  for (const manifestBase64 of ['!', 'Zh==', disclosure.manifestBase64 + '\n', 'a'.repeat(22000)])
    assert.equal(evidenceV1Disclosure({ ...disclosure, manifestBase64 }), null);
  for (const value of [null, [], {}, { ...disclosure, evidenceVersion: '1' }]) assert.equal(evidenceV1Disclosure(value), null);
});
test('D2.5 offline CLI gives deterministic status/exit and never echoes input diagnostics', () => {
  const dir = mkdtempSync(join(tmpdir(), 'byetery-d2-006-'));
  try {
    const cli = fileURLToPath(new URL('../src/evidence-cli.ts', import.meta.url));
    for (const [label, data, status, code] of [
      ['intact', disclosure, 'VERIFIED', 0],
      ['tampered', { ...disclosure, manifestBase64: Buffer.concat([input.manifestBytes, Buffer.from([1])]).toString('base64') }, 'NOT_VERIFIED', 1],
      ['invalid', { ...disclosure, expectedCommitment: 'invalid-do-not-echo' }, 'INVALID_INPUT', 2],
    ] as const) {
      const path = join(dir, `${label}.json`); writeFileSync(path, JSON.stringify(data));
      const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, path], { encoding: 'utf8', timeout: 90000 });
      assert.equal(result.error, undefined); assert.equal(result.status, code);
      assert.equal(result.stdout.trim(), status); assert.equal(result.stderr, '');
    }
  } finally { rmSync(dir, { recursive: true }); }
});

/** Unsigned, offline envelope fixtures. These tests never sign or contact a provider. */
function chainFixture(change: { payloadHash?: string; requestId?: string; actor?: string; method?: string; contract?: string; extra?: boolean } = {}) {
  const ev = { version: 1, batteryId: input.batteryId, requestId: input.requestId,
    kind: input.kind, payloadHash: change.payloadHash ?? disclosure.payloadHash };
  const args = [nativeToScVal(input.batteryId, { type: 'string' }), xdr.ScVal.scvBytes(Buffer.from(change.requestId ?? input.requestId, 'hex')),
    new Address(change.actor ?? ACTORS.recycler).toScVal(), evidenceValue(ev)];
  if (change.extra) args.push(xdr.ScVal.scvVoid());
  const tx = new TransactionBuilder(new Account(ACTORS.recycler, '1'), { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(change.contract ?? CONTRACT).call(change.method ?? 'confirm_recycling', ...args)).setTimebounds(1, 2).build();
  const row: HistoryRow = { id: 'UNSIGNED-OFFLINE-FIXTURE', kind: 'RECYCLED', state: 'CONFIRMED',
    created_at: '2026-10-21T17:15:15.660Z', transaction_hash: Buffer.from(tx.hash()).toString('hex'),
    identity_network: input.networkId, identity_contract: CONTRACT, confirmation_ledger: '12' };
  const receipt: HistoryReceipt = { status: 'SUCCESS', txHash: row.transaction_hash!, ledger: 12, createdAt: '1792602957', envelopeXdr: tx.toXDR(),
    resultXdr: new xdr.TransactionResult({ feeCharged: 1000n, result: xdr.TransactionResultResult.txSuccess([]), ext: xdr.TransactionResultExt.v0() }).toXDR('base64') };
  let reads = 0;
  const chain: HistoryChainReader = { network: async () => ({ passphrase: Networks.TESTNET }), transaction: async () => { reads++; return receipt; } };
  return { row, receipt, chain, reads: () => reads };
}
test('D2.5 provenance independently binds SUCCESS hash/contract/method/battery/request/actor/evidence', async () => {
  const f = chainFixture(), result = await verifyEvidenceV1Provenance(context, f.row, f.chain);
  assert.equal(result.verification, 'CONFIRMED', JSON.stringify(result)); assert.equal(result.commitment, input.expectedCommitment);
  assert.equal(result.transactionHash, f.row.transaction_hash); assert.equal(result.ledger, 12); assert.equal(f.reads(), 1);
  assert.ok(!JSON.stringify(result).includes('envelope'));
});
for (const [label, change] of [
  ['payload', { payloadHash: '07'.repeat(32) }], ['request', { requestId: '07'.repeat(32) }],
  ['actor', { actor: ACTORS.collector }], ['method', { method: 'confirm_collection' }],
  ['contract', { contract: StrKey.encodeContract(Buffer.alloc(32, 7)) }], ['extra argument', { extra: true }],
] as const) test(`D2.5 provenance rejects ${label} mismatch`, async () => {
  const f = chainFixture(change);
  assert.equal((await verifyEvidenceV1Provenance(context, f.row, f.chain)).verification, 'UNVERIFIED');
});
for (const label of ['wrong network', 'missing tx', 'failed tx', 'false success', 'hash mismatch', 'ledger mismatch', 'SQL pending', 'unavailable', 'wrong deployment', 'wrong expected commitment'])
  test(`D2.5 provenance remains UNVERIFIED: ${label}`, async () => {
    const f = chainFixture(), c = { ...context };
    if (label === 'wrong network') f.chain.network = async () => ({ passphrase: Networks.PUBLIC });
    if (label === 'missing tx') f.receipt.status = 'NOT_FOUND';
    if (label === 'failed tx') f.receipt.status = 'FAILED';
    if (label === 'false success') f.receipt.resultXdr = new xdr.TransactionResult({ feeCharged: 1000n,
      result: xdr.TransactionResultResult.txFailed([]), ext: xdr.TransactionResultExt.v0() }).toXDR('base64');
    if (label === 'hash mismatch') f.row.transaction_hash = f.receipt.txHash = '07'.repeat(32);
    if (label === 'ledger mismatch') f.receipt.ledger = 13;
    if (label === 'SQL pending') f.row.state = 'SUBMITTED';
    if (label === 'unavailable') f.chain.transaction = async () => { throw Error('PRIVATE PROVIDER DIAGNOSTIC'); };
    if (label === 'wrong deployment') c.deploymentId = 'OTHER';
    if (label === 'wrong expected commitment') c.expectedCommitment = '07'.repeat(32);
    const result = await verifyEvidenceV1Provenance(c, f.row, f.chain);
    assert.equal(result.verification, 'UNVERIFIED'); assert.equal(result.commitment, null);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  });
test('D2.5 pure integrity and provenance are independent: tampered disclosure does not rewrite chain history', async () => {
  const f = chainFixture(), altered = Buffer.from(input.manifestBytes); altered[0] ^= 1;
  assert.equal(verifyEvidenceV1({ ...input, manifestBytes: altered }).status, 'NOT_VERIFIED');
  assert.equal((await verifyEvidenceV1Provenance(context, f.row, f.chain)).verification, 'CONFIRMED');
});
test('D2.5 Horizon adapter is fixed Testnet GET-only and returns transient receipt to shared verifier', async () => {
  const f = chainFixture(), paths: string[] = [];
  const reader = new HorizonEvidenceReader(async (url, init) => {
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error'); assert.equal(init?.body, undefined);
    paths.push(String(url));
    return Response.json(String(url).endsWith('/') ? { network_passphrase: Networks.TESTNET } : {
      hash: f.receipt.txHash, successful: true, ledger: 12, created_at: new Date(Number(f.receipt.createdAt) * 1000).toISOString(),
      envelope_xdr: f.receipt.envelopeXdr, result_xdr: f.receipt.resultXdr,
    });
  });
  assert.equal((await verifyEvidenceV1Provenance(context, f.row, reader)).verification, 'CONFIRMED');
  assert.deepEqual(paths, ['https://horizon-testnet.stellar.org/', `https://horizon-testnet.stellar.org/transactions/${f.row.transaction_hash}`]);
});
test('D2.5 Horizon 404 is NOT_FOUND; invalid hash is rejected before transport', async () => {
  let calls = 0;
  const reader = new HorizonEvidenceReader(async () => { calls++; return new Response('', { status: 404 }); });
  assert.deepEqual(await reader.transaction('07'.repeat(32)), { status: 'NOT_FOUND' });
  await assert.rejects(reader.transaction('invalid'), /InvalidHistoryHash/); assert.equal(calls, 1);
});
