/** Explicit server-side DEV provisioning. No HTTP endpoint can grant application roles. */
import { randomBytes, createHash } from 'node:crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import type { Deployment } from '../domain.ts';
import { MockStellarService } from '../mock-stellar-service.ts';
import type { StellarService } from '../stellar-service.ts';
import { settings } from './config.ts';
import { Repository, one } from './repository.ts';
import { requireThat } from './errors.ts';
import { uuid } from './validation.ts';
let repo: Repository|undefined;
try {
  const config=await settings();repo=new Repository(config);
  const repository=repo;
  const args=process.argv.slice(2);
  requireThat(args.length===0 || (args.length===4 && args[0]==='--auth-user-id' && args[2]==='--role'),400,'InvalidArguments');
  await repo.transaction(async db=>{
    const existing=await one(db,'select id from chain_private.deployments where id=$1',[config.deploymentId]);
    if(!existing) {
      const deployment:Deployment={deploymentId:config.deploymentId,mode:'MOCK',schemaVersion:1,
        networkId:createHash('sha256').update('Test SDF Network ; September 2015').digest('hex'),contractAddress:StrKey.encodeContract(randomBytes(32)),
        admin:Keypair.random().publicKey(),service:Keypair.random().publicKey(),rewardToken:StrKey.encodeContract(randomBytes(32)),rewardAmount:100000000n};
      await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
        values($1,'MOCK',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,$8)`,[deployment.deploymentId,deployment.networkId,deployment.contractAddress,
        'c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6',deployment.admin,deployment.service,deployment.rewardToken,deployment.rewardAmount.toString()]);
      const mock=new MockStellarService(deployment);mock.fund(deployment.rewardAmount*1000n);
      await db.query('insert into api_private.mock_runtime(deployment_id,snapshot) values($1,$2)',[config.deploymentId,Buffer.from(mock.exportSnapshot())]);
    } else { await repository.config(db); await repository.mock(db); }
    if(args.length) {
      const authId=uuid(args[1]),role=args[3];requireThat(['USER','ADMIN','COLLECTOR','RECYCLER'].includes(role),400,'InvalidRole');
      requireThat(await one(db,'select id from auth.users where id=$1',[authId]),404,'AuthUserNotFound');
      await db.query('insert into app_private.users(auth_user_id) values($1) on conflict(auth_user_id) do nothing',[authId]);
      const user=await one(db,'select id,status from app_private.users where auth_user_id=$1',[authId]);requireThat(user?.status==='ACTIVE',403,'UserDisabled');
      const membership=await one(db,'select * from api_private.memberships where deployment_id=$1 and user_id=$2 and role=$3',[config.deploymentId,user.id,role]);
      const actor=['COLLECTOR','RECYCLER'].includes(role)?membership?.actor_address??Keypair.random().publicKey():null;
      await db.query(`insert into api_private.memberships(deployment_id,user_id,role,actor_address) values($1,$2,$3,$4)
        on conflict(deployment_id,user_id,role) do update set enabled=true`,[config.deploymentId,user.id,role,actor]);
      if(actor) {
        const mock=await repository.mock(db);const stellar:StellarService=mock;
        const command={kind:'set_role' as const,actor,role:role as 'COLLECTOR'|'RECYCLER',enabled:true};
        const p=await stellar.prepare(config.deploymentId,command);
        const submission=await stellar.submit(p,p.requiredSigners.map(s=>mock.authorize(p,s)));
        mock.settle(submission);const result=await stellar.getTransactionResult(submission);requireThat(result.status==='SUCCESS',500,'RoleProvisioningFailed');
        await repository.project(db,mock,command,result.ledger);await repository.saveMock(db,mock);
      }
    }
  });
  console.log('Byetery DEV provisioning complete. Source: MOCK. No private signing keys stored.');
} catch {console.error('DEV provisioning failed. Check configuration, user ID and role.');process.exitCode=1;}
finally {await repo?.pool.end();}
