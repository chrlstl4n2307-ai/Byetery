/** BYE-W1-004: one recycling then one atomic reward, through the existing HTTP application. */
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Asset,Keypair,Account,Operation,Address,Contract,Transaction,TransactionBuilder,Networks,xdr,scValToNative} from '@stellar/stellar-sdk';
import {settings,root} from '../application/config.ts';
import {Repository} from '../application/repository.ts';
import {databaseHealth} from '../application/database.ts';
import {SupabaseAuth} from '../application/auth.ts';
import {Coordinator} from '../application/coordinator.ts';
import {api,listen,close} from '../application/http.ts';
import {LocalSecureStoreSigner,signerProcess} from '../local-secure-store-signer.ts';
import {DomainError,ensure,type Command} from '../domain.ts';
import {evidenceCommitment} from '../evidence.ts';
import type {PhasedStellarSigner} from '../stellar-signer.ts';
import {TestnetRpc} from './rpc.ts';
import {TestnetTransport,validateAuth} from './transport.ts';
import {TestnetStellarService} from './service.ts';
import {ACTORS,CONTRACT,TOKEN,WASM,invocation} from './abi.ts';
import {NETWORK_ID} from './identity.ts';
import {login,authorizationSummary,counts} from './sprint-return-collection.ts';
import {assertNoRoleSimulationError} from './sprint-collection-recovery.ts';
const D='5c0cad2f-5f25-4216-8068-6cb9d2d26325',B='BYE-W1-002-64257020134D4A0F',R='5d48643a8915413ed889dd6aa3f8304d10a8c251e384f528ab5461d6e4c8d78c';
const USER='c422b2da-f838-4da3-90b5-9eb18347bace',RECIPIENT='GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS';
const ISSUER='GCHROKHXHL4L635J6Y6DWFFD5DDHABOAF4BP5TEUZDZQMW4XYS6DIDL7',COLLECTION='3bca64581d5aced4a8582f85fe5755b07104e1b7d7cf6201cde90c6ffce5b5ef';
const dir=path.join(root,'.tools/bye-w1-004'),sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const json=(v:unknown)=>JSON.stringify(v,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const deny=async()=>{throw new DomainError('ReadOnlyCannotSignOrSend');};
class ReadOnlyRpc extends TestnetRpc{override async send(){return deny();}}
export function recyclingAuthNegatives(tx:Transaction,command:Command){
 ensure(command.kind==='confirm_recycling','RecyclingRequired');validateAuth(tx,command);
 const rejected=(work:()=>void)=>{try{work();}catch(e){ensure(e instanceof DomainError,'UnexpectedNegativeError');return 'PASS';}throw new DomainError('NegativeAccepted');};
 const env=tx.toEnvelope();ensure(env.type==='envelopeTypeTx','UnexpectedAuthorization');const op=env.v1.tx.operations[0].body;ensure(op.type==='invokeHostFunction','UnexpectedAuthorization');
 const missing=new TransactionBuilder(new Account(tx.source,(BigInt(tx.sequence)-1n).toString()),{fee:tx.fee,networkPassphrase:Networks.TESTNET})
  .addOperation(Operation.invokeHostFunction({func:op.invokeHostFunctionOp.hostFunction,auth:[]})).setTimebounds(0,Number(tx.timeBounds!.maxTime)).build();
 return {missingRecycler:rejected(()=>validateAuth(missing,command)),wrongRecycler:rejected(()=>validateAuth(tx,{...command,recycler:ACTORS.collector})),invalidBroadcasts:0};
}
export function checkTrustline(flags:number,balance:string,limit:string,buying:string){
 ensure((flags&1)===1,'RecipientTrustlineNotAuthorized');
 ensure(BigInt(limit)-BigInt(balance)-BigInt(buying)>=100000000n,'RecipientTrustlineCapacity');
}
async function assets(rpc:TestnetRpc,read:TestnetTransport){
 const asset=new Asset('GREENTEST',ISSUER);ensure(asset.contractId(Networks.TESTNET)===TOKEN,'AssetSacMismatch');
 const key=xdr.LedgerKey.trustline(new xdr.LedgerKeyTrustLine({accountId:Keypair.fromPublicKey(RECIPIENT).xdrAccountId(),asset:asset.toTrustLineXDRObject()}));
 const result=await rpc.entries([key]),entry=result.entries?.find(v=>v.key===key.toXDR('base64'));
 if(!entry)return {ledger:result.latestLedger,recipientAcceptance:'MISSING_TRUSTLINE' as const,recipientBalance:null,contractBalance:null};
 const value=xdr.LedgerEntryData.fromXDR(entry.xdr,'base64');ensure(value.type==='trustline','UnexpectedAssetEntry');const t=value.trustLine;
 const buying=t.ext.type==='v1'?t.ext.v1.liabilities.buying.toString():'0';
 checkTrustline(t.flags,t.balance.toString(),t.limit.toString(),buying);
 const recipient=await read.read('balance',[new Address(RECIPIENT).toScVal()],TOKEN),contract=await read.read('balance',[new Address(CONTRACT).toScVal()],TOKEN);
 ensure(BigInt(recipient.value)===BigInt(t.balance.toString()),'RecipientBalanceObservationMismatch');
 return {ledger:result.latestLedger,recipientAcceptance:'PASS' as const,recipientBalance:String(recipient.value),contractBalance:String(contract.value),limit:t.limit.toString(),flags:t.flags,buyingLiabilities:buying};
}
async function state(repo:Repository,read:TestnetTransport,physical:string,reward:string){
 ensure(sha(await readFile(path.join(root,'contracts/byetery-contract/target/wasm32v1-none/release/byetery_contract.wasm')))===WASM,'WasmMismatch');
 const ready=await read.readiness(),b=await read.battery(B),r=await read.request(R);
 ensure(b.value?.state===physical&&b.value.rewardState===reward&&b.value.requestId===R&&b.value.collector===ACTORS.collector&&b.value.collectionHash===COLLECTION,'UnexpectedLifecycle');
 ensure(r?.state==='CONFIRMED'&&r.batteryId===B&&r.recipient===RECIPIENT,'RecipientChanged');
 const c=await repo.transaction(db=>repo.config(db));ensure(c.networkId===NETWORK_ID&&c.contractAddress===CONTRACT&&c.rewardToken===TOKEN&&c.rewardAmount===100000000n,'DeploymentMismatch');
 const p=(await repo.pool.query(`select b.state,b.reward_state,b.recycler,encode(b.recycling_hash,'hex') recycling_hash,encode(b.collection_hash,'hex') collection_hash,
 r.state request_state,r.recipient,a.recipient_snapshot,a.association_confirmed_at,encode(d.wasm_hash,'hex') wasm
 from chain_private.batteries b join chain_private.return_requests r on r.deployment_id=b.deployment_id and r.request_id=b.request_id
 join app_private.return_requests a on a.deployment_id=b.deployment_id and a.request_id=b.request_id join chain_private.deployments d on d.id=b.deployment_id
 where b.deployment_id=$1 and b.battery_id=$2`,[D,B])).rows[0];
 ensure(p&&p.state===physical&&p.reward_state===reward&&p.request_state==='CONFIRMED'&&p.recipient===RECIPIENT&&p.recipient_snapshot===RECIPIENT&&p.association_confirmed_at&&p.collection_hash===COLLECTION&&p.wasm===WASM,'ProjectionMismatch');
 return {ready,battery:b,request:r,projection:p};
}
async function run(action:string){
 ensure(['--inspect','--assets','--recycling','--reward'].includes(action),'ExplicitActionRequired');
 ensure(git('branch','--show-current')==='instaward/d1-testnet-integration','WrongBranch');
 ensure(git('rev-parse','instaward-sprint-start-v1^{}')==='349ee3fd78104f3c249b3052b1cca402c9d99ff3'&&git('rev-parse','pre-instaward-baseline-v1^{}')==='450c21b151a0973064986327f09d55e4f36c43e0','TagChanged');
 await mkdir(dir,{recursive:true});const config={...await settings(),mode:'TESTNET' as const,deploymentId:D},repo=new Repository(config);
 const rpcRead=new ReadOnlyRpc(),read=new TestnetTransport(rpcRead,{authorize:deny,signEnvelope:deny},{validate:deny},deny,D);
 try{
  if(action==='--assets'){const result=await assets(rpcRead,read);await writeFile(path.join(dir,'asset-read.json'),json(result));console.log(json(result));return;}
  const reward=action==='--reward',before=await state(repo,read,reward?'RECYCLED':'COLLECTED',reward?'PENDING':'NOT_ELIGIBLE');
  const member=(await repo.pool.query(`select u.id business_id,u.auth_user_id from api_private.memberships m join app_private.users u on u.id=m.user_id join auth.users a on a.id=u.auth_user_id
   where m.deployment_id=$1 and m.role='RECYCLER' and m.actor_address=$2 and m.enabled and u.status='ACTIVE' and a.raw_user_meta_data->>'display_name'='BYETERY-INSTAWARD-RECYCLER-1'`,[D,ACTORS.recycler])).rows;
  ensure(member.length===1,'RECYCLER_APP_PRINCIPAL_REQUIRED');
  ensure((await read.read('has_role',[new Address(ACTORS.recycler).toScVal(),xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Recycler')])])).value===true,'RecyclerRoleMissing');
  if(action==='--inspect'){console.log(json({task:'BYE-W1-004',before,memberCount:1,recyclerRole:true}));return;}
  ensure(git('status','--porcelain','--','backend','scripts','tools/stellar-secure-store-signer')==='','ImplementationCheckpointRequired');
  const verify=JSON.parse(await readFile(path.join(dir,'verification.json'),'utf8'));ensure(verify.head===git('rev-parse','HEAD')&&verify.allPassed,'VerificationGateRequired');
  const kind=reward?'pay_reward':'confirm_recycling',file=path.join(dir,reward?'reward.json':'recycling.json');
  ensure((await repo.pool.query('select 1 from app_private.stellar_operations where deployment_id=$1 and battery_id=$2 and command=$3',[D,B,kind])).rows.length===0,'ExistingOperationRequiresReview');
  let balances:Awaited<ReturnType<typeof assets>>|null=null;
  if(reward){
   const prior=JSON.parse(await readFile(path.join(dir,'recycling.json'),'utf8'));ensure(prior.stage==='CONFIRMED'&&before.battery.value?.recycler===ACTORS.recycler&&before.battery.value.recyclingHash===prior.commitment,'RecyclingNotConfirmed');
   balances=await assets(rpcRead,read);await writeFile(path.join(dir,'reward-gate.json'),json(balances));
   ensure(balances.recipientAcceptance==='PASS','RECIPIENT_ASSET_ACCEPTANCE_REQUIRED');ensure(BigInt(balances.contractBalance!)>=100000000n,'InsufficientRewardBalance');
  }
  const binary=path.join(root,'tools/stellar-secure-store-signer/target/debug/byetery-secure-store-signer.exe');ensure(sha(await readFile(binary))==='85f980b2e0dfd3bd2b098daa78c0e743cc07fb5baf18da59aa8fd83dfb9843cb','SignerBinaryChanged');
  const raw=reward?null:Buffer.from(JSON.stringify({version:1,task:'BYE-W1-004',fixture:true,batteryId:B,requestId:R,kind:'RECYCLING',attestation:'Synthetic Testnet demonstration evidence; NOT proof of physical recycling, custody, environmental benefit, regulatory compliance or material recovery.',nonce:randomBytes(16).toString('hex')}));
  const evidence=raw?{version:1 as const,batteryId:B,requestId:R,kind:'RECYCLING' as const,payloadHash:sha(raw)}:null;
  const record:Record<string,any>={task:'BYE-W1-004',kind,stage:'API_INTENT',startingHead:'1779a45251d818afaa5ab8fe2a297d1abc04f2ea',implementationHead:verify.head,startedAt:new Date().toISOString(),batteryId:B,requestId:R,recipient:RECIPIENT,amount:'100000000',asset:'GREENTEST',token:TOKEN,key:randomUUID(),before:await counts(repo),preState:before.battery,balanceBefore:balances,sourceUse:'UNCONFIRMED; treat source as shared'};
  if(evidence){record.manifestUtf8=raw!.toString('utf8');record.manifestHash=evidence.payloadHash;record.commitment=evidenceCommitment(before.ready.config,evidence);}
  const save=()=>writeFile(file,json(record));await writeFile(file,json(record),{flag:'wx'});
  const recyclerToken=await login(config,member[0].auth_user_id,'BYETERY-INSTAWARD-RECYCLER-1'),userToken=await login(config,USER,'BYETERY-INSTAWARD-USER-1');
  const rpc=new TestnetRpc(),underlying=new LocalSecureStoreSigner(signerProcess(binary)),healthy=databaseHealth(repo.pool).guard();
  let authCalls=0,envelopeCalls=0,broadcasts=0,operationId:string|undefined,durableHash:string|undefined,durableBytes:Buffer|undefined;
  const simulation=rpc.simulate.bind(rpc);rpc.simulate=async encoded=>{
   const result=await simulation(encoded),t=new Transaction(encoded,Networks.TESTNET),env=t.toEnvelope();
   if(env.type==='envelopeTypeTx'){const b=env.v1.tx.operations[0].body;
    if(b.type==='invokeHostFunction'&&b.invokeHostFunctionOp.hostFunction.type==='hostFunctionTypeInvokeContract'){
     const call=b.invokeHostFunctionOp.hostFunction.invokeContract;
     if(call.functionName.toString()===kind&&(reward||scValToNative(call.args[2])===ACTORS.recycler)){
      const resources=result.transactionData?xdr.SorobanTransactionData.fromXDR(result.transactionData,'base64').resources:null;
      record.simulation={ledger:result.latestLedger,resourceFee:result.minResourceFee??null,restorePreamble:Boolean(result.restorePreamble),authEntries:result.results?.[0]?.auth?.length??0,resources:resources?{instructions:resources.instructions,diskReadBytes:resources.diskReadBytes,writeBytes:resources.writeBytes,readOnlyEntries:resources.footprint.readOnly.length,readWriteEntries:resources.footprint.readWrite.length}:null};
     }
    }
   }return result;
  };
  const signer:PhasedStellarSigner={authorize:async input=>{
   healthy();ensure(input.method===kind&&operationId,'MethodScopeViolation');const w=await service.store.work(operationId),tx=new Transaction(input.transactionXdr,Networks.TESTNET);validateAuth(tx,w.command);
   record.preSign={source:tx.source,sequence:tx.sequence,totalFee:tx.fee,classicFee:(BigInt(tx.fee)-BigInt(record.simulation.resourceFee)).toString(),auth:authorizationSummary(tx),currentLedger:input.currentLedger,expirationLedger:input.expirationLedger,timeBounds:tx.timeBounds};
   if(!reward){
    ensure(w.command.kind==='confirm_recycling','WrongCommand');record.negatives={...record.negatives,...recyclingAuthNegatives(tx,w.command)};
    ensure((await read.read('has_role',[new Address(RECIPIENT).toScVal(),xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Recycler')])])).value===false,'NoRoleProbeUnexpectedRole');
    const args=invocation(w.command).args;args[2]=new Address(RECIPIENT).toScVal();const a=await rpc.account(ACTORS.recycler),l=await rpc.latest();
    const bad=new TransactionBuilder(a.account,{fee:'10000',networkPassphrase:Networks.TESTNET}).addOperation(new Contract(CONTRACT).call(kind,...args)).setTimebounds(0,Number(l.closeTime)+120).build();
    assertNoRoleSimulationError((await rpc.simulate(bad.toXDR())).error);record.negatives.noRoleRecycler='PASS_UNSIGNED_RPC_RoleNotGranted_9';
    const persisted=(await repo.pool.query("select manifest_bytes,encode(payload_hash,'hex') hash,encode(commitment,'hex') commitment,revision from app_private.evidence_versions where deployment_id=$1 and battery_id=$2 and request_id=decode($3,'hex') and kind='RECYCLING'",[D,B,R])).rows;
    ensure(persisted.length===1&&Buffer.from(persisted[0].manifest_bytes).equals(raw!)&&persisted[0].hash===record.manifestHash&&persisted[0].commitment===record.commitment&&persisted[0].revision===1,'ImmutableEvidenceMismatch');record.evidenceRevision=1;
    ensure((await read.battery(B)).value?.state==='COLLECTED'&&broadcasts===0,'NegativeChangedState');
   }
   record.writeBeforeHelperGate='PASS';await save();healthy();authCalls++;const signed=await underlying.authorize(input);record.authorizedAuth=authorizationSummary(new Transaction(signed.transactionXdr,Networks.TESTNET));return signed;
  },signEnvelope:async(input,hash)=>{healthy();ensure(operationId,'OperationMissing');validateAuth(new Transaction(input.transactionXdr,Networks.TESTNET),(await service.store.work(operationId)).command);healthy();envelopeCalls++;const signed=await underlying.signEnvelope(input,hash);record.sdkHash=hash;record.hashBodyVerification='PASS';await save();return signed;}};
  const service=new TestnetStellarService(repo,rpc,signer),check=service.transport.assertSourceSequence.bind(service.transport),send=rpc.send.bind(rpc);
  service.transport.assertSourceSequence=async i=>{const durable=await service.store.identity(i.operationId);ensure(durable&&durable.transactionHash===i.transactionHash&&Buffer.from(durable.envelopeBytes).equals(Buffer.from(i.envelopeBytes)),'DurableReadbackMismatch');durableHash=i.transactionHash;durableBytes=Buffer.from(i.envelopeBytes);healthy();return check(i);};
  rpc.send=async encoded=>{healthy();const tx=new Transaction(encoded,Networks.TESTNET);ensure(broadcasts===0&&durableHash===Buffer.from(tx.hash()).toString('hex')&&durableBytes&&Buffer.from(encoded,'base64').equals(durableBytes),'BroadcastScopeViolation');broadcasts++;return send(encoded);};
  const processor={process:async(id:string)=>{ensure(!operationId||operationId===id,'SecondLogicalOperation');operationId=id;record.operationId=id;await save();return service.process(id);}};
  const coordinator=new Coordinator(repo,{},undefined,processor),server=api(new SupabaseAuth(config),coordinator),url=await listen(server);
  const body=reward?{}:{evidence:{batteryId:B,requestId:R,kind:'RECYCLING',manifestBase64:raw!.toString('base64')}},route=reward?`/api/batteries/${B}/reward`:`/api/returns/${R}/recycling`;
  const call=async(token:string,key:string)=>{const response=await fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(150000),redirect:'error'});return {status:response.status,body:await response.json() as Record<string,any>};};
  try{
   if(!reward){const before=await counts(repo),bad=await call(userToken,randomUUID()),after=await counts(repo);ensure(bad.status===403&&JSON.stringify(before)===JSON.stringify(after)&&!operationId,'WrongApplicationPrincipalAccepted');record.negatives={wrongApplicationPrincipal:'PASS_HTTP_403',invalidBroadcasts:0};await save();}
   const response=await call(reward?userToken:recyclerToken,record.key);record.initialApi=response;await save();ensure(operationId&&response.body.operationId===operationId,'OriginalOperationLost');
   for(let n=0;n<30;n++){const w=await service.store.work(operationId);if(w.state==='PROJECTED'||w.state==='CONFIRMED_FAILED')break;ensure(!await service.store.requiresReview(operationId),'REVIEWED_RESOLUTION_REQUIRED');ensure(await service.store.identity(operationId),'UnsignedPreparationInterrupted');await new Promise(r=>setTimeout(r,2000));await service.process(operationId);}
   const w=await service.store.work(operationId),i=await service.store.identity(operationId);ensure(w.state==='PROJECTED'&&w.confirmation&&i,'OriginalHashUnresolved');
   const post=await state(repo,read,'RECYCLED',reward?'SENT':'PENDING');ensure(post.battery.value?.recycler===ACTORS.recycler,'RecyclerPostMismatch');
   if(!reward)ensure(post.battery.value?.recyclingHash===record.commitment&&post.projection.recycling_hash===record.commitment,'CommitmentPostMismatch');
   const envelope=(await repo.pool.query('select created_at from api_private.testnet_envelopes where operation_id=$1',[operationId])).rows[0];
   const observations=(await repo.pool.query("select kind,evidence,created_at from api_private.testnet_observations where operation_id=$1 and kind in ('DISPATCH_INTENT','SUBMIT_RESPONSE') order by id",[operationId])).rows;
   const intent=observations.find(v=>v.kind==='DISPATCH_INTENT'),submit=observations.find(v=>v.kind==='SUBMIT_RESPONSE');
   ensure(envelope&&intent&&submit?.evidence.sourceCheck&&new Date(envelope.created_at)<=new Date(intent.created_at)&&w.dispatchAttempts===1,'DurabilityEvidenceIncomplete');
   record.durability={persistedAt:envelope.created_at,dispatchIntentAt:intent.created_at,sourceCheck:submit.evidence.sourceCheck,persistedBeforeSend:true};
   record.transactionHash=i.transactionHash;record.confirmationLedger=w.confirmation.confirmationLedger;record.actualFee=xdr.TransactionResult.fromXDR(w.confirmation.resultXdr,'base64').feeCharged.toString();record.identity={source:i.sourceAccount,sequence:i.sequence,preparedLedger:i.preparedLedger,authorizationExpirations:i.authorizationExpirations,timeBounds:{min:i.minTime,max:i.maxTime}};record.postBattery=post.battery;record.postRequest=post.request;record.sqlProjection=post.projection;record.events=w.confirmation.events.map(v=>{const e=xdr.ContractEvent.fromXDR(v,'base64');return {topics:e.body.value.topics.map(t=>scValToNative(t)),data:scValToNative(e.body.value.data)};});record.sorobanReturn=w.confirmation.sorobanResult?scValToNative(xdr.ScVal.fromXDR(w.confirmation.sorobanResult,'base64')):null;
   if(reward){const after=await assets(rpcRead,read);ensure(after.recipientAcceptance==='PASS'&&BigInt(after.recipientBalance!)-BigInt(balances!.recipientBalance!)===100000000n&&BigInt(balances!.contractBalance!)-BigInt(after.contractBalance!)===100000000n,'RewardBalanceDeltaMismatch');record.balanceAfter=after;record.recipientDelta='100000000';}
   const beforeReplay=await counts(repo),duplicate=await call(reward?userToken:recyclerToken,record.key),afterReplay=await counts(repo);
   ensure(duplicate.status===200&&duplicate.body.operationId===operationId&&JSON.stringify(beforeReplay)===JSON.stringify(afterReplay)&&broadcasts===1,'DuplicateEffect');
   if(reward){const after=await assets(rpcRead,read);ensure(after.recipientBalance===record.balanceAfter.recipientBalance&&after.contractBalance===record.balanceAfter.contractBalance,'ReplayPaidAgain');}
   ensure(authCalls===1&&envelopeCalls===1&&afterReplay.operations===record.before.operations+1&&afterReplay.identities===record.before.identities+1&&afterReplay.dispatches===record.before.dispatches+1&&afterReplay.requests===record.before.requests,'OneIdentityRule');
   record.duplicate={status:'PASS',before:beforeReplay,after:afterReplay,additionalIdentities:0,additionalBroadcasts:0,additionalReward:reward?'0':null};record.authCalls=authCalls;record.envelopeCalls=envelopeCalls;record.broadcasts=broadcasts;record.stage='CONFIRMED';await save();console.log(json({task:record.task,kind,status:'PASS',operationId,transactionHash:i.transactionHash,ledger:record.confirmationLedger,actualFee:record.actualFee,broadcasts:1}));
  }finally{await close(server);}
 }finally{await repo.pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))await run(process.argv[2]??'').catch(e=>{console.error(JSON.stringify({task:'BYE-W1-004',status:'STOPPED',code:e instanceof DomainError?e.code:'OperatorStopped',noAutomaticRetry:true}));process.exitCode=1;});
