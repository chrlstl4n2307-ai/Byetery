/** BYE-W1-003A operator entry point. Real Auth and wallet endpoints; NO RPC/signer. */
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {settings,root} from '../../backend/src/application/config.ts';
import {Repository} from '../../backend/src/application/repository.ts';
import {Coordinator} from '../../backend/src/application/coordinator.ts';
import {SupabaseAuth} from '../../backend/src/application/auth.ts';
import {api,listen,close} from '../../backend/src/application/http.ts';
import {authRequest} from '../../backend/src/application/dev-fixture.ts';
import {DomainError,ensure} from '../../backend/src/domain.ts';
import {bridge,TARGET} from './bridge.mts';
const deploymentId='5c0cad2f-5f25-4216-8068-6cb9d2d26325';
const dir=path.join(root,'.tools/bye-w1-003a');
const digest=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
async function main(){
  ensure(process.argv.includes('--owner-wallet-only'),'ExplicitOwnerWalletSetupRequired');
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  ensure(git('branch','--show-current')==='instaward/d1-testnet-integration','WrongBranch');
  ensure(git('rev-parse','instaward-sprint-start-v1^{}')==='349ee3fd78104f3c249b3052b1cca402c9d99ff3','SprintTagChanged');
  const source=await settings(),config={...source,mode:'TESTNET' as const,deploymentId};
  const repo=new Repository(config);
  await mkdir(dir,{recursive:true});
  const journal=path.join(dir,'owner-progress.json');
  // Never mint a second Auth principal after a stopped/ambiguous setup attempt.
  try{await readFile(journal);throw new DomainError('ExistingSetupRequiresReviewedResume');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const d=await repo.transaction(db=>repo.config(db));
  ensure(d.contractAddress==='CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON','WrongDeployment');
  const eligible=await repo.pool.query(`select u.id from app_private.users u join auth.users a on a.id=u.auth_user_id
    join api_private.memberships m on m.user_id=u.id where m.deployment_id=$1 and m.enabled and u.status='ACTIVE'`,[deploymentId]);
  ensure(eligible.rows.length===0,'ExistingPrincipalRequiresReviewedOwnerLogin');
  const gates=await repo.pool.query(`select column_default from information_schema.columns where table_schema='api_private' and table_name='wallet_challenges' and column_name='signing_scheme'`);
  ensure(gates.rows[0]?.column_default==="'SEP53_V2'::text",'Sep53DatabaseRequired');
  const label='BYETERY-INSTAWARD-USER-1',email=`byetery-instaward-user-1-${randomUUID()}@example.com`,password=randomBytes(32).toString('base64url')+'aA1!';
  const created=await authRequest(config,'/admin/users','POST',{email,password,email_confirm:true,user_metadata:{display_name:label,byetery_task:'BYE-W1-003A',fixture:true}});
  const authId=created.id??created.user?.id;ensure(authId,'TestPrincipalCreationFailed');
  let progress:Record<string,any>={task:'BYE-W1-003A',stage:'AUTH_PRINCIPAL_CREATED',label,authUserId:authId,deploymentId,target:TARGET,startedAt:new Date().toISOString(),startingHead:git('rev-parse','HEAD'),businessTransactions:0};
  await writeFile(journal,JSON.stringify(progress,null,2)+'\n',{flag:'wx'});
  const session=await authRequest(config,'/token?grant_type=password','POST',{email,password});
  ensure(typeof session.access_token==='string','AuthSessionRequired');
  const active=api(new SupabaseAuth(config),new Coordinator(repo,{},undefined,{process:async()=>{throw new DomainError('WalletOnlyNoLifecycle');}}));
  const base=await listen(active);
  async function call(route:string,body?:unknown,key:string=randomUUID()){
    const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json','Idempotency-Key':key},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});
    return {status:r.status,body:await r.json() as Record<string,any>};
  }
  const profile=await call('/api/me');ensure(profile.status===200&&profile.body.roles.includes('USER')&&profile.body.source==='TESTNET','AuthenticatedMembershipRequired');
  progress={...progress,stage:'WAITING_OWNER_CONNECTION',businessUserId:profile.body.userId,authPrincipal:true,membership:'ACTIVE',walletLinked:false};
  await writeFile(journal,JSON.stringify(progress,null,2)+'\n');
  let currentChallenge:string|undefined;
  const local=await bridge({
    challenge:async key=>{
      const response=await call('/api/wallet/challenge',{address:TARGET},key);
      if(response.status===201){const c=response.body;
        ensure(c.signingScheme==='SEP53_V2'&&c.version===2&&c.address===TARGET&&c.source==='TESTNET','ChallengeContextMismatch');
        currentChallenge=c.challengeId;
        const raw=Buffer.from(c.messageBase64,'base64').toString('utf8');
        const nonce=raw.split('\n').find(l=>l.startsWith('Nonce: '))?.slice(7);ensure(nonce,'NonceMissing');
        const stored=(await repo.pool.query('select created_at,expires_at,consumed_at from api_private.wallet_challenges where deployment_id=$1 and id=$2 and user_id=$3',[deploymentId,currentChallenge,profile.body.userId])).rows[0];
        ensure(stored&&!stored.consumed_at,'ChallengeMissing');
        progress={...progress,stage:'WAITING_OWNER_SIGNATURE',challengeId:currentChallenge,version:2,signingScheme:'SEP53_V2',issuedAt:stored.created_at,expiresAt:stored.expires_at,nonceHash:digest(nonce)};
        await writeFile(journal,JSON.stringify(progress,null,2)+'\n');
      }return response;
    },
    verify:async(body,key)=>{
      ensure(body.challengeId===currentChallenge,'UnexpectedChallenge');
      const response=await call('/api/wallet/verify',body,key);
      if(response.status===200){
        const facts=await repo.pool.query(`select w.id wallet_link_id,w.address,w.deployment_id,u.auth_user_id is not null auth_present,
          u.status='ACTIVE' user_active,exists(select 1 from auth.users a where a.id=u.auth_user_id) auth_exists,
          exists(select 1 from api_private.memberships m where m.deployment_id=w.deployment_id and m.user_id=w.user_id and m.role='USER' and m.enabled) membership_active,
          c.signing_scheme,c.consumed_at,c.attempts,w.revoked_at is null wallet_active
          from app_private.wallet_links w join app_private.users u on u.id=w.user_id
          join api_private.wallet_challenges c on c.id::text=w.proof_reference and c.deployment_id=w.deployment_id and c.user_id=w.user_id
          where w.deployment_id=$1 and w.user_id=$2 and w.address=$3 and c.id=$4`,[deploymentId,profile.body.userId,TARGET,currentChallenge]);
        const f=facts.rows[0];ensure(f&&f.auth_present&&f.user_active&&f.auth_exists&&f.membership_active&&f.wallet_active&&f.signing_scheme==='SEP53_V2'&&f.consumed_at,'AuthoritativeWalletVerificationFailed');
        progress={...progress,stage:'WALLET_VERIFIED',walletLinked:true,verified:true,consumedExactlyOnce:true,facts:f};
        await writeFile(journal,JSON.stringify(progress,null,2)+'\n');
        console.log(JSON.stringify({task:'BYE-W1-003A',status:'WALLET_VERIFIED',wallet:TARGET,source:'TESTNET',businessTransactions:0}));
      }return response;
    },
  });
  progress={...progress,ownerUrl:local.url};await writeFile(journal,JSON.stringify(progress,null,2)+'\n');
  console.log(JSON.stringify({task:'BYE-W1-003A',stage:'WAITING_OWNER_CONNECTION',url:local.url,label,source:'TESTNET',businessTransactions:0,credentialsLogged:false}));
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void close(local.server).then(()=>close(active)).then(()=>repo.pool.end());});
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))await main().catch(e=>{console.error(JSON.stringify({task:'BYE-W1-003A',status:'STOPPED',code:e instanceof DomainError?e.code:'WalletSetupUnavailable',businessTransactions:0}));process.exitCode=1;});
