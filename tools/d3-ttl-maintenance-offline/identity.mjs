import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {ROOT,read,hash,check} from '../d3-evidence-capture/common.mjs';
import {assertBusinessFingerprint} from '../d3-evidence-capture/pins.mjs';
import {assertOwnerQuery} from '../d3-evidence-capture/owner-export.mjs';
import {PIN} from './policy.mjs';
function git(args){check(['rev-parse','show','ls-tree'].includes(args[0]),'GIT_READ_ONLY_REQUIRED');return execFileSync('git',args,{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','ignore']});}
export function assertRatifiedBase(){
 check(git(['rev-parse',PIN.tooling+'^{tree}']).toString().trim()===PIN.root&&git(['rev-parse',PIN.tooling+':tools/d3-evidence-capture']).toString().trim()===PIN.subtree,'BLOCKED_MAINTENANCE_DESIGN_IDENTITY_DRIFT');
 const pin=assertBusinessFingerprint();check(pin.businessExecutionSha===PIN.business&&pin.fingerprint===PIN.fingerprint&&assertOwnerQuery()===PIN.query,'BLOCKED_MAINTENANCE_DESIGN_IDENTITY_DRIFT');
 const names=git(['ls-tree','-r','--name-only',PIN.tooling,'--','tools/d3-evidence-capture']).toString().trim().split('\n');check(names.length===26,'BLOCKED_MAINTENANCE_DESIGN_IDENTITY_DRIFT');
 for(const name of names)check(hash(read(resolve(ROOT,name)))===hash(git(['show',PIN.tooling+':'+name])),'BLOCKED_MAINTENANCE_DESIGN_IDENTITY_DRIFT');
 return {status:'RATIFIED_BASE_UNCHANGED',businessSha:PIN.business,businessFingerprint:PIN.fingerprint,toolingCommit:PIN.tooling,toolingRoot:PIN.root,toolingSubtree:PIN.subtree,querySha256:PIN.query};
}
