import { F } from './fixture-loader.mjs';
import { createServer } from 'node:http';
import { generateKeyPairSync, sign, verify, randomUUID } from 'node:crypto';
import { SupabaseAuth } from '../../backend/src/application/auth.ts';
import { Coordinator } from '../../backend/src/application/coordinator.ts';
import { api } from '../../backend/src/application/http.ts';
import { D324 } from '../../backend/src/application/d324-scope.ts';
import { LocalTransactionWorker } from '../../backend/src/testnet/worker.ts';
import { PersistedContextGuard } from '../../backend/src/testnet/service.ts';
import { MockStellarService } from '../../backend/src/mock-stellar-service.ts';
import { ACTORS } from '../../backend/src/testnet/abi.ts';
import { createD324SessionControl } from '../d3-24-composition/session-control.mjs';
import { SQL_RECEIPT_QUERY } from '../d3-receipt-capture/sources.mjs';
import { X } from '../d3-evidence-capture/xdr-reader.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';
import { readSqlForRun } from '../d3-run1-launcher/live-sql.mjs';

// This process is only a synthetic loopback fixture; no application server startup.
const scenario=process.argv[2]??'success';
const capability=process.env.OFFLINE_CAPABILITY;
if(!process.send||!/^[a-f0-9]{64}$/.test(capability??''))throw Error('OFFLINE_FIXTURE_PARENT_REQUIRED');
const f=await F.local();
// Review objects are not in the base fixture's migration directory. Model the
// readiness query's required columns only in this disposable database.
await f.db.exec(`create schema review_private;
  create table review_private.registration_intents(deployment_id uuid,battery_id text,status text)`);
if(scenario==='busy-quiescence')await f.db.query("insert into review_private.registration_intents values($1,'BYE-SYNTHETIC-HOLD','WAITING')",[D324.deploymentId]);
for(const i of Object.values(f.identities))i.tokenExpiresAt=Math.floor(i.tokenExpiresAt/1000)*1000;
let quiescenceReads=0;
const snapshotPool={connect:async()=>{
  const db=await f.repo.pool.connect();
  return {query:(q,args)=>typeof q==='string'?db.query(q,args):db.query(q.text,q.values),release:()=>db.release()};
}};
const quiescence=async()=>{
  const sql=await readSqlForRun(snapshotPool,RUN1,{coordinate:true});quiescenceReads++;
  if(['active_leases','pending','uncertain','reconciliation_locks','foreign_holds','review_intents'].some(k=>sql[k]!==0))
    throw Error('SQL_QUIESCENCE_REJECTED');
  return sql;
};
const approval=F.fixtureApproval(f.identities,{readiness:async()=>{
  const sql=await quiescence();if(sql.occupied!==0||sql.operations.length!==0)throw Error('SQL_QUIESCENCE_REJECTED');
}});
const key=generateKeyPairSync('ed25519'),revoked=new Set();
// Valid, explicitly synthetic XDR. Do not copy historical chain receipts into
// evidence for a different operation or pretend to reproduce Soroban effects.
const frames={resultXdr:X.TransactionResult.fromXdrObject({feeCharged:100n,result:{code:0,results:[]},ext:{v:0}}).toXDR('base64'),
  resultMetaXdr:X.TransactionMeta.fromXdrObject({v:0,operations:[]}).toXDR('base64')};
const cfg=await f.repo.transaction(db=>f.repo.config(db));
const mock=new MockStellarService({...cfg,mode:'MOCK'});mock.fund(1_000_000_000n);
async function apply(command){
  const p=await mock.prepare(f.deploymentId,command);
  const submission=await mock.submit(p,p.requiredSigners.map(s=>mock.authorize(p,s)));
  const result=mock.settle(submission);
  if(result.status!=='SUCCESS')throw Error('OFFLINE_MOCK_PROJECTION_FAILED');
}
for(const [role,actor] of [['COLLECTOR',ACTORS.collector],['RECYCLER',ACTORS.recycler]])
  await apply({kind:'set_role',role,actor,enabled:true});
const wallet=randomUUID();
await f.db.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
  values($1,$2,decode($3,'hex'),$4,$5,'offline-controller-synthetic',now())`,
  [wallet,D324.deploymentId,D324.networkId,f.users.USER,D324.recipient]);
const store=F.transportFixture(f.repo,approval.authority.instanceId);
const fakes=new Map(),originals=new Map();let auth,app,control,origin,logins=0,logouts=0,dispatches=0,proofs=0;
const check=(ok,code)=>{if(!ok)throw Error(code);};
const issue=role=>{
  const i=f.identities[role],h=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({sub:i.authUserId,session_id:i.sessionId,role:'authenticated',
    exp:Math.floor(i.tokenExpiresAt/1000)-(scenario==='expired-session'&&role==='RECYCLER'?6000:0)})).toString('base64url');
  const token=h+'.'+payload+'.'+sign(null,Buffer.from(h+'.'+payload),key.privateKey).toString('base64url');
  return token;
};
const decode=header=>{
  const token=header?.slice(7),parts=token?.split('.');
  check(parts?.length===3&&!revoked.has(token)&&verify(null,Buffer.from(parts[0]+'.'+parts[1]),key.publicKey,Buffer.from(parts[2],'base64url')),'SyntheticTokenRejected');
  const c=JSON.parse(Buffer.from(parts[1],'base64url'));check(c.exp*1000>Date.now(),'SyntheticTokenExpired');return c;
};
const counts=async()=>({admissions:await F.count(f.repo,'d324_admission'),operations:await F.count(f.repo,'stellar_operations'),
  steps:await F.count(f.repo,'d324_step'),logins,logouts,proofs,dispatches,quiescenceReads,
  leases:Number((await f.db.query('select count(*) from api_private.testnet_source_leases where lease_until>clock_timestamp()')).rows[0].count),
  sends:[...fakes.values()].reduce((n,t)=>n+t.submitted.length,0),signatures:[...fakes.values()].reduce((n,t)=>n+t.signCount,0),
  identities:[...originals.values()],classification:'OFFLINE_SYNTHETIC'});
const reply=(r,status,body)=>{r.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});r.end(JSON.stringify(body));};
const server=createServer(async(req,res)=>{
  try{
    if(req.headers['x-fixture-capability']!==capability)return reply(res,403,{code:'OFFLINE_FIXTURE_ACCESS_DENIED'});
    const p=req.url;
    if(p==='/auth/v1/user')return reply(res,200,{id:decode(req.headers.authorization).sub});
    if(p==='/auth/v1/logout?scope=local'){
      // Supabase-compatible local logout: mark the bearer unusable even on expiry.
      revoked.add(req.headers.authorization?.slice(7));logouts++;return reply(res,200,{});
    }
    if(req.method==='GET'&&p==='/api/batteries/'+RUN1.batteryId+'/history'){
      await auth.validate(req.headers.authorization);
      const entries=[];
      for(const {operationId,transactionHash} of originals.values()){
        const row=(await f.db.query(SQL_RECEIPT_QUERY,[operationId,transactionHash,D324.batteryId])).rows[0];
        if(!row)continue;
        const receipt=JSON.parse(row.receipt);
        const transport=fakes.get(operationId);
        const observation=await transport.observe(await store.identity(operationId));
        const verification=observation.status==='SUCCESS'&&observation.confirmation.transactionHash===transactionHash?'CONFIRMED':'UNVERIFIED';
        const kind={register_battery:'REGISTERED',open_return:'RETURNED',confirm_collection:'COLLECTED',confirm_recycling:'RECYCLED',pay_reward:'REWARD'}[receipt.method];
        entries.push({...receipt,kind,category:kind==='REWARD'?'REWARD':'LIFECYCLE',persistedState:receipt.applicationState,
          verification,chainResult:observation.status,confirmedAt:new Date().toISOString()});
      }
      return reply(res,200,{source:'TESTNET',deploymentId:D324.deploymentId,contractAddress:cfg.contractAddress,
        network:'STELLAR TESTNET',batteryId:RUN1.batteryId,entries});
    }
    if(p.startsWith('/api/')){
      const end=res.end.bind(res);
      res.end=(chunk,...args)=>{
        if(req.method!=='POST'||res.statusCode!==202)return end(chunk,...args);
        void dispatch(JSON.parse(chunk).operationId).then(()=>end(chunk,...args),()=>end(chunk,...args));
        return res;
      };
      return app.emit('request',req,res);
    }
    if(p==='/state')return reply(res,200,await counts());
    let raw='';for await(const b of req){raw+=b;check(raw.length<=50000,'SyntheticInputTooLarge');}
    const input=JSON.parse(raw||'{}');
    if(p==='/auth/v1/token?grant_type=password'){
      let role=String(input.email).split('@')[0].toUpperCase();check(F.roles.includes(role)&&input.password==='synthetic-only','SyntheticLoginRejected');
      if(scenario==='wrong-role'&&role==='USER')role='ADMIN';
      logins++;return reply(res,200,{access_token:issue(role)});
    }
    if(p==='/prepare')return reply(res,200,await control.prepare(input.headers));
    if(p==='/admission-check'){await control.checkAdmission(input.ack);return reply(res,200,{valid:true});}
    if(p==='/admit'){
      let data=approval.input;
      if(scenario==='missing-manifest')data={...data,manifest:undefined};
      if(scenario==='wrong-plan')data={...data,grant:{...data.grant,planHash:'0'.repeat(64)}};
      if(scenario==='expired-grant')data={...data,grant:{...data.grant,issuedAt:Date.now()-910000,expiresAt:Date.now()-10000}};
      if(scenario==='unauthorized')data={...data,live:undefined};
      if(scenario==='changed-session'){
        await f.db.query('update auth.sessions set id=$1 where id=$2',[randomUUID(),f.identities.RECYCLER.sessionId]);
      }
      const ack=await control.admit(input.id,data);return reply(res,200,ack);
    }
    if(p==='/proof'){
      const identity=await auth.validate(input.header),role=input.role;
      check(F.roles.includes(role)&&identity.authUserId===f.identities[role].authUserId&&identity.sessionId===f.identities[role].sessionId,'SyntheticIdentityMismatch');
      await control.checkAdmission(input.ack);await quiescence();proofs++;
      return reply(res,200,{proof:F.prove({id:input.ack.admissionId,liveHash:approval.liveHash},identity,input.ordinal,input.action,input.body,input.key)});
    }
    if(p==='/dispatch'){
      return reply(res,200,await dispatch(input.operationId));
    }
    if(p==='/receipt'){
      const row=(await f.db.query(SQL_RECEIPT_QUERY,[input.operationId,input.transactionHash,D324.batteryId])).rows[0];
      check(row,'SyntheticReceiptAbsent');return reply(res,200,JSON.parse(row.receipt));
    }
    if(p==='/observation'){
      const fake=fakes.get(input.operationId),original=await store.identity(input.operationId);
      check(fake&&original?.transactionHash===input.transactionHash,'SyntheticOriginalMismatch');
      const r=await fake.observe(original),confirmation=r.confirmation;
      check(confirmation?.transactionHash===input.transactionHash&&r.status==='SUCCESS','SyntheticObservationUnconfirmed');
      const work=await store.work(input.operationId);
      return reply(res,200,{operationId:original.operationId,transactionHash:confirmation.transactionHash,
        batteryId:RUN1.batteryId,method:work.command.kind,status:r.status,ledger:confirmation.confirmationLedger,
        resultXdr:confirmation.resultXdr,resultMetaXdr:confirmation.resultMetaXdr});
    }
    return reply(res,404,{});
  }catch(e){const code=e.code??e.message;reply(res,e.status??403,{code:/^[A-Za-z0-9_]+$/.test(code)?code:'SyntheticControllerRejected'});}
});
async function dispatch(op){
      check((await f.db.query('select 1 from api_private.d324_step where operation_id=$1',[op])).rows.length===1,'SyntheticScopeRejected');
      let fake=fakes.get(op);
      if(!fake){
        fake=await F.queueFake(store,op,f.repo);fake.success=true;
        if(scenario==='uncertain-retry'){fake.loseSubmit=true;fake.outage=true;}
        const ordinal=fakes.size+1,observe=fake.observe.bind(fake);fake.ledger=5684002+ordinal;
        fake.observe=async original=>{const r=await observe(original);if(r.confirmation)r.confirmation={...r.confirmation,
          confirmationLedger:5684000+ordinal,resultXdr:frames.resultXdr,resultMetaXdr:frames.resultMetaXdr};return r;};
        const guard=new PersistedContextGuard(f.repo,approval.authority.instanceId),signEnvelope=fake.signEnvelope.bind(fake);
        fake.signEnvelope=async(body,context)=>{
          if(scenario==='revoke-before-sign')
            await f.db.query('delete from auth.sessions where id=$1',[f.identities.RECYCLER.sessionId]);
          return guard.startD324Signing(context,assertStillValid=>{assertStillValid();return signEnvelope(body);});
        };
        fakes.set(op,fake);
      }
      let projected=false;
      const worker=new LocalTransactionWorker(store,fake,async(db,w)=>{
        await apply(w.command);await f.repo.project(db,mock,w.command,w.confirmation.confirmationLedger);projected=true;
        if(w.command.kind==='pay_reward')await db.query("update app_private.reward_attempts set state='SUCCEEDED' where operation_id=$1",[op]);
      },()=>Number(fake.closeTime));
      const result=await worker.run(op,'offline-controller-worker');dispatches++;
      const original=await store.identity(op);if(original)originals.set(op,{operationId:op,transactionHash:original.transactionHash});
      return {result,projected};
}
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
// Fence every fetch used by the actual Auth validator to this one fixture.
const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,options={})=>{
  check(new URL(String(url)).origin===origin,'OFFLINE_EGRESS_REJECTED');
  const headers=new Headers(options.headers);headers.set('x-fixture-capability',capability);
  return nativeFetch(url,{...options,headers,redirect:'error',credentials:'omit'});
};
auth=new SupabaseAuth({url:origin,publicKey:'sb_publishable_fixture'});
control=createD324SessionControl({repo:f.repo,auth,authority:approval.authority,challenge:approval.input.execution.challenge});
app=api(auth,new Coordinator(f.repo,{},undefined,undefined,approval.authority),{
  network:async()=>{throw Error('OFFLINE_HISTORY_NETWORK_DISABLED');},transaction:async()=>{throw Error('OFFLINE_HISTORY_NETWORK_DISABLED');}});
process.send({ready:true,origin});
process.on('message',async m=>{if(m?.stop){control.close();server.closeAllConnections();await new Promise(r=>server.close(r));await f.db.close();process.exit(0);}});
