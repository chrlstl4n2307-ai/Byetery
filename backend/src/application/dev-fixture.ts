/** DEV-only provisioning helpers shared by the HTTP integration suite and API demo.
 * Passwords, tokens and generated signing keys stay in memory and never enter files.
 */
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { settings, type Settings } from './config.ts';
import { Repository } from './repository.ts';
import { MockStellarService } from '../mock-stellar-service.ts';
import type { Deployment } from '../domain.ts';
import { SupabaseAuth } from './auth.ts';
import { Coordinator, type Faults } from './coordinator.ts';
import { api, listen, close } from './http.ts';
import { requireThat } from './errors.ts';
export interface DevUser { id: string; token: string; key: Keypair; role: string; businessId?: string }
export async function authRequest(config: Settings, path: string, method: string, body?: unknown, token?: string): Promise<Record<string, any>> {
  const key=token?config.publicKey:config.serverKey;
  const headers: Record<string,string>={apikey:key,'Content-Type':'application/json'};
  if(token) headers.Authorization='Bearer '+token;
  else if(key.startsWith('eyJ')) headers.Authorization='Bearer '+key;
  const response=await fetch(config.url+'/auth/v1'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw new Error(`DevAuthHttp${response.status}`);}
  const raw=await response.text();return raw?JSON.parse(raw):{};
}
export async function fixture(faults: Faults = {}) {
  const config={...await settings(),deploymentId:randomUUID()};
  const repo=new Repository(config),users:Record<string,DevUser>={};
  const deployment:Deployment={deploymentId:config.deploymentId,mode:'MOCK',schemaVersion:1,
    networkId:createHash('sha256').update('Test SDF Network ; September 2015').digest('hex'),
    contractAddress:StrKey.encodeContract(randomBytes(32)),admin:Keypair.random().publicKey(),service:Keypair.random().publicKey(),
    rewardToken:StrKey.encodeContract(randomBytes(32)),rewardAmount:100000000n};
  const coordinator=new Coordinator(repo,faults),server=api(new SupabaseAuth(config),coordinator);
  let started=false;
  async function cleanup() {
    if(started) await close(server);
    for(const u of Object.values(users)) {
      if(u.businessId) await repo.transaction(async db=>{
        await db.query("update app_private.users set status='DISABLED' where id=$1",[u.businessId]);
        await db.query('update api_private.memberships set enabled=false where deployment_id=$1 and user_id=$2',[config.deploymentId,u.businessId]);
        await db.query('update app_private.wallet_links set revoked_at=clock_timestamp() where deployment_id=$1 and user_id=$2 and revoked_at is null',[config.deploymentId,u.businessId]);
      });
      if(u.token) await authRequest(config,'/logout?scope=global','POST',{},u.token);
      await authRequest(config,'/admin/users/'+u.id,'DELETE');
    }
    await repo.pool.end();
  }
  try {
    for(const [name,role] of Object.entries({a:'USER',b:'USER',admin:'ADMIN',collector:'COLLECTOR',recycler:'RECYCLER',rogue:'COLLECTOR'})) {
      const email=`byetery-dev-${randomUUID()}@example.com`, password=randomBytes(32).toString('base64url')+'aA1!';
      const created=await authRequest(config,'/admin/users','POST',{email,password,email_confirm:true});
      const id=created.id??created.user?.id;requireThat(typeof id==='string',500,'DevUserCreationFailed');
      users[name]={id,token:'',key:Keypair.random(),role};
      const session=await authRequest(config,'/token?grant_type=password','POST',{email,password});
      requireThat(typeof session.access_token==='string',500,'DevLoginFailed');users[name].token=session.access_token;
    }
    await repo.transaction(async db=>{
      await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
        values($1,'MOCK',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,$8)`,[deployment.deploymentId,deployment.networkId,deployment.contractAddress,
        'c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6',deployment.admin,deployment.service,deployment.rewardToken,deployment.rewardAmount.toString()]);
      for(const u of Object.values(users)) {
        const row=(await db.query('insert into app_private.users(auth_user_id) values($1) returning id',[u.id])).rows[0];u.businessId=row.id;
        await db.query('insert into api_private.memberships(deployment_id,user_id,role,actor_address) values($1,$2,$3,$4)',[deployment.deploymentId,row.id,u.role,
          ['COLLECTOR','RECYCLER'].includes(u.role)?u.key.publicKey():null]);
      }
      const mock=new MockStellarService(deployment);
      // Explicit simulated prefunding, isolated per run. Never a Stellar transaction.
      mock.fund(1000n*deployment.rewardAmount);
      for(const u of [users.collector,users.recycler]) {
        const command={kind:'set_role' as const,actor:u.key.publicKey(),role:u.role as 'COLLECTOR'|'RECYCLER',enabled:true};
        const p=await mock.prepare(deployment.deploymentId,command);
        const s=await mock.submit(p,p.requiredSigners.map(a=>mock.authorize(p,a)));
        const result=mock.settle(s);requireThat(result.status==='SUCCESS',500,'DevRoleFailed');
        await repo.project(db,mock,command,result.ledger);
      }
      await db.query('insert into api_private.mock_runtime(deployment_id,snapshot) values($1,$2)',[deployment.deploymentId,Buffer.from(mock.exportSnapshot())]);
    });
    const base=await listen(server);started=true;
    async function call(user: DevUser|null, method: string, path: string, body?: unknown, key=randomUUID()) {
      const headers:Record<string,string>={'Content-Type':'application/json','Idempotency-Key':key};
      if(user)headers.Authorization='Bearer '+user.token;
      const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});
      return {status:response.status,body:await response.json() as Record<string,any>};
    }
    async function wallet(user: DevUser) {
      const c=await call(user,'POST','/api/wallet/challenge',{address:user.key.publicKey()});
      requireThat(c.status===201,500,'DevChallengeFailed');
      const signature=Buffer.from(user.key.sign(Buffer.from(c.body.messageBase64,'base64'))).toString('base64');
      const v=await call(user,'POST','/api/wallet/verify',{challengeId:c.body.challengeId,signature});
      requireThat(v.status===200,500,'DevWalletFailed');return v.body.walletLinkId as string;
    }
    return {config,repo,coordinator,server,base,users,deployment,call,wallet,cleanup};
  } catch(error) {await cleanup();throw error;}
}
export function evidence(batteryId:string,requestId:string,kind:'COLLECTION'|'RECYCLING') {
  return {evidence:{batteryId,requestId,kind,manifestBase64:Buffer.from(JSON.stringify({batteryId,requestId,kind,note:'DEV fictitious manifest; no photographs'})).toString('base64')}};
}
