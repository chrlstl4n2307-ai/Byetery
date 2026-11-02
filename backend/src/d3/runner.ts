import type {Command,Deployment,Evidence} from '../domain.ts';
import { MockStellarService } from '../mock-stellar-service.ts';
import { canonical } from '../application/validation.ts';
import { evidenceCommitment } from '../evidence.ts';
import { verifyEvidenceV1 } from '../evidence-verifier.ts';
import { AMOUNT,ACTORS,CONTRACT,NETWORK_ID,TOKEN,check,plan,sha,D3Error,executionPreflight,type Negative } from './model.ts';
import {exportManifest,type RawRunEvidence,type State,type IntegrityRecord} from './manifest.ts';
import {reconcileOriginal,NEGATIVES} from './negatives.ts';
export {plan,NEGATIVES};
export function execute(input:unknown,context:unknown=undefined):never {
 // No switch, JSON input or CLI argument grants authority or loads Secure Store.
 const p=plan(input);check(context!==undefined,'FutureOwnerAuthorizationRequired');executionPreflight(p,context);
 throw new D3Error('LiveExecutionBindingNotEnabled');
}
/** Offline only. Opaque mock proofs are not signatures; no RPC/HTTP/signer import. */
export async function simulate(input:unknown){
 const p=plan(input);check(!p.blockers.length,'RecipientDecisionRequired');
 const d:Deployment={deploymentId:'5c0cad2f-5f25-4216-8068-6cb9d2d26325',mode:'MOCK',schemaVersion:1,networkId:NETWORK_ID,contractAddress:CONTRACT,admin:ACTORS.admin,service:ACTORS.service,rewardToken:TOKEN,rewardAmount:BigInt(AMOUNT)};
 const mock=new MockStellarService(d,()=>1);mock.fund(700000000n);
 async function call(command:Command){const prepared=await mock.prepare(d.deploymentId,command);const ref=await mock.submit(prepared,prepared.requiredSigners.map(s=>mock.authorize(prepared,s)));return {result:mock.settle(ref),ref};}
 for(const [actor,role] of [[ACTORS.collector,'COLLECTOR'],[ACTORS.recycler,'RECYCLER']] as const)check((await call({kind:'set_role',actor,role,enabled:true})).result.status==='SUCCESS','FixtureRoleSetupFailed');
 const manifests:ReturnType<typeof exportManifest>[]=[];
 const negativeResults:Array<{runId:string;case:Negative;result:string;layer:'OFFLINE_MOCK'|'OFFLINE_VERIFIER';broadcasts:0;errorCode?:string;unchangedState?:boolean;balanceUnchanged?:boolean;originalPayloadHash?:string;alteredPayloadHash?:string;expectedCommitment?:string;verificationStatus?:string;originalCorrelationHash?:string;reconciledCorrelationHash?:string;identityCount?:number;recoveryResult?:string}>=[];
 for(const run of p.input.runs){
  const rid=sha('OFFLINE_FIXTURE_ONLY:'+p.planHash+':'+run.runId); // Never a future server request ID.
  const evidence:RawRunEvidence={source:'OFFLINE_MOCK',operations:[],records:[],reward:null,recovery:{uncertainResponse:false,originalHash:null,reconciledHash:null,result:'NOT_ENCOUNTERED',identityCount:0,broadcastCount:0}};
  async function snapshot():Promise<State>{const b=await mock.getBattery(d.deploymentId,run.batteryId);return {lifecycle:b?.state??null,reward:b?.rewardState??null};}
  async function reject(id:Negative,command:Command,code:string){
   const before=canonical(await snapshot()),balance=mock.recipientBalance(run.recipient!);const out=await call(command);
   check(out.result.status==='FAILED'&&out.result.error===code,'NegativeDidNotReject');
   check(canonical(await snapshot())===before&&mock.recipientBalance(run.recipient!)===balance,'NegativeChangedState');
   negativeResults.push({runId:run.runId,case:id,result:'PASS',layer:'OFFLINE_MOCK',broadcasts:0,errorCode:code,unchangedState:true,balanceUnchanged:true});
  }
  const make=(kind:'COLLECTION'|'RECYCLING')=>{
   const raw=Buffer.from(canonical({version:1,task:'D3-OFFLINE',fixture:true,batteryId:run.batteryId,requestId:rid,kind}));
   const ev:Evidence={version:1,batteryId:run.batteryId,requestId:rid,kind,payloadHash:sha(raw)};
   const record:IntegrityRecord={kind,revision:1,manifestBase64:raw.toString('base64'),payloadHash:ev.payloadHash,commitment:evidenceCommitment(d,ev)};return {ev,record};
  };
  const collection=make('COLLECTION'),recycling=make('RECYCLING');
  const registration=Buffer.from(canonical({version:1,batteryId:run.batteryId,metadata:{synthetic:true}}));
  evidence.records.push({kind:'REGISTRATION',revision:1,manifestBase64:registration.toString('base64'),payloadHash:sha(registration),commitment:sha(registration)});
  const commands:Command[]=[{kind:'register_battery',batteryId:run.batteryId,registrationHash:sha(registration)},{kind:'open_return',batteryId:run.batteryId,requestId:rid,recipient:run.recipient!},{kind:'confirm_collection',batteryId:run.batteryId,requestId:rid,collector:ACTORS.collector,evidence:collection.ev},{kind:'confirm_recycling',batteryId:run.batteryId,requestId:rid,recycler:ACTORS.recycler,evidence:recycling.ev},{kind:'pay_reward',batteryId:run.batteryId}];
  for(let i=0;i<commands.length;i++){
   const command=commands[i];check(command.kind!=='set_role'&&command.kind!=='cancel_return','UnexpectedCommand');
   const before=await snapshot();const beforeBalance=mock.recipientBalance(run.recipient!),payerBefore=await mock.getRewardBalance(d.deploymentId);
   const prepared=await mock.prepare(d.deploymentId,command);const ref=await mock.submit(prepared,prepared.requiredSigners.map(s=>mock.authorize(prepared,s)));
   if(i===4&&run.negativeCases.includes('uncertain_response')){
    check((await mock.getTransactionResult(ref)).status==='PENDING','FixtureNotPending');
    const localHash=sha('OFFLINE_IDENTITY_ONLY:'+p.planHash+run.runId); // A local correlation hash, never a Testnet reference.
    const proof=await reconcileOriginal({identity:async()=>({operationId:run.runId+'-pay_reward',transactionHash:localHash}),reconcileOriginalOperation:async()=>{check(mock.settle(ref).status==='SUCCESS','FixtureRewardFailed');return (await mock.getTransactionResult(ref)).status==='SUCCESS'?'SUCCESS':'UNRESOLVED';}});
    check(proof.result==='SUCCESS','RecoveryUnresolved');
    negativeResults.push({runId:run.runId,case:'uncertain_response',result:'PASS',layer:'OFFLINE_MOCK',broadcasts:0,originalCorrelationHash:proof.originalHash,reconciledCorrelationHash:proof.reconciledHash,identityCount:1,recoveryResult:proof.result});
    evidence.recovery={uncertainResponse:true,originalHash:null,reconciledHash:null,result:'SUCCESS',identityCount:1,broadcastCount:0};
    // Mock recovery is visible, with unavailable Testnet references explicitly null.
   }else check(mock.settle(ref).status==='SUCCESS','OfflineOperationFailed');
   const after=await snapshot();
   const source=i===0?ACTORS.admin:i===3?ACTORS.recycler:ACTORS.service;
   evidence.operations.push({operation:command.kind,operationId:run.runId+'-'+command.kind,transactionHash:null,ledger:null,timestamp:null,result:'SUCCESS',before,after,requestId:i===0?null:rid,source,authorizers:i===2?[ACTORS.service,ACTORS.collector]:[source]});
   if(i===0&&run.negativeCases.includes('early_reward'))await reject('early_reward',commands[4],'RewardNotEligible');
   if(i===1&&run.negativeCases.includes('invalid_transition'))await reject('invalid_transition',commands[3],'InvalidState');
   if(i===2&&run.negativeCases.includes('unauthorized_recycler'))await reject('unauthorized_recycler',{...commands[3],recycler:ACTORS.collector} as Command,'RoleNotGranted');
   if(i===2)evidence.records.push(collection.record);
   if(i===3)evidence.records.push(recycling.record);
   if(i===4){
    evidence.reward={recipient:run.recipient!,assetCode:'GREENTEST',issuer:p.input.issuer,sac:TOKEN,amountBaseUnits:AMOUNT,recipientBefore:String(beforeBalance),recipientAfter:String(mock.recipientBalance(run.recipient!)),payerBefore:String(payerBefore),payerAfter:String(await mock.getRewardBalance(d.deploymentId)),stateBefore:'PENDING',stateAfter:'SENT',successfulPayments:1,receiptMatched:true,transferMatched:true,beforeLedger:0,afterLedger:0,otherActivity:false};
    if(run.negativeCases.includes('duplicate_reward'))await reject('duplicate_reward',commands[4],'RewardAlreadySent');
   }
  }
  if(run.negativeCases.includes('altered_record')){
   const b=Buffer.from(recycling.record.manifestBase64,'base64');b[0]^=1;
   const v=verifyEvidenceV1({version:1,domain:'BYETERY_EVIDENCE_V1',networkId:NETWORK_ID,contractAddress:CONTRACT,batteryId:run.batteryId,requestId:rid,kind:'RECYCLING',manifestBytes:b,expectedCommitment:recycling.record.commitment});
   check(v.status==='NOT_VERIFIED','AlterationNotDetected');negativeResults.push({runId:run.runId,case:'altered_record',result:'PASS',layer:'OFFLINE_VERIFIER',broadcasts:0,originalPayloadHash:recycling.record.payloadHash,alteredPayloadHash:sha(b),expectedCommitment:recycling.record.commitment,verificationStatus:v.status});
  }
  manifests.push(exportManifest(p.input,run.runId,evidence));
 }
 check(negativeResults.length===6&&new Set(negativeResults.map(n=>n.case)).size===6,'NegativeCoverageIncomplete');
 return {schemaVersion:'BYETERY_D3_OFFLINE_V1',source:'OFFLINE_MOCK',notTestnetCompletion:true,planHash:p.planHash,manifests,negativeResults:negativeResults.sort((a,b)=>a.case.localeCompare(b.case)),operationalSignatures:0,broadcasts:0,networkCalls:0};
}
