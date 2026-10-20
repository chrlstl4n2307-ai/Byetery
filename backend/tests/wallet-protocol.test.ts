import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, hash } from '@stellar/stellar-sdk';
import { Ed25519WalletVerifier } from '../src/application/wallet.ts';
import { walletMessage } from '../src/wallet-message.ts';
import type { WalletChallenge } from '../src/wallet-verifier.ts';

// Public verification vectors from stellar-protocol/ecosystem/sep-0053.md v1.0.0.
// Only public address, messages and signatures are retained; no published test seed.
const address='GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L';
const vectors=[
  [Buffer.from('Hello, World!'),'fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA=='],
  [Buffer.from('こんにちは、世界！'),'CDU265Xs8y3OWbB/56H9jPgUss5G9A0qFuTqH2zs2YDgTm+++dIfmAEceFqB7bhfN3am59lCtDXrCtwH2k1GBA=='],
  [Buffer.from('2zZDP1sa1BVBfLP7TeeMk3sUbaxAkUhBhDiNdrksaFo=','base64'),'VA1+7hefNwv2NKScH6n+Sljj15kLAge+M2wE7fzFOf+L0MMbssA1mwfJZRyyrhBORQRle10X1Dxpx+UOI4EbDQ=='],
] as const;
const verifier=new Ed25519WalletVerifier();
const base:WalletChallenge={signingScheme:'SEP53_V2',id:'test',userId:'test',networkId:'ab'.repeat(32),address,domain:'byetery-dev',nonce:'aa'.repeat(32),message:new Uint8Array(),expiresAt:new Date('2099-01-01')};
for(const [i,[message,signature]] of vectors.entries()) test(`official SEP-53 vector ${i+1}: SDK and actual verifier`,async()=>{
  const proof=Buffer.from(signature,'base64'),key=Keypair.fromPublicKey(address);
  assert.equal(key.verifyMessage(message,proof),true);
  assert.equal((await verifier.verify({...base,message},proof,new Date())).verified,true);
  assert.equal((await verifier.verify({...base,message,signingScheme:'RAW_ED25519_V1'},proof,new Date())).verified,false);
});
test('legacy signature only accepted under persisted legacy scheme and before expiry',async()=>{
  const key=Keypair.random(),message=Buffer.from('{"version":1,"domain":"byetery-dev"}'),proof=key.sign(message);
  const c={...base,address:key.publicKey(),message,signingScheme:'RAW_ED25519_V1' as const};
  assert.equal((await verifier.verify(c,proof,new Date())).verified,true);
  assert.equal((await verifier.verify({...c,signingScheme:'SEP53_V2'},proof,new Date())).verified,false);
  assert.equal((await verifier.verify(c,proof,c.expiresAt)).verified,false);
});
test('Freighter prefix/hash is compatible; changed message and wrong account rejected',async()=>{
  const key=Keypair.random(),message=Buffer.from('Byetery - Verify wallet control\nVersion: 2');
  const proof=key.sign(hash(Buffer.concat([Buffer.from('Stellar Signed Message:\n'),message])));
  assert.deepEqual(proof,key.signMessage(message));
  const c={...base,address:key.publicKey(),message};
  assert.equal((await verifier.verify(c,proof,new Date())).verified,true);
  assert.equal((await verifier.verify({...c,message:Buffer.concat([message,Buffer.from(' ')])},proof,new Date())).verified,false);
  assert.equal((await verifier.verify({...c,address:Keypair.random().publicKey()},proof,new Date())).verified,false);
});
test('unknown/missing scheme fails closed, with no algorithm fallback',async()=>{
  const key=Keypair.random(),message=Buffer.from('test');
  for(const signingScheme of [undefined,'v1','SEP53']) {
    assert.equal((await verifier.verify({...base,address:key.publicKey(),message,signingScheme} as WalletChallenge,key.sign(message),new Date())).verified,false);
  }
});
test('wire text is deterministic independently of object property order',()=>{
  const fields={deploymentId:'dep',id:'id',userId:'user',networkId:'ab',address,nonce:'cd',expiresAt:'2099-01-01T00:00:00.000Z'};
  const message=walletMessage(fields);
  assert.equal(message,walletMessage(Object.fromEntries(Object.entries(fields).reverse()) as typeof fields));
  assert.equal(message,[
    'Byetery - Verify wallet control','Domain: byetery-dev','Purpose: LINK_WALLET','Version: 2','Signing scheme: SEP53_V2',
    'Deployment: dep','Challenge: id','User: user','Network: Testnet','Network ID: ab',`Address: ${address}`,'Nonce: cd',
    'Expires at: 2099-01-01T00:00:00.000Z','This signature links your address to Byetery DEV. It does not authorize a transaction.',
  ].join('\n'));
  assert.ok(!message.includes('\r')&&!message.endsWith('\n'));
  assert.throws(()=>walletMessage({...fields,id:'id\nVersion: 1'}));
});
