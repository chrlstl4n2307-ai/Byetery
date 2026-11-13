import { fork, spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { mkdir, mkdtemp, writeFile, symlink, realpath, unlink, rm, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { D324_ARGV } from '../d3-24-operational/policy.mjs';
import { BASE, BRIDGE_BASE, V3_BASE } from './local-control.mjs';
import { isD324SessionFrame } from '../d3-24-operational/private-session-channel.mjs';
const directory=dirname(fileURLToPath(import.meta.url));
const cases=['success','expired-session','wrong-role','changed-session','unauthorized','missing-manifest','wrong-plan',
  'expired-grant','busy-quiescence','revoke-before-sign','crash-reconcile','uncertain-retry','outside-battery',
  'reserved-battery-wrong-task','k5-tamper','session-control-tamper'];
const selected=process.argv.slice(2);
const runtimeV3=selected[0]==='--runtime-v3-review';
const bridge=runtimeV3||selected[0]==='--bridge-review';
if(bridge){
  selected.shift();
  cases.push('missing-grant','auth-revoked-at-admission','shorter-sql-session','partial-login','prepared-close',
    'execution-exceeds-prepared','legacy-admission','nonfixture-input');
}
if(selected.some(scenario=>!cases.includes(scenario))||new Set(selected).size!==selected.length)
  throw Error('OFFLINE_SCENARIO_REJECTED');
const pwsh=execFileSync('pwsh',['-NoProfile','-NonInteractive','-Command','[Console]::Write((Get-Process -Id $PID).Path)'],
  {encoding:'utf8',windowsHide:true}).trim();
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|PATHEXT|SYSTEMDRIVE|OS)$/i.test(k)));
Object.assign(env,{NODE_DISABLE_COMPILE_CACHE:'1',OFFLINE_PWSH:pwsh});
const root=resolve(directory,'../..');
const output=resolve(root,'.test-output');await mkdir(output,{recursive:true});
if(await realpath(output)!==output)throw Error('OFFLINE_OUTPUT_PATH_REJECTED');
const git=(cwd,...args)=>execFileSync('git',['--no-replace-objects',...args],{cwd,env,encoding:'utf8',windowsHide:true}).trim();
const head=runtimeV3?V3_BASE:bridge?BRIDGE_BASE:BASE;
if(git(root,'rev-parse','HEAD')!==head)throw Error('OFFLINE_COMPOSITION_PIN_REJECTED');
const objects=git(root,'rev-parse','--path-format=absolute','--git-path','objects');
let passed=0;
for(const scenario of selected.length?selected:cases){
  const caseDir=await mkdtemp(join(output,'controller-'));
  const operatorRoot=join(caseDir,'operator');
  const compositionRoot=join(caseDir,'composition');
  await mkdir(operatorRoot);
  git(operatorRoot,'-c','init.templateDir=','init','--quiet');
  await writeFile(join(operatorRoot,'.git/objects/info/alternates'),objects+'\n',{flag:'wx',mode:0o600});
  git(operatorRoot,'-c','core.hooksPath=/dev/null','checkout','--detach','--quiet',D324_ARGV[4]);
  git(operatorRoot,'worktree','add','--detach','--no-checkout',compositionRoot,head);
  // Resolve the SDK inside the isolated operator checkout.
  const dependencyPath=resolve(root,'backend','node_modules');
  await symlink(dependencyPath,join(operatorRoot,'backend','node_modules'),'junction');
  if(git(operatorRoot,'rev-parse','--path-format=absolute','--git-common-dir')===git(root,'rev-parse','--path-format=absolute','--git-common-dir'))
    throw Error('OFFLINE_GIT_ISOLATION_REQUIRED');
  const fixtureEnv={...env,OFFLINE_CAPABILITY:randomBytes(32).toString('hex')};
  const mode=runtimeV3?'--runtime-v3-review':'--bridge-review';
  if(runtimeV3)fixtureEnv.BYETERY_D324_TEST_PG_PORT=process.env.BYETERY_D324_TEST_PG_PORT;
  const server=fork(join(directory,'server-fixture.mjs'),[scenario,...(bridge?[mode]:[])],
    {execArgv:['--experimental-strip-types'],env:fixtureEnv,windowsHide:true,silent:true});
  let client,diagnostics='';
  server.stderr.on('data',b=>{diagnostics=(diagnostics+b).slice(-3000);});server.stdout.on('data',()=>{});
  const watchdog=setTimeout(()=>{server.kill();client?.kill();},150000);
  try{
    const origin=await new Promise((resolve,reject)=>{server.once('message',m=>m.ready?resolve(m.origin):reject(Error('OFFLINE_NOT_READY')));
      server.once('exit',()=>reject(Error('OFFLINE_SERVER_EXITED')));server.once('error',reject);});
    const childEnv={...fixtureEnv,OFFLINE_ORIGIN:origin,OFFLINE_CASE_DIR:caseDir,OFFLINE_SCENARIO:scenario};
    let launcherOutput='';
    function observeChild(child, capture=false){
      child.stdout.on('data',b=>{if(capture)launcherOutput=(launcherOutput+b).slice(-3000);else process.stdout.write(b);});
      child.stderr.on('data',b=>{diagnostics=(diagnostics+b).slice(-3000);});
      return new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
    }
    function run(exe,args,capture=false){
      client=spawn(exe,args,{env:childEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});
      return observeChild(client,capture);
    }
    let code=await run(pwsh,['-NoProfile','-NonInteractive','-File',join(directory,'launch-fixture.ps1'),process.execPath,
      ...(bridge?[mode]:[]),...D324_ARGV],runtimeV3);
    if(runtimeV3&&code===0){
      if(launcherOutput.trim()!=='D324_V3_FIXTURE_LAUNCHER_VERIFIED')throw Error('D324_BRIDGE_LAUNCHER_REJECTED');
      client=fork(join(directory,'client-fixture.mjs'),[mode,...D324_ARGV],
        {execArgv:['--experimental-strip-types'],env:childEnv,windowsHide:true,silent:true});
      const launcher=client;
      const forward=(to,message)=>{
        if(!isD324SessionFrame(message))return;
        if(!to.connected){launcher.kill();return;}
        try { to.send(message,error=>{if(error)launcher.kill();}); }
        catch { launcher.kill(); }
      };
      const toClient=message=>forward(launcher,message);
      const toServer=message=>forward(server,message);
      server.on('message',toClient);
      launcher.on('message',toServer);
      try { code=await observeChild(launcher); }
      finally {
        server.off('message',toClient);
        launcher.off('message',toServer);
        if(server.connected)server.send({sessionClosed:true});
      }
    }
    if(['crash-reconcile','uncertain-retry'].includes(scenario)){
      if(code!==73||await run(process.execPath,['--experimental-strip-types',join(directory,'recovery-fixture.mjs')])!==0)
        throw Error('OFFLINE_RECOVERY_FAILED');
    }else if(code!==0)throw Error('OFFLINE_CLIENT_FAILED');
    passed++;
  }catch(e){
    // Synthetic diagnostics only, emitted as category (no arbitrary error body).
    console.log(JSON.stringify({scenario,result:'FAIL',code:e.message,
      category:diagnostics.match(/Unexpected bridge rejection: ([A-Za-z0-9_]+)\b/)?.[1]??
        diagnostics.match(/(?:ERR_[A-Z_]+|[A-Za-z]+Error: [A-Za-z0-9_]+|\b[A-Z][A-Z_]{9,}\b)/)?.[0]??'NONE',
      systemCodes:[...new Set(diagnostics.match(/\b(?:ECONN[A-Z]+|ETIMEDOUT|EPERM|EACCES|UND_ERR_[A-Z_]+)\b/g)??[])],
      location:diagnostics.match(/(?:client-fixture\.mjs|launch-fixture\.ps1):\d+(?::\d+)?/)?.[0]??null}));
    process.exitCode=1;
  }finally{
    clearTimeout(watchdog);if(server.connected)server.send({stop:true});
    if(server.exitCode===null&&server.signalCode===null){
      const kill=setTimeout(()=>server.kill(),3000);
      await new Promise(resolve=>server.once('exit',resolve));clearTimeout(kill);
    }
    if(runtimeV3&&server.exitCode!==0){
      console.log(JSON.stringify({scenario,result:'FAIL',code:'D324_FIXTURE_SHUTDOWN_FAILED'}));
      process.exitCode=1;
    }
    if(await realpath(caseDir)!==caseDir||dirname(caseDir)!==output||await realpath(operatorRoot)!==operatorRoot||
      await realpath(compositionRoot)!==compositionRoot)throw Error('OFFLINE_CLEANUP_PATH_REJECTED');
    // Preserve the operator's own durable state for review before removing its checkout.
    try{await rename(join(operatorRoot,'.git','byetery-d3-operator'),join(caseDir,'operator-state'));}
    catch(e){if(e.code!=='ENOENT')throw e;}
    await unlink(join(operatorRoot,'backend','node_modules'));
    await rm(operatorRoot,{recursive:true,maxRetries:8,retryDelay:250});
    await rm(compositionRoot,{recursive:true,maxRetries:8,retryDelay:250});
  }
  if(process.exitCode)break;
}
console.log(JSON.stringify({OFFLINE_CONTROLLER_CASES_PASS:passed,EXPECTED:selected.length||cases.length,
  LIVE_AUTHORITY:false,realAuthLogins:0,realStellarTransactions:0}));
