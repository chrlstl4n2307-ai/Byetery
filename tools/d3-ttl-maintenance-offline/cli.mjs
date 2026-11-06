#!/usr/bin/env node
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {ROOT,local,check,json,bytes,hash} from '../d3-evidence-capture/common.mjs';
import {scanRaw} from '../d3-evidence-capture/sanitizer.mjs';
import {assertRatifiedBase} from './identity.mjs';
import {offlineImportAudit} from './audit.mjs';
import {evaluateOffline,evidenceManifest} from './gate.mjs';
export async function main(argv){local();check(argv[0]==='--local','EXPLICIT_LOCAL_REQUIRED');assertRatifiedBase();const options={};for(let i=1;i<argv.length;i+=2){check(['--fixture','--input','--out'].includes(argv[i])&&typeof argv[i+1]==='string'&&!options[argv[i]],'INVALID_OFFLINE_ARGUMENTS');options[argv[i]]=argv[i+1];}
 check(Boolean(options['--fixture'])!==Boolean(options['--input']),'INVALID_OFFLINE_ARGUMENTS');let input;if(options['--fixture']){check(['1','3','none'].includes(options['--fixture']),'INVALID_OFFLINE_FIXTURE');const {makeFixture}=await import('./fixtures.mjs');input=makeFixture(options['--fixture']==='1'?1:3,options['--fixture']==='none');}else input=json(options['--input']);
 const result=evaluateOffline(input),manifest=evidenceManifest(input,result),audit=offlineImportAudit(dirname(fileURLToPath(import.meta.url)));scanRaw(bytes(manifest));
 if(options['--out']){const out=resolve(options['--out']),rel=relative(resolve(ROOT,'.tools'),out);check(rel&&!rel.startsWith('..')&&!rel.includes(':')&&!existsSync(out),'OFFLINE_OUTPUT_MUST_BE_NEW_IGNORED_LOCAL_DIRECTORY');mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'manifest.json'),bytes(manifest),{flag:'wx'});writeFileSync(resolve(out,'input-observations.json'),bytes(input),{flag:'wx'});if(result.unsignedEnvelopeXdr)writeFileSync(resolve(out,'UNSIGNED.OFFLINE.xdr'),result.unsignedEnvelopeXdr+'\n',{flag:'wx'});}
 return {status:result.status,classification:manifest.classification,mode:input.mode,executionAuthorized:false,keysObserved:result.scope.readOnly.length,keysNeedingExtension:result.subset.readOnly.length,alreadyAboveTarget:result.subset.alreadyAboveTarget.length,TARGET_ABSOLUTE_LEDGER:result.target.TARGET_ABSOLUTE_LEDGER,extendTo:result.verification?.extendTo??null,feeStroops:result.verification?.fee.txFee??null,newAccounts:0,liveSimulations:0,signatures:0,broadcasts:0,manifestSha256:hash(bytes(manifest)),audit:audit.status};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(JSON.stringify({status:'STOP',code:e.code??'OFFLINE_MAINTENANCE_GATE_STOPPED'}));process.exitCode=1;});
