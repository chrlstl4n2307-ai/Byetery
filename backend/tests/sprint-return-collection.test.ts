import test from 'node:test';
import assert from 'node:assert/strict';
import {Account,Address,Contract,Networks,Operation,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {authorizationSummary,collectionAuthNegatives} from '../src/testnet/sprint-return-collection.ts';
import {ACTORS,CONTRACT,invocation} from '../src/testnet/abi.ts';
import type {Command} from '../src/domain.ts';
import {assertNoRoleSimulationError} from '../src/testnet/sprint-collection-recovery.ts';
function fixture(){
 const command:Command={kind:'confirm_collection',batteryId:'BYE-W1-003B-OFFLINE',requestId:'21'.repeat(32),collector:ACTORS.collector,
  evidence:{version:1,batteryId:'BYE-W1-003B-OFFLINE',requestId:'21'.repeat(32),kind:'COLLECTION',payloadHash:'22'.repeat(32)}};
 const operation=new Contract(CONTRACT).call(command.kind,...invocation(command).args);
 assert.equal(operation.body.type,'invokeHostFunction');if(operation.body.type!=='invokeHostFunction')throw Error();
 const func=operation.body.invokeHostFunctionOp.hostFunction;
 assert.equal(func.type,'hostFunctionTypeInvokeContract');if(func.type!=='hostFunctionTypeInvokeContract')throw Error();
 const root=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(func.invokeContract),subInvocations:[]});
 const auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:root}),
  new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddressV2(new xdr.SorobanAddressCredentials({address:new Address(ACTORS.collector).toScAddress(),nonce:9n,signatureExpirationLedger:100,signature:xdr.ScVal.scvVoid()})),rootInvocation:root})];
 const build=(entries:typeof auth)=>new TransactionBuilder(new Account(ACTORS.service,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET})
  .addOperation(Operation.invokeHostFunction({func,auth:entries})).setTimebounds(0,1000).build();
 return {command,auth,build};
}

test('recovery no-role proof requires the frozen contract role error, not an RPC or unrelated failure',()=>{
 assert.doesNotThrow(()=>assertNoRoleSimulationError('HostError: Error(Contract, #9)'));
 for(const error of [undefined,'RPC unavailable','HostError: Error(Contract, #3)','Error(Budget, ExceededLimit)'])
  assert.throws(()=>assertNoRoleSimulationError(error),/NoRoleNegativeNotProven/);
});
test('operator validates negative collection authorizations without changing original bytes',()=>{
 const f=fixture(),tx=f.build(f.auth),before=tx.toXDR();
 assert.deepEqual(collectionAuthNegatives(tx,f.command),{missingService:'PASS',missingCollector:'PASS',wrongCollector:'PASS',broadcasts:0});
 assert.equal(tx.toXDR(),before);assert.equal(tx.signatures.length,0);
});
test('operator cannot certify negatives using a malformed positive auth structure',()=>{
 const f=fixture();for(const entries of [[f.auth[0]],[f.auth[1]],[]])assert.throws(()=>collectionAuthNegatives(f.build(entries),f.command),/UnexpectedAuthorization/);
});
test('public authorization summary preserves roots and actors but omits nonce and signature material',()=>{
 const f=fixture(),summary=authorizationSummary(f.build(f.auth));
 assert.equal(summary.length,2);assert.deepEqual(summary.map(a=>a.address),[ACTORS.service,ACTORS.collector]);
 assert.ok(summary.every(a=>a.contract===CONTRACT&&a.method==='confirm_collection'&&a.argumentCount===4&&a.subInvocations===0));
 assert.equal(summary[1].expirationLedger,100);assert.ok(!JSON.stringify(summary).includes('nonce'));assert.ok(!JSON.stringify(summary).includes('signature'));
});
