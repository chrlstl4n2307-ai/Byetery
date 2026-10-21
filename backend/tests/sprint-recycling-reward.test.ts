import test from 'node:test';
import assert from 'node:assert/strict';
import {Account,Contract,Networks,Operation,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {recyclingAuthNegatives,checkTrustline} from '../src/testnet/sprint-recycling-reward.ts';
import {ACTORS,CONTRACT,invocation} from '../src/testnet/abi.ts';
import type {Command} from '../src/domain.ts';
import {localDb,harness} from './testnet-fixtures.ts';
import {TransportStore} from '../src/testnet/store.ts';
import {LocalTransactionWorker} from '../src/testnet/worker.ts';
function fixture(){
 const command:Command={kind:'confirm_recycling',batteryId:'BYE-W1-004-OFFLINE',requestId:'31'.repeat(32),recycler:ACTORS.recycler,
 evidence:{version:1,batteryId:'BYE-W1-004-OFFLINE',requestId:'31'.repeat(32),kind:'RECYCLING',payloadHash:'32'.repeat(32)}};
 const op=new Contract(CONTRACT).call(command.kind,...invocation(command).args);assert.equal(op.body.type,'invokeHostFunction');if(op.body.type!=='invokeHostFunction')throw Error();
 const func=op.body.invokeHostFunctionOp.hostFunction;assert.equal(func.type,'hostFunctionTypeInvokeContract');if(func.type!=='hostFunctionTypeInvokeContract')throw Error();
 const root=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(func.invokeContract),subInvocations:[]});
 const auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:root})];
 const build=(entries:typeof auth)=>new TransactionBuilder(new Account(ACTORS.recycler,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeHostFunction({func,auth:entries})).setTimebounds(0,1000).build();
 return {command,auth,build};
}
test('recycling negative guards reject missing authorization and wrong actor without mutating positive bytes',()=>{
 const f=fixture(),tx=f.build(f.auth),raw=tx.toXDR();assert.deepEqual(recyclingAuthNegatives(tx,f.command),{missingRecycler:'PASS',wrongRecycler:'PASS',invalidBroadcasts:0});assert.equal(tx.toXDR(),raw);assert.equal(tx.signatures.length,0);
});
test('recycling negative proof cannot use an invalid positive auth structure',()=>{
 const f=fixture();assert.throws(()=>recyclingAuthNegatives(f.build([]),f.command),/UnexpectedAuthorization/);
});
test('asset acceptance requires authorization, not merely maintain-liabilities authorization',()=>{
 assert.doesNotThrow(()=>checkTrustline(1,'0','100000000','0'));
 for(const flags of [0,2])assert.throws(()=>checkTrustline(flags,'0','1000000000','0'),/RecipientTrustlineNotAuthorized/);
});
test('asset acceptance accounts for existing balance and buying liabilities at exact ten-token boundary',()=>{
 assert.doesNotThrow(()=>checkTrustline(1,'200000000','350000000','50000000'));
 assert.throws(()=>checkTrustline(1,'200000000','349999999','50000000'),/RecipientTrustlineCapacity/);
});
test('lost send response, NOT_FOUND, RPC outage and worker restart resolve original durable hash once',async()=>{
 const db=await localDb();try{
  const f=await harness(db);f.transport.loseSubmit=true;
  assert.equal(await f.worker.run(f.op,'sent-response-lost'),'SUBMITTED_OR_UNKNOWN');const identity=await f.store.identity(f.op);assert.ok(identity);
  const restarted=new LocalTransactionWorker(new TransportStore(f.adapter),f.transport,f.project);
  assert.equal(await restarted.run(f.op,'not-found'),'SUBMITTED_OR_UNKNOWN');assert.equal(f.projectionCount(),0);
  f.transport.outage=true;assert.equal(await restarted.run(f.op,'rpc-down'),'SUBMITTED_OR_UNKNOWN');assert.equal(f.projectionCount(),0);
  f.transport.outage=false;f.transport.success=true;assert.equal(await restarted.run(f.op,'rpc-restored'),'PROJECTED');await restarted.run(f.op,'replay');
  assert.equal(f.projectionCount(),1);assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
  assert.ok(f.transport.observed.every(h=>h===identity.transactionHash));assert.equal((await f.store.work(f.op)).dispatchAttempts,1);assert.deepEqual((await f.store.identity(f.op))?.envelopeBytes,identity.envelopeBytes);
 }finally{await db.close();}
});
