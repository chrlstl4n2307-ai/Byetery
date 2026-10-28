import test from 'node:test';
import assert from 'node:assert/strict';
import {Account,Networks,SorobanDataBuilder,xdr} from '@stellar/stellar-sdk';
import {TestnetTransport} from '../src/testnet/transport.ts';
import {TestnetRpc} from '../src/testnet/rpc.ts';
import {NETWORK_ID,type TransactionIdentity} from '../src/testnet/identity.ts';
import type {Work} from '../src/testnet/store.ts';
import type {Command} from '../src/domain.ts';
import {ACTORS,CONTRACT} from '../src/testnet/abi.ts';
import {bid,rid,h,config,evidence,recipient} from './fixtures.ts';

function fixture(command:Command){
 let tripwires=0,facts=0;
 const deny=async():Promise<never>=>{tripwires++;throw Error('Live RPC and signer forbidden');};
 const rpc=new TestnetRpc(deny);rpc.network=async()=>({passphrase:Networks.TESTNET,protocolVersion:'23'});
 const w:Work={deploymentId:config.deploymentId,operationId:'fixture',principal:'fixture',networkId:NETWORK_ID,contractAddress:CONTRACT,sourceAccount:ACTORS.admin,
  command,contextHash:h(1),argumentsXdr:[],state:'READY',dispatchAttempts:0,confirmation:null,stateEvidence:null};
 const identity:TransactionIdentity={...w,sequence:'1',envelopeBytes:new Uint8Array([1]),transactionHash:h(2),minTime:'1000',maxTime:'1300',authorizationExpirations:[30],preparedLedger:1};
 const transport=new TestnetTransport(rpc,{authorize:deny,signEnvelope:deny},{validate:async()=>{},validateFacts:async()=>{facts++;}},async()=>w,w.deploymentId);
 transport.config=async()=>({...config,mode:'TESTNET',contractAddress:CONTRACT});
 return {rpc,w,identity,transport,tripwires:()=>tripwires,facts:()=>facts};
}

test('GAP2B real revoked-effect reader: command-specific absence proof and minimum read ledger',async()=>{
 const commands:Command[]=[{kind:'register_battery',batteryId:bid,registrationHash:h(1)},
  {kind:'open_return',batteryId:bid,requestId:rid,recipient},{kind:'cancel_return',batteryId:bid,requestId:rid},
  {kind:'confirm_collection',batteryId:bid,requestId:rid,collector:ACTORS.collector,evidence:evidence()},
  {kind:'confirm_recycling',batteryId:bid,requestId:rid,recycler:ACTORS.recycler,evidence:evidence('RECYCLING')},
  {kind:'pay_reward',batteryId:bid}];
 for(const c of commands){
  const f=fixture(c);
  const state=c.kind==='confirm_recycling'?'Collected':c.kind==='pay_reward'?'Recycled':'Returned';
  f.transport.read=async method=>({ledger:method==='get_request'?49:50,value:method==='get_request'
   ?c.kind==='open_return'?null:{battery_id:bid,recipient,state:[c.kind==='cancel_return'||c.kind==='confirm_collection'?'Open':'Confirmed']}
   :c.kind==='register_battery'?null:{state:[state],reward_state:[c.kind==='pay_reward'?'Pending':'NotEligible'],registration_hash:Buffer.from(h(1),'hex'),request_id:Buffer.from(rid,'hex'),collector:null,collection_hash:null,recycler:null,recycling_hash:null}});
  const result=await f.transport.inspectRevokedEffect(f.identity,f.w);
  assert.equal(result.outcome,'NOT_APPLIED',c.kind);assert.equal(result.stateReadLedger,c.kind==='register_battery'?50:49);
  if(c.kind==='pay_reward')assert.equal(f.facts(),1);
  assert.equal(f.tripwires(),0);
 }
 const reward=fixture({kind:'pay_reward',batteryId:bid});
 reward.transport.read=async method=>({ledger:50,value:method==='get_request'?{battery_id:bid,recipient,state:['Confirmed']}:
  {state:['Recycled'],reward_state:['Sent'],registration_hash:Buffer.from(h(1),'hex'),request_id:Buffer.from(rid,'hex'),collector:null,collection_hash:null,recycler:null,recycling_hash:null}});
 assert.equal((await reward.transport.inspectRevokedEffect(reward.identity,reward.w)).outcome,'UNRESOLVED','SENT is never evidence of nonpayment');
});

test('GAP2B actual getter refuses archived/restoration simulations instead of proving absent',async()=>{
 const f=fixture({kind:'register_battery',batteryId:bid,registrationHash:h(1)});
 f.rpc.account=async()=>({account:new Account(ACTORS.admin,'1'),balance:'100000000',ledger:50});
 f.rpc.latest=async()=>({id:'fixture',sequence:50,protocolVersion:'23',closeTime:'1400'});
 let data=new SorobanDataBuilder().build().toXDR('base64');
 const raw={id:'fixture',latestLedger:50,minResourceFee:'1',transactionData:data,results:[{auth:[],xdr:xdr.ScVal.scvVoid().toXDR('base64')}],restorePreamble:{minResourceFee:'1',transactionData:data}};
 f.rpc.simulate=async()=>raw;
 await assert.rejects(f.transport.inspectRevokedEffect(f.identity,f.w),{code:'UnexpectedRestoration'});
 const object=xdr.SorobanTransactionData.fromXDR(data,'base64').toXdrObject();object.ext={v:1,resourceExt:{archivedSorobanEntries:[0]}};
 data=xdr.SorobanTransactionData.fromXdrObject(object).toXDR('base64');
 f.rpc.simulate=async()=>({...raw,restorePreamble:undefined,transactionData:data});
 await assert.rejects(f.transport.inspectRevokedEffect(f.identity,f.w),{code:'UnexpectedRestoration'});
 assert.equal(f.tripwires(),0);
});
