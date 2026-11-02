import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {SIGNER_FEE_CAP} from '../src/testnet/identity.ts';
import {plan,NETWORK_ID,CONTRACT,WASM,ACTORS,AMOUNT} from '../src/d3/model.ts';
import {assertLocalRuntime,localRuntime} from '../src/d3/operator-guard.ts';
import {activation,activationArguments,preflight,REVIEWED_RUNTIME_FEE_CAP,LIVE_TASK,
  sanitizeJournal,appendJournal,acquireOperatorLock,consumeBattery,Budget,runDecision,type Preflight,type JournalEntry} from '../src/d3/operator-control.ts';
import {passwordSession,localApiOrigin,reconcileViaHistory,negativeEvidenceReady,createLocalOperator,requireActualArguments,requireModuleWorktree} from '../src/d3/live-operator.ts';
import {d3Input,walletA,walletB} from './d3-fixtures.ts';
import {localDb,harness} from './testnet-fixtures.ts';
import {TransportStore} from '../src/testnet/store.ts';
import {LocalTransactionWorker} from '../src/testnet/worker.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const args={live:true,taskId:LIVE_TASK,expectedSha:d3Input().gitSha};
const git={sha:args.expectedSha,clean:true};
function facts():Preflight {return {taskId:LIVE_TASK,runId:'RUN1',observedAt:Date.now(),git:{...git},networkId:NETWORK_ID,contractId:CONTRACT,wasmSha256:WASM,
 deploymentId:'5c0cad2f-5f25-4216-8068-6cb9d2d26325',mode:'TESTNET',unresolved:0,pendingDispatches:0,
 signers:Object.values(ACTORS).map(address=>({address,available:true})),sources:[ACTORS.admin,ACTORS.service,ACTORS.recycler].map(address=>({address,sequence:'42',reviewedSequence:'42',xlmReady:true})),
 wallets:[walletA,walletB].map(address=>({address,approvedMapping:true,trustlineAuthorized:true,capacityBaseUnits:'200000000'})),payer:CONTRACT,payerBaseUnits:'700000000',marginBaseUnits:'10000000',ttlMargin:200000,requiredTtlMargin:150000,
 successfulTxCap:15,failedBroadcastCap:0,setupCap:0,maintenanceCap:0,runtimeFeeCap:String(SIGNER_FEE_CAP),approvedFeeCap:String(SIGNER_FEE_CAP),requestedFee:'1000',uniqueBatteryIds:true,simulationBeforeSend:true,sameRuntimeSha:args.expectedSha};}
test('D3 operator reviewed local activation and full public preflight model pass offline',()=>assert.doesNotThrow(()=>preflight(plan(d3Input()),args,facts(),{})));
for(const [label,change,code] of [
 ['flag',{live:false},'ExplicitLocalFlagRequired'],['task',{taskId:'D3-5-OPERATOR'},'ExactTaskRequired'],['sha',{expectedSha:'ab'.repeat(20)},'ExactShaRequired'],
] as const)test('D3 activation requires exact '+label,()=>assert.throws(()=>activation(plan(d3Input()),{...args,...change},git,{}),new RegExp(code)));
test('D3 JSON plan and env switch cannot supply local activation arguments',()=>{
 assert.throws(()=>activationArguments([]),/ExplicitLocalArgumentsRequired/);
 assert.throws(()=>activationArguments(['--live','--task-id',LIVE_TASK,'--expected-sha',git.sha,'--env','D3_LIVE=true']),/ExplicitLocalArgumentsRequired/);
 assert.throws(()=>activation(plan(d3Input()),{...args,live:false},git,{D3_LIVE:'true'}),/ExplicitLocalFlagRequired/);
 assert.deepEqual(activationArguments(['--live','--task-id',LIVE_TASK,'--expected-sha',git.sha]),args);
 const cli=['--live','--task-id',LIVE_TASK,'--expected-sha',git.sha];
 assert.throws(()=>requireActualArguments(cli,[]),/ActualLocalCliRequired/);assert.doesNotThrow(()=>requireActualArguments(cli,[...cli]));
});
test('D3 dirty worktree cannot activate',()=>assert.throws(()=>activation(plan(d3Input()),args,{...git,clean:false},{}),/CleanWorktreeRequired/));
test('D3 Mainnet cannot activate',()=>assert.throws(()=>plan({...d3Input(),network:'MAINNET'}),/TestnetOnly/));
for(const marker of ['VERCEL','VERCEL_ENV','VERCEL_URL','VERCEL_GIT_COMMIT_SHA','AWS_LAMBDA_FUNCTION_NAME','NETLIFY','CI','K_SERVICE'])
 test('D3 hosted guard precedes signer factory: '+marker,()=>{let constructed=0;assert.throws(()=>localRuntime({[marker]:''},()=>{constructed++;throw new Error('SIGNER_PATH_ACCESSED');}),/HostedExecutionDenied/);assert.equal(constructed,0);});
test('D3 production guard and unmarked local process',()=>{assert.throws(()=>assertLocalRuntime({NODE_ENV:'production'}),/HostedExecutionDenied/);assert.doesNotThrow(()=>assertLocalRuntime({NODE_ENV:'development'}));});
test('D3 server denies hosted execution before settings/signer import in a real process',async()=>{
 const env:NodeJS.ProcessEnv={...process.env,VERCEL:'1'};delete env.NODE_OPTIONS;
 const result=await new Promise<{code:number|null;output:string}>((done,reject)=>{const child=spawn(process.execPath,['--experimental-strip-types','backend/src/application/server.ts'],{cwd:root,env,windowsHide:true});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>done({code,output}));});
 assert.equal(result.code,1);assert.match(result.output,/API startup failed/);assert.doesNotMatch(result.output,/signer|postgres|supabase\.co|sb_secret/i);
 const text=await readFile(join(root,'backend/src/application/server.ts'),'utf8');assert.ok(text.indexOf('assertLocalRuntime();')<text.indexOf('await settings()'));assert.ok(text.indexOf('assertLocalRuntime();')<text.indexOf("await import('../local-secure-store-signer.ts')"));
});
test('D3 operator direct and transitive local dependencies exclude signer/service/RPC/SQL side doors',async()=>{
 const visited=new Set<string>();
 async function inspect(path:string){if(visited.has(path))return;visited.add(path);const text=await readFile(path,'utf8');
  assert.doesNotMatch(path.replaceAll('\\','/'),/\/(service|transport|store|rpc|repository|database|local-secure-store-signer|stellar-signer)\.ts$/);
  assert.doesNotMatch(text,/\b(?:eval|new Function|require)\s*\(|\bimport\s*\(/);
  for(const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)){const dep=m[1];if(dep.startsWith('.')){const target=resolve(dirname(path),dep);if(target.endsWith('/identity.ts')||target.endsWith('\\identity.ts'))continue;await inspect(target);}else assert.ok(dep.startsWith('node:')||dep==='@stellar/stellar-sdk',dep);}
 }
 // model.ts is the unchanged public plan validator, with public ABI/StrKey;
 // its identity constants import is pinned and not a live transport dependency.
 await inspect(join(root,'backend/src/d3/live-operator.ts'));
 const src=await readFile(join(root,'backend/src/d3/live-operator.ts'),'utf8');assert.doesNotMatch(src,/from ['"].*(?:testnet|signer|secure-store|pg|sql)/i);
 await assert.rejects(access(join(root,'backend/src/d3/live-adapter.ts')));
});
for(const [name,mutate] of [
 ['stale',(f:Preflight)=>{f.observedAt-=60001;}],['queue',(f:Preflight)=>{f.unresolved=1;}],['unknown',(f:Preflight)=>{f.pendingDispatches=1;}],
 ['network',(f:Preflight)=>{f.networkId='ab'.repeat(32);}],['contract',(f:Preflight)=>{f.contractId='wrong';}],['wasm',(f:Preflight)=>{f.wasmSha256='ab'.repeat(32);}],
 ['signer',(f:Preflight)=>{f.signers[0].available=false;}],['drift',(f:Preflight)=>{f.sources[0].sequence='43';}],['xlm',(f:Preflight)=>{f.sources[0].xlmReady=false;}],
 ['wallet mapping',(f:Preflight)=>{f.wallets[1].approvedMapping=false;}],['trustline',(f:Preflight)=>{f.wallets[0].trustlineAuthorized=false;}],['capacity',(f:Preflight)=>{f.wallets[0].capacityBaseUnits='1';}],
 ['funds',(f:Preflight)=>{f.payerBaseUnits='300000000';}],['ttl',(f:Preflight)=>{f.ttlMargin=1;}],['fee',(f:Preflight)=>{f.requestedFee='50000001';}],['cap drift',(f:Preflight)=>{f.runtimeFeeCap='50000001';}],
 ['tx cap',(f:Preflight)=>{f.successfulTxCap=16;}],['negative broadcasts',(f:Preflight)=>{f.failedBroadcastCap=1;}],['simulation',(f:Preflight)=>{f.simulationBeforeSend=false;}],['runtime SHA',(f:Preflight)=>{f.sameRuntimeSha='ab'.repeat(20);}],
] as const)test('D3 preflight fails closed for '+name,()=>{const f=facts();mutate(f);assert.throws(()=>preflight(plan(d3Input()),args,f,{}));});
test('D3 cap reflects existing signer/runtime ceiling without changing its policy',()=>assert.equal(REVIEWED_RUNTIME_FEE_CAP,SIGNER_FEE_CAP));
test('D3 exact business budget reserves before call, uncertainty cannot refund/reuse',()=>{const b=new Budget(15);for(let i=0;i<15;i++)b.reserve(String(i));assert.equal(b.used,15);assert.throws(()=>b.reserve('16'),/TxBudgetExceeded/);assert.throws(()=>b.reserve('0'),/OriginalOperationOnly/);assert.throws(()=>new Budget(16),/BudgetReviewRequired/);});
const entry:JournalEntry={taskId:LIVE_TASK,gitSha:git.sha,runId:'RUN1',batteryId:'BYE-OFFLINE-OPERATOR',role:'USER',operation:'pay_reward',phase:'UNKNOWN',timestamp:'2026-11-02T00:00:00.000Z'};
test('D3 journal closes output schema and redacts credentials, raw XDR, nested server data',()=>{
 const result=sanitizeJournal({...entry,password:'never-print-fixture',access_token:'fixture-token',cookie:'fixture-cookie',signed_xdr:'raw-fixture',envelope:{bytes:'fixture'},authEntries:['fixture'],response:{secret:'fixture'}} as JournalEntry);
 assert.deepEqual(result,entry);assert.doesNotMatch(JSON.stringify(result),/never-print|fixture-token|fixture-cookie|raw-fixture|authEntries|envelope|secret/);
 assert.throws(()=>sanitizeJournal({...entry,batteryId:'password=abc'}),/InvalidJournalEntry/);
});
test('D3 journal fsync output contains only allowlisted fields',async()=>{const d=await mkdtemp(join(tmpdir(),'byetery-d3-journal-'));try{const path=join(d,'journal');await appendJournal(path,entry);assert.deepEqual(JSON.parse(await readFile(path,'utf8')),entry);}finally{await rm(d,{recursive:true,force:true});}});
test('D3 lock excludes another OS process and never auto-recovers stale lock',async()=>{
 // Use an isolated local repository with no commits, no remote or worktree/ref changes.
 const d=await mkdtemp(join(tmpdir(),'byetery-d3-lock-'));try{
  execFileSync('git',['init','--quiet',d],{windowsHide:true});const l=await acquireOperatorLock(d);
  await assert.rejects(acquireOperatorLock(d),/EEXIST/);
  const module=new URL('../src/d3/operator-control.ts',import.meta.url).href;
  const script=`import {acquireOperatorLock} from ${JSON.stringify(module)};try{await acquireOperatorLock(process.argv[1]);process.exitCode=3}catch(e){process.exitCode=e.code==='EEXIST'?0:4}`;
  const code=await new Promise<number|null>((done,reject)=>{const c=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',script,d],{windowsHide:true,stdio:'ignore'});c.on('error',reject);c.on('exit',done);});assert.equal(code,0);
  await l.assertHeld();await l.release();const second=await acquireOperatorLock(d);await second.release();
 }finally{await rm(d,{recursive:true,force:true});}
});
test('D3 failed RUN1 is non-counting and its battery tombstone cannot be reused',async()=>{const d=await mkdtemp(join(tmpdir(),'byetery-d3-consumed-'));try{
 await consumeBattery(d,entry.batteryId);await assert.rejects(consumeBattery(d,entry.batteryId),/EEXIST/);
 assert.equal(runDecision(entry.batteryId,git.sha,git.sha,true,true,false).countable,true);
 for(const outcome of [runDecision(entry.batteryId,git.sha,'ab'.repeat(20),true,true,false),runDecision(entry.batteryId,git.sha,git.sha,true,true,true),runDecision(entry.batteryId,git.sha,git.sha,false,true,false),runDecision(entry.batteryId,git.sha,git.sha,true,false,false)]){assert.equal(outcome.countable,false);assert.equal(outcome.status,'FAILED_ATTEMPT / NON_COUNTING');}
}finally{await rm(d,{recursive:true,force:true});}});
for(const origin of ['https://example.invalid','http://localhost:3001','http://127.0.0.1.evil.invalid:3001','http://user:pass@127.0.0.1:3001','http://127.0.0.1:3001/?secret=x'])test('D3 rejects hosted/ambiguous API target '+origin.split('@').at(-1),()=>assert.throws(()=>localApiOrigin(origin),/LoopbackApiRequired/));
test('D3 loopback API target is explicit',()=>assert.equal(localApiOrigin('http://127.0.0.1:3001'),'http://127.0.0.1:3001'));
test('D3 ordinary password login and local logout retain tokens in memory, never admin shortcut',async()=>{
 const calls:{url:string;init:RequestInit}[]=[];const credentials={email:'fixture@example.invalid',password:'fixture-only-never-real'};
 const fetcher=(async(url:unknown,init:RequestInit)=>{calls.push({url:String(url),init});return new Response(JSON.stringify(calls.length===1?{access_token:'offline.fixture.bearer'}:{}),{status:200});}) as typeof fetch;
 const s=await passwordSession('sb_publishable_fixture',credentials,fetcher);assert.equal(s.bearer(),'offline.fixture.bearer');assert.equal(credentials.password,'');assert.equal(credentials.email,'');await s.close();assert.throws(()=>s.bearer(),/SessionClosed/);
 assert.equal(calls[0].url.endsWith('/auth/v1/token?grant_type=password'),true);assert.equal(calls[1].url.endsWith('/auth/v1/logout?scope=local'),true);assert.equal(calls.every(c=>c.init.redirect==='error'&&c.init.credentials==='omit'),true);assert.doesNotMatch(calls.map(c=>c.url).join(),/admin|generate_link/);
});
test('D3 service credential cannot login and failed Auth error cannot leak response body',async()=>{
 let n=0;const fake=(async()=>{n++;return new Response('{"secret":"do-not-propagate"}',{status:401});}) as typeof fetch;
 await assert.rejects(passwordSession('sb_secret_fixture',{email:'a',password:'b'},fake),/PublishableKeyRequired/);assert.equal(n,0);
 await assert.rejects(passwordSession('sb_publishable_fixture',{email:'a',password:'b'},fake),e=>e instanceof Error&&e.message==='LoginFailed');
});
const op='10000000-0000-0000-0000-000000000001',hash='ab'.repeat(32);
const historyContext={source:'TESTNET',deploymentId:'5c0cad2f-5f25-4216-8068-6cb9d2d26325',contractAddress:CONTRACT,network:'STELLAR TESTNET'};
test('D3 uncertainty reads only original API history and preserves identity',async()=>{
 const original={operationId:op,transactionHash:hash};let reads=0;const history=async()=>({...historyContext,entries:[{operationId:op,transactionHash:hash,persistedState:'CONFIRMED',verification:++reads===1?'UNVERIFIED':'CONFIRMED',chainResult:'SUCCESS'}]});
 assert.equal(await reconcileViaHistory(original,history),'UNRESOLVED');assert.equal(await reconcileViaHistory(original,history),'CONFIRMED');assert.deepEqual(original,{operationId:op,transactionHash:hash});
 await assert.rejects(reconcileViaHistory(original,async()=>({...historyContext,entries:[{operationId:op,transactionHash:'cd'.repeat(32)}]})),/OriginalIdentityMismatch/);
 assert.equal(await reconcileViaHistory({operationId:null,transactionHash:null},async()=>{throw new Error('must not infer by battery');}),'UNRESOLVED');
});
test('D3 rejects MOCK history and missing/unknown transactions never imply success',async()=>{
 await assert.rejects(reconcileViaHistory({operationId:op,transactionHash:hash},async()=>({source:'MOCK',entries:[]})),/TestnetHistoryRequired/);
 assert.equal(await reconcileViaHistory({operationId:op,transactionHash:hash},async()=>({...historyContext,entries:[]})),'UNRESOLVED');
});
test('D3 negatives require contract simulation rejection plus unchanged state/balance, zero broadcasts',()=>{
 const e={apiRejected:true,unchangedState:true,unchangedBalance:true,contractSimulation:'REJECTED' as const,failedBroadcasts:0 as const};assert.equal(negativeEvidenceReady(e),true);assert.equal(negativeEvidenceReady({...e,contractSimulation:'NOT_RUN'}),false);assert.equal(negativeEvidenceReady({...e,unchangedBalance:false}),false);
});
test('D3 requires two distinct wallets, not two Auth users or USER2',()=>{const f=facts();assert.equal(f.wallets.length,2);assert.doesNotThrow(()=>preflight(plan(d3Input()),args,f,{}));assert.equal('user2' in f,false);});
test('D3 current dirty candidate cannot construct live operator or ask for credentials',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byetery-d3-plan-'));try{const path=join(dir,'plan.json');await writeFile(path,JSON.stringify(d3Input()));let asked=0;
 await assert.doesNotReject(requireModuleWorktree(root));await assert.rejects(requireModuleWorktree(dir),/OperatorWorktreeMismatch/);
 await assert.rejects(createLocalOperator({root,argv:['--live','--task-id',LIVE_TASK,'--expected-sha',git.sha],publicPlanFile:path,apiOrigin:'http://127.0.0.1:3001',publishableKey:'sb_publishable_fixture',credentials:async()=>{asked++;throw new Error('MUST_NOT_AUTHENTICATE');},readPreflight:async()=>facts()}));assert.equal(asked,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('D3 separately reviewed later run uses the same frozen code, never automatic advancement',()=>{
 const f=facts();f.taskId='D3-10-RUN2';f.runId='RUN2';
 assert.throws(()=>preflight(plan(d3Input()),args,f,{}),/ExactTaskRequired/);
 assert.doesNotThrow(()=>preflight(plan(d3Input()),{...args,taskId:f.taskId},f,{}));
 f.runId='RUN3';assert.throws(()=>preflight(plan(d3Input()),{...args,taskId:f.taskId},f,{}),/ExactRunRequired/);
});
test('D3 budget survives new operator instance without restoring spent/unknown slots',()=>{
 const previous=Array.from({length:14},(_,i)=>String(i));const b=new Budget(15,previous);b.reserve('last');assert.throws(()=>b.reserve('new'),/TxBudgetExceeded/);assert.throws(()=>new Budget(15,['same','same']),/OriginalOperationOnly/);
});
test('D3 operator read-only uncertainty uses original D1 recovery fixture across restart, zero replacement',async()=>{
 const db=await localDb();try{
  const f=await harness(db,true);f.transport.loseSubmit=true;await f.worker.run(f.op,'d3-operator-offline');
  const first=(await f.store.identity(f.op))!;
  const worker=new LocalTransactionWorker(new TransportStore(f.adapter),f.transport,f.project);
  const original={operationId:f.op,transactionHash:first.transactionHash};
  const history=async()=>{
   const state=await worker.run(f.op,'d3-operator-offline-recovery');
   return {...historyContext,entries:[{operationId:f.op,transactionHash:first.transactionHash,persistedState:state==='PROJECTED'?'CONFIRMED':'UNKNOWN',verification:state==='PROJECTED'?'CONFIRMED':'UNVERIFIED',chainResult:state==='PROJECTED'?'SUCCESS':null}]};
  };
  assert.equal(await reconcileViaHistory(original,history),'UNRESOLVED');
  f.transport.success=true;assert.equal(await reconcileViaHistory(original,history),'CONFIRMED');
  assert.equal(await reconcileViaHistory(original,history),'CONFIRMED');
  assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);assert.equal(f.projectionCount(),1);
  assert.deepEqual((await f.store.identity(f.op))!.envelopeBytes,first.envelopeBytes);
 }finally{await db.close();}
});
