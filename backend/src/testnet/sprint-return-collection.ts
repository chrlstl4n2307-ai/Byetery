/** Bounded BYE-W1-003B operator. Existing API/worker only; no lifecycle implementation. */
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Address,Contract,Networks,Transaction,TransactionBuilder,Account,Operation,xdr,scValToNative} from '@stellar/stellar-sdk';
import {settings,root,type Settings} from '../application/config.ts';
import {Repository} from '../application/repository.ts';
import {authRequest} from '../application/dev-fixture.ts';
import {SupabaseAuth} from '../application/auth.ts';
import {Coordinator} from '../application/coordinator.ts';
import {api,listen,close} from '../application/http.ts';
import {LocalSecureStoreSigner,signerProcess} from '../local-secure-store-signer.ts';
import {DomainError,ensure,type Command,type Evidence} from '../domain.ts';
import {evidenceCommitment} from '../evidence.ts';
import type {SigningRequest,SigningResult,PhasedStellarSigner} from '../stellar-signer.ts';
import {TestnetRpc} from './rpc.ts';
import {TestnetStellarService} from './service.ts';
import {TestnetTransport,validateAuth} from './transport.ts';
import {ACTORS,CONTRACT,TOKEN,WASM,invocation} from './abi.ts';
import {NETWORK_ID} from './identity.ts';
const DEPLOYMENT='5c0cad2f-5f25-4216-8068-6cb9d2d26325',BATTERY='BYE-W1-002-64257020134D4A0F';
const USER='c422b2da-f838-4da3-90b5-9eb18347bace',BUSINESS_USER='59200d04-e482-416d-b1cf-bfbc740440c5';
const RECIPIENT='GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS';
const dir=path.join(root,'.tools/bye-w1-003b'),journal=path.join(dir,'live.json');
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const deny=async()=>{throw new DomainError('ReadOnlyGate');};
const save=(v:unknown)=>writeFile(journal,JSON.stringify(v,(_k,value)=>typeof value==='bigint'?value.toString():value,2)+'\n');
export function authorizationSummary(tx:Transaction){
 const e=tx.toEnvelope();ensure(e.type==='envelopeTypeTx','UnexpectedAuthorization');
 const b=e.v1.tx.operations[0].body;ensure(b.type==='invokeHostFunction','UnexpectedAuthorization');
 return b.invokeHostFunctionOp.auth.map(a=>{
  const c=a.credentials;const address=c.type==='sorobanCredentialsAddress'?c.address:c.type==='sorobanCredentialsAddressV2'?c.addressV2:null;
  const f=a.rootInvocation.function;ensure(f.type==='sorobanAuthorizedFunctionTypeContractFn','UnexpectedAuthorization');
  return {credentialType:c.type,address:address?Address.fromScAddress(address.address).toString():tx.source,
   expirationLedger:address?.signatureExpirationLedger??null,contract:Address.fromScAddress(f.contractFn.contractAddress).toString(),
   method:f.contractFn.functionName.toString(),argumentCount:f.contractFn.args.length,subInvocations:a.rootInvocation.subInvocations.length};
 });
}
/** Deterministic guard negatives on the actual simulation entries. Never signs/sends. */
export function collectionAuthNegatives(tx:Transaction,c:Command){
 ensure(c.kind==='confirm_collection','CollectionRequired');validateAuth(tx,c);
 const env=tx.toEnvelope();ensure(env.type==='envelopeTypeTx','UnexpectedAuthorization');
 const b=env.v1.tx.operations[0].body;ensure(b.type==='invokeHostFunction','UnexpectedAuthorization');
 const op=b.invokeHostFunctionOp;
 const rebuild=(auth:typeof op.auth)=>new TransactionBuilder(new Account(tx.source,(BigInt(tx.sequence)-1n).toString()),
  {fee:tx.fee,networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeHostFunction({func:op.hostFunction,auth})).setTimebounds(0,Number(tx.timeBounds!.maxTime)).build();
 const rejected=(work:()=>void)=>{try{work();}catch(e){ensure(e instanceof DomainError,'UnexpectedNegativeError');return 'PASS';}throw new DomainError('NegativeAccepted');};
 const missingService=rejected(()=>validateAuth(rebuild(op.auth.filter(a=>a.credentials.type!=='sorobanCredentialsSourceAccount')),c));
 const missingCollector=rejected(()=>validateAuth(rebuild(op.auth.filter(a=>a.credentials.type==='sorobanCredentialsSourceAccount')),c));
 const wrongCollector=rejected(()=>validateAuth(tx,{...c,collector:RECIPIENT}));
 return {missingService,missingCollector,wrongCollector,broadcasts:0};
}
async function login(config:Settings,authId:string,label:string){
 const a=await authRequest(config,'/admin/users/'+authId,'GET');
 ensure((a.id??a.user?.id)===authId,'AuthIdentityMismatch');const u=a.user??a;
 ensure(u.user_metadata?.display_name===label&&u.user_metadata?.fixture===true&&typeof u.email==='string','FixtureIdentityMismatch');
 // Admin-generated one-time login for the existing test principal; no email or password change.
 const link=await authRequest(config,'/admin/generate_link','POST',{type:'magiclink',email:u.email});
 const tokenHash=link.properties?.hashed_token??link.hashed_token;ensure(typeof tokenHash==='string','LoginLinkUnavailable');
 const session=await authRequest(config,'/verify','POST',{token_hash:tokenHash,type:'email'});
 ensure(session.user?.id===authId&&typeof session.access_token==='string','FixtureLoginFailed');
 const identity=await new SupabaseAuth(config).validate('Bearer '+session.access_token);ensure(identity.authUserId===authId,'AuthIdentityMismatch');
 return session.access_token as string;
}
async function validateState(repo:Repository,transport:TestnetTransport,expected:string){
 ensure(sha(await readFile(path.join(root,'contracts/byetery-contract/target/wasm32v1-none/release/byetery_contract.wasm')))===WASM,'WasmMismatch');
 const ready=await transport.readiness(),chain=await transport.battery(BATTERY);
 ensure(chain.value?.state===expected&&chain.value.rewardState==='NOT_ELIGIBLE','UnexpectedBatteryState');
 const d=await repo.transaction(db=>repo.config(db));ensure(d.networkId===NETWORK_ID&&d.contractAddress===CONTRACT&&d.service===ACTORS.service&&d.rewardToken===TOKEN,'DeploymentMismatch');
 const rows=await repo.pool.query(`select b.state,b.reward_state,encode(b.registration_hash,'hex') registration_hash,
  encode(b.request_id,'hex') request_id,encode(d.wasm_hash,'hex') wasm from chain_private.batteries b join chain_private.deployments d on d.id=b.deployment_id
  where b.deployment_id=$1 and b.battery_id=$2`,[DEPLOYMENT,BATTERY]);
 const b=rows.rows[0];ensure(b&&b.wasm===WASM&&b.state===chain.value.state&&b.reward_state===chain.value.rewardState&&b.registration_hash===chain.value.registrationHash&&b.request_id===chain.value.requestId,'ProjectionMismatch');
 const wallet=await repo.pool.query(`select w.id from app_private.wallet_links w join app_private.users u on u.id=w.user_id
  join auth.users a on a.id=u.auth_user_id join api_private.memberships m on m.user_id=u.id and m.deployment_id=w.deployment_id
  join api_private.wallet_challenges c on c.id::text=w.proof_reference and c.deployment_id=w.deployment_id and c.user_id=u.id
  where w.deployment_id=$1 and u.id=$2 and u.auth_user_id=$3 and u.status='ACTIVE' and m.role='USER' and m.enabled
  and w.address=$4 and w.revoked_at is null and c.consumed_at is not null and c.signing_scheme='SEP53_V2'`,[DEPLOYMENT,BUSINESS_USER,USER,RECIPIENT]);
 ensure(wallet.rows.length===1,'VerifiedRecipientRequired');return {ready,chain,walletLinkId:wallet.rows[0].id as string};
}
async function counts(repo:Repository){return (await repo.pool.query(`select
 (select count(*)::int from app_private.return_requests where deployment_id=$1) requests,
 (select count(*)::int from app_private.stellar_operations where deployment_id=$1) operations,
 (select count(*)::int from api_private.testnet_envelopes where deployment_id=$1) identities,
 (select coalesce(sum(dispatch_attempts),0)::int from api_private.testnet_work where deployment_id=$1) dispatches`,[DEPLOYMENT])).rows[0];}
async function run(action:string){
 ensure(['--setup','--return','--collection'].includes(action),'ExplicitActionRequired');
 ensure(git('branch','--show-current')==='instaward/d1-testnet-integration','WrongBranch');
 ensure(git('rev-parse','instaward-sprint-start-v1^{}')==='349ee3fd78104f3c249b3052b1cca402c9d99ff3'&&git('rev-parse','pre-instaward-baseline-v1^{}')==='450c21b151a0973064986327f09d55e4f36c43e0','TagChanged');
 await mkdir(dir,{recursive:true});
 const config={...await settings(),mode:'TESTNET' as const,deploymentId:DEPLOYMENT},repo=new Repository(config);
 let state:Record<string,any>;
 try{state=JSON.parse(await readFile(journal,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;state={task:'BYE-W1-003B',startingHead:'c237da5278e7532612e13e81f0d9eba535f22b74',batteryId:BATTERY,recipient:RECIPIENT,deploymentId:DEPLOYMENT};}
 const rpcClient=new TestnetRpc(),readonly=new TestnetTransport(rpcClient,{authorize:deny,signEnvelope:deny},{validate:deny},deny,DEPLOYMENT);
 try{
  if(action==='--setup'){
   ensure(!state.setupStarted,'ExistingSetupRequiresReview');await validateState(repo,readonly,'REGISTERED');
   ensure(Boolean((await readonly.read('has_role',[new Address(ACTORS.collector).toScVal(),xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Collector')])])).value),'CollectorRoleMissing');
   ensure((await repo.pool.query("select 1 from api_private.memberships where deployment_id=$1 and role='COLLECTOR'",[DEPLOYMENT])).rows.length===0,'ExistingCollectorRequiresReview');
   state.setupStarted=true;state.collectorSetupAuthorization='Explicit owner approval: dedicated Auth fixture and COLLECTOR membership only';await save(state);
   const label='BYETERY-INSTAWARD-COLLECTOR-1',password=randomBytes(32).toString('base64url')+'aA1!';
   const created=await authRequest(config,'/admin/users','POST',{email:`byetery-instaward-collector-1-${randomUUID()}@example.com`,password,email_confirm:true,user_metadata:{display_name:label,fixture:true,byetery_task:'BYE-W1-003B'}});
   state.collectorAuthId=created.id??created.user?.id;ensure(state.collectorAuthId,'CollectorCreationFailed');await save(state);
   const token=await login(config,state.collectorAuthId,label),identity=await new SupabaseAuth(config).validate('Bearer '+token);
   await repo.transaction(async db=>{const user=await repo.principal(db,identity);await db.query(`insert into api_private.memberships(deployment_id,user_id,role,actor_address)
    values($1,$2,'COLLECTOR',$3)`,[DEPLOYMENT,user,ACTORS.collector]);state.collectorBusinessId=user;});
   state.stage='SETUP_COMPLETE';state.setupCompletedAt=new Date().toISOString();await save(state);
   console.log(JSON.stringify({task:state.task,stage:state.stage,onChainRolesChanged:false,applicationMembership:'COLLECTOR',source:'TESTNET'}));return;
  }
  ensure(state.stage==='SETUP_COMPLETE'&&action==='--return'||state.stage==='RETURN_CONFIRMED'&&action==='--collection','StageRequiresReviewedResolution');
  const kind=action==='--return'?'open_return':'confirm_collection';
  const checks=await validateState(repo,readonly,kind==='open_return'?'REGISTERED':'RETURNED');
  ensure(await new TestnetStellarService(repo,rpcClient,{authorize:deny,signEnvelope:deny}).hasRole(DEPLOYMENT,ACTORS.collector,'COLLECTOR'),'CollectorRoleMissing');
  const member=await repo.pool.query(`select 1 from api_private.memberships m join app_private.users u on u.id=m.user_id join auth.users a on a.id=u.auth_user_id
   where m.deployment_id=$1 and m.user_id=$2 and m.role='COLLECTOR' and m.enabled and m.actor_address=$3 and u.status='ACTIVE' and u.auth_user_id=$4`,[DEPLOYMENT,state.collectorBusinessId,ACTORS.collector,state.collectorAuthId]);ensure(member.rows.length===1,'CollectorMembershipRequired');
  ensure(git('status','--porcelain','--','backend','tools/stellar-secure-store-signer','scripts')==='','ImplementationCheckpointRequired');
  const verification=JSON.parse(await readFile(path.join(dir,'verification.json'),'utf8'));
  ensure(verification.head===git('rev-parse','HEAD')&&verification.allPassed===true,'VerificationGateRequired');
  const binary=path.join(root,'tools/stellar-secure-store-signer/target/debug/byetery-secure-store-signer.exe');
  ensure(sha(await readFile(binary))==='85f980b2e0dfd3bd2b098daa78c0e743cc07fb5baf18da59aa8fd83dfb9843cb','SignerBinaryChanged');
  const token=await login(config,kind==='open_return'?USER:state.collectorAuthId,kind==='open_return'?'BYETERY-INSTAWARD-USER-1':'BYETERY-INSTAWARD-COLLECTOR-1');
  const entry:Record<string,any>={kind,key:randomUUID(),stage:'API_INTENT',startedAt:new Date().toISOString(),implementationHead:git('rev-parse','HEAD'),before:await counts(repo),sourceUse:'SHARED_OR_MANUAL_USAGE_UNCONFIRMED'};
  const client=new TestnetRpc();let broadcasts=0,authCalls=0,envelopeCalls=0;
  const simulate=client.simulate.bind(client);
  client.simulate=async encoded=>{
   const response=await simulate(encoded),tx=new Transaction(encoded,Networks.TESTNET),env=tx.toEnvelope();
   if(env.type==='envelopeTypeTx'){
    const b=env.v1.tx.operations[0].body;
    if(b.type==='invokeHostFunction'&&b.invokeHostFunctionOp.hostFunction.type==='hostFunctionTypeInvokeContract'){
     const call=b.invokeHostFunctionOp.hostFunction.invokeContract;
     if(call.functionName.toString()===kind&&(kind==='open_return'||scValToNative(call.args[2])===ACTORS.collector)){
      entry.simulationDetails={ledger:response.latestLedger,resourceFee:response.minResourceFee??null,
       restorePreamble:Boolean(response.restorePreamble),authEntryCount:response.results?.[0]?.auth?.length??0,
       resources:response.transactionData?xdr.SorobanTransactionData.fromXDR(response.transactionData,'base64').resources.toXdrObject():null};
     }
    }
   }return response;
  };
  const underlying=new LocalSecureStoreSigner(signerProcess(binary));
  const signer:PhasedStellarSigner={authorize:async(request:SigningRequest):Promise<SigningResult>=>{
   ensure(request.method===kind,'MethodScopeViolation');const tx=new Transaction(request.transactionXdr,Networks.TESTNET);
   const command=(await repo.pool.query('select parameters from app_private.stellar_operations where deployment_id=$1 and idempotency_key=$2',[DEPLOYMENT,entry.key])).rows[0]?.parameters as Command;
   ensure(command&&command.kind===kind&&'batteryId' in command&&command.batteryId===BATTERY,'OperationContextMismatch');validateAuth(tx,command);
   await validateState(repo,readonly,kind==='open_return'?'REGISTERED':'RETURNED');
   entry.preSign={source:tx.source,sequence:tx.sequence,fee:tx.fee,auth:authorizationSummary(tx),expirationLedger:request.expirationLedger,currentLedger:request.currentLedger};
   if(kind==='confirm_collection'){
    entry.negatives=collectionAuthNegatives(tx,command);
    ensure(!(await readonly.read('has_role',[new Address(RECIPIENT).toScVal(),xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Collector')])])).value,'NoRoleProbeUnexpectedRole');
    ensure(command.kind==='confirm_collection','CollectionRequired');const args=invocation(command).args;args[2]=new Address(RECIPIENT).toScVal();
    const account=await client.account(ACTORS.service),latest=await client.latest();
    const probe=new TransactionBuilder(account.account,{fee:'10000',networkPassphrase:Networks.TESTNET}).addOperation(new Contract(CONTRACT).call(kind,...args)).setTimebounds(0,Number(latest.closeTime)+180).build();
    const negative=await client.simulate(probe.toXDR());ensure(Boolean(negative.error),'NoRoleCollectorAccepted');
    entry.negatives.noRoleCollector='PASS_UNSIGNED_RPC_SIMULATION';ensure(broadcasts===0,'NegativeBroadcast');
   }
   await save(state);authCalls++;return underlying.authorize(request);
  },signEnvelope:async(request,hash)=>{ensure(request.method===kind,'MethodScopeViolation');envelopeCalls++;
   const signed=await underlying.signEnvelope(request,hash);entry.hashBodyVerification='PASS';entry.sdkHash=hash;await save(state);return signed;}};
  const service=new TestnetStellarService(repo,client,signer),coordinator=new Coordinator(repo,{},undefined,service),server=api(new SupabaseAuth(config),coordinator);
  const originalSend=client.send.bind(client);
  const sourceCheck=service.transport.assertSourceSequence.bind(service.transport);
  let persistedHash:string|undefined,persistedBytes:Buffer|undefined;
  service.transport.assertSourceSequence=async identity=>{
   const persisted=await repo.pool.query(`select e.signed_envelope from api_private.testnet_envelopes e join app_private.stellar_operations o on o.id=e.operation_id
    where e.deployment_id=$1 and o.idempotency_key=$2 and e.transaction_hash=decode($3,'hex')`,[DEPLOYMENT,entry.key,identity.transactionHash]);
   ensure(persisted.rows.length===1&&Buffer.from(identity.envelopeBytes).equals(persisted.rows[0].signed_envelope),'PersistedEnvelopeMismatch');
   persistedHash=identity.transactionHash;persistedBytes=Buffer.from(identity.envelopeBytes);
   // Last I/O before send is the original authoritative source-sequence gate.
   // A failure remains outside the worker's send catch and records reviewed hold.
   return sourceCheck(identity);
  };
  client.send=async encoded=>{const tx=new Transaction(encoded,Networks.TESTNET),hash=Buffer.from(tx.hash()).toString('hex');
   ensure(hash===persistedHash&&persistedBytes&&Buffer.from(encoded,'base64').equals(persistedBytes),'PersistedEnvelopeMismatch');
   ensure(broadcasts===0&&tx.source===ACTORS.service,'BroadcastScopeViolation');broadcasts++;return originalSend(encoded);};
  const base=await listen(server);
  const call=async(route:string,body:unknown)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':entry.key},body:JSON.stringify(body),signal:AbortSignal.timeout(120000),redirect:'error'});return {status:response.status,body:await response.json() as Record<string,any>};};
  try{
   let body:Record<string,unknown>,route:string;
   if(kind==='open_return'){body={walletLinkId:checks.walletLinkId};route=`/api/batteries/${BATTERY}/returns`;}
   else{
    const request=await service.getReturnRequest(DEPLOYMENT,state.open_return.requestId);ensure(request?.state==='OPEN'&&request.batteryId===BATTERY&&request.recipient===RECIPIENT,'RequestMismatch');
    const manifest={version:1,task:'BYE-W1-003B',fixture:true,batteryId:BATTERY,requestId:state.open_return.requestId,kind:'COLLECTION',attestation:'Testnet application collection validation; no assertion of real physical battery handling',nonce:randomBytes(16).toString('hex')};
    const raw=Buffer.from(JSON.stringify(manifest),'utf8');
    const evidence:Evidence={version:1,batteryId:BATTERY,requestId:manifest.requestId,kind:'COLLECTION',payloadHash:sha(raw)};
    entry.evidence={manifestUtf8:raw.toString('utf8'),payloadHash:evidence.payloadHash,commitment:evidenceCommitment(checks.ready.config,evidence)};
    body={evidence:{batteryId:BATTERY,requestId:manifest.requestId,kind:'COLLECTION',manifestBase64:raw.toString('base64')}};route=`/api/returns/${manifest.requestId}/collection`;
   }
   state[kind]=entry;state.stage=kind==='open_return'?'RETURN_API_INTENT':'COLLECTION_API_INTENT';await save(state);
   const response=await call(route,body);entry.initialApi=response;entry.operationId=response.body.operationId;await save(state);
   ensure(typeof entry.operationId==='string','MissingLogicalOperation');
   for(let poll=0;poll<30;poll++){
    const work=await service.store.work(entry.operationId);if(work.state==='PROJECTED'||work.state==='CONFIRMED_FAILED')break;
    ensure(!await service.store.requiresReview(entry.operationId),'REVIEWED_RESOLUTION_REQUIRED');
    ensure(await service.store.identity(entry.operationId),'UnsignedOperationRequiresReview');
    await new Promise(resolve=>setTimeout(resolve,2000));await coordinator.process(entry.operationId);
   }
   const work=await service.store.work(entry.operationId),identity=await service.store.identity(entry.operationId);
   ensure(work.state==='PROJECTED'&&work.confirmation&&identity,'OriginalHashUnresolved');
   const post=await validateState(repo,readonly,kind==='open_return'?'RETURNED':'COLLECTED');
   const requestId='requestId' in work.command?work.command.requestId:'';ensure(/^[0-9a-f]{64}$/.test(requestId),'RequestIdMissing');
   const request=await service.getReturnRequest(DEPLOYMENT,requestId);
   ensure(request?.batteryId===BATTERY&&request.recipient===RECIPIENT&&request.state===(kind==='open_return'?'OPEN':'CONFIRMED'),'RequestPostStateMismatch');
   const association=(await repo.pool.query(`select r.recipient_snapshot,r.user_id,r.wallet_link_id,r.association_confirmed_at,encode(c.request_id,'hex') request_id,c.state chain_request_state
    from app_private.return_requests r join chain_private.return_requests c using(deployment_id,request_id)
    where r.deployment_id=$1 and r.request_id=decode($2,'hex')`,[DEPLOYMENT,requestId])).rows[0];
   ensure(association&&association.recipient_snapshot===RECIPIENT&&association.user_id===BUSINESS_USER&&association.wallet_link_id===checks.walletLinkId,'RecipientAssociationMismatch');
   if(kind==='confirm_collection')ensure(post.chain.value?.collector===ACTORS.collector&&post.chain.value.collectionHash===entry.evidence.commitment&&association.association_confirmed_at,'CollectionPostStateMismatch');
   const observations=(await repo.pool.query(`select kind,evidence,created_at from api_private.testnet_observations where operation_id=$1
    and (kind in ('DISPATCH_INTENT','SUBMIT_RESPONSE') or evidence->>'classification'='SIMULATION') order by id`,[entry.operationId])).rows;
   const persisted=(await repo.pool.query('select created_at from api_private.testnet_envelopes where operation_id=$1',[entry.operationId])).rows[0];
   const dispatch=observations.find(o=>o.kind==='DISPATCH_INTENT'),submit=observations.find(o=>o.kind==='SUBMIT_RESPONSE');
   ensure(persisted&&dispatch&&submit?.evidence.sourceCheck&&new Date(persisted.created_at)<=new Date(dispatch.created_at),'DurabilityEvidenceMissing');
   const beforeDuplicate=await counts(repo),duplicate=await call(route,body),afterDuplicate=await counts(repo);
   ensure(duplicate.body.operationId===entry.operationId&&JSON.stringify(beforeDuplicate)===JSON.stringify(afterDuplicate)&&broadcasts===1&&work.dispatchAttempts===1,'DuplicateCreatedOperation');
   const finalBattery=await service.getBattery(DEPLOYMENT,BATTERY);ensure(JSON.stringify(finalBattery)===JSON.stringify(post.chain.value),'DuplicateChangedState');
   entry.requestId=requestId;entry.transactionHash=identity.transactionHash;entry.confirmationLedger=work.confirmation.confirmationLedger;
   entry.actualFee=xdr.TransactionResult.fromXDR(work.confirmation.resultXdr,'base64').feeCharged.toString();
   entry.simulation=observations.find(o=>o.evidence.classification==='SIMULATION')?.evidence;
   entry.durability={persistedAt:persisted.created_at,dispatchIntentAt:dispatch.created_at,persistedBeforeDispatch:true,sourceCheck:submit.evidence.sourceCheck};
   entry.events=work.confirmation.events.map(raw=>{const e=xdr.ContractEvent.fromXDR(raw,'base64');return {topics:e.body.value.topics.map(t=>scValToNative(t)),data:scValToNative(e.body.value.data)};});
   entry.sorobanReturn=work.confirmation.sorobanResult?scValToNative(xdr.ScVal.fromXDR(work.confirmation.sorobanResult,'base64')):null;
   entry.postBattery=post.chain;entry.postRequest=request;entry.recipientSnapshotMatched=true;entry.duplicate={status:'PASS',before:beforeDuplicate,after:afterDuplicate,newBroadcasts:0};
   entry.authCalls=authCalls;entry.envelopeCalls=envelopeCalls;entry.broadcasts=broadcasts;entry.after=afterDuplicate;entry.stage='CONFIRMED';
   state.stage=kind==='open_return'?'RETURN_CONFIRMED':'COLLECTION_CONFIRMED';await save(state);
   console.log(JSON.stringify({task:state.task,stage:state.stage,operationId:entry.operationId,requestId,transactionHash:entry.transactionHash,confirmationLedger:entry.confirmationLedger,actualFee:entry.actualFee,batteryState:finalBattery?.state,duplicate:'PASS',source:'TESTNET'}));
  }finally{await close(server);}
 }finally{await repo.pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))await run(process.argv[2]??'').catch(e=>{
 console.error(JSON.stringify({task:'BYE-W1-003B',status:'STOPPED',code:e instanceof DomainError?e.code:e instanceof Error&&/^DevAuthHttp\d+$/.test(e.message)?e.message:'OperatorStopped',noAutomaticReplacement:true}));process.exitCode=1;
});
