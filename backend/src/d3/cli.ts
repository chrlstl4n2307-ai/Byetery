import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonical} from '../application/validation.ts';
import {D3Error,check,noSecrets} from './model.ts';
import {plan,simulate,execute} from './runner.ts';
import {writeManifest} from './manifest.ts';
export async function main(args:string[]){
 const [mode,input,...rest]=args;check(['plan','simulate','execute'].includes(mode)&&typeof input==='string'&&rest.length===2&&rest[0]==='--output-dir'&&!!rest[1],'UsageD3ModeInputOutputDir');
 // Execute is denied before reading arbitrary files or starting any infrastructure.
 if(mode==='execute')throw new D3Error('FutureOwnerAuthorizationRequired');
 const bytes=await readFile(input);check(bytes.length<=65536,'InputTooLarge');noSecrets(bytes.toString('utf8'));
 const data:unknown=JSON.parse(bytes.toString('utf8'));const result=mode==='plan'?plan(data):await simulate(data);
 const out=resolve(rest[1]);await mkdir(out,{recursive:true});
 if(mode==='simulate')for(const m of (result as Awaited<ReturnType<typeof simulate>>).manifests)await writeManifest(out,m);
 await writeFile(resolve(out,mode+'.json'),canonical(result)+'\n',{flag:'wx',mode:0o600});
 console.log(mode==='plan'?'D3 PLAN READY — NO EXECUTION AUTHORITY':'D3 OFFLINE SIMULATION COMPLETE — NOT TESTNET EVIDENCE');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main(process.argv.slice(2)).catch(error=>{console.error(error instanceof D3Error?error.message:'D3InputOrOutputRejected');process.exitCode=1;});
}
