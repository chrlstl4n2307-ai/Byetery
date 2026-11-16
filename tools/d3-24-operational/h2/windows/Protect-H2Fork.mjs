import assert from 'node:assert/strict';
import { realpath,writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readH2Launch, readH2Credential } from './Verify-H2NodeBoundary.mjs';

const [role,target,manifest]=process.argv.slice(2);
assert(process.send && ['verifier','closer'].includes(role));
const [launchProof] = await once(process,'message');
const {lab}=await readH2Launch(role,manifest,launchProof);
assert(await realpath(lab.root)===lab.root && await realpath(manifest)===join(lab.root,'local-manifest.json'));
assert(await realpath(target)===join(lab.root,'candidate','.test-output','server-worker','h2-role-process.mjs'));
const proof=join(lab.root,'state',role,'fork-startup-'+process.pid+'.json');
let phase='secret-path';
try {
  phase='read-own-fixture';
  const {password}=await readH2Credential(role,manifest,launchProof,'candidate',async receipt => {
    const ack = once(process,'message');
    process.send(receipt);
    return (await ack)[0];
  });
  process.env.BYETERY_D324_H2_ROLE_PASSWORD=password;
  phase='import-candidate';
  await import(pathToFileURL(target).href);
  await writeFile(proof,JSON.stringify({role,phase,result:'PASS'}));
  process.send({boundaryReady:true});
} catch(error) {
  const frames=String(error.stack??'').match(/(?:h2-role-process|Protect-H2Fork)\.mjs:[0-9]+/g)??[];
  const code=/^[A-Z0-9_]{3,40}$/.test(error.code??'')?error.code:null;
  await writeFile(proof,JSON.stringify({role,phase,result:'FAIL',type:error.name,code,frames:frames.slice(0,3)}));
  process.exit(1);
}
