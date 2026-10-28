import {disableMemberships} from '../application/revocation.ts';
/** BYE-W1-002 operator entrypoint. Exactly ONE register; open_return is UNSIGNED ONLY. */
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { settings,root } from '../application/config.ts';
import { Repository } from '../application/repository.ts';
import { canonical } from '../application/validation.ts';
import { authRequest } from '../application/dev-fixture.ts';
import { SupabaseAuth } from '../application/auth.ts';
import { Coordinator } from '../application/coordinator.ts';
import { api,listen,close } from '../application/http.ts';
import { LocalSecureStoreSigner,signerProcess } from '../local-secure-store-signer.ts';
import { DomainError,ensure } from '../domain.ts';
import { TestnetRpc } from './rpc.ts';
import { TestnetTransport } from './transport.ts';
import { TestnetStellarService } from './service.ts';
import { ACTORS,CONTRACT,TOKEN,WASM } from './abi.ts';
import { NETWORK_ID } from './identity.ts';

const dir=path.join(root,'.tools/bye-w1-002');
const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16000000}).trim();
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const recipient='GCOEEZR6CA4TU2WK7ZNAS6AJGHQH7NGYWKO7HZ3HQIF7EJATGLBNKOUZ';
export async function sourceDigest(){
  const names=git('ls-files','--cached','--others','--exclude-standard','--','backend','tools/stellar-secure-store-signer','scripts','.env.example');
  const hash=createHash('sha256');
  for(const name of [...new Set(names.split('\n').filter(Boolean))].sort())hash.update(name+'\0').update(await readFile(path.join(root,name)));
  return hash.digest('hex');
}
interface Candidate {deploymentId:string;batteryId:string;requestId:string;idempotencyKey:string;metadata:Record<string,unknown>;recipient:string}
async function candidate():Promise<Candidate>{
  const file=path.join(dir,'candidate.json');try{return JSON.parse(await readFile(file,'utf8'));}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const c:Candidate={deploymentId:randomUUID(),batteryId:'BYE-W1-002-'+randomBytes(8).toString('hex').toUpperCase(),
    requestId:randomBytes(32).toString('hex'),idempotencyKey:randomUUID(),recipient,
    metadata:{classification:'OFFICIAL_INSTAWARD_SPRINT',task:'BYE-W1-002',fixture:true,
      evidenceNonce:randomBytes(16).toString('hex'),createdAt:new Date().toISOString(),type:'Sprint API registration fixture'}};
  await writeFile(file,JSON.stringify(c,null,2)+'\n',{flag:'wx'});return c;
}
async function preflight(c:Candidate){
  ensure(git('branch','--show-current')==='instaward/d1-testnet-integration','WrongBranch');
  ensure(git('rev-parse','instaward-sprint-start-v1^{}')==='349ee3fd78104f3c249b3052b1cca402c9d99ff3','SprintTagChanged');
  ensure(git('rev-parse','pre-instaward-baseline-v1^{}')==='450c21b151a0973064986327f09d55e4f36c43e0','BaselineTagChanged');
  ensure(sha(await readFile(path.join(root,'contracts/byetery-contract/target/wasm32v1-none/release/byetery_contract.wasm')))===WASM,'WasmMismatch');
  const client=new TestnetRpc(),transport=new TestnetTransport(client,{authorize:async()=>{throw new DomainError('PlanCannotSign');},signEnvelope:async()=>{throw new DomainError('PlanCannotSign');}},
    {validate:async()=>{throw new DomainError('PlanCannotQueue');}},async()=>{throw new DomainError('PlanCannotLoadWork');},c.deploymentId);
  const ready=await transport.readiness();const source=await client.account(ACTORS.admin);
  const historical=await transport.battery('BYE-TN-D7DB910EE8BA');
  ensure(historical.value?.state==='RECYCLED'&&historical.value.rewardState==='SENT','HistoricalStateMismatch');
  const balance=await transport.read('balance',[new (await import('@stellar/stellar-sdk')).Address(CONTRACT).toScVal()],TOKEN);
  const registrationHash=sha(canonical({version:1,batteryId:c.batteryId,metadata:c.metadata}));
  const simulation=await transport.preflight({kind:'register_battery',batteryId:c.batteryId,registrationHash});
  return {transport,report:{observedAt:new Date().toISOString(),implementationHead:git('rev-parse','HEAD'),source:'TESTNET',network:NETWORK_ID,
    contract:CONTRACT,wasm:WASM,stateReady:true,latestLedger:ready.latest.sequence,historicalBattery:historical.value,
    rewardAmount:ready.config.rewardAmount.toString(),
    contractTokenBalance:String(balance.value),feeCap:'50000000',sourceAccount:ACTORS.admin,sourceSequence:source.account.sequenceNumber(),
    sourceBalance:source.balance,sourceAccountUse:'SHARED_OR_MANUAL_USAGE_UNCONFIRMED; treat as shared; final sequence recheck required',
    dedicatedSourceLimitation:'Current frozen ADMIN and signer allowlist require the existing admin source for registration.',
    freshBatteryId:c.batteryId,freshRequestProbeId:c.requestId,recipient:c.recipient,registrationHash,simulation:simulation.simulation,
    requestProbePurpose:'SIMULATION_ONLY; no wallet verification or application return association claimed'}};
}

export async function run(action:string){
  ensure(['--plan','--execute-register'].includes(action),'ExplicitValidationActionRequired');await mkdir(dir,{recursive:true});
  const c=await candidate();const {transport,report}=await preflight(c);
  const config=await settings(),repo=new Repository({...config,mode:'TESTNET',deploymentId:c.deploymentId});
  try{
    const protections=await repo.pool.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_grant,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated_grant
      from pg_class c where c.relnamespace='api_private'::regnamespace and c.relname in
      ('testnet_work','testnet_source_leases','testnet_envelopes','testnet_observations')`);
    ensure(protections.rows.length===4&&protections.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity&&!r.anon_grant&&!r.authenticated_grant),'DatabaseProtectionFailed');
    ensure((await repo.pool.query("select 1 from pg_proc where pronamespace='api_private'::regnamespace and prosecdef")).rows.length===0,'UnexpectedSecurityDefiner');
    const occupied=await repo.pool.query("select id from chain_private.deployments where mode='TESTNET' and contract_address=$1",[CONTRACT]);
    ensure(occupied.rows.length===0||occupied.rows.every(r=>r.id===c.deploymentId),'ExistingTestnetDeploymentRequiresReview');
    await writeFile(path.join(dir,'gate.json'),JSON.stringify({...report,databaseProtections:protections.rows},null,2)+'\n');
    if(action==='--plan'){console.log(JSON.stringify({...report,databaseReady:true,signerBound:'IMPLEMENTED; offline suite must pass before execution'},null,2));return;}
    const verification=JSON.parse(await readFile(path.join(dir,'verification.json'),'utf8'));
    ensure(verification.sourceDigest===await sourceDigest()&&verification.allPassed===true,'VerificationGateRequired');
    ensure(git('status','--porcelain','--','backend','tools/stellar-secure-store-signer','scripts','.env.example')==='','ImplementationCheckpointRequired');
    const journal=path.join(dir,'execution.json');
    await writeFile(journal,JSON.stringify({stage:'STARTED',candidate:c,implementationHead:report.implementationHead},null,2)+'\n',{flag:'wx'});
    const save=async(v:unknown)=>writeFile(journal,JSON.stringify(v,null,2)+'\n');
    const binary=path.join(root,'tools/stellar-secure-store-signer/target/debug/byetery-secure-store-signer.exe');
    ensure(sha(await readFile(binary))===verification.signerHash,'SignerBinaryChanged');
    const service=new TestnetStellarService(repo,new TestnetRpc(),new LocalSecureStoreSigner(signerProcess(binary)));
    let authId:string|undefined,token:string|undefined,server:ReturnType<typeof api>|undefined;
    try{
      await repo.transaction(async db=>{
        await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
          values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,$8)`,[c.deploymentId,NETWORK_ID,CONTRACT,WASM,ACTORS.admin,ACTORS.service,TOKEN,report.rewardAmount]);
      });
      const email=`byetery-w1-002-test-${randomUUID()}@example.com`,password=randomBytes(32).toString('base64url')+'aA1!';
      const created=await authRequest(config,'/admin/users','POST',{email,password,email_confirm:true});authId=created.id??created.user?.id;ensure(authId,'FixtureAuthFailed');
      const session=await authRequest(config,'/token?grant_type=password','POST',{email,password});token=session.access_token;ensure(token,'FixtureAuthFailed');
      await repo.transaction(async db=>{const u=(await db.query('insert into app_private.users(auth_user_id) values($1) returning id',[authId])).rows[0];
        await db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'ADMIN')",[c.deploymentId,u.id]);});
      const coordinator=new Coordinator(repo,{},undefined,service);server=api(new SupabaseAuth(config),coordinator);const url=await listen(server);
      const request={method:'POST',path:'/api/batteries',idempotencyKey:c.idempotencyKey,body:{batteryId:c.batteryId,metadata:c.metadata}};
      await save({stage:'API_REQUEST_INTENT',candidate:c,gate:report,apiRequest:request});
      const response=await fetch(url+request.path,{method:request.method,headers:{'content-type':'application/json','Idempotency-Key':c.idempotencyKey,Authorization:'Bearer '+token},
        body:JSON.stringify(request.body),signal:AbortSignal.timeout(90000),redirect:'error'});
      const apiResponse=await response.json() as Record<string,any>;
      ensure(response.status===201||response.status===202,'LiveApiGateFailed');
      const operationId=apiResponse.operationId;ensure(typeof operationId==='string','MissingLogicalOperation');
      await save({stage:'RECONCILING_ORIGINAL_HASH',candidate:c,gate:report,apiRequest:request,apiResponse,operationId});
      for(let poll=0;poll<30;poll++){
        const work=await service.store.work(operationId);if(work.state==='PROJECTED'||work.state==='CONFIRMED_FAILED')break;
        if(await service.store.requiresReview(operationId))throw new DomainError('REVIEWED_RESOLUTION_REQUIRED');
        await new Promise(resolve=>setTimeout(resolve,2000));await coordinator.process(operationId);
      }
      const work=await service.store.work(operationId),identity=await service.store.identity(operationId);
      ensure(work.state==='PROJECTED'&&work.confirmation&&identity,'RegisterNotConfirmed');
      const post=await service.getBattery(c.deploymentId,c.batteryId);ensure(post?.state==='REGISTERED'&&post.registrationHash===report.registrationHash,'RegisterPostStateMismatch');
      const finalResponse=await fetch(url+'/api/batteries/'+c.batteryId,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
      const finalBody=await finalResponse.json();ensure(finalResponse.status===200,'PostStateApiReadFailed');
      const observations=await repo.pool.query(`select kind,evidence,created_at from api_private.testnet_observations
        where operation_id=$1 and (kind in ('DISPATCH_INTENT','SUBMIT_RESPONSE') or evidence->>'classification'='SIMULATION') order by id`,[operationId]);
      const persisted=await repo.pool.query('select created_at from api_private.testnet_envelopes where operation_id=$1',[operationId]);
      const applicationSimulation=observations.rows.find(r=>r.evidence.classification==='SIMULATION')?.evidence;
      const broadcast=observations.rows.find(r=>r.kind==='SUBMIT_RESPONSE')?.evidence;
      const intent=observations.rows.find(r=>r.kind==='DISPATCH_INTENT');
      ensure(applicationSimulation&&broadcast?.sourceCheck&&intent&&persisted.rows[0]
        &&new Date(persisted.rows[0].created_at).getTime()<=new Date(intent.created_at).getTime(),'LiveEvidenceIncomplete');
      const completed={stage:'REGISTER_CONFIRMED',classification:'OFFICIAL_INSTAWARD_SPRINT',task:'BYE-W1-002',candidate:c,gate:report,
        implementationHead:report.implementationHead,apiRequest:request,initialApiResponse:apiResponse,finalApiResponse:finalBody,
        logicalOperationId:operationId,transactionHash:identity.transactionHash,confirmationLedger:work.confirmation.confirmationLedger,
        applicationSimulation,broadcast,durability:{persistedAt:persisted.rows[0].created_at,dispatchIntentAt:intent.created_at,persistedBeforeDispatch:true},
        postState:post,signedEnvelopePubliclyExposed:false};
      await save(completed); // Confirmed checkpoint BEFORE any further simulation.
      // Only now preflight open_return. No application queue, no wallet claim, no signer or submit.
      const probe=await transport.preflight({kind:'open_return',batteryId:c.batteryId,requestId:c.requestId,recipient:c.recipient});
      const evidence={...completed,stage:'COMPLETE',openReturnSimulation:{status:'SUCCESS',submitted:false,signed:false,...probe.simulation}};
      await save(evidence);
      await writeFile(path.join(root,'docs/instaward/week1/BYE-W1-002-results.json'),JSON.stringify(evidence,null,2)+'\n');
      console.log(JSON.stringify({status:'SUCCESS',batteryId:c.batteryId,operationId,transactionHash:identity.transactionHash,
        confirmationLedger:work.confirmation.confirmationLedger,register:'CONFIRMED SUCCESS',openReturnSimulation:evidence.openReturnSimulation,source:'TESTNET'},null,2));
    }finally{
      if(server)await close(server);
      if(authId){await repo.transaction(async db=>{
        await db.query("update app_private.users set status='DISABLED' where auth_user_id=$1",[authId]);
        const principals=await db.query<{id:string}>('select id from app_private.users where auth_user_id=$1',[authId]);
        for(const principal of principals.rows)await disableMemberships(db,c.deploymentId,principal.id);
      });await authRequest(config,'/admin/users/'+authId,'DELETE');}
    }
  }finally{await repo.pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))
  await run(process.argv[2]??'').catch(error=>{console.error(JSON.stringify({status:'STOPPED',code:error instanceof DomainError?error.code:'ValidationStopped',noAutomaticReplacement:true}));process.exitCode=1;});
