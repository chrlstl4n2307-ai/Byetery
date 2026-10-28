import { createHash } from 'node:crypto';
import { Address, Contract, Networks, StrKey, Transaction, TransactionBuilder, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { ensure, type Battery, type Command, type Deployment, type ReturnRequest } from '../domain.ts';
import { evidenceCommitment } from '../evidence.ts';
import type { PhasedStellarSigner, SigningRequest } from '../stellar-signer.ts';
import type { TransactionTransport } from './worker.ts';
import type { Work } from './store.ts';
import { NETWORK_ID, SIGNER_FEE_CAP, type Confirmation, type FinalizedBody, type Observation, type PreparedBody,
  type StateEvidence, type TransactionIdentity } from './identity.ts';
import { TestnetRpc } from './rpc.ts';
import { ACTORS, CONTRACT, TOKEN, WASM, invocation, string, bytes } from './abi.ts';

const hex=(v:Uint8Array)=>Buffer.from(v).toString('hex');
const enumName=(v:unknown)=>Array.isArray(v)?String(v[0]):String(v);
const stateOrder=['REGISTERED','RETURNED','COLLECTED','RECYCLED'];
const key=(tag:string,arg:xdr.ScVal)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
  contract:new Address(CONTRACT).toScAddress(),durability:xdr.ContractDataDurability.persistent,
  key:xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(tag),arg])}));
export interface ContextGuard {validate(work:Work):Promise<void>;validateFacts?(work:Work,battery:Battery,request:ReturnRequest|null):Promise<void>;connectionGuard?():()=>void}

/** Checks the simulation's exact invocation tree before any signer is launched. */
export function validateAuth(tx:Transaction,command:Command){
  const e=tx.toEnvelope();ensure(e.type==='envelopeTypeTx'&&e.v1.tx.operations.length===1,'UnexpectedAuthorization');
  const b=e.v1.tx.operations[0].body;ensure(b.type==='invokeHostFunction','UnexpectedAuthorization');
  const op=b.invokeHostFunctionOp;ensure(op.hostFunction.type==='hostFunctionTypeInvokeContract','UnexpectedAuthorization');
  const call=op.hostFunction.invokeContract,expected=invocation(command);
  ensure(call.functionName.toString()===command.kind&&new Address(CONTRACT).toScAddress().toXDR('base64')===call.contractAddress.toXDR('base64')
    &&call.args.length===expected.args.length&&call.args.every((a,i)=>a.toXDR('base64')===expected.args[i].toXDR('base64')),'InvocationMismatch');
  ensure(tx.source===expected.signers[0]&&op.auth.length===expected.signers.length,'UnexpectedAuthorization');
  const seen=new Set<string>();
  for(const a of op.auth){
    ensure(a.rootInvocation.function.type==='sorobanAuthorizedFunctionTypeContractFn'
      &&a.rootInvocation.function.contractFn.toXDR('base64')===call.toXDR('base64')&&a.rootInvocation.subInvocations.length===0,'UnexpectedAuthorization');
    let actor:string;
    if(a.credentials.type==='sorobanCredentialsSourceAccount')actor=tx.source;
    else {
      const c=a.credentials.type==='sorobanCredentialsAddress'?a.credentials.address:a.credentials.type==='sorobanCredentialsAddressV2'?a.credentials.addressV2:null;
      ensure(c&&command.kind==='confirm_collection','UnexpectedAuthorization');
      actor=Address.fromScAddress(c.address).toString();
      ensure(actor===ACTORS.collector,'UnexpectedAuthorization');
    }
    ensure(expected.signers.includes(actor)&&!seen.has(actor),'UnexpectedAuthorization');seen.add(actor);
  }
}
export function effectMatches(c:Command,b:Battery|null,r:ReturnRequest|null,d:Deployment):boolean{
  if(!b||c.kind==='set_role')return false;
  if(c.kind==='register_battery')return b.registrationHash===c.registrationHash;
  if(c.kind==='open_return')return r?.batteryId===c.batteryId&&r.recipient===c.recipient
    &&(r.state==='CANCELLED'||b.requestId===c.requestId);
  if(c.kind==='cancel_return')return r?.batteryId===c.batteryId&&r.state==='CANCELLED';
  if(c.kind==='pay_reward')return b.state==='RECYCLED'&&b.rewardState==='SENT'&&r?.state==='CONFIRMED'&&r.batteryId===c.batteryId;
  if(r?.batteryId!==c.batteryId||r.state!=='CONFIRMED'||b.requestId!==c.requestId)return false;
  return c.kind==='confirm_collection'?stateOrder.indexOf(b.state)>=2&&b.collector===c.collector&&b.collectionHash===evidenceCommitment(d,c.evidence)
    :b.state==='RECYCLED'&&b.recycler===c.recycler&&b.recyclingHash===evidenceCommitment(d,c.evidence);
}
/** Receipt + actual SAC transfer event + on-chain request and reward state. */
export function rewardFacts(c:Confirmation,b:Battery,r:ReturnRequest,d:Deployment){
  ensure(c.sorobanResult&&b.state==='RECYCLED'&&b.rewardState==='SENT'&&r.state==='CONFIRMED','RewardEvidenceMissing');
  const receipt=scValToNative(xdr.ScVal.fromXDR(c.sorobanResult,'base64'));
  ensure(receipt&&receipt.recipient===r.recipient&&receipt.token===d.rewardToken&&BigInt(receipt.amount)===d.rewardAmount
    &&enumName(receipt.reward_state)==='Sent','RewardReceiptMismatch');
  const match=c.events.some(raw=>{
    const e=xdr.ContractEvent.fromXDR(raw,'base64');if(!e.contractId||hex(e.contractId.toBytes())!==hex(StrKey.decodeContract(d.rewardToken)))return false;
    const data=e.body.value;const topics=data.topics.map(t=>scValToNative(t));const amount=scValToNative(data.data);
    return topics[0]==='transfer'&&topics[1]===d.contractAddress&&topics[2]===r.recipient
      &&BigInt(typeof amount==='object'&&amount!==null?amount.amount:amount)===BigInt(receipt.amount);
  });
  ensure(match,'TokenTransferEvidenceMissing');return {recipient:r.recipient,token:receipt.token as string,amount:String(receipt.amount)};
}

export class TestnetTransport implements TransactionTransport {
  readonly scope='TESTNET' as const;
  readonly rpc:TestnetRpc;readonly signer:PhasedStellarSigner;readonly guard:ContextGuard;
  readonly load:(id:string)=>Promise<Work>;readonly deploymentId:string;
  constructor(rpcClient:TestnetRpc,signer:PhasedStellarSigner,guard:ContextGuard,load:(id:string)=>Promise<Work>,deploymentId:string){
    this.rpc=rpcClient;this.signer=signer;this.guard=guard;this.load=load;this.deploymentId=deploymentId;
  }
  async readiness(){
    await this.rpc.network();const latest=await this.rpc.latest();
    const keys=[new Contract(CONTRACT).getFootprint(),xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(WASM,'hex')})),new Contract(TOKEN).getFootprint()];
    const values=await this.rpc.entries(keys);
    const target=latest.sequence+Math.max(120,Math.ceil((1795230000-Number(latest.closeTime))/5)); // Nov21 00:00 Santiago, exclusive.
    for(const k of keys){const e=values.entries?.find(e=>e.key===k.toXDR('base64'));ensure(e&&e.liveUntilLedgerSeq&&e.liveUntilLedgerSeq>target,'TestnetStateNotReady');
      const data=xdr.LedgerEntryData.fromXDR(e.xdr,'base64');
      if(data.type==='contractCode')ensure(createHash('sha256').update(data.contractCode.code).digest('hex')===WASM,'WasmMismatch');
      if(k===keys[0])ensure(data.type==='contractData'&&data.contractData.val.type==='scvContractInstance'
        &&data.contractData.val.instance.executable.type==='contractExecutableWasm'
        &&hex(data.contractData.val.instance.executable.wasmHash.toBytes())===WASM,'WasmMismatch');
    }
    const config=await this.config();return {latest,config};
  }
  async read(method:string,args:xdr.ScVal[]=[],contract=CONTRACT){
    const a=await this.rpc.account(ACTORS.admin);const l=await this.rpc.latest();
    const tx=new TransactionBuilder(a.account,{fee:'10000',networkPassphrase:Networks.TESTNET})
      .addOperation(new Contract(contract).call(method,...args)).setTimebounds(0,Number(l.closeTime)+180).build();
    const s=await this.rpc.simulate(tx.toXDR());ensure(!s.error&&s.results?.length===1&&s.results[0].xdr,'StateReadUnavailable');
    ensure(!s.restorePreamble&&s.transactionData,'UnexpectedRestoration');
    const data=xdr.SorobanTransactionData.fromXDR(s.transactionData,'base64');
    ensure(data.ext.type!=='resourceExt'||data.ext.resourceExt.archivedSorobanEntries.length===0,'UnexpectedRestoration');
    return {value:scValToNative(xdr.ScVal.fromXDR(s.results[0].xdr,'base64')),ledger:s.latestLedger};
  }
  async config():Promise<Deployment>{const {value:v}=await this.read('get_config');
    ensure(v?.schema_version===1&&v.admin===ACTORS.admin&&v.service===ACTORS.service&&v.reward_token===TOKEN&&BigInt(v.reward_amount)>0n,'UnexpectedContractConfiguration');
    return {deploymentId:this.deploymentId,mode:'TESTNET',networkId:NETWORK_ID,contractAddress:CONTRACT,
      admin:v.admin,service:v.service,rewardToken:v.reward_token,rewardAmount:BigInt(v.reward_amount),schemaVersion:1};
  }
  async battery(id:string):Promise<{value:Battery|null;ledger:number}>{
    const result=await this.read('get_battery',[string(id)]),v=result.value;
    const optionalHex=(v:Uint8Array|null)=>v?hex(v):null;
    const stateMap:Record<string,Battery['state']>={Registered:'REGISTERED',Returned:'RETURNED',Collected:'COLLECTED',Recycled:'RECYCLED'};
    const rewardMap:Record<string,Battery['rewardState']>={NotEligible:'NOT_ELIGIBLE',Pending:'PENDING',Sent:'SENT'};
    if(!v)return {value:null,ledger:result.ledger};
    ensure(stateMap[enumName(v.state)]&&rewardMap[enumName(v.reward_state)],'UnexpectedContractState');
    return {ledger:result.ledger,value:{state:stateMap[enumName(v.state)],rewardState:rewardMap[enumName(v.reward_state)],registrationHash:hex(v.registration_hash),
      requestId:optionalHex(v.request_id),collector:v.collector??null,collectionHash:optionalHex(v.collection_hash),recycler:v.recycler??null,recyclingHash:optionalHex(v.recycling_hash)}};
  }
  private async requestEvidence(id:string):Promise<{value:ReturnRequest|null;ledger:number}>{const {value:v,ledger}=await this.read('get_request',[bytes(id)]);if(!v)return {value:null,ledger};
    const states:Record<string,ReturnRequest['state']>={Open:'OPEN',Cancelled:'CANCELLED',Confirmed:'CONFIRMED'};ensure(states[enumName(v.state)],'UnexpectedContractState');
    return {value:{batteryId:v.battery_id,recipient:v.recipient,state:states[enumName(v.state)]},ledger};
  }
  async request(id:string):Promise<ReturnRequest|null>{return (await this.requestEvidence(id)).value;}
  async prepareAndSimulate(w:Work):Promise<PreparedBody>{
    ensure(w.networkId===NETWORK_ID,'WrongNetwork');ensure(w.contractAddress===CONTRACT&&w.deploymentId===this.deploymentId,'WrongContract');
    await this.guard.validate(w);const expected=invocation(w.command);ensure(w.sourceAccount===expected.signers[0],'WrongSigner');
    ensure(JSON.stringify(w.argumentsXdr)===JSON.stringify(expected.args.map(a=>a.toXDR('base64'))),'ArgumentsMismatch');
    return this.preflight(w.command);
  }
  /** Unsigned simulation only; never queues, authorizes, persists or dispatches. */
  async preflight(command:Command):Promise<PreparedBody>{
    const expected=invocation(command);
    const {latest}=await this.readiness(),a=await this.rpc.account(expected.signers[0]);
    const sourceSequence=a.account.sequenceNumber();
    const tx=new TransactionBuilder(a.account,{fee:'10000',networkPassphrase:Networks.TESTNET})
      .addOperation(new Contract(CONTRACT).call(command.kind,...expected.args)).setTimebounds(0,Number(latest.closeTime)+180).build();
    const s=await this.rpc.simulate(tx.toXDR());
    ensure(!s.error,'SimulationFailed');ensure(!s.restorePreamble&&s.transactionData,'UnexpectedRestoration');
    const data=xdr.SorobanTransactionData.fromXDR(s.transactionData,'base64');
    ensure(data.ext.type!=='resourceExt'||data.ext.resourceExt.archivedSorobanEntries.length===0,'UnexpectedRestoration');
    ensure(s.minResourceFee&&/^\d+$/.test(s.minResourceFee)&&BigInt(s.minResourceFee)+10000n<=SIGNER_FEE_CAP,'SignerFeeCap');
    let final:Transaction;try{final=rpc.assembleTransaction(tx,s).build();}catch{throw new Error('SimulationAssemblyFailed');}
    ensure(BigInt(final.fee)<=SIGNER_FEE_CAP&&BigInt(final.fee)>=BigInt(s.minResourceFee)+10000n,'SignerFeeCap');
    validateAuth(final,command);
    return {transactionXdr:final.toXDR(),preparedLedger:s.latestLedger,
      simulation:{resourceFee:s.minResourceFee,totalFee:final.fee,authRequirements:expected.signers,
        sourceSequence,sourceBalance:a.balance,ledger:s.latestLedger}};
  }
  private async signingRequest(body:PreparedBody,w:Work):Promise<SigningRequest>{
    await this.guard.validate(w);await this.rpc.network();const l=await this.rpc.latest();
    const tx=new Transaction(body.transactionXdr,Networks.TESTNET);validateAuth(tx,w.command);
    ensure(l.sequence>=body.preparedLedger&&l.sequence-body.preparedLedger<=20&&tx.timeBounds
      &&BigInt(tx.timeBounds.maxTime)>BigInt(l.closeTime)&&BigInt(tx.timeBounds.maxTime)<=BigInt(l.closeTime)+300n,'InvalidSigningWindow');
    return {transactionXdr:body.transactionXdr,method:w.command.kind,expectedSigners:invocation(w.command).signers,
      networkPassphrase:Networks.TESTNET,currentLedger:l.sequence,expirationLedger:body.preparedLedger+60};
  }
  async attachSorobanAuthorization(body:PreparedBody,w:Work){
    const healthy=this.guard.connectionGuard?.()??(()=>{}),request=await this.signingRequest(body,w);healthy();
    const r=await this.signer.authorize(request);return {...body,transactionXdr:r.transactionXdr};
  }
  async signEnvelope(body:FinalizedBody,w:Work){
    const healthy=this.guard.connectionGuard?.()??(()=>{}),request=await this.signingRequest(body,w);healthy();
    const r=await this.signer.signEnvelope(request,body.transactionHash);return r.transactionXdr;
  }
  async validity(_i:TransactionIdentity){await this.rpc.network();const l=await this.rpc.latest();return {ledger:l.sequence,closeTime:l.closeTime};}
  async assertSourceSequence(i:TransactionIdentity){const a=await this.rpc.account(i.sourceAccount);
    ensure(BigInt(a.account.sequenceNumber())===BigInt(i.sequence)-1n,'REVIEWED_RESOLUTION_REQUIRED');
    return {sequence:a.account.sequenceNumber(),balance:a.balance,ledger:a.ledger};}
  async submit(i:TransactionIdentity){const tx=new Transaction(Buffer.from(i.envelopeBytes).toString('base64'),Networks.TESTNET);
    ensure(hex(tx.hash())===i.transactionHash&&i.networkId===NETWORK_ID&&i.contractAddress===CONTRACT,'IdentityMismatch');
    const r=await this.rpc.send(tx.toXDR());ensure(r.hash===i.transactionHash,'SubmitIdentityMismatch');
    return {transactionHash:r.hash,status:r.status,ledger:r.latestLedger};
  }
  async observe(i:TransactionIdentity):Promise<Observation>{
    await this.rpc.network();const r=await this.rpc.transaction(i.transactionHash);
    if(r.status==='NOT_FOUND')return {status:'NOT_FOUND',observationLedger:r.latestLedger,ledgerCloseTime:String(r.latestLedgerCloseTime),correlationId:i.operationId};
    ensure(r.txHash===i.transactionHash&&r.ledger&&r.resultXdr&&r.resultMetaXdr,'ConfirmationMismatch');
    const resultCode=xdr.TransactionResult.fromXDR(r.resultXdr,'base64').result.type;
    ensure((r.status==='SUCCESS')===(resultCode==='txSuccess'),'ConfirmationResultMismatch');
    const meta=xdr.TransactionMeta.fromXDR(r.resultMetaXdr,'base64');
    const result=(meta.type==='v3'||meta.type==='v4')?meta.value.sorobanMeta?.returnValue:null;
    const c:Confirmation={transactionHash:i.transactionHash,observationLedger:r.latestLedger,confirmationLedger:r.ledger,
      resultXdr:r.resultXdr,resultMetaXdr:r.resultMetaXdr,events:r.events.flat(),sorobanResult:result?.toXDR('base64')??null,
      correlationId:i.operationId,confirmedAt:r.createdAt};
    if(r.status==='SUCCESS'){
      const w=await this.load(i.operationId),d=await this.config(),b=await this.battery(w.command.kind==='set_role'?'':w.command.batteryId);
      const rid='requestId' in w.command?w.command.requestId:b.value?.requestId;
      const request=rid?await this.request(rid):null;
      ensure(b.value&&b.ledger>=r.ledger&&effectMatches(w.command,b.value,request,d),'ConfirmedEffectMismatch');
      await this.guard.validateFacts?.(w,b.value,request);
      c.facts={battery:b.value,request,stateReadLedger:b.ledger};
      if(w.command.kind==='pay_reward'){ensure(request,'RewardRequestMissing');c.facts.reward=rewardFacts(c,b.value,request,d);}
    }
    return {status:r.status,confirmation:c};
  }
  async inspectExpiredEffect(i:TransactionIdentity,w:Work):Promise<StateEvidence>{
    await this.rpc.network();const d=await this.config();ensure(w.command.kind!=='set_role','MethodNotAllowed');
    // Explicit entry lookup supplements getters; omission never establishes non-application.
    const keys=[key('Battery',string(w.command.batteryId))];if('requestId' in w.command)keys.push(key('Request',bytes(w.command.requestId)));
    const entries=await this.rpc.entries(keys);const b=await this.battery(w.command.batteryId);
    const rid='requestId' in w.command?w.command.requestId:b.value?.requestId;const r=rid?await this.request(rid):null;
    const matched=effectMatches(w.command,b.value,r,d);
    // A reward's SENT state cannot prove this original transaction paid; require its receipt/events.
    const applied=matched&&w.command.kind!=='pay_reward';
    return {outcome:applied?'APPLIED':'UNRESOLVED',stateReadLedger:Math.max(entries.latestLedger,b.ledger),
      evidence:JSON.stringify({predicate:w.command.kind,matched,paymentProofRequired:w.command.kind==='pay_reward',
        entryStatus:keys.map(k=>{const e=entries.entries?.find(e=>e.key===k.toXDR('base64'));return e?.liveUntilLedgerSeq&&e.liveUntilLedgerSeq>=entries.latestLedger?'LIVE':'UNKNOWN';}),
        ...(applied?{facts:{battery:b.value,request:r,stateReadLedger:b.ledger}}:{})}),correlationId:i.operationId};
  }
  async inspectRevokedEffect(i:TransactionIdentity,w:Work):Promise<StateEvidence>{
    await this.rpc.network();ensure(w.command.kind!=='set_role'&&w.networkId===NETWORK_ID&&w.contractAddress===CONTRACT
      &&i.transactionHash.length===64,'OperationContextMismatch');
    const d=await this.config(),c=w.command,b=await this.battery(c.batteryId);
    const rid='requestId' in c?c.requestId:b.value?.requestId;
    const request=rid?await this.requestEvidence(rid):null,r=request?.value??null;
    // Successful getters reject restorePreamble and archivedSorobanEntries in
    // read(). An omitted raw ledger entry alone is NEVER an absence proof.
    let absent=false;
    if(c.kind==='register_battery')absent=b.value===null||b.value.registrationHash!==c.registrationHash;
    else if(c.kind==='open_return')absent=!!request&&r===null;
    else if(c.kind==='cancel_return')absent=!!r&&r.batteryId===c.batteryId&&r.state!=='CANCELLED';
    else if(c.kind==='confirm_collection')absent=b.value?.state==='RETURNED'&&b.value.requestId===c.requestId&&r?.state==='OPEN'&&r.batteryId===c.batteryId;
    else if(c.kind==='confirm_recycling')absent=b.value?.state==='COLLECTED'&&b.value.requestId===c.requestId&&r?.state==='CONFIRMED'&&r.batteryId===c.batteryId;
    else if(c.kind==='pay_reward')absent=b.value?.state==='RECYCLED'&&b.value.rewardState==='PENDING'&&r?.state==='CONFIRMED'&&r.batteryId===c.batteryId;
    if(c.kind==='pay_reward'&&absent&&b.value)await this.guard.validateFacts?.(w,b.value,r);
    const matched=effectMatches(c,b.value,r,d);
    return {outcome:absent&&!matched?'NOT_APPLIED':'UNRESOLVED',stateReadLedger:Math.min(b.ledger,request?.ledger??b.ledger),
      evidence:JSON.stringify({classification:'AUTHORIZATION_REVOKED',predicate:c.kind,gettersSucceededWithoutRestoration:true,
        absent,matched,battery:b.value,request:r,batteryLedger:b.ledger,requestLedger:request?.ledger??null}),correlationId:i.operationId};
  }
}
