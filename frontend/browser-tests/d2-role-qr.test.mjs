import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {roleQrFixture} from '../../backend/tests/d2-role-qr-fixture.ts';

test('D2-005 actual Next pages + Chromium + isolated HTTP/SQL/MOCK fixture bridge',{timeout:240000},async t=>{
 const f=await roleQrFixture(),trace=[],blockedExternal=[];
 const frontend=fileURLToPath(new URL('../',import.meta.url));
 const evidence=new URL('../../docs/instaward/d2/evidence/d2-005/',import.meta.url);
 const localLogs=new URL('../../.tools/d2-005/',import.meta.url);
 await mkdir(evidence,{recursive:true});await mkdir(localLogs,{recursive:true});
 const generatedFiles=['next-env.d.ts','AGENTS.md','CLAUDE.md'];
 const beforeFiles=new Map(await Promise.all(generatedFiles.map(async name=>{
  try{return [name,await readFile(new URL('../'+name,import.meta.url))];}catch(error){if(error.code!=='ENOENT')throw error;return [name,null];}
 })));
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
 const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const origin='http://127.0.0.1:'+port;
 const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',BYETERY_WEB_ENV:'LOCAL',BYETERY_SOURCE:'MOCK',
  BYETERY_WEB_ORIGIN:origin,BYETERY_API_URL:f.origin,SUPABASE_URL:'https://aemxuqnnwfclzrwwiqfd.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_D2_005_BROWSER_FIXTURE_ONLY'};
 for(const key of ['VERCEL','VERCEL_ENV','VERCEL_URL','VERCEL_BRANCH_URL','VERCEL_GIT_COMMIT_REF'])delete env[key];
 const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),'dev','--hostname','127.0.0.1','--port',String(port)],
  {cwd:frontend,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let log='',browser,browserVersion=null;
 child.stdout.on('data',b=>{log=(log+b.toString()).slice(-128000);});child.stderr.on('data',b=>{log=(log+b.toString()).slice(-128000);});
 const contexts=[];
 try{
  const deadline=Date.now()+90000;let started=false;
  while(Date.now()<deadline){
   if(child.exitCode!==null)throw Error('Fixture Next server stopped; inspect ignored next-browser.log');
   try{const r=await fetch(origin,{signal:AbortSignal.timeout(2500)});if(r.ok){started=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  assert.ok(started,'Next fixture server became ready');
  const known=await f.ready('QR'),collection=await f.ready('BROWSER-C','RETURNED'),recycling=await f.ready('BROWSER-R','COLLECTED');
  let executablePath=chromium.executablePath();
  if(!existsSync(executablePath)&&process.platform==='win32'){
   const cache=path.join(process.env.LOCALAPPDATA??'','ms-playwright');
   const installed=readdirSync(cache).filter(name=>/^chromium_headless_shell-\d+$/.test(name)).sort((a,b)=>Number(b.split('-').at(-1))-Number(a.split('-').at(-1)));
   executablePath=installed.map(name=>path.join(cache,name,'chrome-headless-shell-win64','chrome-headless-shell.exe')).find(name=>existsSync(name));
  }
  assert.ok(executablePath&&existsSync(executablePath),'An existing Chromium executable is required; this test never downloads browsers');
  browser=await chromium.launch({headless:true,executablePath});
  browserVersion=browser.version();
  const pageFor=async alias=>{
   const context=await browser.newContext({viewport:{width:1440,height:1024},serviceWorkers:'block'});contexts.push(context);
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin){blockedExternal.push(url.origin);await route.abort();return;}
    if(url.pathname==='/auth/session'){
     await route.fulfill({status:alias?200:401,contentType:'application/json',body:JSON.stringify(alias
      ?{user:{id:'D2-005-FIXTURE-'+alias,email:'fixture-'+alias.toLowerCase()+'@example.test'}}:{error:{code:'AuthenticationRequired'}})});return;
    }
    if(url.pathname.startsWith('/api/')){
     const reply=await f.call(alias,url.pathname+url.search,req.method()==='POST'?req.postDataJSON():undefined);
     trace.push({principal:alias??'ANONYMOUS',method:req.method(),path:url.pathname,status:reply.status,
      ...(reply.body.batteryId?{batteryId:reply.body.batteryId}:{}),...(reply.body.source?{source:reply.body.source}:{}),
      ...(reply.body.error?{error:reply.body.error.code}:{})});
     await route.fulfill({status:reply.status,contentType:'application/json',body:JSON.stringify(reply.body)});return;
    }
    await route.continue();
   });
   return context.newPage();
  };
  await t.test('USER dashboard, actual QR target, exact SQL-backed record and direct forbidden API',async()=>{
   const page=await pageFor('USER');await page.goto(origin+'/dashboard');
   await page.getByRole('heading',{name:'Tu actividad circular'}).waitFor();
   await page.getByLabel('Consultar una batería').fill('bye-d2-005-qr');await page.getByRole('button',{name:'Buscar batería →'}).click();
   await page.getByRole('heading',{name:known.batteryId,exact:true}).waitFor();
   assert.equal(new URL(page.url()).pathname,'/battery/'+known.batteryId);
   const target=await page.locator('.qr a').getAttribute('href');assert.equal(target,'/battery/'+known.batteryId);
   await page.getByText('Solo identifica la batería. No concede permisos.',{exact:true}).waitFor();
   assert.equal(await page.locator('.qr svg path').count()>0,true);
   await page.locator('.qr a').click();await page.getByRole('heading',{name:known.batteryId,exact:true}).waitFor();
   assert.ok(trace.some(r=>r.batteryId===known.batteryId&&r.source==='MOCK'&&r.status===200));
   const before=await f.snapshot();
   const denied=await page.evaluate(async id=>{
    const response=await fetch('/api/batteries',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({batteryId:id})});return response.status;
   },known.batteryId);assert.equal(denied,403);assert.deepEqual(await f.snapshot(),before);
   await page.screenshot({path:fileURLToPath(new URL('user-qr.png',evidence)),fullPage:true});
   await page.goto(origin+'/admin');await page.getByRole('heading',{name:'Acceso restringido'}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Registrar batería',exact:true}).count(),0);
  });
  await t.test('ADMIN actual registration interface and successful API; collector remains forbidden',async()=>{
   const page=await pageFor('ADMIN');await page.goto(origin+'/admin');
   await page.getByRole('heading',{name:'Una identidad para cada batería'}).waitFor();
   await page.getByLabel('Battery ID',{exact:true}).fill('BYE-D2-005-BROWSER-A');
   await page.getByLabel('Tipo',{exact:true}).fill('Pila AA ficticia');
   await page.getByLabel('Marca / fabricante',{exact:true}).fill('Fixture');
   await page.getByLabel('Lote',{exact:true}).fill('D2-005');
   await page.getByRole('button',{name:'Registrar batería',exact:true}).click();
   await page.getByRole('status').filter({hasText:/confirmada/i}).waitFor();
   assert.ok(trace.some(r=>r.principal==='ADMIN'&&r.method==='POST'&&r.path==='/api/batteries'&&r.status===201));
   await page.screenshot({path:fileURLToPath(new URL('admin.png',evidence)),fullPage:true});
   await page.goto(origin+'/collector');await page.getByRole('heading',{name:'Acceso restringido'}).waitFor();
  });
  for(const [alias,route,target,button,file] of [['COLLECTOR','collector',collection,'Confirmar recepción física','collector.png'],['RECYCLER','recycler',recycling,'Confirmar reciclaje','recycler.png']]){
   await t.test(alias+' actual eligible interface submits correct evidence through real local API',async()=>{
    const page=await pageFor(alias);await page.goto(origin+'/'+route);
    await page.getByLabel('Battery ID',{exact:true}).fill(target.batteryId);await page.getByLabel('Return Request ID',{exact:true}).fill(target.requestId);
    await page.getByRole('button',{name:'Consultar batería',exact:true}).click();
    await page.getByRole('button',{name:button,exact:true}).waitFor();
    await page.getByRole('button',{name:button,exact:true}).click();
    await page.getByRole('status').filter({hasText:/confirmada/i}).waitFor();
    assert.ok(trace.some(r=>r.principal===alias&&r.method==='POST'&&r.status===200));
    await page.screenshot({path:fileURLToPath(new URL(file,evidence)),fullPage:true});
    await page.goto(origin+(alias==='COLLECTOR'?'/recycler':'/collector'));await page.getByRole('heading',{name:'Acceso restringido'}).waitFor();
   });
  }
  await t.test('anonymous QR requires login; malformed targets reject and query cannot grant ADMIN',async()=>{
   const anonymous=await pageFor(null);await anonymous.goto(origin+'/battery/'+known.batteryId);await anonymous.waitForURL('**/login');
   const page=await pageFor('USER');
   for(const id of ['A'.repeat(33),'BYE_0001','../admin','BYE?role=ADMIN']){
    const response=await page.goto(origin+'/battery/'+encodeURIComponent(id));assert.equal(response.status(),404,id);
    assert.ok(new URL(page.url()).pathname.startsWith('/battery/'));
   }
   await page.goto(origin+'/battery/'+known.batteryId+'?role=ADMIN&batteryId=OTHER');await page.getByRole('heading',{name:known.batteryId,exact:true}).waitFor();
   assert.equal(await page.getByRole('link',{name:'Administración',exact:true}).count(),0);
   await page.goto(origin+'/battery/BYE-D2-005-MISSING');await page.getByRole('alert').filter({hasText:/No encontramos/}).waitFor();
   assert.ok(trace.some(r=>r.path==='/api/batteries/BYE-D2-005-MISSING'&&r.status===404));
  });
  assert.equal(f.externalCalls(),0);assert.deepEqual(blockedExternal,[]);
 }finally{
  await Promise.all(contexts.map(c=>c.close()));if(browser)await browser.close();
  if(child.exitCode===null&&child.pid){
   if(process.platform==='win32')try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
   else child.kill('SIGTERM');
  }
  for(const name of generatedFiles){
   const target=new URL('../'+name,import.meta.url),before=beforeFiles.get(name);
   if(name==='next-env.d.ts'&&before){await writeFile(target,before);continue;}
   if(before!==null)continue;
   let bytes;try{bytes=await readFile(target);}catch(error){if(error.code==='ENOENT')continue;throw error;}
   const text=bytes.toString('utf8');
   if((name==='AGENTS.md'&&text.includes('<!-- BEGIN:nextjs-agent-rules -->'))||(name==='CLAUDE.md'&&text.trim()==='@AGENTS.md')){
    const archive=new URL('generated-next/',localLogs);await mkdir(archive,{recursive:true});await writeFile(new URL(name,archive),bytes);await unlink(target);
   }
  }
  await writeFile(new URL('next-browser.log',localLogs),log);
  await writeFile(new URL('browser-results.json',localLogs),JSON.stringify({task:'D2-005',mode:'ACTUAL_NEXT_CHROMIUM_WITH_FIXTURE_AUTH_BRIDGE',browserVersion,trace,blockedExternalOrigins:blockedExternal,liveRpcCalls:f.externalCalls(),operationalSignatures:0,broadcasts:0},null,2)+'\n');
  await f.close();
 }
});
