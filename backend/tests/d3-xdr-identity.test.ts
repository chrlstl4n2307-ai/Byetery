import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Address,Keypair,Networks,Transaction,xdr} from '@stellar/stellar-sdk';
import {operationPresentation,operationStatus} from '../src/application/operation-status.ts';
import {submitAndObserveOperation} from '../src/d3/live-operator.ts';
import {assertPersistedEnvelope,finalizedBody,signedEnvelopeDigest,type TransactionIdentity} from '../src/testnet/identity.ts';
import {TransportStore} from '../src/testnet/store.ts';
import {DurableTransactionWorker,LocalTransactionWorker} from '../src/testnet/worker.ts';
import {incidentFixture} from './d3-close-fixture.ts';
import {harness,localDb} from './testnet-fixtures.ts';

type Fixture=Awaited<ReturnType<typeof harness>>;
type Transform=(i:TransactionIdentity,f:Fixture)=>TransactionIdentity|null;
let db:Awaited<ReturnType<typeof localDb>>;
before(async()=>{db=await localDb();});
after(async()=>{await db.close();});

function envelope(bytes:Uint8Array){
  const tx=new Transaction(Buffer.from(bytes).toString('base64'),Networks.TESTNET);
  const env=tx.toEnvelope();
  if(env.type!=='envelopeTypeTx')assert.fail('unexpected fixture envelope');
  return {tx,env};
}
function signedBytes(tx:xdr.Transaction,signatures:xdr.DecoratedSignature[]){
  return Buffer.from(xdr.TransactionEnvelope.envelopeTypeTx(new xdr.TransactionV1Envelope({tx,signatures})).toXDR());
}
function restart(f:Fixture,alter:Transform){
  const store=new TransportStore(f.adapter),read=store.identity.bind(store);
  store.identity=async id=>{const i=await read(id);return i?alter(i,f):null;};
  return {store,worker:new LocalTransactionWorker(store,f.transport,f.project,()=>Number(f.transport.closeTime))};
}
async function reachPastMargin(f:Fixture){
  await f.worker.run(f.op,'original-fixture');
  f.transport.closeTime='1311';f.transport.ledger=40;
  const identity=await f.store.identity(f.op);
  assert.ok(identity);
  return identity;
}
const identityCases:[string,Transform][]=[
  ['missing identity',()=>null],
  ['missing XDR',i=>({...i,envelopeBytes:Buffer.alloc(0)})],
  ['truncated XDR',i=>({...i,envelopeBytes:i.envelopeBytes.slice(0,-1)})],
  ['unreadable XDR',i=>({...i,envelopeBytes:Buffer.from([255,255,255,255])})],
  ['changed signature, same body hash',(i,f)=>{
    const {tx}=envelope(i.envelopeBytes);
    assert.equal(f.key.verify(tx.hash(),tx.signatures[0].signature.toBytes()),true);
    const bytes=Buffer.from(i.envelopeBytes);bytes[bytes.length-1]^=1;
    const altered=envelope(bytes).tx;
    assert.deepEqual(altered.hash(),tx.hash());
    assert.equal(f.key.verify(altered.hash(),altered.signatures[0].signature.toBytes()),false);
    return {...i,envelopeBytes:bytes};
  }],
  ['missing signature',i=>{const {env}=envelope(i.envelopeBytes);return {...i,envelopeBytes:signedBytes(env.v1.tx,[])};}],
  ['wrong signer with correct hint',i=>{
    const {tx,env}=envelope(i.envelopeBytes),other=Keypair.random();
    const signature=other.sign(tx.hash());assert.equal(other.verify(tx.hash(),signature),true);
    const decorated=new xdr.DecoratedSignature({hint:env.v1.signatures[0].hint,signature});
    return {...i,envelopeBytes:signedBytes(env.v1.tx,[decorated])};
  }],
  ['correct signature with changed hint',i=>{
    const {env}=envelope(i.envelopeBytes),original=env.v1.signatures[0];
    const hint=Buffer.from(original.hint.toBytes());hint[0]^=1;
    return {...i,envelopeBytes:signedBytes(env.v1.tx,[new xdr.DecoratedSignature({hint,signature:original.signature})])};
  }],
  ['extra signature',i=>{
    const {tx,env}=envelope(i.envelopeBytes);
    return {...i,envelopeBytes:signedBytes(env.v1.tx,[...env.v1.signatures,Keypair.random().signDecorated(tx.hash())])};
  }],
  ['wrong signing passphrase',(i,f)=>{
    const {env}=envelope(i.envelopeBytes);
    const tx=new Transaction(signedBytes(env.v1.tx,[]).toString('base64'),Networks.FUTURENET);
    tx.sign(f.key);
    const decoded=envelope(Buffer.from(tx.toXDR(),'base64')).tx;
    assert.equal(Buffer.from(decoded.hash()).toString('hex'),i.transactionHash);
    return {...i,envelopeBytes:Buffer.from(tx.toXDR(),'base64')};
  }],
  ['wrong network metadata',i=>({...i,networkId:'ab'.repeat(32)})],
  ['wrong durable hash',i=>({...i,transactionHash:'cd'.repeat(32)})],
  ['wrong source',i=>({...i,sourceAccount:Keypair.random().publicKey()})],
  ['wrong sequence',i=>({...i,sequence:String(BigInt(i.sequence)+1n)})],
  ['wrong minTime',i=>({...i,minTime:'1001'})],
  ['wrong maxTime',i=>({...i,maxTime:'1301'})],
  ['unsupported Preconditions V2',(i,f)=>{
    const {env}=envelope(i.envelopeBytes),wire=env.v1.tx.toXdrObject();
    assert.equal(wire.cond.type,1);
    if(wire.cond.type!==1)assert.fail('expected time bounds');
    const body=xdr.Transaction.fromXdrObject({...wire,cond:{type:2,v2:{
      timeBounds:wire.cond.timeBounds,ledgerBounds:{minLedger:1,maxLedger:100},
      minSeqNum:1n,minSeqAge:0n,minSeqLedgerGap:0,extraSigners:[],
    }}});
    const tx=new Transaction(signedBytes(body,[]).toString('base64'),Networks.TESTNET);
    tx.sign(f.key);
    return {...i,envelopeBytes:Buffer.from(tx.toXDR(),'base64'),transactionHash:Buffer.from(tx.hash()).toString('hex')};
  }],
  ['re-signed body and metadata disagree with immutable intent',(i,f)=>{
    const {env}=envelope(i.envelopeBytes),wire=env.v1.tx.toXdrObject();
    assert.equal(wire.cond.type,1);
    if(wire.cond.type!==1)assert.fail('expected time bounds');
    const body=xdr.Transaction.fromXdrObject({...wire,cond:{type:1,timeBounds:{...wire.cond.timeBounds,maxTime:1301n}}});
    const tx=new Transaction(signedBytes(body,[]).toString('base64'),Networks.TESTNET);tx.sign(f.key);
    return {...i,envelopeBytes:Buffer.from(tx.toXDR(),'base64'),maxTime:'1301',transactionHash:Buffer.from(tx.hash()).toString('hex')};
  }],
];

for(const [label,alter] of identityCases)test('D3-14B restart with '+label+' stays UNCERTAIN_OPEN',async()=>{
  const f=await harness(db,false,undefined,false,'d3:identity-'+label);
  const original=await reachPastMargin(f);
  const reads=f.transport.observed.length;
  const {store,worker}=restart(f,alter);
  assert.equal(await worker.run(f.op,'restart'), 'SUBMITTED_OR_UNKNOWN');
  assert.equal(await store.hasIdentityHold(f.op),true);
  assert.equal(await worker.run(f.op,'restart-again'),'SUBMITTED_OR_UNKNOWN');
  const work=await f.store.work(f.op);
  const dto=operationPresentation({id:f.op,state:'UNKNOWN',transport_state:work.state,
    transaction_hash:label==='missing identity'?null:original.transactionHash,
    dispatch_attempts:work.dispatchAttempts,identity_uncertain:await store.hasIdentityHold(f.op),review_required:false,interrupted:false});
  assert.equal(dto.class,'UNCERTAIN_OPEN');assert.equal(dto.terminal,false);assert.equal(dto.result,null);
  assert.equal(dto.reviewRequired,true);
  assert.equal(f.transport.observed.length,reads);
  assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);
  assert.equal(f.transport.submitted.length,1);assert.equal(work.dispatchAttempts,1);
  assert.deepEqual(await f.store.identity(f.op),original);
});

for(const [label,oldest,expected] of [['complete',1,'EXPIRED_NOT_APPLIED'],['gap before dispatch',2,'EXPIRED_UNRESOLVED']] as const){
  test('D3-14B valid signature with '+label+' retention proof',async()=>{
    const f=await harness(db),original=await reachPastMargin(f);
    assertPersistedEnvelope(original,await f.store.work(f.op));
    f.transport.oldestLedger=oldest;
    const {store,worker}=restart(f,i=>i);
    assert.equal(await worker.run(f.op,'restart'),expected);
    assert.equal(await store.hasIdentityHold(f.op),false);
    const intent=(await db.query<{evidence:{envelopeSha256:string}}>(
      "select evidence from api_private.testnet_observations where operation_id=$1 and kind='DISPATCH_INTENT'",[f.op])).rows[0];
    assert.equal(intent.evidence.envelopeSha256,signedEnvelopeDigest(original.envelopeBytes));
    const persisted=(await db.query<{digest:string}>(`select evidence->>'envelopeSha256' as digest
      from api_private.testnet_observations where operation_id=$1
      and evidence->>'phase'='IDENTITY_PERSIST_COMMITTED'`,[f.op])).rows[0];
    assert.equal(persisted.digest,intent.evidence.envelopeSha256);
    assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
  });
}

for(const corrupt of [false,true])test('D3-14B distinct pre-auth and final Soroban bodies '+(corrupt?'reject stale XDR':'bind final XDR'),async()=>{
  const f=await harness(db,false,undefined,true);
  let priorSigned:Buffer|undefined;
  f.transport.attachSorobanAuthorization=async prepared=>{
    const tx=new Transaction(prepared.transactionXdr,Networks.TESTNET),env=tx.toEnvelope();
    if(env.type!=='envelopeTypeTx')assert.fail('fixture type');
    const op=env.v1.tx.operations[0].body;
    if(op.type!=='invokeHostFunction'||op.invokeHostFunctionOp.hostFunction.type!=='hostFunctionTypeInvokeContract')assert.fail('fixture invocation');
    const call=op.invokeHostFunctionOp.hostFunction.invokeContract,collector=Keypair.random();
    const rootInvocation=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),subInvocations:[]});
    const nonce=1n,signatureExpirationLedger=60;
    const preimage=xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({
      networkId:createHash('sha256').update(Networks.TESTNET).digest(),nonce,signatureExpirationLedger,invocation:rootInvocation,
    }));
    const sig=collector.sign(createHash('sha256').update(preimage.toXDR()).digest());
    const beforeHash=Buffer.from(tx.hash()).toString('hex');tx.sign(f.key);priorSigned=Buffer.from(tx.toXDR(),'base64');
    op.invokeHostFunctionOp.auth.push(new xdr.SorobanAuthorizationEntry({
      rootInvocation,credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
        address:new Address(collector.publicKey()).toScAddress(),nonce,signatureExpirationLedger,
        signature:xdr.ScVal.scvVec([xdr.ScVal.scvBytes(sig)]),
      })),
    }));
    const transactionXdr=env.toXDR('base64');
    assert.notEqual(Buffer.from(new Transaction(transactionXdr,Networks.TESTNET).hash()).toString('hex'),beforeHash);
    return {...prepared,transactionXdr};
  };
  const original=await reachPastMargin(f);
  assert.ok(priorSigned);
  const {store,worker}=restart(f,i=>corrupt?{...i,envelopeBytes:priorSigned!}:i);
  assert.equal(await worker.run(f.op,'restart'),corrupt?'SUBMITTED_OR_UNKNOWN':'EXPIRED_NOT_APPLIED');
  assert.equal(await store.hasIdentityHold(f.op),corrupt);
  assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
  assert.deepEqual(await f.store.identity(f.op),original);
});

test('D3-14B pre-sign guard rejects unsupported ledger and sequence preconditions',async()=>{
  const f=await harness(db),work=await f.store.work(f.op),prepared=await f.transport.prepareAndSimulate(work);
  const {env}=envelope(Buffer.from(prepared.transactionXdr,'base64')),wire=env.v1.tx.toXdrObject();
  assert.equal(wire.cond.type,1);
  if(wire.cond.type!==1)assert.fail('fixture bounds');
  const body=xdr.Transaction.fromXdrObject({...wire,cond:{type:2,v2:{
    timeBounds:wire.cond.timeBounds,ledgerBounds:{minLedger:1,maxLedger:100},
    minSeqNum:1n,minSeqAge:0n,minSeqLedgerGap:0,extraSigners:[],
  }}});
  assert.throws(()=>finalizedBody(work,{...prepared,transactionXdr:signedBytes(body,[]).toString('base64')}),/UnsupportedEnvelopePreconditions/);
});

test('D3-14B actual authorized status GET surfaces durable hold without exposing XDR',async()=>{
  const f=await incidentFixture();
  try{
    const claim=await f.store.claim(f.op,'fixture-intent');
    await f.store.persist(claim,f.identity);
    await f.store.dispatchIntent(claim,false);
    await f.store.release(claim);
    await f.worker.run(f.op,'fixture-restart');
    const dto=await operationStatus(f.repo,{authUserId:f.user,sessionId:f.session},{id:f.op});
    assert.equal(dto.class,'UNCERTAIN_OPEN');assert.equal(dto.terminal,false);
    assert.equal(dto.reviewRequired,true);assert.doesNotMatch(JSON.stringify(dto),/envelope|signature/i);
    assert.equal(f.transport.prepareCount+f.transport.signCount+f.transport.submitted.length+f.transport.observed.length,0);
  }finally{await f.pg.close();}
});

test('D3-14B lost POST response and missing durable hash stop as UNCERTAIN_OPEN without replay',async()=>{
  const id='10000000-0000-0000-0000-000000000014',hash='ab'.repeat(32);
  let elapsed=0,posts=0,reads=0;
  await assert.rejects(submitAndObserveOperation(async()=>{posts++;return null;},async pinned=>{
    const missing=reads++>0;
    assert.equal(pinned,missing?id:null);
    return operationPresentation({id,state:'UNKNOWN',transport_state:'SUBMITTED_OR_UNKNOWN',
      transaction_hash:missing?null:hash,dispatch_attempts:1,review_required:false,interrupted:false});
  },async()=>{},{now:()=>elapsed,sleep:async ms=>{elapsed+=ms;}}),/^Error: UNCERTAIN_OPEN$/);
  assert.equal(posts,1);assert.equal(reads,2);
});

test('D3-14B real routing rejects a locally valid signature from an unexpected source',async()=>{
  const f=await harness(db);await reachPastMargin(f);
  Object.defineProperty(f.transport,'scope',{value:'TESTNET'});
  const worker=new DurableTransactionWorker(new TransportStore(f.adapter),f.transport,f.project);
  const reads=f.transport.observed.length;
  assert.equal(await worker.run(f.op,'wrong-real-route'),'SUBMITTED_OR_UNKNOWN');
  assert.equal(await f.store.hasIdentityHold(f.op),true);
  assert.equal(f.transport.observed.length,reads);assert.equal(f.transport.submitted.length,1);
});

test('D3-14B post-persist corruption before dispatch cannot create intent or send',async()=>{
  const f=await harness(db);
  const read=f.store.identity.bind(f.store);
  f.store.identity=async id=>{
    const i=await read(id);
    if(!i)return null;
    const bytes=Buffer.from(i.envelopeBytes);bytes[bytes.length-1]^=1;
    return {...i,envelopeBytes:bytes};
  };
  assert.equal(await f.worker.run(f.op,'corrupted-read'),'READY');
  const w=await f.store.work(f.op);
  assert.equal(w.dispatchAttempts,0);assert.equal(await f.store.hasIdentityHold(f.op),true);
  assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,0);
});
