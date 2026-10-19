import test from 'node:test';
import assert from 'node:assert/strict';
import { Account,Address,Contract,Networks,Operation,SorobanDataBuilder,Transaction,TransactionBuilder,rpc,xdr } from '@stellar/stellar-sdk';
import { TestnetTransport,validateAuth,effectMatches } from '../src/testnet/transport.ts';
import { ACTORS,CONTRACT,TOKEN,invocation } from '../src/testnet/abi.ts';
import { TestnetRpc } from '../src/testnet/rpc.ts';
import { NETWORK_ID,type TransactionIdentity } from '../src/testnet/identity.ts';
import type { Work } from '../src/testnet/store.ts';
import type { Command,Deployment,Battery } from '../src/domain.ts';
import { localDb,harness } from './testnet-fixtures.ts';
import type { TransactionTransport } from '../src/testnet/worker.ts';
const h='01'.repeat(32);
const d:Deployment={deploymentId:'test',mode:'TESTNET',schemaVersion:1,networkId:NETWORK_ID,contractAddress:CONTRACT,
  admin:ACTORS.admin,service:ACTORS.service,rewardToken:TOKEN,rewardAmount:100000000n};
function rootAuth(c:Command){const args=invocation(c).args;
  const call=new Contract(CONTRACT).call(c.kind,...args);assert.equal(call.body.type,'invokeHostFunction');if(call.body.type!=='invokeHostFunction')throw Error();
  const f=call.body.invokeHostFunctionOp.hostFunction;assert.equal(f.type,'hostFunctionTypeInvokeContract');if(f.type!=='hostFunctionTypeInvokeContract')throw Error();
  const root=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(f.invokeContract),subInvocations:[]});
  const auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:root})];
  if(c.kind==='confirm_collection')auth.push(new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddressV2(new xdr.SorobanAddressCredentials({
    address:new Address(ACTORS.collector).toScAddress(),nonce:1n,signatureExpirationLedger:0,signature:xdr.ScVal.scvVoid()})),rootInvocation:root}));
  return auth;
}
function fixture(){
  const c:Command={kind:'register_battery',batteryId:'BYE-W1-002-FIXTURE',registrationHash:h};
  const v=invocation(c);const w:Work={...d,operationId:'fixture',sourceAccount:ACTORS.admin,command:c,contextHash:h,
    argumentsXdr:v.args.map(a=>a.toXDR('base64')),state:'CLAIMED',dispatchAttempts:0,confirmation:null,stateEvidence:null};
  const raw:rpc.Api.RawSimulateTransactionResponse={id:'1',latestLedger:10,minResourceFee:'1000',
    transactionData:new SorobanDataBuilder().setResourceFee('1000').build().toXDR('base64'),results:[{auth:rootAuth(c).map(a=>a.toXDR('base64')),xdr:xdr.ScVal.scvVoid().toXDR('base64')}]};
  class FakeRpc extends TestnetRpc {
    override async account(a:string){return {account:new Account(a,'5'),balance:'1000000000',ledger:10};}
    override async simulate(){return raw;}
    override async network(){return {passphrase:Networks.TESTNET,protocolVersion:'29'};}
    override async latest(){return {id:'x',sequence:10,closeTime:'1000',protocolVersion:'29'};}
  }
  let signs=0,guards=0;const client=new FakeRpc();
  const transport=new TestnetTransport(client,{authorize:async()=>{signs++;throw Error();},signEnvelope:async()=>{signs++;throw Error();}},
    {validate:async()=>{guards++;}},async()=>w,'test');
  transport.readiness=async()=>({latest:await client.latest(),config:d});
  return {c,w,raw,client,transport,signs:()=>signs,guards:()=>guards};
}
test('real preparation rejects wrong network/contract/source/arguments before signing',async()=>{
  for(const patch of [{networkId:h},{contractAddress:TOKEN},{sourceAccount:ACTORS.service},{argumentsXdr:[]}]){
    const f=fixture();await assert.rejects(f.transport.prepareAndSimulate({...f.w,...patch}));assert.equal(f.signs(),0);
  }
});
test('simulation failure has no inferred fee or signature',async()=>{
  const f=fixture();f.raw.error='contract-error';delete f.raw.minResourceFee;
  await assert.rejects(f.transport.prepareAndSimulate(f.w),/SimulationFailed/);assert.equal(f.signs(),0);
});
test('restore preamble and restoration list reject before signing',async()=>{
  const f=fixture();f.raw.restorePreamble={minResourceFee:'1',transactionData:f.raw.transactionData!};
  await assert.rejects(f.transport.prepareAndSimulate(f.w),/UnexpectedRestoration/);
  delete f.raw.restorePreamble;
  const data=xdr.SorobanTransactionData.fromXDR(f.raw.transactionData!,'base64');
  const obj=data.toXdrObject();obj.ext={v:1,resourceExt:{archivedSorobanEntries:[0]}};
  f.raw.transactionData=xdr.SorobanTransactionData.fromXdrObject(obj).toXDR('base64');
  await assert.rejects(f.transport.prepareAndSimulate(f.w),/UnexpectedRestoration/);assert.equal(f.signs(),0);
});
test('fee cap rejects before signing; ordinary resource+classic fee preserved',async()=>{
  const f=fixture();f.raw.minResourceFee='50000001';await assert.rejects(f.transport.prepareAndSimulate(f.w),/SignerFeeCap/);
  f.raw.minResourceFee='1000';const result=await f.transport.prepareAndSimulate(f.w);
  assert.equal(new Transaction(result.transactionXdr,Networks.TESTNET).fee,'11000');assert.equal(f.signs(),0);
});
test('recipient mismatch guard runs before any preparation or signer',async()=>{
  const f=fixture();f.transport.guard.validate=async()=>{throw Error('RecipientSnapshotMismatch');};
  await assert.rejects(f.transport.prepareAndSimulate(f.w),/RecipientSnapshotMismatch/);assert.equal(f.signs(),0);
});
test('collection simulation must have both SERVICE source and COLLECTOR entries',()=>{
  const c:Command={kind:'confirm_collection',batteryId:'BYE-FIXTURE',requestId:h,collector:ACTORS.collector,
    evidence:{version:1,batteryId:'BYE-FIXTURE',requestId:h,kind:'COLLECTION',payloadHash:h}};
  const a=rootAuth(c),v=invocation(c);
  for(const auth of [a,[a[0]],[a[1]]]){
    const call=new Contract(CONTRACT).call(c.kind,...v.args);if(call.body.type!=='invokeHostFunction')throw Error();
    const op=Operation.invokeHostFunction({func:call.body.invokeHostFunctionOp.hostFunction,auth});
    const tx=new TransactionBuilder(new Account(ACTORS.service,'1'),{fee:'10000',networkPassphrase:Networks.TESTNET}).addOperation(op).setTimeout(120).build();
    if(auth.length===2)validateAuth(tx,c);else assert.throws(()=>validateAuth(tx,c),/UnexpectedAuthorization/);
  }
});
test('later lifecycle states prove exact registration/open/collection, never arbitrary commitment',()=>{
  const b:Battery={state:'RECYCLED',rewardState:'SENT',registrationHash:h,requestId:h,collector:ACTORS.collector,collectionHash:h,recycler:ACTORS.recycler,recyclingHash:h};
  assert.ok(effectMatches({kind:'register_battery',batteryId:'BYE-X',registrationHash:h},b,null,d));
  assert.ok(effectMatches({kind:'open_return',batteryId:'BYE-X',requestId:h,recipient:ACTORS.admin},b,{batteryId:'BYE-X',recipient:ACTORS.admin,state:'CONFIRMED'},d));
  assert.ok(!effectMatches({kind:'register_battery',batteryId:'BYE-X',registrationHash:'02'.repeat(32)},b,null,d));
});
test('sequence drift after durable dispatch intent prevents send and records reviewed hold',async()=>{
  const db=await localDb();try{const f=await harness(db);
    (f.transport as TransactionTransport).assertSourceSequence=async()=>{throw Error('REVIEWED_RESOLUTION_REQUIRED');};
    await assert.rejects(f.worker.run(f.op,'test'),/REVIEWED_RESOLUTION_REQUIRED/);
    assert.equal(f.transport.submitted.length,0);assert.ok(await f.store.identity(f.op));assert.ok(await f.store.requiresReview(f.op));
    const signs=f.transport.signCount;await f.worker.run(f.op,'recovery');assert.equal(f.transport.signCount,signs);assert.equal(f.transport.submitted.length,0);
  }finally{await db.close();}
});
test('identity persistence failure cannot reach dispatch',async()=>{
  const db=await localDb();try{const f=await harness(db);f.store.persist=async()=>{throw Error('PersistenceFailed');};
    await assert.rejects(f.worker.run(f.op,'test'),/PersistenceFailed/);assert.equal(f.transport.submitted.length,0);
  }finally{await db.close();}
});
test('real observation retains actual confirmation ledger and distinguishes SUCCESS/FAILED/NOT_FOUND',async()=>{
  const f=fixture(),hash='05'.repeat(32);
  const identity:TransactionIdentity={deploymentId:'test',operationId:f.w.operationId,networkId:NETWORK_ID,contractAddress:CONTRACT,
    sourceAccount:ACTORS.admin,sequence:'6',envelopeBytes:new Uint8Array(),transactionHash:hash,contextHash:h,minTime:'0',maxTime:'1200',authorizationExpirations:[],preparedLedger:10};
  const meta=xdr.TransactionMeta.v3(new xdr.TransactionMetaV3({ext:xdr.ExtensionPoint.v0(),txChangesBefore:[],operations:[],txChangesAfter:[],sorobanMeta:null})).toXDR('base64');
  f.transport.config=async()=>d;
  f.transport.battery=async()=>({value:{state:'REGISTERED',rewardState:'NOT_ELIGIBLE',registrationHash:h,requestId:null,collector:null,collectionHash:null,recycler:null,recyclingHash:null},ledger:12});
  for(const status of [rpc.Api.GetTransactionStatus.SUCCESS,rpc.Api.GetTransactionStatus.FAILED,rpc.Api.GetTransactionStatus.NOT_FOUND]){
    const result=new xdr.TransactionResult({feeCharged:1000n,result:status==='SUCCESS'?xdr.TransactionResultResult.txSuccess([]):xdr.TransactionResultResult.txFailed([]),ext:xdr.TransactionResultExt.v0()}).toXDR('base64');
    f.client.transaction=async input=>{assert.equal(input,hash);return {status,txHash:hash,ledger:11,createdAt:1010,latestLedger:12,latestLedgerCloseTime:1020,resultXdr:result,resultMetaXdr:meta,events:[]};};
    const observed=await f.transport.observe(identity);assert.equal(observed.status,status);
    if(observed.status!=='NOT_FOUND'){assert.equal(observed.confirmation.confirmationLedger,11);assert.equal(observed.confirmation.observationLedger,12);
      if(status==='SUCCESS')assert.equal(observed.confirmation.facts?.battery.state,'REGISTERED');}
  }
});
