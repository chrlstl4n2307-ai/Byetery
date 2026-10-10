// Explicit opt-in offline suite: accesses the four approved Testnet identities.
// Sequence=1 and auth expiration=100 make fixtures unusable on live Testnet.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Account, Address, Contract, Networks, Operation, TransactionBuilder, Transaction, SorobanDataBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { LocalSecureStoreSigner, signerProcess } from '../src/local-secure-store-signer.ts';
import type { SigningRequest } from '../src/stellar-signer.ts';
const ACTORS={admin:'GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F',service:'GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX',collector:'GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V',recycler:'GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2'};
const binary=path.resolve(fileURLToPath(new URL('../../',import.meta.url)),'tools/stellar-secure-store-signer/target/debug/byetery-secure-store-signer.exe');
const run=signerProcess(binary,60000),signer=new LocalSecureStoreSigner(run);
function prepared(method: string, v2=false): SigningRequest {
  const id='BYE-OFFLINE-TEST',rid='01'.repeat(32);
  const str=(s:string)=>nativeToScVal(s,{type:'string'}),bytes=(s:string)=>xdr.ScVal.scvBytes(Buffer.from(s,'hex'));
  const evidence=xdr.ScVal.scvMap([
    ['battery_id',str(id)],['kind',xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(method==='confirm_collection'?'Collection':'Recycling')])],
    ['payload_hash',bytes(rid)],['request_id',bytes(rid)],['version',xdr.ScVal.scvU32(1)],
  ].map(([key,val])=>new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol(key as string),val:val as xdr.ScVal})));
  const args: xdr.ScVal[]=method==='register_battery'?[str(id),bytes(rid)]:method==='open_return'?[str(id),bytes(rid),new Address(ACTORS.admin).toScVal()]:method==='cancel_return'?[str(id),bytes(rid)]:method==='confirm_collection'?[str(id),bytes(rid),new Address(ACTORS.collector).toScVal(),evidence]:method==='confirm_recycling'?[str(id),bytes(rid),new Address(ACTORS.recycler).toScVal(),evidence]:[str(id)];
  const op=new Contract('CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON').call(method,...args);
  assert.equal(op.body.type,'invokeHostFunction');if(op.body.type!=='invokeHostFunction')throw Error('Invalid fixture');
  const func=op.body.invokeHostFunctionOp.hostFunction;
  if(func.type!=='hostFunctionTypeInvokeContract')throw Error('Invalid fixture');
  const root=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(func.invokeContract),subInvocations:[]});
  const auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:root})];
  if(method==='confirm_collection') {
    const credentials=new xdr.SorobanAddressCredentials({address:new Address(ACTORS.collector).toScAddress(),nonce:1n,signatureExpirationLedger:0,signature:xdr.ScVal.scvVoid()});
    auth.push(new xdr.SorobanAuthorizationEntry({credentials:v2?xdr.SorobanCredentials.sorobanCredentialsAddressV2(credentials):xdr.SorobanCredentials.sorobanCredentialsAddress(credentials),rootInvocation:root}));
  }
  const source=method==='register_battery'?ACTORS.admin:method==='confirm_recycling'?ACTORS.recycler:ACTORS.service;
  const tx=new TransactionBuilder(new Account(source,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET})
    .addOperation(Operation.invokeHostFunction({func,auth})).setSorobanData(new SorobanDataBuilder().build()).setTimeout(120).build();
  return {transactionXdr:tx.toXDR(),networkPassphrase:Networks.TESTNET,currentLedger:1,expirationLedger:100,method,expectedSigners:method==='confirm_collection'?[ACTORS.service,ACTORS.collector]:[source]};
}
for(const method of ['register_battery','open_return','cancel_return','confirm_recycling','pay_reward']) {
  test(`SecureStore offline ${method}: envelope signature verified`,async()=>{
    const r=await signer.sign(prepared(method));assert.equal(r.signers.length,1);
    assert.equal(new Transaction(r.transactionXdr,Networks.TESTNET).signatures.length,1);
  });
}
for(const v2 of [false,true]) test(`SERVICE + COLLECTOR cryptographically verified (${v2?'V2':'V1'})`,async()=>{
  const r=await signer.sign(prepared('confirm_collection',v2));assert.deepEqual(r.signers,[ACTORS.service,ACTORS.collector]);
  const envelope=new Transaction(r.transactionXdr,Networks.TESTNET).toEnvelope();assert.equal(envelope.type,'envelopeTypeTx');
  if(envelope.type!=='envelopeTypeTx')throw Error('Invalid result');
  const body=envelope.v1.tx.operations[0].body;if(body.type!=='invokeHostFunction')throw Error('Invalid result');
  assert.equal(body.invokeHostFunctionOp.auth.length,2);
  assert.equal(body.invokeHostFunctionOp.auth[0].credentials.type,'sorobanCredentialsSourceAccount');
  assert.equal(body.invokeHostFunctionOp.auth[1].credentials.type,v2?'sorobanCredentialsAddressV2':'sorobanCredentialsAddress');
});
test('helper JSON parseable, rejects identity selection and malformed input without diagnostics',async()=>{
  for(const input of ['invalid',JSON.stringify({version:1,identity:'unapproved'}),'x'.repeat(131073)]) {
    if(input.length>131072) {await assert.rejects(run(input),/SignerInputTooLarge/);continue;}
    const r=await run(input);assert.equal(r.exitCode,1);assert.equal(r.stderr,'');
    const parsed=JSON.parse(r.stdout);assert.equal(parsed.status,'error');assert.deepEqual(Object.keys(parsed).sort(),['code','status']);
    assert.ok(!/\bS[A-Z2-7]{55}\b/.test(r.stdout+r.stderr));
  }
});
test('helper has no RPC or submit call sites',async()=>{
  const {readFile}=await import('node:fs/promises');
  const lib=await readFile(new URL('../../tools/stellar-secure-store-signer/src/lib.rs',import.meta.url),'utf8');
  assert.ok(!/\.rpc_client\(|send_transaction|sendTransaction|reqwest::|TcpStream|Client::new/.test(lib));
});
