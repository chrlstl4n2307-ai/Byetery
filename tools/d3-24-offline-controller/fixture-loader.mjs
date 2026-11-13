import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Reuse the exact published fixture, never a caller-selected module or keys.
// Skipped test declarations do not execute their bodies. No product hook exists.
const root=fileURLToPath(new URL('../../',import.meta.url));
const url=pathToFileURL(root+'backend/tests/__offline_d324_controller__.ts').href;
let source=readFileSync(root+'backend/tests/d324-authority.test.ts','utf8');
if(createHash('sha256').update(source).digest('hex')!=='7e1ac4be128af00c00ac4696dad79d2196763555be1334b70f7b49c84faba996')throw Error('OFFLINE_FIXTURE_DRIFT');
const old="const compositionSha='a'.repeat(40),operatorSha='b'.repeat(40),planHash='c'.repeat(64);";
if(source.split(old).length!==2||source.split('new FixtureAuthority(').length!==2)throw Error('OFFLINE_FIXTURE_DRIFT');
source=source.replace(old,"const compositionSha='bc9dc8bff9bbc34da37abfb51f59d1d58f165068',operatorSha='d85e54e00e98c8d8bc6294c883708a701ce55440',planHash='0435d8436d13881ebbdf31e729cf36a80e538bc149300219353f68817b37d72d';")
  .replace("manifestSchema='BYETERY_D324_FINAL_ACTIVATION_V3'}", "manifestSchema='BYETERY_D324_FINAL_ACTIVATION_V3',readiness=async()=>{}}")
  .replace('instanceId,challenge},async()=>{},now)', 'instanceId,challenge},readiness,now)')
  .replace('new FixtureAuthority(','new D324Authority(').replace(/\btest\(/g,'skipTest(');
source='const skipTest=()=>{};\n'+source+'\nexport {local,fixtureApproval,roles,count,prove,transportFixture,queueFake};';
registerHooks({resolve(s,c,next){return s==='offline:d324-fixture'?{url,shortCircuit:true}:next(s,c);},
  load(u,c,next){return u===url?{format:'module-typescript',source,shortCircuit:true}:next(u,c);}});
export const F=await import('offline:d324-fixture');
