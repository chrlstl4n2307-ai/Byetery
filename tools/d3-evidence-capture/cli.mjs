#!/usr/bin/env node
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {SPEC,check,json,local,CaptureError} from './common.mjs';
import {collect,captureRun,verifyPortable} from './capture.mjs';
import {auditDirectory} from './audit-imports.mjs';
import {assertNextRun} from './gate.mjs';
import {assertBusinessFingerprint} from './pins.mjs';
import {assertOwnerQuery,parseOwnerExport,compareOwnerExport,observationsFromBundle} from './owner-export.mjs';
import {assertHandoff,assertCommittedBundle} from './gate.mjs';
import {read,bytes,hash,outputDirectory} from './common.mjs';
import {writeFileSync} from 'node:fs';
export async function main(argv){local();check(argv[0]==='--local','EXPLICIT_LOCAL_REQUIRED');const [command,...rest]=argv.slice(1);const dir=dirname(fileURLToPath(import.meta.url));auditDirectory(dir);
 assertBusinessFingerprint();assertOwnerQuery();const flags={};for(let i=0;i<rest.length;i+=2){check(/^--[a-z][a-z0-9-]*$/.test(rest[i])&&typeof rest[i+1]==='string'&&!flags[rest[i]],'INVALID_ARGUMENTS');flags[rest[i]]=rest[i+1];}
 const ownerFlags=['--export','--sha256','--scope','--bundle','--bundles','--out','--evidence-commits'];
 const allowed={'status':[],'verify-owner-export':ownerFlags,'check-handoff':ownerFlags,'verify-bundle':['--bundle'],'scan-bundle':['--bundle'],'check-next-run':['--next-run','--bundle','--evidence-commit','--owner-decision'],'capture-tx':['--input','--out'],'capture-run':['--input','--fixtures','--out']};check(allowed[command]&&Object.keys(flags).every(f=>allowed[command].includes(f)),'INVALID_ARGUMENTS');
 if(command==='status')return {businessExecutionSha:SPEC.businessSha,readOnlyTool:true,ownerExportOption:'A',querySha256:SPEC.ownerExport.querySha256,databaseCredentialsAccepted:false,sqlIntegrity:'PENDING_OWNER_EXPORT_REQUIRED_BEFORE_HANDOFF',chainGateRequiredBetweenRuns:true,sqlGateRequiredBeforeHandoff:true,canStartRun:false,planning:SPEC.planning};
 if(command==='verify-owner-export'||command==='check-handoff'){
  check(flags['--export']&&flags['--sha256']&&flags['--scope']&&Boolean(flags['--bundle'])!==Boolean(flags['--bundles']),'INVALID_OWNER_EXPORT_ARGUMENTS');
  const dirs=flags['--bundle']?[flags['--bundle']]:json(flags['--bundles']);check(Array.isArray(dirs)&&dirs.length>0&&dirs.length<=3&&dirs.every(d=>typeof d==='string')&&new Set(dirs.map(d=>resolve(d))).size===dirs.length,'INVALID_BUNDLE_LIST');
  const bundles=dirs.map(d=>({dir:d,verified:verifyPortable(d)}));const parsed=parseOwnerExport(read(flags['--export']),flags['--sha256'],json(flags['--scope']));
  const report=compareOwnerExport(parsed,bundles.flatMap(b=>observationsFromBundle(b.dir,b.verified.inventory)));
  report.chainBundles=bundles.map(b=>({runId:b.verified.inventory.summary.runId,bundleSha256:b.verified.BUNDLE_SHA256}));
  if(command==='check-handoff'){report.handoff=assertHandoff(bundles.map(b=>b.verified.inventory.summary),report);check(flags['--evidence-commits'],'EVIDENCE_NOT_COMMITTED');const commits=json(flags['--evidence-commits']);for(const b of bundles)assertCommittedBundle(b.dir,commits[b.verified.inventory.summary.runId],b.verified);}
  if(flags['--out']){const encoded=bytes(report);writeFileSync(outputDirectory(flags['--out']),encoded,{flag:'wx'});return {status:report.status,reportSha256:hash(encoded),rows:report.rows.length,...(report.handoff?{handoff:report.handoff}:{})};}return report;
 }
 if(command==='verify-bundle'||command==='scan-bundle'){const r=verifyPortable(flags['--bundle']);return {status:r.status,BUNDLE_SHA256:r.BUNDLE_SHA256,sqlReady:r.inventory.summary.sqlReady,runStatus:r.inventory.summary.status};}
 if(command==='check-next-run')return assertNextRun({nextRun:flags['--next-run'],bundle:flags['--bundle'],evidenceCommit:flags['--evidence-commit'],ownerDecision:json(flags['--owner-decision'])});
 if(command==='capture-run'&&flags['--fixtures']){check(!flags['--input']&&flags['--out'],'INVALID_ARGUMENTS');const f=json(flags['--fixtures']);check(f.classification==='CURATED_PUBLIC_CHAIN_FIXTURE_NOT_NEW_D3_COMPLETION'&&f.liveSqlProof===false&&Array.isArray(f.items),'INVALID_FIXTURE');for(const d of f.items){check(!d.sql&&!d.sqlProvenance&&d.provenance?.source==='LOCAL_HISTORICAL','INVALID_FIXTURE');}return captureRun({runId:'HISTORICAL-RUN1',retired:true,complete:false},f.items,flags['--out']);}
 if(command==='capture-tx'||command==='capture-run'){check(flags['--input']&&flags['--out'],'INPUT_AND_OUTPUT_REQUIRED');const input=json(flags['--input']);const expected=command==='capture-tx'?[input.expected]:input.transactions;check(Array.isArray(expected)&&expected.length>0&&expected.length<=5,'INVALID_CAPTURE_INPUT');const observations=[];for(const e of expected)observations.push(await collect({expected:e}));const run=command==='capture-tx'?{runId:'HISTORICAL-SINGLE-TX',retired:true,complete:false}:input.run;
 return captureRun(run,observations,flags['--out']);}
 throw new CaptureError('UNKNOWN_COMMAND');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){main(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(JSON.stringify({status:'STOP',code:e instanceof CaptureError?e.code:/^[A-Z0-9_]+$/.test(e.message??'')?e.message:'EVIDENCE_CAPTURE_STOPPED',...(e instanceof CaptureError?{details:e.details}:{})}));process.exitCode=1;});}
