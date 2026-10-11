import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Account, Contract, Keypair, Networks, Transaction, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk';
import { config, h } from './fixtures.ts';
import { finalizedBody, signedIdentity, identityLabel, NETWORK_ID, SIGNER_FEE_CAP, type OperationContext } from '../src/testnet/identity.ts';

export function identityFixture() {
  const key=Keypair.random(); // Synthetic, ephemeral test identity; never stored or printed.
  const args=[nativeToScVal('BYE-LOCAL-FIXTURE',{type:'string'}),nativeToScVal(Buffer.from(h(1),'hex'),{type:'bytes'})];
  const context:OperationContext={deploymentId:config.deploymentId,operationId:'44444444-4444-4444-8444-444444444444',
    networkId:NETWORK_ID,contractAddress:config.contractAddress,sourceAccount:key.publicKey(),
    command:{kind:'register_battery',batteryId:'BYE-LOCAL-FIXTURE',registrationHash:h(1)},contextHash:h(1),argumentsXdr:args.map(a=>a.toXDR('base64'))};
  const tx=new TransactionBuilder(new Account(key.publicKey(),'0'),{fee:'10000',networkPassphrase:Networks.TESTNET})
    .addOperation(new Contract(context.contractAddress).call(context.command.kind,...args)).setTimebounds(1000,1300).build();
  return {key,context,prepared:{transactionXdr:tx.toXDR(),preparedLedger:1}};
}
test('VOL-003 SDK hash is computed before envelope signing and unchanged afterward',()=>{
  const f=identityFixture(),final=finalizedBody(f.context,f.prepared);
  const tx=new Transaction(final.transactionXdr,Networks.TESTNET);tx.sign(f.key);
  const identity=signedIdentity(f.context,final,tx.toXDR());
  assert.equal(identity.transactionHash,final.transactionHash);
  assert.notEqual(identity.transactionHash,createHash('sha256').update(tx.toXDR()).digest('hex'));
  assert.notEqual(identity.transactionHash,Buffer.from(new Transaction(tx.toXDR(),Networks.PUBLIC).hash()).toString('hex'));
  assert.deepEqual(identityLabel(identity),{deploymentId:f.context.deploymentId,operationId:f.context.operationId,transactionHash:final.transactionHash,source:'FIXTURE'});
  assert.equal(identity.sequence,'1');assert.equal(SIGNER_FEE_CAP,50_000_000n);
});
test('VOL-003 wrong network/source/invocation/arguments cannot produce an accepted identity',()=>{
  const f=identityFixture();
  for(const change of [{networkId:h(2)},{sourceAccount:Keypair.random().publicKey()},
    {command:{kind:'pay_reward',batteryId:'BYE-LOCAL-FIXTURE'} as const},{argumentsXdr:[]}]) {
    assert.throws(()=>finalizedBody({...f.context,...change},f.prepared));
  }
});
test('VOL-003 rejects tampered hash, unsigned result and wrong envelope signer',()=>{
  const f=identityFixture(),final=finalizedBody(f.context,f.prepared);
  assert.throws(()=>signedIdentity(f.context,{...final,transactionHash:h(2)},final.transactionXdr),/FinalizedHashMismatch/);
  assert.throws(()=>signedIdentity(f.context,final,final.transactionXdr),/InvalidEnvelopeSignature/);
  const tx=new Transaction(final.transactionXdr,Networks.TESTNET);tx.sign(Keypair.random());
  assert.throws(()=>signedIdentity(f.context,final,tx.toXDR()),/InvalidEnvelopeSignature/);
});
