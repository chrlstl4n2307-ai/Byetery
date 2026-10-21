/** BYE-W1-003C: reviewed recovery of ONE existing unsigned logical collection. */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Transaction,Networks,Address,Contract,TransactionBuilder,xdr,scValToNative} from '@stellar/stellar-sdk';
import {settings,root} from '../application/config.ts';
import {Repository} from '../application/repository.ts';
import {databaseHealth} from '../application/database.ts';
import {SupabaseAuth} from '../application/auth.ts';
import {Coordinator} from '../application/coordinator.ts';
import {canonical} from '../application/validation.ts';
import {api,listen,close} from '../application/http.ts';
import {LocalSecureStoreSigner,signerProcess} from '../local-secure-store-signer.ts';
import {DomainError,ensure,type Command} from '../domain.ts';
import {evidenceCommitment} from '../evidence.ts';
import {TestnetRpc} from './rpc.ts';
import {TestnetTransport,validateAuth} from './transport.ts';
import {TestnetStellarService} from './service.ts';
import {ACTORS,CONTRACT,WASM,invocation} from './abi.ts';
import {recoveryClassification} from './worker.ts';
import {login,validateState,counts,authorizationSummary,collectionAuthNegatives} from './sprint-return-collection.ts';
import type {PhasedStellarSigner} from '../stellar-signer.ts';
const OP='4fa3fbac-84e4-4845-8abd-fbdff757cbb4',DEPLOYMENT='5c0cad2f-5f25-4216-8068-6cb9d2d26325';
const BATTERY='BYE-W1-002-64257020134D4A0F',REQUEST='5d48643a8915413ed889dd6aa3f8304d10a8c251e384f528ab5461d6e4c8d78c';
const RECIPIENT='GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS';
const PAYLOAD='ef61932cb180ffbafac39eddffaed46dccb6e42366c7999913116d9eb8f73766',COMMITMENT='3bca64581d5aced4a8582f85fe5755b07104e1b7d7cf6201cde90c6ffce5b5ef';
const CONTEXT='5b61120b98b79d6276bcf7054dcc0c515b5b2a9f8b43538c57e961f19c3402f8';
const dir=path.join(root,'.tools/bye-w1-003c'),journal=path.join(dir,'execution.json');
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const save=(value:unknown,first=false)=>writeFile(journal,JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n',first?{flag:'wx'}:{});
const deny=async()=>{throw new DomainError('InspectionCannotSignOrSend');};
/** A provider/resource error is not evidence of contract role enforcement. */
export function assertNoRoleSimulationError(error:string|undefined){
 ensure(typeof error==='string'&&/Error\(Contract,\s*#9\)/.test(error),'NoRoleNegativeNotProven');
}
class ReadOnlyRpc extends TestnetRpc {override async send(){return deny();}}
async function run(action:string){
 ensure(['--inspect','--execute-reviewed'].includes(action),'ExplicitRecoveryActionRequired');
 ensure(git('branch','--show-current')==='instaward/d1-testnet-integration','WrongBranch');
 ensure(git('rev-parse','instaward-sprint-start-v1^{}')==='349ee3fd78104f3c249b3052b1cca402c9d99ff3'&&git('rev-parse','pre-instaward-baseline-v1^{}')==='450c21b151a0973064986327f09d55e4f36c43e0','TagChanged');
 await mkdir(dir,{recursive:true});
 const config={...await settings(),mode:'TESTNET' as const,deploymentId:DEPLOYMENT},repo=new Repository(config);
 try{
  const rpc=new ReadOnlyRpc(),read=new TestnetTransport(rpc,{authorize:deny,signEnvelope:deny},{validate:deny},deny,DEPLOYMENT);
  const probe=new TestnetStellarService(repo,rpc,{authorize:deny,signEnvelope:deny});
  const work=await probe.store.work(OP),identity=await probe.store.identity(OP);
  ensure(recoveryClassification(work,identity)==='UNSIGNED_PREPARATION_INTERRUPTED','UnexpectedIdentityOrDispatch');
  ensure(work.deploymentId===DEPLOYMENT&&work.command.kind==='confirm_collection'&&work.contextHash===CONTEXT,'OriginalOperationMismatch');
  const command=work.command;ensure(command.batteryId===BATTERY&&command.requestId===REQUEST&&command.collector===ACTORS.collector&&command.evidence.payloadHash===PAYLOAD,'ImmutableCommandMismatch');
  ensure(sha(canonical(command))===CONTEXT&&JSON.stringify(work.argumentsXdr)===JSON.stringify(invocation(command).args.map(a=>a.toXDR('base64'))),'ImmutableContextMismatch');
  const checks=await validateState(repo,read,'RETURNED'),request=await read.request(REQUEST);
  ensure(request?.state==='OPEN'&&request.batteryId===BATTERY&&request.recipient===RECIPIENT,'RequestMismatch');
  ensure(await probe.hasRole(DEPLOYMENT,ACTORS.collector,'COLLECTOR'),'CollectorRoleMissing');
  const facts=(await repo.pool.query(`select o.idempotency_key,o.principal,o.state,u.auth_user_id,e.manifest_bytes,e.payload_hash,e.commitment,
    exists(select 1 from api_private.memberships m where m.deployment_id=o.deployment_id and m.user_id=u.id and m.role='COLLECTOR' and m.actor_address=$2 and m.enabled) member_valid,
    exists(select 1 from api_private.idempotency i where i.deployment_id=o.deployment_id and i.user_id=u.id and i.key=o.idempotency_key and i.operation_id=o.id and i.response_body is null) original_context,
    exists(select 1 from app_private.return_requests a join chain_private.return_requests c using(deployment_id,request_id) where a.deployment_id=o.deployment_id and a.request_id=o.request_id and a.recipient_snapshot=$3 and a.reservation_state='HELD' and c.state='OPEN') request_valid
    from app_private.stellar_operations o join app_private.users u on u.id::text=o.principal join auth.users a on a.id=u.auth_user_id
    join app_private.evidence_versions e on e.deployment_id=o.deployment_id and e.battery_id=o.battery_id and e.request_id=o.request_id and e.kind='COLLECTION'
    where o.id=$1 and u.status='ACTIVE'`,[OP,ACTORS.collector,RECIPIENT])).rows;
  ensure(facts.length===1&&facts[0].member_valid&&facts[0].original_context&&facts[0].request_valid&&facts[0].state==='QUEUED','OriginalPrincipalOrContextInvalid');
  const f=facts[0],raw=Buffer.from(f.manifest_bytes);
  ensure(sha(raw)===PAYLOAD&&Buffer.from(f.payload_hash).toString('hex')===PAYLOAD&&Buffer.from(f.commitment).toString('hex')===COMMITMENT&&evidenceCommitment(checks.ready.config,command.evidence)===COMMITMENT,'ImmutableEvidenceMismatch');
  const source=await rpc.account(ACTORS.service);
  const gate={task:'BYE-W1-003C',observedAt:new Date().toISOString(),operationId:OP,classification:'UNSIGNED_PREPARATION_INTERRUPTED',batteryId:BATTERY,requestId:REQUEST,recipient:RECIPIENT,
   source:{address:ACTORS.service,sequence:source.account.sequenceNumber(),balance:source.balance,ledger:source.ledger,externalUse:'UNCONFIRMED; treat as shared'},
   latestLedger:checks.ready.latest.sequence,network:'TESTNET',contract:CONTRACT,wasm:WASM,ttl:'PASS',manifestHash:PAYLOAD,commitment:COMMITMENT,
   collector:ACTORS.collector,collectorRole:true,collectorMembership:true,originalContext:true,identityCount:0,dispatches:0,counts:await counts(repo)};
  await writeFile(path.join(dir,'gate.json'),JSON.stringify(gate,null,2)+'\n');
  if(action==='--inspect'){console.log(JSON.stringify(gate,null,2));return;}
  ensure(git('status','--porcelain','--','backend','scripts','tools/stellar-secure-store-signer')==='','TestedImplementationCheckpointRequired');
  const verification=JSON.parse(await readFile(path.join(dir,'verification.json'),'utf8'));ensure(verification.head===git('rev-parse','HEAD')&&verification.allPassed,'VerificationGateRequired');
  const binary=path.join(root,'tools/stellar-secure-store-signer/target/debug/byetery-secure-store-signer.exe');
  ensure(sha(await readFile(binary))==='85f980b2e0dfd3bd2b098daa78c0e743cc07fb5baf18da59aa8fd83dfb9843cb','SignerBinaryChanged');
  const record:Record<string,any>={...gate,startingHead:'65478adb8d251b8bbee26be31b02d3c4f523b8ce',implementationHead:verification.head,stage:'REVIEWED_RESUME_INTENT',decisionId:'BYE-W1-003C-EXPLICIT-OWNER-RECOVERY',before:gate.counts};
  await save(record,true); // Never overwrite an uncertain previous execution or reset 003B.
  const token=await login(config,f.auth_user_id,'BYETERY-INSTAWARD-COLLECTOR-1');
  const liveRpc=new TestnetRpc(),underlying=new LocalSecureStoreSigner(signerProcess(binary)),healthy=databaseHealth(repo.pool).guard();
  let authCalls=0,envelopeCalls=0,broadcasts=0,first=true;
  const simulate=liveRpc.simulate.bind(liveRpc);
  liveRpc.simulate=async encoded=>{
   const result=await simulate(encoded),tx=new Transaction(encoded,Networks.TESTNET),e=tx.toEnvelope();
   if(e.type==='envelopeTypeTx'){
    const b=e.v1.tx.operations[0].body;
    if(b.type==='invokeHostFunction'&&b.invokeHostFunctionOp.hostFunction.type==='hostFunctionTypeInvokeContract'){
     const call=b.invokeHostFunctionOp.hostFunction.invokeContract;
     if(call.functionName.toString()==='confirm_collection'&&scValToNative(call.args[2])===ACTORS.collector)
      record.simulation={ledger:result.latestLedger,resourceFee:result.minResourceFee,restorePreamble:Boolean(result.restorePreamble),authEntryCount:result.results?.[0]?.auth?.length??0,
       resources:result.transactionData?xdr.SorobanTransactionData.fromXDR(result.transactionData,'base64').resources.toXdrObject():null};
    }
   }return result;
  };
  const signer:PhasedStellarSigner={authorize:async input=>{
   healthy();ensure(input.method==='confirm_collection','MethodScopeViolation');
   const tx=new Transaction(input.transactionXdr,Networks.TESTNET);validateAuth(tx,command);
   record.preSign={source:tx.source,sequence:tx.sequence,fee:tx.fee,classicFee:(BigInt(tx.fee)-BigInt(record.simulation.resourceFee)).toString(),
    auth:authorizationSummary(tx),currentLedger:input.currentLedger,expirationLedger:input.expirationLedger,timeBounds:tx.timeBounds};
   record.negatives=collectionAuthNegatives(tx,command);
   ensure(!(await read.read('has_role',[new Address(RECIPIENT).toScVal(),xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Collector')])])).value,'NoRoleProbeUnexpectedRole');
   const a=await liveRpc.account(ACTORS.service),l=await liveRpc.latest(),args=invocation(command).args;args[2]=new Address(RECIPIENT).toScVal();
   const negative=new TransactionBuilder(a.account,{fee:'10000',networkPassphrase:Networks.TESTNET}).addOperation(new Contract(CONTRACT).call('confirm_collection',...args)).setTimebounds(0,Number(l.closeTime)+120).build();
   const rejected=await liveRpc.simulate(negative.toXDR());assertNoRoleSimulationError(rejected.error);ensure(broadcasts===0,'NoRoleNegativeAccepted');
   record.negatives.noRoleCollector='PASS_UNSIGNED_RPC_SIMULATION';
   record.negatives.noRoleContractError='RoleNotGranted (#9)';
   const b=await read.battery(BATTERY),r=await read.request(REQUEST);ensure(b.value?.state==='RETURNED'&&r?.state==='OPEN','NegativeChangedChainState');
   record.writeBeforeHelperGate='PASS';await save(record);healthy();authCalls++;
   const signed=await underlying.authorize(input);record.authorizedAuth=authorizationSummary(new Transaction(signed.transactionXdr,Networks.TESTNET));return signed;
  },signEnvelope:async(input,hash)=>{
   healthy();validateAuth(new Transaction(input.transactionXdr,Networks.TESTNET),command);envelopeCalls++;
   const signed=await underlying.signEnvelope(input,hash);record.hashBodyVerification='PASS';record.sdkHash=hash;await save(record);return signed;
  }};
  const service=new TestnetStellarService(repo,liveRpc,signer);
  const sourceCheck=service.transport.assertSourceSequence.bind(service.transport),send=liveRpc.send.bind(liveRpc);
  let durableHash:string|undefined,durableBytes:Buffer|undefined;
  service.transport.assertSourceSequence=async i=>{
   const durable=await service.store.identity(OP);ensure(durable&&durable.operationId===i.operationId&&durable.transactionHash===i.transactionHash&&Buffer.from(durable.envelopeBytes).equals(Buffer.from(i.envelopeBytes)),'DurableReadbackMismatch');
   durableHash=i.transactionHash;durableBytes=Buffer.from(durable.envelopeBytes);healthy();return sourceCheck(i);
  };
  liveRpc.send=async encoded=>{healthy();const tx=new Transaction(encoded,Networks.TESTNET);validateAuth(tx,command);
   ensure(broadcasts===0&&Buffer.from(tx.hash()).toString('hex')===durableHash&&durableBytes&&Buffer.from(encoded,'base64').equals(durableBytes),'BroadcastScopeViolation');
   broadcasts++;return send(encoded);};
  const review={operationId:OP,contextHash:CONTEXT,decisionId:record.decisionId};
  const processor={process:async(id:string)=>{ensure(id===OP,'OriginalOperationOnly');if(first){first=false;return service.resumeUnsigned(review);}return service.process(OP);}};
  const coordinator=new Coordinator(repo,{},undefined,processor),server=api(new SupabaseAuth(config),coordinator),url=await listen(server);
  const body={evidence:{batteryId:BATTERY,requestId:REQUEST,kind:'COLLECTION',manifestBase64:raw.toString('base64')}};
  const call=async()=>{const response=await fetch(url+`/api/returns/${REQUEST}/collection`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':f.idempotency_key},body:JSON.stringify(body),signal:AbortSignal.timeout(120000),redirect:'error'});return {status:response.status,body:await response.json() as Record<string,any>};};
  try{
   const response=await call();record.initialApi=response;await save(record);ensure(response.body.operationId===OP,'OriginalOperationLost');
   for(let i=0;i<30;i++){
    const w=await service.store.work(OP);if(w.state==='PROJECTED'||w.state==='CONFIRMED_FAILED')break;
    ensure(!await service.store.requiresReview(OP),'REVIEWED_RESOLUTION_REQUIRED');ensure(await service.store.identity(OP),'UnsignedRecoveryInterruptedAgain');
    await new Promise(resolve=>setTimeout(resolve,2000));await service.process(OP);
   }
   const w=await service.store.work(OP),i=await service.store.identity(OP);ensure(w.state==='PROJECTED'&&w.confirmation&&i,'OriginalHashUnresolved');
   const post=await validateState(repo,read,'COLLECTED'),req=await read.request(REQUEST);
   ensure(post.chain.value?.collector===ACTORS.collector&&post.chain.value.collectionHash===COMMITMENT&&req?.state==='CONFIRMED'&&req.recipient===RECIPIENT,'CollectionPostStateMismatch');
   const projection=(await repo.pool.query(`select b.collector,encode(b.collection_hash,'hex') hash,c.state,r.recipient_snapshot,r.association_confirmed_at from chain_private.batteries b
    join chain_private.return_requests c on c.deployment_id=b.deployment_id and c.request_id=b.request_id join app_private.return_requests r on r.deployment_id=b.deployment_id and r.request_id=b.request_id
    where b.deployment_id=$1 and b.battery_id=$2`,[DEPLOYMENT,BATTERY])).rows[0];
   ensure(projection&&projection.collector===ACTORS.collector&&projection.hash===COMMITMENT&&projection.state==='CONFIRMED'&&projection.recipient_snapshot===RECIPIENT&&projection.association_confirmed_at,'ProjectionMismatch');
   const obs=(await repo.pool.query(`select kind,evidence,created_at from api_private.testnet_observations where operation_id=$1 and kind in ('DISPATCH_INTENT','SUBMIT_RESPONSE') order by id`,[OP])).rows;
   const persisted=(await repo.pool.query('select created_at from api_private.testnet_envelopes where operation_id=$1',[OP])).rows[0];
   const dispatch=obs.find(v=>v.kind==='DISPATCH_INTENT'),submitted=obs.find(v=>v.kind==='SUBMIT_RESPONSE');
   ensure(persisted&&dispatch&&submitted?.evidence.sourceCheck&&new Date(persisted.created_at)<=new Date(dispatch.created_at)&&w.dispatchAttempts===1,'DurabilityEvidenceIncomplete');
   const before=await counts(repo),duplicate=await call(),after=await counts(repo);ensure(duplicate.body.operationId===OP&&duplicate.status===200&&JSON.stringify(before)===JSON.stringify(after)&&broadcasts===1,'DuplicateCreatedOperation');
   ensure(authCalls===1&&envelopeCalls===1&&after.operations===record.before.operations&&after.identities===record.before.identities+1&&after.dispatches===record.before.dispatches+1,'OneIdentityRule');
   ensure(JSON.stringify((await read.battery(BATTERY)).value)===JSON.stringify(post.chain.value),'ReplayChangedState');
   record.stage='COLLECTION_CONFIRMED';record.transactionHash=i.transactionHash;record.confirmationLedger=w.confirmation.confirmationLedger;record.actualFee=xdr.TransactionResult.fromXDR(w.confirmation.resultXdr,'base64').feeCharged.toString();
   record.identity={source:i.sourceAccount,sequence:i.sequence,preparedLedger:i.preparedLedger,authorizationExpirations:i.authorizationExpirations,minTime:i.minTime,maxTime:i.maxTime};
   record.durability={persistedAt:persisted.created_at,dispatchIntentAt:dispatch.created_at,persistedBeforeSend:true,sourceCheck:submitted.evidence.sourceCheck};
   record.postBattery=post.chain;record.postRequest=req;record.sqlProjection=projection;record.evidence={manifestUtf8:raw.toString('utf8'),payloadHash:PAYLOAD,commitment:COMMITMENT,reused:true};
   record.events=w.confirmation.events.map(v=>{const e=xdr.ContractEvent.fromXDR(v,'base64');return {topics:e.body.value.topics.map(t=>scValToNative(t)),data:scValToNative(e.body.value.data)};});
   record.sorobanReturn=w.confirmation.sorobanResult?scValToNative(xdr.ScVal.fromXDR(w.confirmation.sorobanResult,'base64')):null;
   record.duplicate={status:'PASS',before,after};record.authCalls=authCalls;record.envelopeCalls=envelopeCalls;record.broadcasts=broadcasts;record.additionalBroadcasts=0;record.newLogicalOperations=0;await save(record);
   console.log(JSON.stringify({task:record.task,status:'PASS',operationId:OP,transactionHash:i.transactionHash,confirmationLedger:record.confirmationLedger,actualFee:record.actualFee,battery:'COLLECTED',request:'CONFIRMED',source:'TESTNET',broadcasts:1,newLogicalOperations:0}));
  }finally{await close(server);}
 }finally{await repo.pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))await run(process.argv[2]??'').catch(e=>{console.error(JSON.stringify({task:'BYE-W1-003C',status:'STOPPED',code:e instanceof DomainError?e.code:'RecoveryStopped',noAutomaticRetry:true}));process.exitCode=1;});
