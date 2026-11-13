
import {fork,spawn} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const env={...process.env,NODE_DISABLE_COMPILE_CACHE:'1'};for(const k of Object.keys(env))if(/^(SUPABASE_|DATABASE_|BYETERY_|PGHOST|PGUSER|PGPASSWORD|CI$|VERCEL)/i.test(k))delete env[k];
const server=fork(join(dir,'session-server.mjs'),[],{execArgv:['--experimental-strip-types'],env,windowsHide:true,silent:true});
let diagnostics='';
server.stdout.on('data',()=>{});server.stderr.on('data',b=>{diagnostics+=b;if(diagnostics.length>3000)diagnostics=diagnostics.slice(-3000);});
const timer=setTimeout(()=>{server.kill();console.log('CROSS_PROCESS_TIMEOUT');process.exitCode=1;},90000);
try{
 const origin=await new Promise((resolve,reject)=>{server.once('message',m=>m.ready?resolve(m.origin):reject(Error('ServerNotReady')));server.once('exit',()=>reject(Error('ServerExited')));});
 const client=spawn(process.execPath,['--experimental-strip-types',join(dir,'session-client.mjs')],{env:{...env,REVIEW_LOOPBACK:origin},windowsHide:true,stdio:['ignore','pipe','pipe']});
 client.stdout.on('data',b=>process.stdout.write(b));client.stderr.on('data',()=>{});
 const code=await new Promise(r=>client.once('close',r));process.exitCode=code;
}catch(e){console.log(JSON.stringify({CROSS_PROCESS_SESSION_TEST:'FAIL',error:e.message,serverErrorCategory:diagnostics.includes('ERR_')?diagnostics.match(/ERR_[A-Z_]+/)?.[0]:'NONE'}));process.exitCode=1;}
finally{clearTimeout(timer);if(server.connected)server.send({stop:true});await new Promise(r=>{server.once('exit',r);setTimeout(()=>{server.kill();r();},3000).unref();});}
