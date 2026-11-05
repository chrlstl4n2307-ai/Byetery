import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Account,Contract,Networks,Transaction,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {submitAndObserveOperation} from '../src/d3/live-operator.ts';
import {operationPresentation} from '../src/application/operation-status.ts';
import {ENVELOPE_TIME_POLICY,finalizedBody} from '../src/testnet/identity.ts';
import {TransportStore} from '../src/testnet/store.ts';
import {LocalTransactionWorker} from '../src/testnet/worker.ts';
import {harness,localDb} from './testnet-fixtures.ts';

let db:Awaited<ReturnType<typeof localDb>>;
before(async()=>{db=await localDb();});
after(async()=>{await db.close();});

for(const [name,includeAt] of [['early',117],['after 120 s',121],['after 300 s',305],['last valid ledger',320],['absent',null]] as const){
  test('D3-14A counterexample '+name,async()=>{
    const f=await harness(db,false,undefined,false,'d3:'+name);
    let elapsed=0,post=0,oldDeadlineChecked=false;
    const reads:string[]=[];
    f.transport.envelopeMaxTime=1000+140+ENVELOPE_TIME_POLICY.validitySeconds;
    f.transport.closeTime='1140';
    const receipt=await submitAndObserveOperation(async()=>{
      post++;
      // The application acknowledges queued work before preparation.
      return {operationId:f.op,transactionHash:null};
    },async id=>{
      assert.equal(id,f.op);
      const second=elapsed/1000;
      if(second===110){await f.worker.run(f.op,'initial');}
      if(second===300&&includeAt!==117&&includeAt!==121){
        assert.equal((await f.store.work(f.op)).state,'SUBMITTED_OR_UNKNOWN');
        oldDeadlineChecked=true;
      }
      if(second===includeAt){
        f.transport.success=true;
        f.transport.closeTime=String(1000+second);
        f.transport.ledger=50;
        const observe=f.transport.observe.bind(f.transport);
        f.transport.observe=async identity=>{
          const observation=await observe(identity);
          assert.equal(observation.status,'SUCCESS');
          if(observation.status!=='SUCCESS')assert.fail('expected original success');
          return {...observation,confirmation:{...observation.confirmation,confirmationLedger:50,confirmedAt:1000+second}};
        };
        const restarted=new LocalTransactionWorker(new TransportStore(f.adapter),f.transport,f.project,()=>1000+second);
        await restarted.run(f.op,'restart');
      }
      if(includeAt===null&&second===331){
        f.transport.closeTime='1331';f.transport.ledger=55;
        const original=f.transport.observe.bind(f.transport);
        const validity=f.transport.validity.bind(f.transport);
        const source=f.transport.sourceSequenceForClosure.bind(f.transport);
        f.transport.observe=async i=>{reads.push('hash');return original(i);};
        f.transport.validity=async i=>{reads.push('ledger');return validity(i);};
        f.transport.sourceSequenceForClosure=async()=>{reads.push('sequence');return source();};
        await f.worker.run(f.op,'safe-close');
      }
      const identity=await f.store.identity(f.op),work=await f.store.work(f.op);
      const visible=second>=115;
      return operationPresentation({id:f.op,state:work.state==='PROJECTED'?'CONFIRMED':'UNKNOWN',
        transport_state:visible?work.state:null,transaction_hash:visible?identity?.transactionHash??null:null,
        dispatch_attempts:visible?work.dispatchAttempts:0,review_required:false,interrupted:false});
    },async()=>{}, {now:()=>elapsed,sleep:async ms=>{elapsed+=ms;}});
    const saved=(await f.store.identity(f.op))!;
    assert.equal(saved.maxTime,'1320');assert.equal(receipt.transactionHash,saved.transactionHash);
    assert.equal(post,1);assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);
    assert.equal(f.transport.submitted.length,1);assert.equal((await f.store.work(f.op)).dispatchAttempts,1);
    assert.ok(f.transport.observed.every(hash=>hash===saved.transactionHash));
    assert.equal(await f.store.firstDispatchLedger(saved),15);
    await assert.rejects(f.worker.retrySameHash({operationId:f.op,transactionHash:saved.transactionHash,decisionId:'test-review'},'denied'),/D3ReplayForbidden/);
    assert.equal(f.transport.submitted.length,1);
    if(includeAt===null){
      assert.equal(receipt.result,'NOT_APPLIED');assert.equal(receipt.class,'EXPIRED_NOT_INCLUDED');
      assert.deepEqual(reads,['hash','ledger','hash','sequence']);assert.equal(f.projectionCount(),0);
    }else{
      assert.equal(receipt.result,'SUCCESS');assert.equal(f.projectionCount(),1);
      const confirmation=(await f.store.work(f.op)).confirmation;
      assert.equal(confirmation?.confirmationLedger,50);
      assert.equal(confirmation?.confirmedAt,1000+includeAt);
      assert.equal(receipt.confirmationMode,includeAt<120?'OBSERVED':'RECONCILED_AFTER_OBSERVATION_EXPIRY');
    }
    assert.equal(oldDeadlineChecked,includeAt===null||includeAt>300);
  });
}

for(const [name,close,mutation,expected] of [
  ['before maxTime','1299','none','SUBMITTED_OR_UNKNOWN'],
  ['at maxTime','1300','none','SUBMITTED_OR_UNKNOWN'],
  ['within margin','1309','none','SUBMITTED_OR_UNKNOWN'],
  ['at margin boundary','1310','none','SUBMITTED_OR_UNKNOWN'],
  ['stale ledger','1311','stale','EXPIRED_UNRESOLVED'],
  ['RPC unavailable','1311','outage','SUBMITTED_OR_UNKNOWN'],
  ['retention gap','1311','retention','EXPIRED_UNRESOLVED'],
  ['advanced source sequence','1311','advanced','EXPIRED_UNRESOLVED'],
  ['uncovered source ledger','1311','sourceLag','EXPIRED_UNRESOLVED'],
  ['uncovered final lookup','1311','lookupLag','EXPIRED_UNRESOLVED'],
  ['valid safe absence','1311','none','EXPIRED_NOT_APPLIED'],
] as const){
  test('D3-14A '+name,async()=>{
    const f=await harness(db);await f.worker.run(f.op,'first');
    const saved=(await f.store.identity(f.op))!;
    f.transport.closeTime=close;f.transport.ledger=30;
    if(mutation==='outage')f.transport.outage=true;
    if(mutation==='retention')f.transport.oldestLedger=16;
    if(mutation==='advanced')f.transport.closureSequence='1';
    if(mutation==='sourceLag')f.transport.sourceSequenceForClosure=async()=>({ledger:29,sequence:'0'});
    if(mutation==='lookupLag')f.transport.validity=async()=>({ledger:31,closeTime:close});
    const restarted=new LocalTransactionWorker(new TransportStore(f.adapter),f.transport,f.project,()=>Number(close)+(mutation==='stale'?31:0));
    assert.equal(await restarted.run(f.op,'restart'),expected);
    assert.deepEqual(await f.store.identity(f.op),saved);assert.equal(f.transport.signCount,1);
    assert.equal(f.transport.submitted.length,1);assert.equal(f.projectionCount(),0);
  });
}

test('D3-14A FAILED on the final original-hash read wins over an earlier NOT_FOUND',async()=>{
  const f=await harness(db);await f.worker.run(f.op,'first');
  f.transport.closeTime='1311';f.transport.ledger=30;let reads=0;
  const observe=f.transport.observe.bind(f.transport);
  f.transport.observe=async i=>{f.transport.failChain=++reads===2;return observe(i);};
  assert.equal(await f.worker.run(f.op,'last-read'),'CONFIRMED_FAILED');
  assert.equal(f.transport.submitted.length,1);assert.equal(f.projectionCount(),0);
});

test('D3-14A lost HTTP POST response recovers by the original key then the pinned ID',async()=>{
  const id='10000000-0000-0000-0000-00000000001a',hash='ba'.repeat(32);
  let posts=0,elapsed=0,reads=0;
  const receipt=await submitAndObserveOperation(async()=>{posts++;return null;},async target=>{
    assert.equal(target,reads++===0?null:id);
    const success=elapsed>=305000;
    return operationPresentation({id,state:success?'CONFIRMED':'UNKNOWN',
      transport_state:success?'PROJECTED':'SUBMITTED_OR_UNKNOWN',transaction_hash:hash,dispatch_attempts:1,
      review_required:false,interrupted:false});
  },async acknowledgement=>assert.equal(acknowledgement,null),{now:()=>elapsed,sleep:async ms=>{elapsed+=ms;}});
  assert.equal(receipt.result,'SUCCESS');assert.equal(receipt.transactionHash,hash);assert.equal(posts,1);
});

for(const [name,maxTime,expected] of [['expired',1120,'READY'],['too far',1301,'READY'],['too little left',1134,'READY']] as const){
  test('D3-14A dispatch guard '+name,async()=>{
    const f=await harness(db);f.transport.envelopeMaxTime=maxTime;
    assert.equal(await f.worker.run(f.op,'guard'),expected);
    assert.equal((await f.store.work(f.op)).dispatchAttempts,0);
    assert.equal(f.transport.submitted.length,0);assert.deepEqual(f.transport.observed,[]);
  });
}

for(const maxTime of [null,0])test('D3-14A rejects absent or zero maxTime '+maxTime,async()=>{
  const f=await harness(db),w=await f.store.work(f.op);
  const fixture=await f.transport.prepareAndSimulate(w);
  const builder=new TransactionBuilder(new Account(w.sourceAccount,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET})
    .addOperation(new Contract(w.contractAddress).call(w.command.kind,...w.argumentsXdr.map(x=>xdrValue(x))));
  const tx=builder.setTimebounds(0,0).build();
  const envelope=tx.toEnvelope();
  assert.equal(envelope.type,'envelopeTypeTx');
  if(envelope.type!=='envelopeTypeTx')assert.fail('wrong envelope type');
  const wire=envelope.v1.tx.toXdrObject();
  const originalXdr=maxTime===null
    ?xdr.TransactionEnvelope.envelopeTypeTx(new xdr.TransactionV1Envelope({
      tx:xdr.Transaction.fromXdrObject({...wire,cond:{type:0}}),signatures:[],
    })).toXDR('base64')
    :tx.toXDR();
  assert.equal(new Transaction(originalXdr,Networks.TESTNET).timeBounds?.maxTime,maxTime===null?undefined:'0');
  assert.throws(()=>finalizedBody(w,{...fixture,transactionXdr:originalXdr}),/BoundedEnvelopeRequired/);
  assert.equal(f.transport.signCount,0);assert.equal(f.transport.submitted.length,0);
});
const xdrValue=(raw:string)=>xdr.ScVal.fromXDR(raw,'base64');

test('D3-14A rejects a persisted XDR metadata mismatch before any closure RPC',async()=>{
  const f=await harness(db);await f.worker.run(f.op,'first');
  const store=new TransportStore(f.adapter),read=store.identity.bind(store);
  store.identity=async id=>{const i=(await read(id))!;return {...i,maxTime:'1301'};};
  const worker=new LocalTransactionWorker(store,f.transport,f.project);
  const observations=f.transport.observed.length;
  assert.equal(await worker.run(f.op,'tampered'),'SUBMITTED_OR_UNKNOWN');
  assert.equal(await store.hasIdentityHold(f.op),true);
  assert.equal(f.transport.observed.length,observations);assert.equal(f.transport.submitted.length,1);
});

test('D3-14A signing checkpoints commit before both calls and a missing checkpoint prevents signing',async()=>{
  const f=await harness(db);
  const phase=async(stage:string)=>(await db.query("select 1 from api_private.testnet_observations where operation_id=$1 and evidence->>'phase'='SIGNING_IDENTITY_VALIDATED' and evidence->>'stage'=$2",[f.op,stage])).rows.length;
  const authorize=f.transport.attachSorobanAuthorization.bind(f.transport),sign=f.transport.signEnvelope.bind(f.transport);
  f.transport.attachSorobanAuthorization=async p=>{assert.equal(await phase('AUTHORIZATION'),1);return authorize(p);};
  f.transport.signEnvelope=async p=>{assert.equal(await phase('ENVELOPE'),1);return sign(p);};
  f.store.signingIdentity=async()=>{throw Error('fixture persistence failed');};
  await assert.rejects(f.worker.run(f.op,'before-sign'),/persistence failed/);
  assert.equal(f.transport.signCount,0);assert.equal(f.transport.submitted.length,0);
  f.store.signingIdentity=TransportStore.prototype.signingIdentity.bind(f.store);
  await f.worker.resumeUnsigned({operationId:f.op,contextHash:(await f.store.work(f.op)).contextHash,decisionId:'fixture-reviewed'},'after-persist');
  assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
});
