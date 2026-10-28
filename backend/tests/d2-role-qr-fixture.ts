import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {permissionFixture} from './d2-authority-fixture.ts';
import {Coordinator} from '../src/application/coordinator.ts';
import {SupabaseAuth,type Identity} from '../src/application/auth.ts';
import {AppError} from '../src/application/errors.ts';
import {api,listen,close} from '../src/application/http.ts';
import {MockStellarService} from '../src/mock-stellar-service.ts';
import type {Command} from '../src/domain.ts';
import {ACTORS} from '../src/testnet/abi.ts';
import {address,contract,h} from './fixtures.ts';


export async function roleQrFixture(){
 const f=await permissionFixture('MOCK'),{db,repo,deploymentId:d}=f;
 const users={...f.users,OTHER:randomUUID()};type Alias=keyof typeof users;
 const ownerWallet=randomUUID(),otherWallet=randomUUID(),trace:Record<string,unknown>[]=[];
 let mockPreparations=0,externalCalls=0;
 const evidence=(batteryId:string,requestId:string,kind:'COLLECTION'|'RECYCLING')=>({evidence:{batteryId,requestId,kind,
  manifestBase64:Buffer.from(JSON.stringify({batteryId,requestId,kind,fixture:'D2-005'})).toString('base64')}});
 await db.query('insert into auth.users values($1)',[users.OTHER]);
 await db.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[users.OTHER]);
 for(const id of Object.values(users)){
  await db.query('insert into auth.sessions values($1,$1,null)',[id]);
  await db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'USER') on conflict do nothing",[d,id]);
 }
 for(const [id,user,walletAddress] of [[ownerWallet,users.USER,address(5)],[otherWallet,users.OTHER,address(6)]] as const)
  await db.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
   values($1,$2,decode($3,'hex'),$4,$5,'D2-005-SEEDED-PROOF-NOT-A-LIVE-VERIFICATION',now())`,[id,d,(await repo.transaction(sql=>repo.config(sql))).networkId,user,walletAddress]);
 await repo.transaction(async sql=>{
  const mock=new MockStellarService(await repo.config(sql));mock.fund(1000n*100000000n);
  for(const [actor,role] of [[ACTORS.collector,'COLLECTOR'],[ACTORS.recycler,'RECYCLER']] as const){
   const c:Command={kind:'set_role',actor,role,enabled:true},p=await mock.prepare(d,c);
   const submitted=await mock.submit(p,p.requiredSigners.map(s=>mock.authorize(p,s)));
   const result=mock.settle(submitted);assert.equal(result.status,'SUCCESS');await repo.project(sql,mock,c,result.ledger);
  }
  await sql.query('insert into api_private.mock_runtime(deployment_id,snapshot) values($1,$2)',[d,Buffer.from(mock.exportSnapshot())]);
 });
 const foreign={deploymentId:randomUUID(),batteryId:'BYE-D2-005-FOREIGN',requestId:h(88)},foreignWallet=randomUUID();
 const config=await repo.transaction(sql=>repo.config(sql));
 await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
  select $1,'MOCK',network_id,$2,wasm_hash,schema_version,admin,service,reward_token,reward_amount from chain_private.deployments where id=$3`,[foreign.deploymentId,contract(25),d]);
 await db.query('insert into app_private.battery_records(deployment_id,battery_id,created_by) values($1,$2,$3)',[foreign.deploymentId,foreign.batteryId,users.USER]);
 await db.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
  values($1,$2,decode($3,'hex'),$4,$5,'D2-005-FOREIGN-FIXTURE',now())`,[foreignWallet,foreign.deploymentId,config.networkId,users.USER,address(5)]);
 await db.query(`insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot)
  values($1,decode($2,'hex'),$3,$4,$5,$6)`,[foreign.deploymentId,foreign.requestId,foreign.batteryId,users.USER,foreignWallet,address(5)]);
 const originalMock=repo.mock.bind(repo);repo.mock=async sql=>{
  const mock=await originalMock(sql),prepare=mock.prepare.bind(mock);
  mock.prepare=async(...args)=>{mockPreparations++;return prepare(...args);};return mock;
 };
 class FixtureAuth extends SupabaseAuth{override async validate(header:string|undefined):Promise<Identity>{
  const user=users[header?.replace('Bearer ','') as Alias];if(!user)throw new AppError(401,'AuthenticationRequired');
  return {authUserId:user,sessionId:user};
 }}
 const server=api(new FixtureAuth({} as never),new Coordinator(repo),{
  network:async()=>{externalCalls++;throw Error('No live RPC permitted');},transaction:async()=>{externalCalls++;throw Error('No live RPC permitted');}});
 const origin=await listen(server);
 const call=async(alias:Alias|null,path:string,body?:unknown)=>{
  const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{...(alias?{Authorization:'Bearer '+alias}:{}),
   ...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':randomUUID()})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json() as Record<string,any>};
 };
 const tables=['app_private.battery_records','app_private.stellar_operations','app_private.return_requests','app_private.reward_attempts',
  'app_private.wallet_links','app_private.evidence_versions','api_private.wallet_challenges','api_private.operation_transport',
  'api_private.mock_runtime','chain_private.batteries','chain_private.return_requests'];
 const snapshot=async()=>{
  const rows=[];for(const table of tables)rows.push((await db.query(`select to_jsonb(t)::text value from ${table} t order by value`)).rows);
  return {businessHash:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),rowCounts:rows.map(r=>r.length),mockPreparations,externalCalls};
 };
 const reject=async(name:string,alias:Alias|null,path:string,body:unknown|undefined,status:number)=>{
  const before=await snapshot(),r=await call(alias,path,body);assert.equal(r.status,status,name+': '+JSON.stringify(r.body));
  assert.deepEqual(await snapshot(),before,name+' must reject before business writes or mock preparation');
  trace.push({case:name,principal:alias??'ANONYMOUS',method:body===undefined?'GET':'POST',path:path.replace(/\/returns\/[a-f0-9]{64}/g,'/returns/<fixture-request-id>'),expected:status,actual:r.status,error:r.body.error?.code,zeroBusinessEffects:true});
 };
 const register=async(id:string)=>{const r=await call('ADMIN','/api/batteries',{batteryId:id});assert.equal(r.status,201,JSON.stringify(r.body));return r;};
 const ready=async(suffix:string,state:'REGISTERED'|'RETURNED'|'COLLECTED'|'RECYCLED'='REGISTERED')=>{
  const batteryId='BYE-D2-005-'+suffix;await register(batteryId);let requestId='';
  if(state!=='REGISTERED'){
   const r=await call('USER',`/api/batteries/${batteryId}/returns`,{walletLinkId:ownerWallet});assert.equal(r.status,201,JSON.stringify(r.body));requestId=r.body.requestId;
  }
  if(state==='COLLECTED'||state==='RECYCLED')assert.equal((await call('COLLECTOR',`/api/returns/${requestId}/collection`,evidence(batteryId,requestId,'COLLECTION'))).status,200);
  if(state==='RECYCLED')assert.equal((await call('RECYCLER',`/api/returns/${requestId}/recycling`,evidence(batteryId,requestId,'RECYCLING'))).status,200);
  return {batteryId,requestId};
 };
 return {db,repo,users,d,origin,foreign,ownerWallet,otherWallet,trace,call,reject,ready,register,snapshot,externalCalls:()=>externalCalls,close:async()=>{await close(server);await db.close();}};
}
