import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempDisposable, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { bytes, hash, SPEC } from '../d3-evidence-capture/common.mjs';
import { inspectV3BootstrapManifest, inspectV3ManifestFields, V3_BOOTSTRAP_BASE } from '../d3-24-composition/manifest-v3.mjs';
import { D324_CAPTURE_PROFILE_SHA256 } from '../d3-24-capture-profile/profile.mjs';
import { RUN1, OWNER_QUERY_SHA256, readD324Ledger } from '../d3-24-ratification/identity.mjs';
import { operatorCandidate } from '../d3-24-ratification/operator-identity.mjs';
import { canonicalGrant } from '../d3-run1-launcher/grant-schema.mjs';
import { BOOTSTRAP_BINARIES } from './bootstrap-pins.mjs';
import { observeV3Checkout } from './entry-bootstrap.mjs';
import { executeD324ApprovedRun } from './final-runtime.mjs';
import { checkV3ExecutionDocuments, verifyV3ExecutionDocuments } from './owner-authorization.mjs';
import { D324_ARGV } from './policy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '');
const ops = join(root,'tools','d3-24-operational');
const shell = execFileSync('pwsh',['-NoProfile','-NonInteractive','-Command','[Console]::Write((Get-Process -Id $PID).Path)'],
  {encoding:'utf8',windowsHide:true}).trim();
const status = 'D324_OPERATIONAL_RATIFICATION_REQUIRED';
const now = Date.now();
const hex = 'a'.repeat(64);
const wire = (domain,value) => Buffer.concat([Buffer.from(domain+'\n'),bytes(value)]);
const manifest = {
  schema:'BYETERY_D324_FINAL_ACTIVATION_V3', identity:RUN1, networkId:SPEC.networkId,deploymentId:SPEC.deployment,
  target:{sha:'1'.repeat(40),parent:V3_BOOTSTRAP_BASE,tree:'2'.repeat(40)},
  operator:{sha:operatorCandidate.sha,parent:operatorCandidate.parent,tree:operatorCandidate.tree},
  ledgerSha256:(await readD324Ledger()).ledgerSha256,
  budget:{historicalConfirmed:5,limitWithoutContingency:19,remaining:14,runCap:5,tx20Authorized:false},
  artifacts:{wrapper:hex,entry:hex,captureChild:hex,exportQuery:OWNER_QUERY_SHA256,captureProfileSha256:D324_CAPTURE_PROFILE_SHA256},
  k5Sha256:hex,sessionControlSha256:hex,binaries:BOOTSTRAP_BINARIES,operatorRoot:join(root,'.test-output','synthetic-operator'),
};
const grant = {schemaVersion:1,action:'AUTHORIZE_D3_24_RUN1_EXECUTION',...RUN1,jwtExpirySeconds:5400,
  jwtObservedAt:now-3000,compositionRootSha:manifest.target.sha,nonce:hex,issuedAt:now-2000,expiresAt:now-2000+900000};
const execution = {schema:'BYETERY_D324_EXECUTION_V1',...RUN1,deploymentId:SPEC.deployment,networkId:SPEC.networkId,
  compositionSha:manifest.target.sha,instanceId:'b'.repeat(64),challenge:'c'.repeat(64),runnerPublicKey:'d'.repeat(64),
  issuedAt:now-1000,executionNotAfter:now+300000,sessions:['ADMIN','USER','COLLECTOR','RECYCLER'].map(role=>({role,
    authUserId:randomUUID(),sessionId:randomUUID(),tokenExpiresAt:now+600000}))};
const live = {schema:'BYETERY_D324_ONE_LIVE_APPROVAL_V3',taskId:RUN1.taskId,runId:RUN1.runId,deploymentId:SPEC.deployment,
  manifestSha256:hash(bytes(manifest)),grantSha256:hash(canonicalGrant(grant)),executionSha256:hash(wire('BYETERY-D324-EXECUTION-V1',execution)),
  instanceId:execution.instanceId,challenge:execution.challenge,runnerPublicKey:execution.runnerPublicKey,issuedAt:now-500,expiresAt:now+60000};
const documents = {grant,execution,live};

test('manifest V3 review schema binds explicit parent, operator, plan, budget, and artifact fields',()=>{
  assert.deepEqual(inspectV3BootstrapManifest(bytes(manifest)),{sha256:hash(bytes(manifest)),reviewOnly:true,liveAuthority:false});
  assert.throws(()=>inspectV3ManifestFields(bytes(manifest)),/D324_V3_SCOPE_REJECTED/);
  for (const changed of [
    {schema:'BYETERY_D324_FINAL_ACTIVATION_V2'}, {target:{...manifest.target,tree:'x'}},
    {target:{...manifest.target,sha:'x'}}, {target:{...manifest.target,parent:'a'.repeat(40)}},
    {operator:{...manifest.operator,sha:'c50e4eb1f7f538a231c5ecfc31d19283998dc234'}},
    {identity:{...RUN1,recipient:'substitute'}}, {identity:{...RUN1,planHash:'b'.repeat(64)}},
    {artifacts:{...manifest.artifacts,captureProfileSha256:hex}}, {binaries:{...BOOTSTRAP_BINARIES,nodeSha256:hex}},
    {budget:{...manifest.budget,tx20Authorized:true}}, {k5Sha256:'invalid'},
  ]) assert.throws(()=>inspectV3BootstrapManifest(bytes({...manifest,...changed})),/D324_V3_/);
  assert.throws(()=>inspectV3BootstrapManifest(Buffer.from('{}\r\n')),/D324_V3_/);
});

test('review compares the exact SHA, parent and tree and never accepts them as a materialized child',()=>{
  const target={sha:V3_BOOTSTRAP_BASE,parent:'2ae596c578deff3a0eb2a3a9ac3dd8e9c9a74732',tree:'0b0119d2adb42aa767490908751c7bb236dd2e93'};
  assert.deepEqual(observeV3Checkout(root,target,{review:true}),target);
  for(const key of Object.keys(target)) assert.throws(()=>observeV3Checkout(root,{...target,[key]:'a'.repeat(40)},{review:true}),/BOOTSTRAP_REJECTED/);
  assert.throws(()=>observeV3Checkout(root,target),/BOOTSTRAP_REJECTED/);
});

test('grant, execution and LIVE are independent and scope changes break verification',()=>{
  const candidate=checkV3ExecutionDocuments(documents,manifest,now);
  assert(candidate.grantBytes.equals(canonicalGrant(grant)));
  assert(candidate.executionBytes.equals(wire('BYETERY-D324-EXECUTION-V1',execution)));
  assert(candidate.liveBytes.equals(wire('BYETERY-D324-ONE-LIVE-APPROVAL-V3',live)));
  for(const changed of [
    {grant:undefined}, {live:undefined}, {execution:undefined},
    {grant:{...grant,expiresAt:now}}, {grant:{...grant,businessSha:'a'.repeat(40)}},
    {execution:{...execution,instanceId:'0'.repeat(64)}},
    {execution:{...execution,sessions:execution.sessions.with(3,execution.sessions[0])}},
    {live:{...live,schema:'BYETERY_D324_ONE_LIVE_APPROVAL_V1'}}, {live:{...live,executionSha256:hex}},
  ]) assert.throws(()=>checkV3ExecutionDocuments({...documents,...changed},manifest,now));
  const fixture=generateKeyPairSync('ed25519');
  const synthetic=sign(null,candidate.grantBytes,fixture.privateKey).toString('base64url');
  assert.throws(()=>verifyV3ExecutionDocuments({...documents,grantSignature:synthetic},manifest,now),/OWNER_GRANT_SIGNATURE_REJECTED/);
});

test('PowerShell review succeeds and direct Node, legacy executor, missing package and forged V2 stay closed', async()=>{
  await using fixture = await mkdtempDisposable(join(root,'.test-output','bootstrap-custody-'));
  const env = {...process.env,LOCALAPPDATA:fixture.path};
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const call = (exe,args,code,message) => {
    const result=spawnSync(exe,args,{env,encoding:'utf8',windowsHide:true,timeout:25000});
    assert.equal(result.status,code,result.stderr || result.error?.message || result.stdout);
    assert.equal(result.stdout.trim(),message);
  };
  const launcher=['-NoProfile','-NonInteractive','-File',join(ops,'launch.ps1')];
  call(shell,[...launcher,'-V3Review'],0,'D324_V3_BOOTSTRAP_REVIEW_PASS');
  call(shell,[...launcher,'-V3VerifyPackage'],1,status);
  const custody=join(fixture.path,'OwnerKeyCustody','Byetery-D3-RUN1','live',RUN1.taskId);
  await mkdir(custody,{recursive:true});
  await writeFile(join(custody,'activation-manifest.json'),bytes({...manifest,schema:'BYETERY_D324_FINAL_ACTIVATION_V2'}));
  await writeFile(join(custody,'manifest-approval.sig'),Buffer.alloc(64).toString('base64url')+'\n');
  call(shell,[...launcher,'-V3VerifyPackage'],1,status);
  call(shell,launcher,1,status);
  call(process.execPath,[join(ops,'entry-bootstrap.mjs'),'--v3-review'],1,status);
  call(process.execPath,[join(ops,'entry-bootstrap.mjs'),'--v3-verify-package'],1,status);
  call(process.execPath,[join(ops,'entry-bootstrap.mjs'),...D324_ARGV],1,status);
  call(process.execPath,[join(ops,'live.mjs'),...D324_ARGV],1,status);
  await assert.rejects(executeD324ApprovedRun(root,{liveAuthority:true}),/D324_OPERATIONAL_RATIFICATION_REQUIRED/);
});
