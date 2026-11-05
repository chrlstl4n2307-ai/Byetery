import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {Account,Contract,Keypair,Networks,Operation,Transaction,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {TestnetRpc} from '../src/testnet/rpc.ts';
import {TestnetTransport} from '../src/testnet/transport.ts';
import {ACTORS,CONTRACT,invocation} from '../src/testnet/abi.ts';
import {ENVELOPE_TIME_POLICY,NETWORK_ID,type Observation,type TransactionIdentity} from '../src/testnet/identity.ts';
import type {Work} from '../src/testnet/store.ts';
import {TransportStore} from '../src/testnet/store.ts';
import {LocalTransactionWorker} from '../src/testnet/worker.ts';
import {deferredSigning} from '../src/application/deferred-signing.ts';
import {HISTORICAL_BATTERY,HISTORICAL_DEPLOYMENT} from '../src/application/historical-lifecycle.ts';
import {operationPresentation,operationStatus} from '../src/application/operation-status.ts';
import {harness,localDb} from './testnet-fixtures.ts';
import {permissionFixture} from './d2-authority-fixture.ts';
import {Coordinator} from '../src/application/coordinator.ts';
import {TestnetStellarService} from '../src/testnet/service.ts';
import {SupabaseAuth} from '../src/application/auth.ts';
import {api,listen,close} from '../src/application/http.ts';
import {pglitePool,incidentFixture} from './d3-close-fixture.ts';
import {Repository} from '../src/application/repository.ts';

let db:Awaited<ReturnType<typeof localDb>>;
before(async()=>{db=await localDb();});
after(async()=>{await db.close();});
const response=(r:unknown)=>new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:r}));
function signingFixture(){
  const command={kind:'register_battery' as const,batteryId:'BYE-D3-14C-FIXTURE',registrationHash:'ab'.repeat(32)};
  const args=invocation(command).args,call=new Contract(CONTRACT).call(command.kind,...args);
  assert.equal(call.body.type,'invokeHostFunction');if(call.body.type!=='invokeHostFunction')throw Error();
  const func=call.body.invokeHostFunctionOp.hostFunction;
  assert.equal(func.type,'hostFunctionTypeInvokeContract');if(func.type!=='hostFunctionTypeInvokeContract')throw Error();
  const root=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(func.invokeContract),subInvocations:[]});
  const auth=[new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),rootInvocation:root})];
  const tx=new TransactionBuilder(new Account(ACTORS.admin,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET})
    .addOperation(Operation.invokeHostFunction({func,auth})).setTimebounds(0,1180).build();
  const w:Work={command,sourceAccount:ACTORS.admin,networkId:NETWORK_ID,contractAddress:CONTRACT,argumentsXdr:args.map(v=>v.toXDR('base64')),
    deploymentId:'fixture',operationId:randomUUID(),contextHash:'ab'.repeat(32),principal:randomUUID(),state:'PREPARING',dispatchAttempts:0,confirmation:null,stateEvidence:null};
  const calls={authorize:0,sign:0,submit:0,broadcast:0};
  const signer={authorize:async()=>{calls.authorize++;return {transactionXdr:tx.toXDR(),signers:[ACTORS.admin]};},
    signEnvelope:async()=>{calls.sign++;return {transactionXdr:tx.toXDR(),signers:[ACTORS.admin]};}};
  const rpc=new TestnetRpc(async(_url,init)=>{
    const m=JSON.parse(String(init?.body)).method;
    if(m==='getNetwork')return response({passphrase:Networks.TESTNET,protocolVersion:'29'});
    if(m==='getLatestLedger')return response({sequence:10,closeTime:'1000',id:'local',protocolVersion:'29'});
    if(m==='sendTransaction'){calls.broadcast++;throw Error('No broadcast');}
    throw Error('Unexpected RPC '+m);
  });
  const transport=new TestnetTransport(rpc,signer,{validate:async()=>{}},async()=>w,'fixture');
  transport.submit=async()=>{calls.submit++;throw Error('No submit');};
  return {tx,w,calls,transport};
}
const timeWire=(f:ReturnType<typeof signingFixture>,maxTime:number|null)=>{
  const e=f.tx.toEnvelope();assert.equal(e.type,'envelopeTypeTx');if(e.type!=='envelopeTypeTx')throw Error();
  const wire=e.v1.tx.toXdrObject();
  return xdr.TransactionEnvelope.envelopeTypeTx(new xdr.TransactionV1Envelope({tx:xdr.Transaction.fromXdrObject({...wire,
    cond:maxTime===null?{type:0}:{type:1,timeBounds:{minTime:0n,maxTime:BigInt(maxTime)}}}),signatures:[]})).toXDR('base64');
};
for(const [name,maxTime] of [['missing timebounds',null],['maxTime zero',0],['maxTime expired',1000],['horizon too long',1181],['insufficient time',1049]] as const){
  test('D3-14C pre-sign '+name,async()=>{
    const f=signingFixture(),transactionXdr=timeWire(f,maxTime),body={transactionXdr,preparedLedger:10,transactionHash:'ab'.repeat(32)};
    await assert.rejects(f.transport.signEnvelope(body,f.w));
    // The auth phase has the stricter 90-second minimum and must also refuse.
    await assert.rejects(f.transport.attachSorobanAuthorization(body,f.w));
    assert.deepEqual(f.calls,{authorize:0,sign:0,submit:0,broadcast:0});
  });
}
for(const field of ['ledgerBounds','minSeqNum','minSeqAge','minSeqLedgerGap','extraSigners'] as const){
  test('D3-14C pre-sign V2 '+field,async()=>{
    const f=signingFixture(),env=f.tx.toEnvelope();if(env.type!=='envelopeTypeTx')throw Error();
    const v2={timeBounds:{minTime:0n,maxTime:1180n},ledgerBounds:null,minSeqNum:null,minSeqAge:0n,minSeqLedgerGap:0,extraSigners:[],
      ...field==='ledgerBounds'?{ledgerBounds:{minLedger:1,maxLedger:100}}:field==='minSeqNum'?{minSeqNum:1n}:field==='minSeqAge'?{minSeqAge:1n}:
      field==='minSeqLedgerGap'?{minSeqLedgerGap:1}:{extraSigners:[{type:0 as const,ed25519:Keypair.random().rawPublicKey()}]}};
    const transactionXdr=xdr.TransactionEnvelope.envelopeTypeTx(new xdr.TransactionV1Envelope({tx:xdr.Transaction.fromXdrObject({...env.v1.tx.toXdrObject(),cond:{type:2,v2}}),signatures:[]})).toXDR('base64');
    const body={transactionXdr,preparedLedger:10,transactionHash:'ab'.repeat(32)};
    await assert.rejects(f.transport.signEnvelope(body,f.w),/UnsupportedEnvelopePreconditions/);
    await assert.rejects(f.transport.attachSorobanAuthorization(body,f.w),/UnsupportedEnvelopePreconditions/);
    assert.deepEqual(f.calls,{authorize:0,sign:0,submit:0,broadcast:0});
  });
}
for(const kind of ['V0','fee-bump'] as const)test('D3-14C pre-sign rejects '+kind,async()=>{
  const f=signingFixture(),env=f.tx.toEnvelope();if(env.type!=='envelopeTypeTx')throw Error();
  const wire=env.v1.tx.toXdrObject();
  const encoded=kind==='fee-bump'
    ?TransactionBuilder.buildFeeBumpTransaction(Keypair.random().publicKey(),'10000',f.tx,Networks.TESTNET).toXDR()
    :xdr.TransactionEnvelope.envelopeTypeTxV0(new xdr.TransactionV0Envelope({tx:xdr.TransactionV0.fromXdrObject({
      sourceAccountEd25519:Keypair.fromPublicKey(ACTORS.admin).rawPublicKey(),fee:wire.fee,seqNum:wire.seqNum,timeBounds:{minTime:0n,maxTime:1180n},
      memo:wire.memo,operations:wire.operations,ext:{v:0}}),signatures:[]})).toXDR('base64');
  const body={transactionXdr:encoded,preparedLedger:10,transactionHash:'ab'.repeat(32)};
  await assert.rejects(f.transport.signEnvelope(body,f.w),/UnsupportedEnvelope/);
  await assert.rejects(f.transport.attachSorobanAuthorization(body,f.w),/UnsupportedEnvelope/);
  assert.deepEqual(f.calls,{authorize:0,sign:0,submit:0,broadcast:0});
});
test('D3-14C numeric policy and exact signing boundaries',async()=>{
  assert.deepEqual(ENVELOPE_TIME_POLICY,{validitySeconds:180,minimumBeforeAuthorization:90,minimumBeforeEnvelopeSignature:50,
    minimumBeforeDispatch:15,expiryMarginSeconds:10,maxLedgerAgeSeconds:30,maxLedgerLeadSeconds:60});
  const f=signingFixture();
  await f.transport.attachSorobanAuthorization({transactionXdr:timeWire(f,1090),preparedLedger:10},f.w);
  await f.transport.signEnvelope({transactionXdr:timeWire(f,1050),preparedLedger:10,transactionHash:'ab'.repeat(32)},f.w);
  assert.deepEqual(f.calls,{authorize:1,sign:1,submit:0,broadcast:0});
});
test('D3-14C authorization refuses 89 seconds without invoking signer',async()=>{
  const f=signingFixture();
  await assert.rejects(f.transport.attachSorobanAuthorization({transactionXdr:timeWire(f,1089),preparedLedger:10},f.w),/InvalidSigningWindow/);
  assert.deepEqual(f.calls,{authorize:0,sign:0,submit:0,broadcast:0});
});
for(const [remaining,submitted] of [[14,0],[15,1],[180,1],[181,0]] as const)test('D3-14C dispatch remaining boundary '+remaining,async()=>{
  const f=await harness(db);f.transport.envelopeMaxTime=1120+remaining;
  await f.worker.run(f.op,'dispatch-boundary');assert.equal(f.transport.submitted.length,submitted);
});
for(const [age,closed] of [[30,true],[31,false],[-60,true],[-61,false]] as const)test('D3-14C RPC freshness boundary '+age,async()=>{
  const f=await harness(db);await f.worker.run(f.op,'first');f.transport.closeTime='1311';f.transport.ledger=40;
  const w=new LocalTransactionWorker(new TransportStore(f.adapter),f.transport,f.project,()=>1311+age);
  assert.equal(await w.run(f.op,'restart'),closed?'EXPIRED_NOT_APPLIED':'EXPIRED_UNRESOLVED');
  assert.equal(f.transport.submitted.length,1);assert.equal(f.transport.signCount,1);
});

for(const mode of ['coherent','stale-plus-fresh','retention-mixed','retention-unavailable','context-unavailable','wrong-network','futurenet'] as const){
  test('D3-14C atomic RPC closure '+mode,async()=>{
    const f=await harness(db);await f.worker.run(f.op,'first');
    f.transport.closeTime='1311';f.transport.ledger=40;const original=(await f.store.identity(f.op))!;
    const methods:string[]=[];
    const raw={status:'NOT_FOUND',latestLedger:40,latestLedgerCloseTime:'1311',oldestLedger:1};
    const client=new TestnetRpc(async(_url,init)=>{
      const {method}=JSON.parse(String(init?.body));methods.push(method);
      if(method==='getNetwork')return response({passphrase:mode==='wrong-network'?Networks.PUBLIC:mode==='futurenet'?Networks.FUTURENET:Networks.TESTNET});
      if(method==='getTransaction')return response(mode==='stale-plus-fresh'?{...raw,latestLedger:20,latestLedgerCloseTime:'1000'}:
        mode==='retention-unavailable'?{...raw,oldestLedger:undefined}:mode==='retention-mixed'?{...raw,oldestLedger:31}:raw);
      // A tempting fresh node / external retention source must never be consulted.
      if(method==='getLatestLedger'||method==='getHealth')return response({sequence:40,closeTime:'1311',oldestLedger:1});
      throw Error('No mutating RPC');
    });
    if(mode==='context-unavailable'){
      const other=new TestnetRpc(async()=>response(raw));
      client.transaction=async hash=>({...await other.transaction(hash)});
    }
    if(mode==='retention-mixed'){
      const originalLookup=client.transaction.bind(client),other=new TestnetRpc(async()=>response(raw));
      client.transaction=async hash=>({...await originalLookup(hash),oldestLedger:(await other.transaction(hash)).oldestLedger});
    }
    const deny=deferredSigning(async()=>{throw Error('Signer must not load');});
    const read=new TestnetTransport(client,deny,{validate:async()=>{throw Error('Not a signing flow');}},id=>f.store.work(id),f.d,undefined,()=>1311);
    f.transport.observe=i=>read.observe(i);
    const restarted=new LocalTransactionWorker(new TransportStore(f.adapter),f.transport,f.project,()=>1311);
    const state=await restarted.run(f.op,'restart');
    assert.equal(state,mode==='coherent'?'EXPIRED_NOT_APPLIED':'SUBMITTED_OR_UNKNOWN');
    if(mode!=='coherent'){
      const dto=operationPresentation({id:f.op,state:'UNKNOWN',transport_state:state,transaction_hash:original.transactionHash,
        dispatch_attempts:1,review_required:false,interrupted:false,rpc_uncertain:await f.store.hasRpcUncertainty(f.op)});
      assert.equal(dto.class,'UNCERTAIN_OPEN');
    }
    assert.equal(methods.filter(m=>m==='getLatestLedger'||m==='getHealth'||m==='sendTransaction'||m==='simulateTransaction').length,0);
    assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
    assert.deepEqual(await f.store.identity(f.op),original);
  });
}

for(const seq of ['0','1','5','-1','unreadable','stale'] as const)test('D3-14C exact source proof '+seq,async()=>{
  const f=await harness(db);await f.worker.run(f.op,'first');f.transport.closeTime='1311';f.transport.ledger=40;
  if(seq==='unreadable')f.transport.sourceSequenceForClosure=async()=>{throw Error('Read unavailable');};
  else if(seq==='stale')f.transport.sourceSequenceForClosure=async()=>({sequence:'0',ledger:39});
  else f.transport.sourceSequenceForClosure=async()=>({sequence:seq,ledger:40});
  const worker=new LocalTransactionWorker(new TransportStore(f.adapter),f.transport,f.project,()=>1311);
  const state=await worker.run(f.op,'restart');assert.equal(state,seq==='0'?'EXPIRED_NOT_APPLIED':'EXPIRED_UNRESOLVED');
  assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
});

for(const invalid of [false,true])test('D3-14C restart is independent of signer constructor and Secure Store '+invalid,async()=>{
  const f=await harness(db);await f.worker.run(f.op,'first');f.transport.closeTime='1311';f.transport.ledger=40;
  const counts={constructor:0,secureStore:0,imports:0};
  const accessor=()=>{counts.secureStore++;throw Error('Secure Store forbidden');};
  const port=deferredSigning(async()=>{counts.constructor++;accessor();throw Error('Constructor forbidden');});
  const hook=registerHooks({resolve(specifier,context,next){if(specifier.includes('local-secure-store-signer')){counts.imports++;throw Error('Signer import forbidden');}return next(specifier,context);}});
  try{
    const store=new TransportStore(f.adapter),identity=store.identity.bind(store);
    if(invalid)store.identity=async id=>{const i=(await identity(id))!;const bytes=Buffer.from(i.envelopeBytes);bytes[bytes.length-1]^=1;return {...i,envelopeBytes:bytes};};
    f.transport.signEnvelope=body=>port.signEnvelope({...body,networkPassphrase:Networks.TESTNET,currentLedger:40,expirationLedger:80,method:f.command.kind,expectedSigners:[]},body.transactionHash).then(v=>v.transactionXdr);
    f.transport.attachSorobanAuthorization=body=>port.authorize({...body,networkPassphrase:Networks.TESTNET,currentLedger:40,expirationLedger:80,method:f.command.kind,expectedSigners:[]}).then(v=>({...body,transactionXdr:v.transactionXdr}));
    const worker=new LocalTransactionWorker(store,f.transport,f.project,()=>1311);
    await worker.run(f.op,'restart');await worker.run(f.op,'repeat-restart');
    assert.equal(await store.hasIdentityHold(f.op),invalid);
    assert.equal((await store.work(f.op)).state,invalid?'SUBMITTED_OR_UNKNOWN':'EXPIRED_NOT_APPLIED');
    assert.deepEqual(counts,{constructor:0,secureStore:0,imports:0});assert.equal(f.transport.submitted.length,1);
  }finally{hook.deregister();}
});
test('D3-14C composition imports signer only inside deferred signing callback',async()=>{
  const source=await readFile(new URL('../src/application/server.ts',import.meta.url),'utf8');
  assert.match(source,/deferredSigning\(async\(\)=>\{\s*const \{LocalSecureStoreSigner,signerProcess\}=await import/);
  for(const path of ['testnet/identity.ts','testnet/worker.ts','testnet/store.ts','testnet/transport.ts','testnet/service.ts','application/deferred-signing.ts']){
    const code=await readFile(new URL('../src/'+path,import.meta.url),'utf8');
    assert.doesNotMatch(code,/local-secure-store-signer|SecureStore\s*\(|fromSecret\s*\(/);
  }
});
test('D3-14C authenticated status reads durable RPC uncertainty and clears it on a coherent observation',async()=>{
  const f=await incidentFixture();
  try{
    const c=await f.store.claim(f.op,'rpc-status-fixture');
    await f.store.persist(c,f.identity);await f.store.dispatchIntent(c,false);
    await f.store.unknown(c,'RPC_OUTAGE',{transactionHash:f.identity.transactionHash,classification:'UNCERTAIN_OPEN'});
    const dto=await operationStatus(f.repo,{authUserId:f.user,sessionId:f.session},{id:f.op});
    assert.equal(dto.class,'UNCERTAIN_OPEN');assert.equal(dto.terminal,false);assert.equal(dto.reviewRequired,true);
    assert.equal(await f.store.hasIdentityHold(f.op),false);assert.equal(await f.store.hasRpcUncertainty(f.op),true);
    assert.doesNotMatch(JSON.stringify(dto),/signature|envelope/i);
    await f.store.observed(c,'SUBMITTED_OR_UNKNOWN','NOT_FOUND',{classification:'UNCERTAIN_OPEN'});
    assert.equal(await f.store.hasRpcUncertainty(f.op),false);
    assert.equal((await operationStatus(f.repo,{authUserId:f.user,sessionId:f.session},{id:f.op})).class,'SUBMITTED_UNKNOWN');
    await f.store.release(c);
  }finally{await f.pg.close();}
});

for(const scenario of ['before-submit','lost-response','during-reconciliation'] as const)test('D3-14C restart boundary '+scenario,async()=>{
  const f=await harness(db,false,undefined,false,'d3:14c-'+scenario);
  if(scenario==='before-submit'){
    const intent=f.store.dispatchIntent.bind(f.store);
    f.store.dispatchIntent=async(...args)=>{await intent(...args);throw Error('Offline crash after committed intent');};
    await assert.rejects(f.worker.run(f.op,'first'),/Offline crash/);
  }else{
    f.transport.loseSubmit=scenario==='lost-response';
    await f.worker.run(f.op,'first');
  }
  const original=(await f.store.identity(f.op))!,submits=f.transport.submitted.length;
  assert.equal(submits,scenario==='before-submit'?0:1);
  assert.equal(await f.store.firstDispatchLedger(original),15);
  f.transport.closeTime='1311';f.transport.ledger=40;
  const store=new TransportStore(f.adapter),worker=new LocalTransactionWorker(store,f.transport,f.project,()=>1311);
  await worker.run(f.op,'restart');await worker.run(f.op,'restart-again');
  assert.deepEqual(await store.identity(f.op),original);
  assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,submits);
  assert.equal((await store.work(f.op)).state,'EXPIRED_NOT_APPLIED');
  assert.ok(f.transport.observed.every(h=>h===original.transactionHash));
  await assert.rejects(worker.retrySameHash({operationId:f.op,transactionHash:original.transactionHash,decisionId:'fixture'},'no-replay'),/D3ReplayForbidden/);
});

for(const kind of ['V0','fee-bump'] as const)test('D3-14C invalid persisted envelope type '+kind,async()=>{
  const f=await harness(db);await f.worker.run(f.op,'first');
  const store=new TransportStore(f.adapter),read=store.identity.bind(store);
  store.identity=async id=>{
    const identity=(await read(id))!,tx=new Transaction(Buffer.from(identity.envelopeBytes).toString('base64'),Networks.TESTNET),env=tx.toEnvelope();
    if(env.type!=='envelopeTypeTx')throw Error();const wire=env.v1.tx.toXdrObject();
    const encoded=kind==='fee-bump'?TransactionBuilder.buildFeeBumpTransaction(Keypair.random().publicKey(),'10000',tx,Networks.TESTNET).toXDR():
      xdr.TransactionEnvelope.envelopeTypeTxV0(new xdr.TransactionV0Envelope({tx:xdr.TransactionV0.fromXdrObject({sourceAccountEd25519:f.key.rawPublicKey(),
        fee:wire.fee,seqNum:wire.seqNum,timeBounds:{minTime:1000n,maxTime:1300n},memo:wire.memo,operations:wire.operations,ext:{v:0}}),signatures:env.v1.signatures})).toXDR('base64');
    return {...identity,envelopeBytes:Buffer.from(encoded,'base64')};
  };
  const reads=f.transport.observed.length;
  await new LocalTransactionWorker(store,f.transport,f.project).run(f.op,'restart');
  assert.equal(await store.hasIdentityHold(f.op),true);assert.equal(f.transport.observed.length,reads);
  assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
});
test('D3-14C full-envelope persist digest mismatch is an explicit durable hold',async()=>{
  const f=await harness(db);await f.worker.run(f.op,'first');
  const store=new TransportStore({transaction:work=>f.adapter.transaction(sql=>work({query:async<T>(s:string,p?:unknown[])=>{
    const result=await sql.query<T>(s,p);
    return s.includes("evidence->>'envelopeSha256' as digest")?{rows:[{digest:'00'.repeat(32)}] as T[]}:result;
  }}))});
  await new LocalTransactionWorker(store,f.transport,f.project).run(f.op,'restart');
  assert.equal(await store.hasIdentityHold(f.op),true);assert.equal(f.transport.prepareCount,1);
  assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
});

for(const outcome of ['FAILED','EXPIRED_NOT_INCLUDED','UNCERTAIN_OPEN'] as const)test('D3-14C no automatic lifecycle continuation '+outcome,async()=>{
  const {submitAndObserveOperation}=await import('../src/d3/live-operator.ts');let posts=0,elapsed=0;
  const id=randomUUID(),hash='ab'.repeat(32);
  const pending=submitAndObserveOperation(async()=>{posts++;return {operationId:id,transactionHash:hash};},async()=>
    operationPresentation({id,state:outcome==='FAILED'?'REJECTED':'UNKNOWN',transport_state:outcome==='FAILED'?'CONFIRMED_FAILED':outcome==='EXPIRED_NOT_INCLUDED'?'EXPIRED_NOT_APPLIED':'EXPIRED_UNRESOLVED',
      transaction_hash:hash,dispatch_attempts:1,review_required:false,interrupted:false}),async()=>{},{now:()=>elapsed,sleep:async ms=>{elapsed+=ms;}});
  if(outcome==='UNCERTAIN_OPEN')await assert.rejects(pending,/UNCERTAIN_OPEN/);
  else{const receipt=await pending;assert.equal(receipt.result,outcome==='FAILED'?'FAILED':'NOT_APPLIED');}
  assert.equal(posts,1);
});
for(const outcome of ['FAILED','EXPIRED_NOT_INCLUDED','UNCERTAIN_OPEN'] as const)test('D3-14C API rejects a new-key replacement '+outcome,async()=>{
  const pg=await localDb();
  try{
    const f=await harness(pg,false,undefined,false,'d3:14c-stop-'+outcome);
    f.transport.failChain=outcome==='FAILED';await f.worker.run(f.op,'first');
    if(outcome==='EXPIRED_NOT_INCLUDED'||outcome==='UNCERTAIN_OPEN'){
      f.transport.closeTime='1311';f.transport.ledger=40;
      if(outcome==='UNCERTAIN_OPEN')f.transport.oldestLedger=16;
      await f.worker.run(f.op,'safe-close');
    }
    const work=await f.store.work(f.op),user=work.principal;
    await pg.exec('create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
    await pg.query('insert into auth.sessions values($1,$1,null)',[user]);
    const repo=Object.assign(Object.create(Repository.prototype) as Repository,{pool:pglitePool(pg),deploymentId:f.d,mode:'TESTNET'});
    const coordinator=new Coordinator(repo);
    const reply=await coordinator.acknowledge({authUserId:user,sessionId:user},{kind:'register'},{batteryId:f.battery},'new-fixture-key');
    assert.equal(reply.status,409);
    assert.equal((reply.body.error as {code:string}).code,'D3LifecycleRequiresOwnerReview');
    assert.equal((await pg.query('select * from app_private.stellar_operations where deployment_id=$1',[f.d])).rows.length,1);
    assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
  }finally{await pg.close();}
});

test('D3-14C historical lifecycle is blocked at real HTTP and service boundaries before all external effects',async()=>{
  const f=await permissionFixture('TESTNET',HISTORICAL_DEPLOYMENT),{repo,db:pg,users}=f;
  const counts={simulate:0,loadSigner:0,submit:0,processor:0};
  const d=HISTORICAL_DEPLOYMENT,b=HISTORICAL_BATTERY,rid='ad'.repeat(32),wallet=randomUUID();
  for(const [role,user] of Object.entries(users)){
    await pg.query('insert into auth.sessions values($1,$1,null)',[user]);
    await pg.query("insert into api_private.memberships(deployment_id,user_id,role,actor_address) values($1,$2,$3,$4),($1,$2,'USER',null) on conflict do nothing",[d,user,role,role==='COLLECTOR'?ACTORS.collector:role==='RECYCLER'?ACTORS.recycler:null]);
  }
  await pg.query('insert into app_private.battery_records(deployment_id,battery_id,created_by) values($1,$2,$3)',[d,b,users.USER]);
  await pg.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
    values($1,$2,decode($3,'hex'),$4,$5,'offline-historical-fixture',now())`,[wallet,d,NETWORK_ID,users.USER,Keypair.random().publicKey()]);
  await pg.query(`insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot)
    select $1,decode($2,'hex'),$3,$4,id,address from app_private.wallet_links where id=$5`,[d,rid,b,users.USER,wallet]);
  await pg.transaction(async tx=>{
    await tx.query(`insert into chain_private.return_requests(deployment_id,request_id,battery_id,recipient,state,confirmed_ledger)
      select $1,decode($2,'hex'),$3,address,'CONFIRMED',1 from app_private.wallet_links where id=$4`,[d,rid,b,wallet]);
    await tx.query(`insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,request_id,collector,collection_hash,reward_state,confirmed_ledger)
      values($1,$2,'COLLECTED',decode($3,'hex'),decode($4,'hex'),$5,decode($3,'hex'),'NOT_ELIGIBLE',1)`,[d,b,'aa'.repeat(32),rid,ACTORS.collector]);
    await tx.query("update app_private.return_requests set reservation_state='CONSUMED',association_confirmed_at=now() where deployment_id=$1",[d]);
  });
  const rpc=new TestnetRpc(async(_url,init)=>{const method=JSON.parse(String(init?.body)).method;
    if(method==='simulateTransaction')counts.simulate++;if(method==='sendTransaction')counts.submit++;throw Error('No live RPC');});
  const port=deferredSigning(async()=>{counts.loadSigner++;throw Error('No signer');});
  const service=new TestnetStellarService(repo,rpc,port),processor={process:async(id:string)=>{counts.processor++;return service.process(id);}};
  const coordinator=new Coordinator(repo,{},undefined,processor);
  class Auth extends SupabaseAuth{override async validate(header:string|undefined){const alias=header?.replace('Bearer ','') as keyof typeof users;return {authUserId:users[alias],sessionId:users[alias]};}}
  const server=api(new Auth({} as never),coordinator),origin=await listen(server);
  try{
    for(const [alias,path,body] of [
      ['RECYCLER',`/api/returns/${rid}/recycling`,{evidence:{}}],['USER',`/api/batteries/${b}/reward`,{}],
      ['ADMIN','/api/batteries',{batteryId:b}],['USER',`/api/batteries/${b}/returns`,{}],['COLLECTOR',`/api/returns/${rid}/collection`,{evidence:{}}],
    ] as const){
      for(let replay=0;replay<2;replay++){
        const reply=await fetch(origin+path,{method:'POST',headers:{Authorization:'Bearer '+alias,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(body)});
        assert.equal(reply.status,409);const data=await reply.json() as {error:{code:string}};
        assert.equal(data.error.code,'HistoricalLifecyclePermanentlyNonCounting');
      }
    }
    await assert.rejects(service.prepare(d,{kind:'pay_reward',batteryId:b}),/HistoricalLifecyclePermanentlyNonCounting/);
    await pg.query(`insert into api_private.idempotency(deployment_id,user_id,key,input_hash,response_status,response_body)
      values($1,$2,'historical-cached-fixture',decode($3,'hex'),201,'{"historical":true}')`,[d,users.USER,'aa'.repeat(32)]);
    const cached=await fetch(origin+`/api/batteries/${b}/returns`,{method:'POST',headers:{Authorization:'Bearer USER','Content-Type':'application/json',
      'Idempotency-Key':'historical-cached-fixture'},body:'{}'});
    assert.equal(cached.status,409);assert.equal(((await cached.json()) as {error:{code:string}}).error.code,'HistoricalLifecyclePermanentlyNonCounting');
    // A pre-existing queued operation also cannot resume via scheduler/service.
    const op=randomUUID(),cmd={kind:'pay_reward',batteryId:b};
    await pg.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
      values($1,$2,$3,'offline-historical-recovery','pay_reward',$4,$5,decode($6,'hex'))`,[op,d,users.USER,b,cmd,'aa'.repeat(32)]);
    assert.equal((await service.process(op)).status,409);
    assert.equal((await service.process(op)).status,409);
    assert.deepEqual(counts,{simulate:0,loadSigner:0,submit:0,processor:0});
    assert.equal((await pg.query('select * from api_private.testnet_work where operation_id=$1',[op])).rows.length,0);
    assert.equal((await pg.query('select * from app_private.reward_attempts where deployment_id=$1',[d])).rows.length,0);
    assert.deepEqual((await pg.query('select state,reward_state from chain_private.batteries where deployment_id=$1 and battery_id=$2',[d,b])).rows[0],{state:'COLLECTED',reward_state:'NOT_ELIGIBLE'});
  }finally{await close(server);await pg.close();}
});

test('D3-14C terminal transition between admission reads cannot admit a replacement',async()=>{
  const pg=await localDb();
  try{
    const f=await harness(pg,false,undefined,false,'d3:14c-admission-transition');await f.worker.run(f.op,'first');
    const user=(await f.store.work(f.op)).principal,originalHash=(await f.store.identity(f.op))!.transactionHash;
    await pg.exec('create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
    await pg.query('insert into auth.sessions values($1,$1,null)',[user]);
    const repo=Object.assign(Object.create(Repository.prototype) as Repository,{pool:pglitePool(pg),deploymentId:f.d,mode:'TESTNET'});
    const transaction=repo.transaction.bind(repo);let transitioned=false;
    repo.transaction=work=>transaction(async sql=>{
      const query=sql.query.bind(sql);
      sql.query=(async(statement:string,params?:unknown[])=>{
        const result=await query(statement,params);
        // Deterministic scheduling of the existing worker's terminal writes
        // after the diagnostic read but before admission, in an ephemeral DB.
        if(!transitioned&&statement.startsWith('select 1 from app_private.stellar_operations o join api_private.testnet_work')){
          transitioned=true;assert.equal(result.rows.length,0);
          await query("update api_private.testnet_work set state='CONFIRMED_FAILED',confirmation=$2::jsonb where operation_id=$1",[f.op,JSON.stringify({transactionHash:originalHash})]);
          await query("update app_private.stellar_operations set state='REJECTED' where id=$1",[f.op]);
        }
        return result;
      }) as typeof sql.query;
      return work(sql);
    });
    const reply=await new Coordinator(repo).acknowledge({authUserId:user,sessionId:user},{kind:'register'},{batteryId:f.battery},'after-terminal-key');
    assert.equal(transitioned,true);assert.equal(reply.status,409);
    assert.equal((reply.body.error as {code:string}).code,'OperationInProgress');
    assert.equal((await pg.query('select id from app_private.stellar_operations where deployment_id=$1',[f.d])).rows.length,1);
    assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
  }finally{await pg.close();}
});
