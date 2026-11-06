import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {SPEC,ROOT,check,read,hash} from './common.mjs';
import {verifyPortable} from './capture.mjs';
function git(args){check(['show','merge-base','rev-parse'].includes(args[0]),'GIT_READ_ONLY_REQUIRED');try{return execFileSync('git',args,{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','ignore']});}catch{throw Error('EVIDENCE_NOT_COMMITTED');}}
export function chainReadiness(s){return s?.status==='COMPLETE'&&s.counting===true&&s.rpcLedgerReady===true&&s.steps?.length===5&&s.steps.every(x=>x.confirmed===true&&x.rpcLedger==='PASS');}
export function assertHandoff(summaries,sqlReport){
 check(Array.isArray(summaries)&&summaries.length===3&&['RUN1','RUN2','RUN3'].every(id=>summaries.some(s=>s.runId===id&&chainReadiness(s))),'HANDOFF_CHAIN_EVIDENCE_REQUIRED');
 check(sqlReport?.status==='SQL_INTEGRITY_PASS','SQL_GATE_PENDING_BEFORE_HANDOFF');
 const steps=summaries.flatMap(s=>s.steps),hashes=steps.map(x=>x.hash);
 check(new Set(hashes).size===15&&new Set(summaries.map(s=>s.steps[0].batteryId)).size===3,'HANDOFF_DISTINCT_RUNS_REQUIRED');
 check(sqlReport.rows?.length===15&&sqlReport.rows.every(r=>r.status==='PASS')&&canonicalHashes(sqlReport.rows.map(r=>r.transactionHash))===canonicalHashes(hashes),'HANDOFF_SQL_SCOPE_MISMATCH');
 return {status:'CHAIN_AND_SQL_HANDOFF_GATES_PASS',ownerAcceptanceGranted:false,startsRun:false};
}
function canonicalHashes(values){return [...values].sort().join('\n');}
export function assertCommittedBundle(bundle,evidenceCommit,v=verifyPortable(bundle)){
 check(/^[a-f0-9]{40}$/.test(evidenceCommit??''),'EVIDENCE_NOT_COMMITTED');git(['merge-base','--is-ancestor',evidenceCommit,'HEAD']);
 const prefix=resolve(bundle).slice(resolve(ROOT).length+1).replaceAll('\\','/');check(resolve(bundle).startsWith(resolve(ROOT)+'/')||resolve(bundle).startsWith(resolve(ROOT)+'\\'),'BUNDLE_MUST_BE_IN_REPOSITORY');
 for(const path of ['inventory.json','BUNDLE_SHA256',...v.inventory.artifacts.map(a=>a.path)]){const committed=git(['show',evidenceCommit+':'+prefix+'/'+path]);check(hash(committed)===hash(read(resolve(bundle,path))),'COMMITTED_EVIDENCE_MISMATCH');}return true;
}
export function assertNextRun({nextRun,bundle,evidenceCommit,ownerDecision}){check(['RUN2','RUN3'].includes(nextRun),'INVALID_NEXT_RUN');check(/^[a-f0-9]{40}$/.test(evidenceCommit??''),'EVIDENCE_NOT_COMMITTED');const v=verifyPortable(bundle),s=v.inventory.summary,prior=nextRun==='RUN2'?'RUN1':'RUN2';
 check(s.runId===prior&&chainReadiness(s)&&s.eligibleForNextRun===true,'PREVIOUS_BUNDLE_NOT_READY');
 assertCommittedBundle(bundle,evidenceCommit,v);
 check(ownerDecision&&ownerDecision.ownerDecision==='APPROVED_NEXT_RUN'&&ownerDecision.nextRun===nextRun&&ownerDecision.previousRun===prior&&ownerDecision.bundleSha256===v.BUNDLE_SHA256&&ownerDecision.evidenceCommit===evidenceCommit,'OWNER_COUNCIL_GATE_REQUIRED');
 return {status:'EVIDENCE_COMMIT_GATE_PASS',nextRun,businessExecutionSha:SPEC.businessSha,sqlIntegrity:s.sqlReady?'PASS':'PENDING_OWNER_EXPORT_REQUIRED_BEFORE_HANDOFF',startsRun:false,warning:'This read-only check cannot grant owner authority or stop an unrelated runner; no business runtime integration is claimed.'};
}
