import { SupabaseAuth, type Identity } from '../application/auth.ts';
import { Coordinator } from '../application/coordinator.ts';
import { profile } from '../application/frontend-reads.ts';
import { requireThat, type Reply } from '../application/errors.ts';
import { Repository, one } from '../application/repository.ts';
import { object, uuid } from '../application/validation.ts';
import { challengeText, DEPLOYMENT, TARGET, WALLET_A, type Challenge, type Profile } from './protocol.ts';

export interface Login { bearer:string; expiresAt:number }
export interface WalletGateway {
  login(email:string,password:string):Promise<Login>;
  logout(bearer:string):Promise<void>;
  me(bearer:string):Promise<Reply>;
  challenge(bearer:string,input:unknown,key:string):Promise<Reply>;
  verify(bearer:string,input:unknown,key:string):Promise<Reply>;
}
/** Wallet-only facade. No processor supplied, operational entrypoint or reconcile call. */
export function walletGateway(repo:Repository,auth:Pick<SupabaseAuth,'validate'>,
  config:{url:string;publicKey:string},transport:typeof fetch=fetch):WalletGateway {
  requireThat(repo.mode==='TESTNET' && repo.deploymentId===DEPLOYMENT,503,'TestnetDeploymentRequired');
  const coordinator=new Coordinator(repo);
  async function existing(bearer:string):Promise<{identity:Identity;userId:string}> {
    const identity=await auth.validate(bearer);
    const userId=await repo.transaction(async db=>{
      // Read-only guard before the existing principal helper: no new principal or membership.
      const session=await one(db,'select 1 from auth.sessions where id=$1 and user_id=$2 and (not_after is null or not_after>now())',[identity.sessionId,identity.authUserId]);
      requireThat(session,401,'SessionRevoked');
      const user=await one(db,`select u.id from app_private.users u
        join api_private.memberships m on m.user_id=u.id and m.deployment_id=$1 and m.role='USER' and m.enabled
        where u.auth_user_id=$2 and u.status='ACTIVE'`,[repo.deploymentId,identity.authUserId]);
      requireThat(user,403,'ExistingUserRequired');
      const a=await one(db,'select 1 from app_private.wallet_links where deployment_id=$1 and user_id=$2 and address=$3 and revoked_at is null',[repo.deploymentId,user.id,WALLET_A]);
      requireThat(a,403,'ExistingWalletARequired'); return user.id as string;
    });
    return {identity,userId};
  }
  async function me(bearer:string):Promise<Reply> {
    const {identity}=await existing(bearer); return profile(repo,identity);
  }
  async function provider(path:string,body?:unknown,bearer?:string):Promise<Response> {
    return transport(config.url+path,{method:'POST',headers:{apikey:config.publicKey,'Content-Type':'application/json',
      ...(bearer?{Authorization:bearer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),
      redirect:'error',signal:AbortSignal.timeout(10000)});
  }
  return {
    async login(email,password) {
      const response=await provider('/auth/v1/token?grant_type=password',{email,password});
      requireThat(response.ok,401,'LoginRejected');
      const value=await response.json() as {access_token?:string;expires_in?:number};
      requireThat(typeof value.access_token==='string' && /^[A-Za-z0-9_.-]+$/.test(value.access_token) &&
        typeof value.expires_in==='number' && value.expires_in>0,401,'LoginRejected');
      const bearer='Bearer '+value.access_token;
      try {await me(bearer);} catch(error) {await provider('/auth/v1/logout?scope=local',undefined,bearer).catch(()=>undefined);throw error;}
      return {bearer,expiresAt:Date.now()+Math.min(value.expires_in,1800)*1000};
    },
    async logout(bearer) {const r=await provider('/auth/v1/logout?scope=local',undefined,bearer);requireThat(r.ok,503,'LogoutUnavailable');},
    me,
    async challenge(bearer,input,key) {
      const body=object(input,['address']);requireThat(body.address===TARGET,400,'TargetWalletRequired');
      const {identity,userId}=await existing(bearer);
      const result=await coordinator.mutate(identity,{kind:'challenge'},{address:TARGET},key);
      if(result.status===201) challengeText(result.body as unknown as Challenge,userId);
      return result;
    },
    async verify(bearer,input,key) {
      const body=object(input,['challengeId','signature']),id=uuid(body.challengeId);
      const {identity,userId}=await existing(bearer);
      await repo.transaction(async db=>{
        const c=await one(db,`select 1 from api_private.wallet_challenges where deployment_id=$1 and user_id=$2
          and id=$3 and address=$4 and signing_scheme='SEP53_V2'`,[repo.deploymentId,userId,id,TARGET]);
        requireThat(c,404,'ChallengeNotFound');
      });
      const result=await coordinator.mutate(identity,{kind:'verify'},body,key);
      if(result.status===200) {
        requireThat(result.body.verified===true && result.body.address===TARGET && result.body.source==='TESTNET',503,'VerificationMismatch');
        const p=(await me(bearer)).body as unknown as Profile;
        requireThat([WALLET_A,TARGET].every(a=>p.wallets.some(w=>w.address===a)),503,'WalletPreservationCheckFailed');
      }
      return result;
    },
  };
}
