import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { synthetic, ttlCoverage, classify, unsigned, businessCalls, summarizeSimulation, networkSummary } from './bye-w1-001-readiness.mts';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const sdk=require('@stellar/stellar-sdk');
const historical=JSON.parse(await readFile(new URL('../docs/testnet/validation-2026-09-26.json',import.meta.url),'utf8'));

test('BYE-W1-001 network evidence drops raw ledger metadata and unexpected RPC fields',()=>{
 const r=networkSummary({id:'hash',sequence:123,closeTime:'456',protocolVersion:29,metadataXdr:'unrelated ledger transactions',headerXdr:'header',unexpected:'omit'},
  {passphrase:'Test SDF Network ; September 2015',protocolVersion:29},{version:'29'});
 assert.equal(r.sequence,123);assert.ok(!Object.hasOwn(r,'metadataXdr'));assert.ok(!Object.hasOwn(r,'headerXdr'));assert.ok(!Object.hasOwn(r,'unexpected'));
});

test('BYE-W1-001 missing/unknown entries never become nonexistent or a live pass',()=>{
 assert.equal(classify(undefined,100),'UNKNOWN');assert.equal(classify({},100),'UNKNOWN');
 assert.equal(classify({liveUntilLedgerSeq:99},100),'ARCHIVED');
 assert.equal(classify({liveUntilLedgerSeq:100},100),'LIVE');
});
test('BYE-W1-001 TTL includes whole deadline day and seven whole buffer days',()=>{
 const now=Date.parse('2026-10-19T12:00:00-03:00')/1000;
 const r=ttlCoverage(100,now,5000,2_000_000);
 assert.equal(r.requiredThroughExclusive,'2026-11-21T00:00:00-03:00');
 assert.equal(r.targetLedger,100+Math.ceil((Date.parse(r.requiredThroughExclusive)/1000-now)/5));
 assert.equal(ttlCoverage(100,now,5000,r.targetLedger).adequate,true);
 assert.equal(ttlCoverage(100,now,5000,r.targetLedger-1).adequate,false);
 assert.throws(()=>ttlCoverage(100,now,0,1000),/UnknownCadence/);
});
test('BYE-W1-001 fresh CSPRNG identifiers fit frozen ABI and do not reuse historical IDs',()=>{
 const ids=Array.from({length:100},()=>synthetic());
 assert.equal(new Set(ids.map(i=>i.batteryId)).size,100);
 assert.equal(new Set(ids.map(i=>i.requestId)).size,100);
 for(const i of ids){assert.match(i.batteryId,/^BYE-SPRINT-PREFLIGHT-[A-F0-9]{10}$/);assert.ok(i.batteryId.length<=32);
  assert.match(i.requestId,/^[a-f0-9]{64}$/);assert.notEqual(i.batteryId,historical.batteryId);assert.notEqual(i.requestId,historical.requestId);}
});
test('BYE-W1-001 all five unsigned probes match frozen deployed ABI, actor/source and exact argument XDR',async()=>{
 const wasm=await readFile(new URL('../contracts/byetery-contract/target/wasm32v1-none/release/byetery_contract.wasm',import.meta.url));
 const spec=sdk.contract.Spec.fromWasm(wasm), funcs=spec.funcs();
 const calls=businessCalls(synthetic(),historical.actors);
 assert.deepEqual(calls.map(c=>c.method),['register_battery','open_return','confirm_collection','confirm_recycling','pay_reward']);
 for(const call of calls){
  const abi=funcs.find((f:any)=>f.name.toString()===call.method);assert.ok(abi);assert.equal(abi.inputs.length,call.args.length);
  const tx=unsigned(call,'100');assert.equal(tx.signatures.length,0);assert.equal(tx.operations.length,1);assert.equal(tx.sequence,'101');
  assert.equal(tx.source,call.source);assert.equal(tx.networkPassphrase,'Test SDF Network ; September 2015');
 }
 const collection=calls[2];assert.deepEqual(collection.requiredActors,[historical.actors.service.address,historical.actors.collector.address]);
 assert.equal(collection.source,historical.actors.service.address);
});
test('BYE-W1-001 failed simulation has unavailable fee/auth, never a zero fee or false cap pass',()=>{
 const r=summarizeSimulation({latestLedger:123,error:'HostError: Error(Contract, #3)'});
 assert.equal(r.status,'SIMULATION_ERROR');assert.equal(r.minResourceFee,null);assert.equal(r.authorizationEntryCount,null);assert.equal(r.belowCap,null);
 assert.equal(r.signed,false);assert.equal(r.submitted,false);
});
test('BYE-W1-001 cap assessment includes classic fee; simulation recording never includes signed material',()=>{
 const low=summarizeSimulation({latestLedger:1,minResourceFee:'49990000',results:[]});assert.equal(low.belowCap,true);
 const high=summarizeSimulation({latestLedger:1,minResourceFee:'49990001',results:[]});assert.equal(high.belowCap,false);
 assert.ok(!Object.hasOwn(low,'transactionXdr'));assert.ok(!Object.hasOwn(low,'signature'));
});
