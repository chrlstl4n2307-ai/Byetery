import test from 'node:test';
import assert from 'node:assert/strict';
import { Account, Contract, Networks, Transaction, TransactionBuilder, nativeToScVal, SorobanDataBuilder } from '@stellar/stellar-sdk';
import { LocalSecureStoreSigner, signerProcess } from '../src/local-secure-store-signer.ts';
import type { SigningRequest } from '../src/stellar-signer.ts';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const SERVICE='GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX';
function request(): SigningRequest {
  const tx=new TransactionBuilder(new Account(SERVICE,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET})
    .addOperation(new Contract('CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON').call('pay_reward',nativeToScVal('BYE-OFFLINE-TEST',{type:'string'})))
    .setSorobanData(new SorobanDataBuilder().build()).setTimeout(120).build();
  return {transactionXdr:tx.toXDR(),networkPassphrase:Networks.TESTNET,currentLedger:1,expirationLedger:100,method:'pay_reward',expectedSigners:[SERVICE]};
}
function protectedRequest():SigningRequest{
  const r=request();
  const tx=new TransactionBuilder(new Account(SERVICE,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET})
    .addOperation(new Contract('CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON').call('pay_reward',
      nativeToScVal('BYE-D3-R1-20261111-DCDE088CA870',{type:'string'})))
    .setSorobanData(new SorobanDataBuilder().build()).setTimeout(120).build();
  return {...r,transactionXdr:tx.toXDR()};
}
test('reserved battery cannot downgrade to v1/v2 signing or use only a spawn permission',async()=>{
  let spawns=0;const signer=new LocalSecureStoreSigner(async()=>{spawns++;throw Error('MustNotRun');});
  const r={...protectedRequest(),startAuthorized:async<T>(start:(valid:()=>void)=>Promise<T>)=>start(()=>{})};
  await assert.rejects(signer.sign(r),/D324KeyUseAuthorityRequired/);
  await assert.rejects(signer.authorize(r),/D324KeyUseAuthorityRequired/);
  assert.equal(spawns,0);
});
test('protected child receives only its fresh v3 context and both phases reenter authority',async()=>{
  let permits=0;const phaseRequests:Record<string,unknown>[]=[];
  const signer=new LocalSecureStoreSigner(async(raw,_observer,before)=>{
    before!();phaseRequests.push(JSON.parse(raw));
    return {exitCode:1,stdout:'',stderr:''};
  });
  const r={...protectedRequest(),withKeyUse:async<T>(use:Parameters<NonNullable<SigningRequest['withKeyUse']>>[0])=>{
    permits++;
    return use({schema:'BYETERY_D324_KEY_USE_V1',operationId:'10000000-0000-0000-0000-000000000001',
      contextHash:'a'.repeat(64),instanceId:'b'.repeat(64),leaseGeneration:'1',notAfter:Date.now()+10000},()=>{},async()=>{}) as Promise<T>;
  }};
  await assert.rejects(signer.authorize(r),/SignerProcessFailed/);
  await assert.rejects(signer.signEnvelope(r,Buffer.from(new Transaction(r.transactionXdr,Networks.TESTNET).hash()).toString('hex')),/SignerProcessFailed/);
  assert.equal(permits,2);assert.equal(phaseRequests[0].version,3);
  assert.equal(phaseRequests[0].phase,'authorize');assert.equal('key_use' in phaseRequests[0],true);
  assert.equal(phaseRequests[1].phase,'sign_envelope');assert.equal(phaseRequests[1].version,3);
});
test('timeout waits for confirmed process close before the authority callback can release its locks',async()=>{
  const events:string[]=[];
  await assert.rejects(signerProcess(process.execPath,100)('setInterval(()=>{},1000)',
    {started:()=>events.push('started'),closed:()=>events.push('closed')}),/SignerTimeout/);
  events.push('rejected');assert.deepEqual(events,['started','closed','rejected']);
});
test('child key-load and final-use handshakes fail closed if custody changes during preparation',async()=>{
  for(const revoke of [false,true]){
    let uses=0,permits=0;
    const launch=((_binary:string,_args:readonly string[],options:Parameters<typeof spawn>[2])=>{
      const child=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/d324-child.mjs',import.meta.url))],options);
      child.stdout!.on('data',(b:Buffer)=>{if(b.toString().includes('syntheticKeyUses'))uses++;});
      return child;
    }) as typeof spawn;
    const result=signerProcess(process.execPath,5000,launch)('{}',undefined,undefined,async()=>{
      permits++;if(revoke&&permits===2)throw new Error('SyntheticCustodyLost');
    });
    if(revoke)await assert.rejects(result,/D324KeyUseAuthorityRejected/);
    else assert.equal((await result).exitCode,0);
    assert.equal(permits,2);assert.equal(uses,revoke?0:1);
  }
});
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
