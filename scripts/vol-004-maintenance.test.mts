import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { maintenanceUnsigned,guardMaintenance,sequenceMatches,SOURCE } from './vol-004-maintenance.mts';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const {Contract,Operation,Account,TransactionBuilder,SorobanDataBuilder}=require('@stellar/stellar-sdk');
const network='Test SDF Network ; September 2015';
const id='CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON';
const keys=[new Contract(id).getFootprint().toXDR('base64')];
test('VOL-004 source check compares authoritative account sequence to envelope sequence minus one',()=>{
  assert.equal(sequenceMatches('10','11'),true);assert.equal(sequenceMatches('11','11'),false);
  assert.equal(sequenceMatches('20970242247229441','20970242247229442'),true);
});
for(const kind of ['restore','extend'] as const)test(`VOL-004 only exact ${kind} maintenance footprint accepted`,()=>{
  const tx=maintenanceUnsigned(kind,'10',keys,1555200);guardMaintenance(tx,kind,keys,10000n);
  assert.equal(tx.source,SOURCE);assert.equal(tx.sequence,'11');
  assert.throws(()=>guardMaintenance(tx,kind,[],10000n),/UnexpectedMaintenanceFootprint/);
  assert.throws(()=>guardMaintenance(tx,kind,keys,9999n),/InvalidMaintenanceEnvelope/);
});
test('VOL-004 business invocations and wrong TTL targets are never signable maintenance',()=>{
  const tx=new TransactionBuilder(new Account(SOURCE,'10'),{fee:'10000',networkPassphrase:network})
    .addOperation(new Contract(id).call('pay_reward')).setTimeout(180).build();
  assert.throws(()=>guardMaintenance(tx,'restore',keys,10000n),/MaintenanceOperationOnly/);
  const wrong=new TransactionBuilder(new Account(SOURCE,'10'),{fee:'10000',networkPassphrase:network})
    .addOperation(Operation.extendFootprintTtl({extendTo:500})).setSorobanData(new SorobanDataBuilder().setReadOnly([new Contract(id).getFootprint()]).build()).setTimeout(180).build();
  assert.throws(()=>guardMaintenance(wrong,'extend',keys,10000n),/UnexpectedTTLTarget/);
});
