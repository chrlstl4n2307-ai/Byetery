// Isolated contract validation. Never imported by the application or StellarService.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { evidenceCommitment } from '../backend/src/evidence.ts';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { xdr, scValToNative, rpc: stellarRpc, TransactionBuilder, Operation, Address, nativeToScVal } = require('@stellar/stellar-sdk');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RPC = 'https://soroban-testnet.stellar.org';
const PASSPHRASE = 'Test SDF Network ; September 2015';
const EXPECTED = 'c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6';
const CLI = process.env.BYETERY_STELLAR_CLI || 'stellar';
const WASM = path.join(ROOT, 'contracts/byetery-contract/target/wasm32v1-none/release/byetery_contract.wasm');
const run = process.argv[3];
if (!run || !/^[a-z0-9-]{1,40}$/.test(run)) throw new Error('Usage: node --experimental-strip-types scripts/testnet-contract.mts setup|deploy|flow|checks <unique-run-name>');
const dir = path.join(ROOT, '.tools/testnet', run);
await mkdir(dir, { recursive:true });
const statePath = path.join(dir, 'public-results.json');
let state:any;
try { state=JSON.parse(await readFile(statePath,'utf8')); }
catch (e:any) { if(e.code!=='ENOENT') throw e; state={run,date:new Date().toISOString(),network:'Stellar Testnet',rpc:RPC,passphrase:PASSPHRASE,actors:{},steps:{},snapshots:{},negative:[]}; }
const json=(v:any)=>JSON.stringify(v,(_,value)=>typeof value==='bigint'?value.toString():value,2);
const save=()=>writeFile(statePath,json(state)+'\n');
const hash=(bytes:any)=>createHash('sha256').update(bytes).digest('hex');
function safe(s:string){return s.replace(/\bS[A-Z2-7]{55}\b/g,'[REDACTED_SECRET]');}
async function rpc(method:string,params:any={}){
 const res=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw new Error(`RPC HTTP ${res.status}`);const body:any=await res.json();if(body.error)throw new Error(json(body.error));return body.result;
}
async function network(){const n=await rpc('getNetwork');assert.equal(n.passphrase,PASSPHRASE);assert.equal(new URL(n.friendbotUrl).hostname,'friendbot.stellar.org');state.protocolVersion=n.protocolVersion;return n;}
const net=['--rpc-url',RPC,'--network-passphrase',PASSPHRASE];
async function cli(args:string[],secretOutput=false):Promise<any>{
 const env={...process.env};for(const name of Object.keys(env))if(name.startsWith('STELLAR_')||name==='RUST_LOG')delete env[name];
 return await new Promise((resolve,reject)=>{const child=spawn(CLI,args,{cwd:ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>resolve({code,stdout:secretOutput?'':safe(stdout.trim()),stderr:secretOutput?'':safe(stderr.trim())}));});
}
async function step(name:string,args:string[],options:any={}){
 if(state.steps[name]?.status==='CONFIRMED'||state.steps[name]?.status==='DONE')return state.steps[name];
 if(state.steps[name]?.status==='UNKNOWN')throw new Error(`${name}: UNKNOWN. Reconcile recorded transaction hashes before retrying; no automatic resubmission.`);
 await network();state.steps[name]={status:'UNKNOWN',args};await save();
 const r=await cli(args);await writeFile(path.join(dir,name+'.json'),json(r));
 state.steps[name]={...state.steps[name],...r};await save();
 if(r.code!==0)throw new Error(`${name}: ${r.stderr}`);
 const candidates=[...new Set((r.stdout+'\n'+r.stderr).match(/\b[a-f0-9]{64}\b/g)||[])] as string[];
 const txs=[];for(const txhash of candidates){const t=await rpc('getTransaction',{hash:txhash});if(t.status==='SUCCESS')txs.push({hash:txhash,ledger:t.ledger,createdAt:t.createdAt});else if(t.status==='FAILED')throw new Error(`${name}: transaction FAILED ${txhash}`);}
 if(options.transaction && txs.length===0)throw new Error(`${name}: no confirmed transaction evidence; inspect output, do not repeat submission.`);
 state.steps[name]={...state.steps[name],status:txs.length?'CONFIRMED':'DONE',transactions:txs};await save();console.log(name+': '+state.steps[name].status);return state.steps[name];
}
const actor=(role:string)=>state.actors[role].address;
const identity=(role:string)=>state.actors[role].identity;
function invocation(method:string,params:Record<string,any>,role='service',extra:string[]=[],view=false){
 return ['contract','invoke','--id',state.contractId,'--source-account',identity(role),...net,...extra,'--send',view?'no':'yes','--',method,...Object.entries(params).flatMap(([k,v])=>['--'+k,typeof v==='object'?JSON.stringify(v):String(v)])];
}
async function read(method:string,params:Record<string,any>={},contractId=state.contractId){
 await network();const args=invocation(method,params,'service',[],true);args[3]=contractId;const r=await cli(args);if(r.code!==0)throw new Error(r.stderr);return JSON.parse(r.stdout);
}
async function check(name:string,method:string,params:any,role:string,error:RegExp,extra:string[]=[]){
 if(state.negative.some((n:any)=>n.name===name))return;
 await network();const r=await cli(invocation(method,params,role,extra,true));
 assert.notEqual(r.code,0,`${name}: unexpected success`);assert.match(r.stderr,error,`${name}: unexpected rejection`);
 const entry={name,result:'simulation rejected',error:r.stderr,transactionHash:null};state.negative.push(entry);await save();console.log(name+': rejected');
}
async function snapshot(name:string,expectedState:string,reward:string){
 if(state.snapshots[name])return state.snapshots[name].battery;
 const b=await read('get_battery',{battery_id:state.batteryId});assert.equal(b.state,expectedState);assert.equal(b.reward_state,reward);state.snapshots[name]={battery:b,request:b.request_id?await read('get_request',{request_id:b.request_id}):null};await save();console.log(`${name}: ${expectedState}/${reward}`);return b;
}
async function missingAuthorization(params:any,presentRole:string,missingRole:string){
 if(state.negative.some((n:any)=>n.name===`missing ${missingRole} authorization`))return;
 await network();
 const built=await cli(invocation('confirm_collection',params,presentRole,['--build-only']));
 assert.equal(built.code,0,built.stderr);
 const tx=TransactionBuilder.fromXDR(built.stdout,PASSPHRASE);
 const server=new stellarRpc.Server(RPC);
 const recording=await server.simulateTransaction(tx,undefined,'record');
 assert.ok(stellarRpc.Api.isSimulationSuccess(recording),'Authorization recording must succeed');
 const entries=recording.result.auth;
 // Keep the source-account authorization and omit ONLY the other actor.
 const sourceOnly=entries.filter((a:any)=>a.credentials.type==='sorobanCredentialsSourceAccount');
 assert.equal(sourceOnly.length,1,'Expected source-account authorization');
 assert.equal(entries.length,2,'Expected collector + service authorization');
 const operation=tx.operations[0];
 const testTx=new TransactionBuilder(await server.getAccount(actor(presentRole)),{fee:'10000000',networkPassphrase:PASSPHRASE}).addOperation(Operation.invokeHostFunction({func:operation.func,auth:sourceOnly})).setTimeout(120).build();
 const enforced=await server.simulateTransaction(testTx,undefined,'enforce');
 assert.ok(stellarRpc.Api.isSimulationError(enforced),'Missing actor must fail enforcing simulation');
 assert.match(enforced.error,/Auth|auth/);
 state.negative.push({name:`missing ${missingRole} authorization`,presentActor:actor(presentRole),missingActor:actor(missingRole),result:'authorization rejected (enforcing RPC simulation)',error:enforced.error,transactionHash:null});await save();
 console.log(`missing ${missingRole} authorization: rejected`);
}
async function balance(address:string){return BigInt(await read('balance',{id:address},state.tokenId));}
await network();
assert.equal(hash(await readFile(WASM)),EXPECTED,'WASM differs: stop before deployment');state.wasmSha256=EXPECTED;
if(process.argv[2]==='setup'){
 state.cliVersion=(await cli(['--version'])).stdout;
 for(const role of ['admin','service','collector','recycler','recipient','issuer']){
  if(!state.actors[role]){
   const name=`byetery-${run}-${role}`;
   const result=await cli(['keys','generate',name,'--secure-store'],true);
   if(result.code!==0)throw new Error(`Secure identity creation failed for ${role}; inspect CLI secure-store availability. No fallback to plaintext.`);
   const pub=await cli(['keys','address',name]);assert.equal(pub.code,0);assert.match(pub.stdout,/^G[A-Z2-7]{55}$/);
   state.actors[role]={identity:name,address:pub.stdout};await save();
  }
  await step('fund-'+role,['keys','fund',identity(role),...net]);
 }
 await save();
}else if(process.argv[2]==='deploy'){
 const asset=`GREENTEST:${actor('issuer')}`;state.asset=asset;
 const sac=await step('deploy-sac',['contract','asset','deploy','--asset',asset,'--source-account',identity('issuer'),...net],{transaction:true});
 state.tokenId=sac.stdout.replaceAll('"','').trim();assert.match(state.tokenId,/^C[A-Z2-7]{55}$/);await save();
 await step('recipient-trustline',['tx','new','change-trust','--source-account',identity('recipient'),'--line',asset,'--limit','10000000000',...net],{transaction:true});
 const uploaded=await step('upload-wasm',['contract','upload','--wasm',WASM,'--optimize=false','--source-account',identity('admin'),...net],{transaction:true});
 assert.equal(uploaded.stdout.replaceAll('"','').trim(),EXPECTED);
 const deployed=await step('deploy-byetery',['contract','deploy','--wasm-hash',EXPECTED,'--source-account',identity('admin'),...net,'--','--admin',actor('admin'),'--service',actor('service'),'--reward_token',state.tokenId,'--reward_amount','100000000'],{transaction:true});
 state.contractId=deployed.stdout.replaceAll('"','').trim();assert.match(state.contractId,/^C[A-Z2-7]{55}$/);await save();
 state.config=await read('get_config');assert.equal(state.config.reward_amount,'100000000');assert.equal(state.config.admin,actor('admin'));assert.equal(state.config.service,actor('service'));assert.equal(state.config.reward_token,state.tokenId);assert.equal(await read('decimals',{},state.tokenId),7);
 for(const role of ['collector','recycler']){
  const actor_role=role==='collector'?'Collector':'Recycler';await step('role-'+role,invocation('set_role',{actor:actor(role),actor_role,enabled:true},'admin'),{transaction:true});assert.equal(await read('has_role',{actor:actor(role),actor_role}),true);
 }
 const args=invocation('mint',{to:state.contractId,amount:'1000000000'},'issuer');args[3]=state.tokenId;
 await step('prefund-contract',args,{transaction:true});assert.equal(await balance(state.contractId),1000000000n);await save();console.log('Contract ID: '+state.contractId);
}else if(process.argv[2]==='flow'){
 if(state.completed)throw new Error('This run is complete. Use a new run name to regenerate after a Testnet reset.');
 if(!state.flowStarted){state.flowStarted=true;state.batteryId='BYE-TN-'+randomBytes(6).toString('hex').toUpperCase();state.requestId=randomBytes(32).toString('hex');await save();}
 const bid={battery_id:state.batteryId},claim={...bid,request_id:state.requestId};
 const register={...bid,registration_hash:hash(Buffer.from('Byetery Testnet fixture '+state.batteryId))};
 await step('register-battery',invocation('register_battery',register,'admin'),{transaction:true});await snapshot('registered','Registered','NotEligible');
 await check('duplicate battery','register_battery',register,'admin',/Error\(Contract, #2\)|BatteryAlreadyExists/);
 await check('early reward','pay_reward',bid,'service',/Error\(Contract, #13\)|RewardNotEligible/);
 await step('open-return',invocation('open_return',{...claim,recipient:actor('recipient')}),{transaction:true});await snapshot('returned','Returned','NotEligible');
 const evidence=(kind:string)=>({battery_id:state.batteryId,kind,payload_hash:hash(Buffer.from(`Byetery Testnet ${kind} evidence\n${state.batteryId}\n${state.requestId}\n`)),request_id:state.requestId,version:1});
 const collection=evidence('Collection'),recycling=evidence('Recycling');state.evidence={collection,recycling};
 for(const [kind,ev] of Object.entries(state.evidence) as any){await writeFile(path.join(dir,kind+'-payload.txt'),`Byetery Testnet ${ev.kind} evidence\n${state.batteryId}\n${state.requestId}\n`);}
 const cargs={...claim,collector:actor('collector'),evidence:collection};
 await check('wrong evidence battery','confirm_collection',{...cargs,evidence:{...collection,battery_id:'BYE-OTHER'}},'collector',/Error\(Contract, #11\)|EvidenceBatteryMismatch/);
 await check('unauthorized collector role','confirm_collection',{...cargs,collector:actor('recipient')},'recipient',/Error\(Contract, #9\)|RoleNotGranted/);
 await check('recycling before collection','confirm_recycling',{...claim,recycler:actor('recycler'),evidence:recycling},'recycler',/Error\(Contract, #8\)|InvalidState/);
 // Enforcing simulation validates required authorizations instead of recording them.
 await missingAuthorization(cargs,'collector','service');
 await missingAuthorization(cargs,'service','collector');
 // CLI resolves Address arguments containing identity aliases into extra auth signers.
 // SERVICE is the transaction source; COLLECTOR signs its separate auth entry.
 await step('confirm-collection',invocation('confirm_collection',{...cargs,collector:identity('collector')},'service'),{transaction:true});
 const b=await snapshot('collected','Collected','NotEligible');
 const cfg:any={networkId:hash(Buffer.from(PASSPHRASE)),contractAddress:state.contractId};
 function commitment(ev:any){return evidenceCommitment(cfg,{version:1,batteryId:ev.battery_id,requestId:ev.request_id,kind:ev.kind==='Collection'?'COLLECTION':'RECYCLING',payloadHash:ev.payload_hash});}
 assert.equal(b.collection_hash,commitment(collection));state.collectionCommitment=b.collection_hash;
 await check('cancel after collection','cancel_return',claim,'service',/Error\(Contract, #6\)|RequestNotOpen/);
 await step('confirm-recycling',invocation('confirm_recycling',{...claim,recycler:actor('recycler'),evidence:recycling},'recycler'),{transaction:true});
 const recycled=await snapshot('recycled','Recycled','Pending');assert.equal(recycled.recycling_hash,commitment(recycling));state.recyclingCommitment=recycled.recycling_hash;
 state.balancesBefore={contract:(await balance(state.contractId)).toString(),recipient:(await balance(actor('recipient'))).toString()};await save();
 await step('pay-reward',invocation('pay_reward',bid),{transaction:true});await snapshot('paid','Recycled','Sent');
 state.balancesAfter={contract:(await balance(state.contractId)).toString(),recipient:(await balance(actor('recipient'))).toString()};
 assert.equal(BigInt(state.balancesBefore.contract)-BigInt(state.balancesAfter.contract),100000000n);assert.equal(BigInt(state.balancesAfter.recipient)-BigInt(state.balancesBefore.recipient),100000000n);
 await check('duplicate reward','pay_reward',bid,'service',/Error\(Contract, #14\)|RewardAlreadySent/);
 assert.equal((await balance(actor('recipient'))).toString(),state.balancesAfter.recipient);assert.equal((await balance(state.contractId)).toString(),state.balancesAfter.contract);state.duplicateRewardBalancesUnchanged=true;
 const startLedger=state.steps['deploy-byetery'].transactions[0].ledger;
 const events=await rpc('getEvents',{startLedger,filters:[{type:'contract',contractIds:[state.contractId]}],pagination:{limit:100}});
 state.events=events.events.map((e:any)=>({id:e.id,ledger:e.ledger,txHash:e.txHash,topics:e.topic.map((t:string)=>scValToNative(xdr.ScVal.fromXDR(t,'base64'))),data:scValToNative(xdr.ScVal.fromXDR(e.value,'base64'))}));
 for(const topic of ['config','role','register','opened','collected','recycled','paid'])assert.ok(state.events.some((e:any)=>e.topics[0]===topic),`Missing event ${topic}`);
 assert.equal(hash(await readFile(WASM)),EXPECTED);state.completed=true;await save();console.log('REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT; 10 GREENTEST; STELLAR TESTNET');
}else if(process.argv[2]==='checks'){
 assert.equal(state.completed,true,'Complete positive lifecycle first');
 const server=new stellarRpc.Server(RPC);
 const tx=new TransactionBuilder(await server.getAccount(actor('admin')),{fee:'10000000',networkPassphrase:PASSPHRASE}).addOperation(Operation.invokeContractFunction({contract:state.contractId,function:'__constructor',args:[new Address(actor('admin')).toScVal(),new Address(actor('service')).toScVal(),new Address(state.tokenId).toScVal(),nativeToScVal(100000000n,{type:'i128'})]})).setTimeout(120).build();
 const sim=await server.simulateTransaction(tx);
 assert.ok(stellarRpc.Api.isSimulationError(sim));assert.match(sim.error,/InvalidAction|reserved|constructor/);
 if(!state.negative.some((n:any)=>n.name==='constructor reinvocation'))state.negative.push({name:'constructor reinvocation',result:'simulation rejected',error:sim.error,transactionHash:null});
 await network();
 const fetched=await cli(['contract','fetch','--id',state.contractId,...net,'--out-file',path.join(dir,'deployed.wasm')]);assert.equal(fetched.code,0,fetched.stderr);
 state.deployedWasmSha256=hash(await readFile(path.join(dir,'deployed.wasm')));assert.equal(state.deployedWasmSha256,EXPECTED);
 await check('backward collection after recycled','confirm_collection',{battery_id:state.batteryId,request_id:state.requestId,collector:actor('collector'),evidence:state.evidence.collection},'collector',/Error\(Contract, #6\)|RequestNotOpen/);
 assert.equal((await balance(actor('recipient'))).toString(),state.balancesAfter.recipient);assert.equal((await balance(state.contractId)).toString(),state.balancesAfter.contract);
 state.finalConfig=await read('get_config');assert.deepEqual(state.finalConfig,state.config);state.additionalChecksComplete=true;await save();console.log('Constructor reinvocation rejected; deployed WASM matches; backward transition rejected; balances unchanged.');
}else throw new Error('Unknown stage');
