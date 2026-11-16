import { createRequire } from 'node:module';
import { createPublicKey } from 'node:crypto';
import assert from 'node:assert/strict';
import { attestH2Approval } from './h2-approval-verifier.mjs';
import { D324Authority } from '../../backend/src/application/d324-authority.ts';
import { D324 } from '../../backend/src/application/d324-scope.ts';
import { Repository } from '../../backend/src/application/repository.ts';
const {Pool}=createRequire(new URL('../../backend/package.json',import.meta.url))('pg');
const role=process.argv[2];
const port=Number(process.env.BYETERY_D324_TEST_PG_PORT);
const database=process.env.BYETERY_D324_H2_DB;
const password=process.env.BYETERY_D324_H2_ROLE_PASSWORD;
assert(process.send&&['verifier','closer'].includes(role)&&port>=49152&&port<=65535
  &&/^d324_v3_[a-f0-9]{32}$/.test(database)&&/^[a-f0-9]{64}$/.test(password));
assert(!process.env.PGPASSWORD&&!process.env.BYETERY_D324_FIXTURE_ADMIN_PASSWORD&&!process.env.DATABASE_URL);
const config={host:'127.0.0.1',port,database,user:'d324_fixture_h2_'+role,password,connectionTimeoutMillis:3000};
delete process.env.BYETERY_D324_H2_ROLE_PASSWORD;
const repo=new Repository({database:config,deploymentId:D324.deploymentId,mode:'TESTNET'});
let trusted;
function reply(id,value){return new Promise((resolve,reject)=>process.send({id,...value},e=>e?reject(e):resolve()));}
process.on('message',async msg=>{
  const {id,command}=msg;
  try{
    if(command==='stop'){await repo.pool.end();await reply(id,{ok:true});process.disconnect();return;}
    if(command==='init'){
      assert(!trusted);
      const key=createPublicKey({key:Buffer.from(msg.publicKey,'hex'),format:'der',type:'spki'});
      assert.equal(key.asymmetricKeyType,'ed25519');
      trusted=Object.freeze({publicKey:key,expectedDecision:Object.freeze({...msg.expectedDecision}),pins:Object.freeze({...msg.pins})});
      const {rows:[self]}=await repo.pool.query('select current_user,session_user');
      assert.equal(self.current_user,config.user);
      assert.equal(self.session_user,config.user);
      // The other role's password is inaccessible over IPC and this role's
      // known password must not authenticate as the other role or fixture admin.
      for(const target of [role==='verifier'?'d324_fixture_h2_closer':'d324_fixture_h2_verifier','byetery_d324_fixture',
        'd324_fixture_h2_revoker','d324_fixture_api','d324_fixture_worker','d324_fixture_evidence']){
        const test=new Pool({...config,user:target});
        try{await assert.rejects(test.query('select 1'),{code:'28P01'});}finally{await test.end();}
        await assert.rejects(repo.pool.query('set role '+target),{code:'42501'});
      }
      await reply(id,{ok:true,role,pid:process.pid});return;
    }
    assert(trusted);
    if(command==='attest'&&role==='verifier'){
      const receipt=await attestH2Approval(repo.pool,trusted.publicKey,trusted.expectedDecision,msg.decision,msg.signature);
      await reply(id,{ok:true,receipt});return;
    }
    if(command==='close'&&role==='closer'){
      const authority=new D324Authority({...trusted.pins,ownerPublicKey:trusted.publicKey},async()=>{});
      await authority.closeExpiredUnsigned(repo,msg.decision,msg.signature);
      await reply(id,{ok:true});return;
    }
    if(command==='try-mint'&&role==='closer'){
      const r=msg.receipt;
      await repo.pool.query('insert into api_private.d324_h2_verified_approval(operation_id,deployment_id,receipt) values($1,$2,$3)',
        [r.operationId,r.deploymentId,JSON.stringify(r)]);
      await reply(id,{ok:true});return;
    }
    throw Error('RoleCommandRejected');
  }catch(e){
    const code=e.code??e.message;
    await reply(id,{ok:false,code:/^[A-Za-z_][A-Za-z0-9_]{3,80}$|^[0-9A-Z]{5}$/.test(code)?code:'H2ProbeInternalError'});
  }
});
