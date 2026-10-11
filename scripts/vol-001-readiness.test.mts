import test from 'node:test';
import assert from 'node:assert/strict';
import { rpcRead, classify, RPC, ledgerKey, restorationIndices } from './vol-001-readiness.mts';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { xdr, nativeToScVal } = require('@stellar/stellar-sdk');
test('read transport rejects every state-changing method before network access', async () => {
  let calls = 0;
  const transport = (async () => { calls++; throw Error('unexpected transport'); }) as typeof fetch;
  for (const method of ['sendTransaction', 'restoreFootprint', 'extendFootprintTtl', 'submit', 'unknown'])
    await assert.rejects(rpcRead(method, {}, transport), /ReadOnlyMethodRequired/);
  assert.equal(calls, 0);
});
test('read transport has fixed Testnet endpoint and accepts only named reads', async () => {
  const sent: string[] = [];
  const transport = (async (url, options) => {
    assert.equal(url, RPC);
    sent.push(JSON.parse(options!.body as string).method);
    return new Response(JSON.stringify({result:{sequence:1}}), { status:200 });
  }) as typeof fetch;
  await rpcRead('getLatestLedger', {}, transport);
  assert.deepEqual(sent, ['getLatestLedger']);
});
test('missing entries remain unknown; expired returned entries classify as archived', () => {
  assert.equal(classify(undefined, 100), 'NOT_RETURNED_UNKNOWN');
  assert.equal(classify({}, 100), 'PRESENT_TTL_UNAVAILABLE');
  assert.equal(classify({liveUntilLedgerSeq:99}, 100), 'ARCHIVED');
  assert.equal(classify({liveUntilLedgerSeq:0}, 100), 'ARCHIVED');
  assert.equal(classify({liveUntilLedgerSeq:100}, 100), 'LIVE');
});
test('ledger keys round-trip with the installed SDK persistent durability and enum payload', () => {
  const key = ledgerKey('CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON',
    xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Battery'), nativeToScVal('VOL-001-SIM', {type:'string'})]));
  const decoded = xdr.LedgerKey.fromXDR(key.toXDR('base64'), 'base64');
  assert.equal(decoded.type, 'contractData');
  assert.equal(decoded.contractData.durability.name, 'persistent');
  assert.equal(decoded.toXDR('base64'), key.toXDR('base64'));
});
test('Protocol 23 restore list is extracted from the actual resourceExt union arm', () => {
  const data = {ext:xdr.SorobanTransactionDataExt.resourceExt(new xdr.SorobanResourcesExtV0({archivedSorobanEntries:[0,2]}))};
  assert.deepEqual(restorationIndices(data), [0,2]);
  assert.deepEqual(restorationIndices({ext:xdr.SorobanTransactionDataExt.v0()}), []);
  assert.equal(restorationIndices(null), null);
});
