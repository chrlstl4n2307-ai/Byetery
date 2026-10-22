/** BYE-W1-006 operator only. No production route or lifecycle implementation. */
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Address,Networks,Transaction,xdr} from '@stellar/stellar-sdk';
import {settings,root} from '../src/application/config.ts';
import {Repository} from '../src/application/repository.ts';
import {databaseHealth} from '../src/application/database.ts';
import {SupabaseAuth} from '../src/application/auth.ts';
import {Coordinator} from '../src/application/coordinator.ts';
import {canonical} from '../src/application/validation.ts';
import {api,listen,close} from '../src/application/http.ts';
import {DomainError,ensure,type Command} from '../src/domain.ts';
import {LocalSecureStoreSigner,signerProcess} from '../src/local-secure-store-signer.ts';
import type {PhasedStellarSigner} from '../src/stellar-signer.ts';
import {TestnetRpc} from '../src/testnet/rpc.ts';
import {TestnetTransport,validateAuth} from '../src/testnet/transport.ts';
import {TestnetStellarService} from '../src/testnet/service.ts';
import {ACTORS,CONTRACT,TOKEN,WASM} from '../src/testnet/abi.ts';
import {NETWORK_ID} from '../src/testnet/identity.ts';
import {login,authorizationSummary} from '../src/testnet/sprint-return-collection.ts';

const D='5c0cad2f-5f25-4216-8068-6cb9d2d26325',OLD='BYE-W1-002-64257020134D4A0F';
const HISTORICAL='dec4c6af-93b6-4e55-80ee-927c17d75217';
const RECIPIENT='GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS';
const LABEL='BYETERY-INSTAWARD-D1-IDEMP-ADMIN';
const dir=path.join(root,'.tools/bye-w1-006'),journal=path.join(dir,'live.json');
export const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const json=(v:unknown)=>JSON.stringify(v,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const git=(...a:string[])=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const deny=async():Promise<never>=>{throw new DomainError('ReadOnlyCannotSignOrSend');};
class ReadOnlyRpc extends TestnetRpc{override async send(){return deny();}}
export function payloads(batteryId:string){
 const original={batteryId,metadata:{task:'BYE-W1-006',fixture:true,d3Eligible:false,physicalBattery:false,environmentalEvidence:false,caseLabel:'ORIGINAL'}};
 const changed={...original,metadata:{...original.metadata,caseLabel:'CONFLICT_PROBE'}};
 const inputHash=(input:unknown)=>sha(canonical({action:{kind:'register'},input}));
 return {original,changed,inputHash:inputHash(original),changedInputHash:inputHash(changed),
  manifest:canonical({version:1,batteryId,metadata:original.metadata})};
}
/** Deny before invoking an external capability. Counters include attempts, not merely successes. */
export class SingleRegistrationScope {
 phase:'A'|'B'|'C'|'DONE'='A';operationId:string|null=null;
 counts={processor:0,authorize:0,envelope:0,broadcast:0};
 readonly batteryId:string;readonly registrationHash:string;
 constructor(batteryId:string,registrationHash:string){this.batteryId=batteryId;this.registrationHash=registrationHash;}
 processor(id:string){ensure(this.phase==='A'&&this.counts.processor===0&&!this.operationId,'ProcessorScopeViolation');this.operationId=id;this.counts.processor++;}
 command(c:Command,source:string){ensure(c.kind==='register_battery'&&c.batteryId===this.batteryId&&c.registrationHash===this.registrationHash&&source===ACTORS.admin,'RegistrationScopeViolation');}
 capability(kind:'authorize'|'envelope'|'broadcast'){
  ensure(this.phase==='A'&&this.operationId&&this.counts[kind]===0,'CapabilityScopeViolation');
  ensure(kind!=='envelope'||this.counts.authorize===1,'AuthorizationPhaseMissing');
  ensure(kind!=='broadcast'||this.counts.envelope===1,'EnvelopePhaseMissing');this.counts[kind]++;
 }
}
async function historical(repo:Repository,read:TestnetTransport){
 const b=await read.battery(OLD);ensure(b.value?.state==='RECYCLED'&&b.value.rewardState==='SENT','HistoricalLifecycleMismatch');
 const recipient=await read.read('balance',[new Address(RECIPIENT).toScVal()],TOKEN),contract=await read.read('balance',[new Address(CONTRACT).toScVal()],TOKEN);
 ensure(String(recipient.value)==='100000000'&&String(contract.value)==='800000000','HistoricalBalanceMismatch');
 const principal=(await repo.pool.query(`select id,status,auth_user_id from app_private.users where id=$1`,[HISTORICAL])).rows;
 ensure(principal.length===1&&principal[0].status==='DISABLED'&&principal[0].auth_user_id===null,'HistoricalPrincipalChanged');
 const memberships=(await repo.pool.query('select deployment_id,role,enabled,actor_address from api_private.memberships where user_id=$1 order by deployment_id,role',[HISTORICAL])).rows;
 ensure(memberships.every(m=>!m.enabled),'HistoricalMembershipEnabled');
 const sql=(await repo.pool.query(`select state,reward_state,encode(registration_hash,'hex') registration_hash,encode(request_id,'hex') request_id,
 collector,encode(collection_hash,'hex') collection_hash,recycler,encode(recycling_hash,'hex') recycling_hash,confirmed_ledger
 from chain_private.batteries where deployment_id=$1 and battery_id=$2`,[D,OLD])).rows;
 ensure(sql.length===1&&sql[0].state==='RECYCLED'&&sql[0].reward_state==='SENT','HistoricalProjectionMismatch');
 return {battery:b.value,recipientBalance:String(recipient.value),contractBalance:String(contract.value),principal,memberships,sql};
}
async function snapshot(repo:Repository,read:TestnetTransport,rpc:TestnetRpc,batteryId:string,user:string,key:string){
 const count=async(table:string,clause='battery_id=$2')=>Number((await repo.pool.query(`select count(*)::int n from ${table} where deployment_id=$1 and ${clause}`,[D,batteryId])).rows[0].n);
 const operations=(await repo.pool.query(`select id,command,state,encode(parameters_hash,'hex') parameters_hash from app_private.stellar_operations where deployment_id=$1 and battery_id=$2 order by id`,[D,batteryId])).rows;
 const identities=(await repo.pool.query(`select e.operation_id,encode(e.transaction_hash,'hex') transaction_hash,e.sequence::text,
 encode(sha256(e.signed_envelope),'hex') envelope_hash from api_private.testnet_envelopes e join app_private.stellar_operations o on o.id=e.operation_id where e.deployment_id=$1 and o.battery_id=$2`,[D,batteryId])).rows;
 const dispatches=(await repo.pool.query(`select coalesce(sum(w.dispatch_attempts),0)::int n from api_private.testnet_work w where deployment_id=$1 and battery_id=$2`,[D,batteryId])).rows[0].n;
 const projection=(await repo.pool.query(`select state,reward_state,encode(registration_hash,'hex') registration_hash,request_id,collector,collection_hash,recycler,recycling_hash,confirmed_ledger from chain_private.batteries where deployment_id=$1 and battery_id=$2`,[D,batteryId])).rows;
 const cache=(await repo.pool.query(`select encode(input_hash,'hex') input_hash,operation_id,response_status,response_body from api_private.idempotency where deployment_id=$1 and user_id=$2 and key=$3`,[D,user,key])).rows;
 const a=await rpc.account(ACTORS.admin),b=await read.battery(batteryId);
 return {operations,identities,dispatches,projection,cache,records:await count('app_private.battery_records'),evidence:await count('app_private.evidence_versions'),
  returns:await count('app_private.return_requests'),rewards:await count('app_private.reward_attempts'),battery:b.value,
  source:{account:ACTORS.admin,sequence:a.account.sequenceNumber(),nativeBalance:a.balance,ledger:a.ledger},chainLedger:b.ledger};
}
function sameReplay(a:Awaited<ReturnType<typeof snapshot>>,b:Awaited<ReturnType<typeof snapshot>>){
 const stable=(s:typeof a)=>({...s,chainLedger:undefined,source:{...s.source,ledger:undefined}});
 ensure(canonical(stable(a))===canonical(stable(b)),'ReplayChangedDurableOrChainState');
}
async function run(){
 ensure(process.argv[2]==='--execute','ExplicitActionRequired');
 ensure(git('branch','--show-current')==='instaward/d1-testnet-integration','WrongBranch');
 ensure(git('rev-parse','instaward-sprint-start-v1^{}')==='349ee3fd78104f3c249b3052b1cca402c9d99ff3'&&git('rev-parse','pre-instaward-baseline-v1^{}')==='450c21b151a0973064986327f09d55e4f36c43e0','TagChanged');
 ensure(git('status','--porcelain','--','backend','scripts','tools/stellar-secure-store-signer')==='','ImplementationCheckpointRequired');
 const verify=JSON.parse(await readFile(path.join(dir,'verification.json'),'utf8'));ensure(verify.head===git('rev-parse','HEAD')&&verify.allPassed,'VerificationGateRequired');
 ensure(sha(await readFile(path.join(root,'contracts/byetery-contract/target/wasm32v1-none/release/byetery_contract.wasm')))===WASM,'WasmMismatch');
 const binary=path.join(root,'tools/stellar-secure-store-signer/target/debug/byetery-secure-store-signer.exe');
 ensure(sha(await readFile(binary))==='85f980b2e0dfd3bd2b098daa78c0e743cc07fb5baf18da59aa8fd83dfb9843cb','SignerBinaryChanged');
 const setup=JSON.parse(await readFile(path.join(dir,'admin-setup.json'),'utf8'));ensure(setup.stage==='SETUP_COMPLETE'&&setup.label===LABEL&&setup.deploymentId===D,'ApprovedPrincipalRequired');
 const config={...await settings(),mode:'TESTNET' as const,deploymentId:D},repo=new Repository(config),rpcRead=new ReadOnlyRpc();
 const read=new TestnetTransport(rpcRead,{authorize:deny,signEnvelope:deny},{validate:deny},deny,D);
 let server:ReturnType<typeof api>|undefined,record:Record<string,any>|undefined;
 const save=async()=>{ensure(record,'JournalMissing');await writeFile(journal,json(record));};
 try{
  const ready=await read.readiness(),d=await repo.transaction(db=>repo.config(db));
  ensure(d.networkId===NETWORK_ID&&d.contractAddress===CONTRACT&&d.rewardToken===TOKEN&&d.admin===ACTORS.admin&&d.service===ACTORS.service,'DeploymentMismatch');
  const member=(await repo.pool.query(`select u.id,u.auth_user_id,u.status,m.deployment_id,m.role,m.enabled,m.actor_address from app_private.users u join api_private.memberships m on m.user_id=u.id where u.id=$1 order by m.deployment_id,m.role`,[setup.businessUserId])).rows;
  ensure(member.length===2&&member.every(m=>m.auth_user_id===setup.authUserId&&m.status==='ACTIVE'&&m.deployment_id===D&&m.enabled&&m.actor_address===null)&&member.map(m=>m.role).join(',')==='ADMIN,USER','PrincipalScopeMismatch');
  const originalHistory=await historical(repo,read),batteryId='BYE-D1-IDEMP-'+randomBytes(9).toString('hex').toUpperCase(),key=randomUUID();
  const payload=payloads(batteryId),registrationHash=sha(payload.manifest),scope=new SingleRegistrationScope(batteryId,registrationHash);
  const pre=await snapshot(repo,read,rpcRead,batteryId,setup.businessUserId,key);
  ensure(!pre.battery&&pre.operations.length===0&&pre.identities.length===0&&pre.dispatches===0&&pre.records===0&&pre.returns===0&&pre.rewards===0&&pre.evidence===0&&pre.cache.length===0,'FixtureNotFresh');
  record={task:'BYE-W1-006',stage:'PRE_STATE',startedAt:new Date().toISOString(),startingHead:'da9bfa972c14c51f92d9c0278b78ee3dddfc2164',implementationHead:verify.head,
   deploymentId:D,contract:CONTRACT,classification:'D1.5 LIVE TESTNET IDEMPOTENCY FIXTURE',d3Eligible:false,physicalBattery:false,environmentalEvidence:false,
   batteryId,key,businessPrincipal:setup.businessUserId,authPrincipal:setup.authUserId,sourceUse:'UNKNOWN external/manual use; treated as shared; application lease is not external protection',
   registrationHash,manifestUtf8:payload.manifest,inputHash:payload.inputHash,changedInputHash:payload.changedInputHash,changedField:'metadata.caseLabel',originalValue:'ORIGINAL',changedValue:'CONFLICT_PROBE',pre,originalHistory,readinessLedger:ready.latest.sequence};
  await mkdir(dir,{recursive:true});await writeFile(journal,json(record),{flag:'wx'});
  const token=await login(config,setup.authUserId,LABEL),rpc=new TestnetRpc(),underlying=new LocalSecureStoreSigner(signerProcess(binary)),healthy=databaseHealth(repo.pool).guard();
  let durableHash:string|undefined,durableBytes:Buffer|undefined;
  const signer:PhasedStellarSigner={authorize:async input=>{
   healthy();ensure(scope.operationId,'OperationMissing');const w=await service.store.work(scope.operationId),tx=new Transaction(input.transactionXdr,Networks.TESTNET);
   scope.command(w.command,tx.source);ensure(input.method==='register_battery'&&BigInt(tx.fee)<=50000000n,'SigningScopeViolation');validateAuth(tx,w.command);scope.capability('authorize');
   const e=(await repo.pool.query(`select manifest_bytes,encode(payload_hash,'hex') hash,revision from app_private.evidence_versions where deployment_id=$1 and battery_id=$2 and kind='REGISTRATION'`,[D,batteryId])).rows;
   ensure(e.length===1&&e[0].revision===1&&Buffer.from(e[0].manifest_bytes).equals(Buffer.from(payload.manifest))&&e[0].hash===registrationHash,'EvidenceReadbackMismatch');
   record!.preSign={source:tx.source,sequence:tx.sequence,totalFee:tx.fee,auth:authorizationSummary(tx),currentLedger:input.currentLedger,expirationLedger:input.expirationLedger,timeBounds:tx.timeBounds};
   record!.counters={...scope.counts};await save();healthy();return underlying.authorize(input);
  },signEnvelope:async(input,hash)=>{
   healthy();ensure(scope.operationId,'OperationMissing');const w=await service.store.work(scope.operationId),tx=new Transaction(input.transactionXdr,Networks.TESTNET);
   scope.command(w.command,tx.source);validateAuth(tx,w.command);ensure(input.method==='register_battery'&&BigInt(tx.fee)<=50000000n&&Buffer.from(tx.hash()).toString('hex')===hash,'EnvelopeScopeViolation');
   scope.capability('envelope');record!.sdkHash=hash;record!.counters={...scope.counts};await save();healthy();return underlying.signEnvelope(input,hash);
  }};
  const service=new TestnetStellarService(repo,rpc,signer),check=service.transport.assertSourceSequence.bind(service.transport),send=rpc.send.bind(rpc),simulate=rpc.simulate.bind(rpc);
  rpc.simulate=async encoded=>{const result=await simulate(encoded),tx=new Transaction(encoded,Networks.TESTNET),env=tx.toEnvelope();
   if(env.type==='envelopeTypeTx'){const body=env.v1.tx.operations[0].body;
    if(body.type==='invokeHostFunction'&&body.invokeHostFunctionOp.hostFunction.type==='hostFunctionTypeInvokeContract'&&body.invokeHostFunctionOp.hostFunction.invokeContract.functionName.toString()==='register_battery'){
     const resources=result.transactionData?xdr.SorobanTransactionData.fromXDR(result.transactionData,'base64').resources:null;
     record!.simulation={ledger:result.latestLedger,resourceFee:result.minResourceFee??null,restorePreamble:Boolean(result.restorePreamble),authEntries:result.results?.[0]?.auth?.length??0,
      resources:resources?{instructions:resources.instructions,diskReadBytes:resources.diskReadBytes,writeBytes:resources.writeBytes,readOnlyEntries:resources.footprint.readOnly.length,readWriteEntries:resources.footprint.readWrite.length}:null};
    }}return result;};
  service.transport.assertSourceSequence=async i=>{
   healthy();ensure(scope.phase==='A'&&i.operationId===scope.operationId&&i.sourceAccount===ACTORS.admin,'DispatchScopeViolation');
   const durable=await service.store.identity(i.operationId),w=await service.store.work(i.operationId);
   ensure(durable&&durable.transactionHash===i.transactionHash&&Buffer.from(durable.envelopeBytes).equals(Buffer.from(i.envelopeBytes))&&w.state==='DISPATCH_INTENT'&&w.dispatchAttempts===1,'DurableCommitReadbackMismatch');
   durableHash=i.transactionHash;durableBytes=Buffer.from(i.envelopeBytes);record!.persistBeforeSend='PASS_COMMITTED_IDENTITY_READBACK';record!.identityHash=durableHash;await save();
   const final=await check(i);record!.finalSourceCheck=final;await save();healthy();return final;
  };
  rpc.send=async encoded=>{healthy();const tx=new Transaction(encoded,Networks.TESTNET);
   ensure(durableHash===Buffer.from(tx.hash()).toString('hex')&&durableBytes&&Buffer.from(encoded,'base64').equals(durableBytes),'BroadcastIdentityMismatch');
   scope.capability('broadcast');record!.counters={...scope.counts};record!.stage='BROADCAST_INTENT';await save();healthy();return send(encoded);
  };
  const processor={process:async(id:string)=>{scope.processor(id);record!.operationId=id;record!.stage='PROCESSOR';await save();return service.process(id);}};
  server=api(new SupabaseAuth(config),new Coordinator(repo,{},undefined,processor));const url=await listen(server);
  const call=async(body:unknown)=>{const response=await fetch(url+'/api/batteries',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(150000),redirect:'error'});return {status:response.status,body:await response.json() as Record<string,any>};};
  record.requestA=await call(payload.original);await save();ensure(scope.operationId&&record.requestA.body.operationId===scope.operationId,'OriginalOperationLost');
  for(let n=0;n<30;n++){
   const w=await service.store.work(scope.operationId);if(['PROJECTED','CONFIRMED_FAILED'].includes(w.state))break;
   ensure(!await service.store.requiresReview(scope.operationId)&&await service.store.identity(scope.operationId)&&scope.counts.broadcast===1,'OriginalHashReviewRequired');
   await new Promise(r=>setTimeout(r,2000));await service.process(scope.operationId);
  }
  const w=await service.store.work(scope.operationId),i=await service.store.identity(scope.operationId);ensure(w.state==='PROJECTED'&&w.confirmation&&i,'OriginalHashUnresolved');
  const receipt=await rpcRead.transaction(i.transactionHash);ensure(receipt.status==='SUCCESS'&&receipt.txHash===i.transactionHash&&receipt.ledger===w.confirmation.confirmationLedger&&receipt.resultXdr,'IndependentReceiptMismatch');
  const afterA=await snapshot(repo,read,rpcRead,batteryId,setup.businessUserId,key);
  ensure(afterA.operations.length===1&&afterA.identities.length===1&&afterA.dispatches===1&&afterA.evidence===1&&afterA.records===1&&afterA.returns===0&&afterA.rewards===0,'RegistrationCardinalityMismatch');
  ensure(afterA.battery?.state==='REGISTERED'&&afterA.battery.rewardState==='NOT_ELIGIBLE'&&afterA.battery.registrationHash===registrationHash&&afterA.battery.requestId===null&&afterA.battery.collector===null&&afterA.battery.recycler===null&&afterA.battery.collectionHash===null&&afterA.battery.recyclingHash===null,'FinalBatteryMismatch');
  ensure(afterA.projection.length===1&&afterA.projection[0].state==='REGISTERED'&&afterA.projection[0].reward_state==='NOT_ELIGIBLE'&&afterA.projection[0].registration_hash===registrationHash,'ProjectionMismatch');
  ensure(afterA.cache.length===1&&afterA.cache[0].input_hash===payload.inputHash&&afterA.cache[0].response_body.operationId===scope.operationId&&afterA.cache[0].response_body.transactionHash===i.transactionHash,'CacheMismatch');
  const actualFee=xdr.TransactionResult.fromXDR(receipt.resultXdr,'base64').feeCharged.toString();
  ensure(BigInt(afterA.source.sequence)===BigInt(pre.source.sequence)+1n&&BigInt(pre.source.nativeBalance)-BigInt(afterA.source.nativeBalance)===BigInt(actualFee),'SourceAccountingMismatch');
  ensure(Object.values(scope.counts).every(n=>n===1),'OriginalCapabilityCountMismatch');
  record.requestA={...record.requestA,confirmed:true,transactionHash:i.transactionHash,ledger:receipt.ledger,actualFee};record.afterA=afterA;record.countsA={...scope.counts};record.stage='A_CONFIRMED';await save();
  scope.phase='B';record.requestB=await call(payload.original);ensure(record.requestB.status===201&&record.requestB.body.operationId===scope.operationId&&record.requestB.body.transactionHash===i.transactionHash,'ReplayResponseMismatch');
  record.afterB=await snapshot(repo,read,rpcRead,batteryId,setup.businessUserId,key);sameReplay(afterA,record.afterB);record.countsB={...scope.counts};record.stage='B_VERIFIED';await save();
  scope.phase='C';record.requestC=await call(payload.changed);ensure(record.requestC.status===409&&record.requestC.body.error?.code==='IdempotencyConflict','ConflictNotRejected');
  record.afterC=await snapshot(repo,read,rpcRead,batteryId,setup.businessUserId,key);sameReplay(afterA,record.afterC);record.countsC={...scope.counts};await save();
  record.historicalAfter=await historical(repo,read);ensure(canonical(originalHistory)===canonical(record.historicalAfter),'HistoricalStateChanged');
  ensure(canonical(record.countsA)===canonical(scope.counts),'ReplayCapabilityAttempted');scope.phase='DONE';record.stage='COMPLETE';record.finishedAt=new Date().toISOString();await save();
  console.log(json({task:record.task,stage:record.stage,batteryId,operationId:scope.operationId,transactionHash:i.transactionHash,ledger:receipt.ledger,actualFee,counts:scope.counts,requestStatuses:[record.requestA.status,record.requestB.status,record.requestC.status],d3Eligible:false}));
 }catch(error){if(record){record.stoppedAt=new Date().toISOString();record.stopCode=error instanceof DomainError?error.code:'ExecutionStoppedReviewJournal';await save();}throw error;}
 finally{if(server)await close(server);await repo.pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(e=>{console.error(e instanceof DomainError?e.code:'ExecutionStoppedReviewJournal');process.exitCode=1;});
