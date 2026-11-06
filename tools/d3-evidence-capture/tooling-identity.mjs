import {execFileSync} from 'node:child_process';
import {readdirSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {SPEC,ROOT,check,read,hash,canonical,local} from './common.mjs';
import {assertBusinessFingerprint} from './pins.mjs';
import {assertOwnerQuery} from './owner-export.mjs';

export const RATIFIED_TOOLING={commit:'2c6fb3c9e749eddfd61a2f217e9292cb880dc9e2',tree:'dc83d7071f049e298c3d8deca671d0934029935d'};
const keys=['BUSINESS_EXECUTION_SHA','BUSINESS_FINGERPRINT','TOOLING_PUBLICATION_SHA','TOOLING_TREE_HASH','OWNER_EXPORT_QUERY_SHA256'];
function git(args){check(['rev-parse','ls-tree','show'].includes(args[0]),'GIT_READ_ONLY_REQUIRED');try{return execFileSync('git',args,{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','ignore']});}catch{check(false,'TOOLING_GIT_IDENTITY_UNAVAILABLE');}}
export function identityAtCommit(commit){
 check(/^[a-f0-9]{40}$/.test(commit??''),'TOOLING_COMMIT_MISMATCH');
 return {BUSINESS_EXECUTION_SHA:SPEC.businessSha,BUSINESS_FINGERPRINT:assertBusinessFingerprint().fingerprint,TOOLING_PUBLICATION_SHA:git(['rev-parse',commit+'^{commit}']).toString().trim(),TOOLING_TREE_HASH:git(['rev-parse',commit+':tools/d3-evidence-capture']).toString().trim(),OWNER_EXPORT_QUERY_SHA256:assertOwnerQuery()};
}
export function compareIdentity(expected,actual){
 check(expected&&canonical(Object.keys(expected).sort())===canonical([...keys].sort()),'INCOMPLETE_TOOLING_IDENTITY');
 check(expected.BUSINESS_EXECUTION_SHA===SPEC.businessSha&&expected.BUSINESS_EXECUTION_SHA===actual.BUSINESS_EXECUTION_SHA,'BUSINESS_EXECUTION_SHA_MISMATCH');
 check(expected.BUSINESS_FINGERPRINT===SPEC.fingerprint&&expected.BUSINESS_FINGERPRINT===actual.BUSINESS_FINGERPRINT,'BUSINESS_FINGERPRINT_MISMATCH');
 check(expected.TOOLING_PUBLICATION_SHA===actual.TOOLING_PUBLICATION_SHA,'TOOLING_COMMIT_MISMATCH');
 check(expected.TOOLING_TREE_HASH===actual.TOOLING_TREE_HASH,'BLOCKED_TOOLING_TREE_IDENTITY_MISMATCH');
 check(expected.OWNER_EXPORT_QUERY_SHA256===actual.OWNER_EXPORT_QUERY_SHA256,'OWNER_QUERY_CHANGED_REVIEW_REQUIRED');return true;
}
function paths(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const name=prefix+e.name,p=resolve(dir,e.name);check(!lstatSync(p).isSymbolicLink(),'SYMLINK_DENIED');return e.isDirectory()?paths(p,name+'/'):[name];});}
export function verifyInstalledTooling(expected){
 local();const actual=identityAtCommit(git(['rev-parse','HEAD']).toString().trim());compareIdentity(expected,actual);
 const lines=git(['ls-tree','-r',actual.TOOLING_PUBLICATION_SHA,'--','tools/d3-evidence-capture']).toString().trim().split('\n');
 const committed=lines.map(line=>{const m=/^(100644|100755) blob ([a-f0-9]{40})\t(tools\/d3-evidence-capture\/[^\r\n]+)$/.exec(line);check(m,'TOOLING_TREE_ENTRY_REJECTED');return m[3];});
 const present=paths(resolve(ROOT,'tools/d3-evidence-capture')).map(p=>'tools/d3-evidence-capture/'+p);
 check(canonical(present.sort())===canonical(committed.sort()),'UNCOMMITTED_TOOLING_DRIFT');
 for(const name of committed)check(hash(read(resolve(ROOT,name)))===hash(git(['show',actual.TOOLING_PUBLICATION_SHA+':'+name])),'UNCOMMITTED_TOOLING_DRIFT');
 return {status:'TOOLING_IDENTITY_VERIFIED',policy:'COMMIT_PLUS_TREE_HASH',...actual,startsRun:false,grantsOwnerAuthority:false};
}
