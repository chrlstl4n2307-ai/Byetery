import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {X} from '../d3-evidence-capture/xdr-reader.mjs';
import {auditCaptureTooling,auditCaptureSource} from './audit.mjs';
import {captureDurableReceipt} from './capture.mjs';
import {normalizeTransactionMeta,NORMALIZED_DIAGNOSTIC_TOPICS} from './meta-normalization.mjs';
import {createReplayReaders} from './sources.mjs';

const fixture = name => JSON.parse(readFileSync(new URL('./fixtures/'+name+'.json',import.meta.url),'utf8'));
const a = fixture('tx1-public-values');
const b = fixture('tx1-public-meta-variant');
const bytes = value => Buffer.from(value,'base64');
const digest = value => createHash('sha256').update(value).digest('hex');
const hashA = '4c2267f012556b11d3f222da6a39d9ee77e9b91a578a2cfb44f7a066adb60667';
const hashB = 'a4214427ec37de1a99caa8ed004cc2b922ed7814a49529a071d35c1f64dc4d24';
const scope = Object.freeze({
  operationId:'2201faa3-980a-4250-8578-ec024272a022',
  transactionHash:'fb159fc9e1646f257414f30034220876f14033ce7b92109102cc9ca530da68c1',
  batteryId:'BYE-D3-R1-20261106-9470F35DF6B1',method:'register_battery',ledger:5599273,
});
const parse = encoded => X.TransactionMeta.fromXDR(encoded,'base64').toXdrObject();
const encode = value => X.TransactionMeta.fromXdrObject(value).toXDR('base64');
const symbol = name => X.ScVal.scvSymbol(name).toXdrObject();
const metric = (v4,name) => v4.diagnosticEvents.find(({event}) =>
  event.body.v0.topics.length === 2 &&
  event.body.v0.topics[0].sym?.toString() === 'core_metrics' &&
  event.body.v0.topics[1].sym?.toString() === name);
const approved = v4 => metric(v4,'invoke_time_nsecs');
const body = diagnostic => diagnostic.event.body.v0;

async function compare(t,sqlMeta,rpcMeta,overrides={}) {
  const base=mkdtempSync(resolve(tmpdir(),'byetery-meta-'));
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  const dir=resolve(base,'capture');
  const sql={...scope,receiptTransactionHash:scope.transactionHash,status:'SUCCESS',applicationState:'CONFIRMED',
    durableState:'PROJECTED',resultXdr:a.resultXdr,resultMetaXdr:sqlMeta,...overrides.sql};
  const rpc={...scope,status:'SUCCESS',resultXdr:a.resultXdr,resultMetaXdr:rpcMeta,...overrides.rpc};
  const result=await captureDurableReceipt({expected:scope,readers:createReplayReaders([sql],[rpc]),outputDirectory:dir});
  const raw=name=>readFileSync(resolve(dir,name),'utf8');
  const read=name=>JSON.parse(raw(name));
  return {result,raw,read,sql,rpc};
}

test('TX1 real metas differ raw but match under invoke_time_nsecs normalization',async t=>{
  const rawA=bytes(a.resultMetaXdr),rawB=bytes(b.resultMetaXdr);
  assert.equal(rawA.equals(rawB),false);
  assert.equal(digest(rawA),hashA);
  assert.equal(digest(rawB),hashB);
  const decodedA=parse(a.resultMetaXdr),decodedB=parse(b.resultMetaXdr);
  assert.equal(body(approved(decodedA.v4)).data.u64,413596n);
  assert.equal(body(approved(decodedB.v4)).data.u64,412826n);
  for(const name of ['cpu_insn','mem_byte'])assert.deepEqual(body(metric(decodedA.v4,name)),body(metric(decodedB.v4,name)));

  const nA=normalizeTransactionMeta(rawA),nB=normalizeTransactionMeta(rawB);
  assert.deepEqual(nA.normalizedBytes,nB.normalizedBytes);
  assert.equal(nA.normalizedMetaSha256,nB.normalizedMetaSha256);
  assert.equal(nA.normalizedMetaSha256,digest(nA.normalizedBytes));
  body(approved(decodedA.v4)).data.u64=0n;
  assert.equal(nA.normalizedBytes.toString('base64'),encode(decodedA));
  assert.equal(digest(rawA),hashA);
  assert.equal(digest(rawB),hashB);

  const {result,raw,read,sql,rpc}=await compare(t,a.resultMetaXdr,b.resultMetaXdr);
  assert.equal(result.status,'DURABLE_RECEIPT_CONVERGED_NORMALIZED');
  assert.equal(result.reason,'APPROVED_DIAGNOSTIC_VARIANCE');
  assert.deepEqual(result.finalObservations.comparison,{
    resultXdrEqual:true,resultXdrTextEqual:true,rawMetaEqual:false,rawMetaSha256:{sql:hashA,rpc:hashB},
    normalizedMetaEqual:true,normalizedMetaSha256:{sql:nA.normalizedMetaSha256,rpc:nB.normalizedMetaSha256},
    normalizationApplied:{sql:'core_metrics/invoke_time_nsecs',rpc:'core_metrics/invoke_time_nsecs'},
    normalizedArtifactSha256:digest(raw('01-normalized-meta.json')),
  });
  assert.equal(raw('01-sql.raw.utf8'),JSON.stringify(sql));
  assert.equal(raw('01-rpc.raw.utf8'),JSON.stringify(rpc));
  const canonical=read('01-canonical-inputs.json');
  assert.equal(canonical.sql.resultMetaXdr.canonicalBase64,a.resultMetaXdr);
  assert.equal(canonical.rpc.resultMetaXdr.canonicalBase64,b.resultMetaXdr);
  assert.deepEqual(canonical.sql.resultMetaXdr.canonicalDecoded.v4.diagnosticEvents[17].event.body.v0.data.u64,{xdrInteger:'413596'});
  assert.deepEqual(canonical.rpc.resultMetaXdr.canonicalDecoded.v4.diagnosticEvents[17].event.body.v0.data.u64,{xdrInteger:'412826'});
  const inventory=read('inventory.json');
  const index=name=>inventory.find(item=>item.path===name).durableWriteIndex;
  assert.ok(index('01-sql.raw.utf8')<index('01-rpc.raw.utf8'));
  assert.ok(index('01-rpc.raw.utf8')<index('01-canonical-inputs.json'));
  assert.ok(index('01-canonical-inputs.json')<index('01-normalized-meta.json'));
  assert.ok(index('01-normalized-meta.json')<index('01-decision.json'));
});

const changes = [
  ['cpu_insn',v=>{body(metric(v,'cpu_insn')).data.u64+=1n;}],
  ['mem_byte',v=>{body(metric(v,'mem_byte')).data.u64+=1n;}],
  ['another core_metrics field',v=>{body(metric(v,'emit_event_byte')).data.u64+=1n;}],
  ['contract event',v=>{v.operations[0].events[0].body.v0.data={type:X.ScValType.scvU64.value,u64:7n};}],
  ['Soroban return value',v=>{v.sorobanMeta.returnValue={type:X.ScValType.scvU64.value,u64:8n};}],
  ['ledger entry change',v=>{v.operations[0].changes[0].created.lastModifiedLedgerSeq+=1;}],
  ['txChangesBefore',v=>{v.txChangesBefore.reverse();}],
  ['txChangesAfter',v=>{v.txChangesAfter.push(v.txChangesBefore[0]);}],
  ['operation changes',v=>{v.operations[0].changes.reverse();}],
  ['non-allowlisted diagnostic event',v=>{v.diagnosticEvents[0].inSuccessfulContractCall=false;}],
  ['same metric name under wrong namespace',v=>{body(approved(v)).topics[0]=symbol('other_metrics');},true],
  ['partial topic match',v=>{body(approved(v)).topics[1]=symbol('invoke_time_nsecs_extra');},true],
  ['extra diagnostic event',v=>{v.diagnosticEvents.push(v.diagnosticEvents[0]);}],
  ['removed diagnostic event',v=>{v.diagnosticEvents.shift();}],
  ['reordered meaningful events',v=>{v.events.reverse();}],
  ['extra topic on allowlisted metric',v=>{body(approved(v)).topics.push(symbol('extra'));},true],
  ['reversed allowlist topics',v=>{body(approved(v)).topics.reverse();},true],
  ['allowlisted event removed',v=>{v.diagnosticEvents.splice(v.diagnosticEvents.indexOf(approved(v)),1);}],
  ['allowlisted event moved',v=>{v.diagnosticEvents.unshift(...v.diagnosticEvents.splice(v.diagnosticEvents.indexOf(approved(v)),1));}],
  ['allowlisted name encoded as ScString',v=>{body(approved(v)).topics[1]=X.ScVal.scvString('invoke_time_nsecs').toXdrObject();},true],
];

for(const [name,mutate,onBoth] of changes)test('normalized receipt STOP preserves '+name,async t=>{
  const left=parse(a.resultMetaXdr),right=parse(b.resultMetaXdr);
  if(onBoth)mutate(left.v4);
  mutate(right.v4);
  const {result}=await compare(t,encode(left),encode(right));
  assert.equal(result.status,'DURABLE_RECEIPT_NORMALIZED_MISMATCH');
  assert.equal(result.attempts,1);
  assert.equal(result.finalObservations.comparison.normalizedMetaEqual,false);
});

test('duplicate or unproven exact metric shape cannot pass',async t=>{
  for(const [mutate,reason] of [
    [v=>v.diagnosticEvents.push(approved(v)),'AMBIGUOUS_DIAGNOSTIC_METRIC'],
    [v=>{body(approved(v)).data={type:X.ScValType.scvU32.value,u32:42};},'UNPROVEN_DIAGNOSTIC_METRIC_SHAPE'],
    [v=>{approved(v).inSuccessfulContractCall=false;},'UNPROVEN_DIAGNOSTIC_METRIC_SHAPE'],
  ]) {
    const right=parse(b.resultMetaXdr);
    mutate(right.v4);
    const {result,read}=await compare(t,a.resultMetaXdr,encode(right));
    assert.equal(result.status,'DURABLE_RECEIPT_NORMALIZED_MISMATCH');
    assert.equal(result.finalObservations.comparison.normalizationError,reason);
    assert.equal(read('01-canonical-inputs.json').rpc.resultMetaXdr.canonicalBase64,encode(right));
  }
});

test('matching non-SUCCESS terminal labels never reach normalization',async t=>{
  const {result}=await compare(t,a.resultMetaXdr,b.resultMetaXdr,{
    sql:{status:'FAILED',applicationState:'REJECTED',durableState:'CONFIRMED_FAILED'},rpc:{status:'FAILED'},
  });
  assert.equal(result.reason,'TRANSACTION_NOT_SUCCESS');
  assert.equal(result.finalObservations.comparison,null);
  assert.equal(result.attempts,1);
});

test('allowlist contains one fixed two-symbol metric with no external overrides',async()=>{
  const audit=auditCaptureTooling();
  assert.equal(audit.NORMALIZED_DIAGNOSTIC_ALLOWLIST_SIZE,1);
  assert.deepEqual(audit.normalizationAllowlist,['core_metrics/invoke_time_nsecs']);
  assert.ok(Object.isFrozen(NORMALIZED_DIAGNOSTIC_TOPICS));
  assert.throws(()=>NORMALIZED_DIAGNOSTIC_TOPICS.push('mem_byte'),TypeError);
  for(const code of ['process.env.NORMALIZATION','process.argv','/core_metrics/','new RegExp(value)','value.startsWith(prefix)']) {
    assert.throws(()=>auditCaptureSource(code,'meta-normalization.mjs'),/CAPTURE_MUTATION_OR_UNKNOWN_CAPABILITY/);
  }
  await assert.rejects(()=>captureDurableReceipt({expected:scope,readers:createReplayReaders([{}],[{}]),
    outputDirectory:'unreachable',allowlist:['mem_byte']}),/UNSUPPORTED_CAPTURE_OPTION/);
});
