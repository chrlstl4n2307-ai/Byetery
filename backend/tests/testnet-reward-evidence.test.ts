import test from 'node:test';
import assert from 'node:assert/strict';
import { Address,StrKey,nativeToScVal,xdr } from '@stellar/stellar-sdk';
import { ACTORS,CONTRACT,TOKEN } from '../src/testnet/abi.ts';
import { rewardFacts } from '../src/testnet/transport.ts';
import { NETWORK_ID,type Confirmation } from '../src/testnet/identity.ts';
import type { Battery,Deployment,ReturnRequest } from '../src/domain.ts';
const d:Deployment={deploymentId:'fixture',mode:'TESTNET',networkId:NETWORK_ID,contractAddress:CONTRACT,admin:ACTORS.admin,service:ACTORS.service,
  schemaVersion:1,rewardToken:TOKEN,rewardAmount:123456789n}; // Deliberately NOT the product's static 10-token amount.
const b:Battery={state:'RECYCLED',rewardState:'SENT',registrationHash:'01'.repeat(32),requestId:'02'.repeat(32),collector:ACTORS.collector,collectionHash:'03'.repeat(32),recycler:ACTORS.recycler,recyclingHash:'04'.repeat(32)};
const r:ReturnRequest={batteryId:'BYE-FIXTURE',recipient:ACTORS.admin,state:'CONFIRMED'};
function fixture(amount=d.rewardAmount,recipient=r.recipient){
  const receipt=xdr.ScVal.scvMap([
    ['amount',nativeToScVal(amount,{type:'i128'})],['recipient',new Address(recipient).toScVal()],
    ['reward_state',xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Sent')])],['token',new Address(TOKEN).toScVal()],
  ].map(([k,v])=>new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol(k as string),val:v as xdr.ScVal})));
  const event=new xdr.ContractEvent({ext:xdr.ExtensionPoint.v0(),contractId:new xdr.ContractId(StrKey.decodeContract(TOKEN)),type:xdr.ContractEventType.contract,
    body:xdr.ContractEventBody.v0(new xdr.ContractEventV0({topics:[xdr.ScVal.scvSymbol('transfer'),new Address(CONTRACT).toScVal(),new Address(recipient).toScVal()],data:nativeToScVal(amount,{type:'i128'})}))});
  const c:Confirmation={transactionHash:'05'.repeat(32),observationLedger:10,confirmationLedger:9,resultXdr:'fixture',resultMetaXdr:'fixture',
    sorobanResult:receipt.toXDR('base64'),events:[event.toXDR('base64')],correlationId:'fixture'};
  return c;
}
test('real reward proof derives amount from receipt/configuration and actual SAC transfer, not a static 10',()=>{
  assert.deepEqual(rewardFacts(fixture(),b,r,d),{recipient:r.recipient,token:TOKEN,amount:'123456789'});
});
test('SENT alone, missing transfer, wrong recipient or amount cannot establish payment',()=>{
  const c=fixture();
  assert.throws(()=>rewardFacts({...c,sorobanResult:null},b,r,d),/RewardEvidenceMissing/);
  assert.throws(()=>rewardFacts({...c,events:[]},b,r,d),/TokenTransferEvidenceMissing/);
  assert.throws(()=>rewardFacts(fixture(100000000n),b,r,d),/RewardReceiptMismatch/);
  assert.throws(()=>rewardFacts(fixture(d.rewardAmount,ACTORS.service),b,r,d),/RewardReceiptMismatch/);
  assert.throws(()=>rewardFacts(c,{...b,rewardState:'PENDING'},r,d),/RewardEvidenceMissing/);
});
