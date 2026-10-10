import test from 'node:test';
import assert from 'node:assert/strict';
import { Account, Contract, Networks, TransactionBuilder, nativeToScVal, SorobanDataBuilder } from '@stellar/stellar-sdk';
import { LocalSecureStoreSigner, signerProcess } from '../src/local-secure-store-signer.ts';
import type { SigningRequest } from '../src/stellar-signer.ts';
const SERVICE='GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX';
function request(): SigningRequest {
  const tx=new TransactionBuilder(new Account(SERVICE,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET})
    .addOperation(new Contract('CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON').call('pay_reward',nativeToScVal('BYE-OFFLINE-TEST',{type:'string'})))
    .setSorobanData(new SorobanDataBuilder().build()).setTimeout(120).build();
  return {transactionXdr:tx.toXDR(),networkPassphrase:Networks.TESTNET,currentLedger:1,expirationLedger:100,method:'pay_reward',expectedSigners:[SERVICE]};
}
test('wrong network rejects before launching helper',async()=>{
  let calls=0;const s=new LocalSecureStoreSigner(async()=>{calls++;throw Error();});
  await assert.rejects(s.sign({...request(),networkPassphrase:Networks.PUBLIC}),/WrongNetwork/);assert.equal(calls,0);
});
test('client-selected identity/method/signer cannot launch helper',async()=>{
  let calls=0;const s=new LocalSecureStoreSigner(async()=>{calls++;throw Error();});
  await assert.rejects(s.sign({...request(),expectedSigners:['unapproved']}),/SignerNotAllowed/);
  await assert.rejects(s.sign({...request(),method:'set_role'}),/SignerNotAllowed/);assert.equal(calls,0);
});
test('invalid XDR rejects before launching helper',async()=>{
  let calls=0;const s=new LocalSecureStoreSigner(async()=>{calls++;throw Error();});
  await assert.rejects(s.sign({...request(),transactionXdr:'invalid'}),/InvalidXdr/);assert.equal(calls,0);
});
test('process failures redact both streams',async()=>{
  const fakeSecret='S'+'A'.repeat(55);
  const s=new LocalSecureStoreSigner(async()=>({exitCode:1,stdout:fakeSecret,stderr:fakeSecret}));
  try {await s.sign(request());assert.fail('must reject');}catch(e){assert.equal((e as Error).message,'SignerProcessFailed');assert.ok(!String(e).includes(fakeSecret));}
});
test('unexpected stderr is never propagated',async()=>{
  const s=new LocalSecureStoreSigner(async()=>({exitCode:0,stdout:'{}',stderr:'sensitive helper diagnostics'}));
  await assert.rejects(s.sign(request()),/SignerUnexpectedStderr/);
});
test('malformed and oversized output rejected',async()=>{
  for(const output of ['not json','x'.repeat(131073),JSON.stringify({status:'signed',signed_xdr:'invalid',method:'pay_reward',signers:[SERVICE]})]) {
    const s=new LocalSecureStoreSigner(async()=>({exitCode:0,stdout:output,stderr:''}));
    await assert.rejects(s.sign(request()),/SignerInvalidOutput|SignerOutputTooLarge/);
  }
});
test('process is bounded by timeout',async()=>{
  const run=signerProcess(process.execPath,100);
  await assert.rejects(run('setTimeout(()=>{},10000)'),/SignerTimeout/);
});
test('process input size bounded before execution',async()=>{
  await assert.rejects(signerProcess(process.execPath)('x'.repeat(131073)),/SignerInputTooLarge/);
});
test('child does not inherit backend credentials',async()=>{
  const prior=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='dummy-test-only';
  try {const result=await signerProcess(process.execPath)("console.log(typeof process.env.SUPABASE_SERVICE_ROLE_KEY)");assert.equal(result.exitCode,0);assert.equal(result.stdout.trim(),'undefined');}
  finally {if(prior===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=prior;}
});
