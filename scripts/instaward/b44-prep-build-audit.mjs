// Audits LOCAL outputs. Never loads .env or calls a remote service.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
const files = dir => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, {withFileTypes:true}).flatMap(x => x.isDirectory() ? files(path.join(dir,x.name)) : [path.join(dir,x.name)]);
const digest = b => createHash('sha256').update(b).digest('hex');
export async function auditBuild(root) {
 const require = createRequire(path.join(root,'package.json'));
 const {StrKey} = require('@stellar/stellar-base');
 const {REVIEW_ROUTES, REVIEW_PAGES, REVIEW_FORBIDDEN_ENV} = await import(pathToFileURL(path.join(root,'src/shared/review/model.ts')).href);
 const findings = [], names = [];
 const browser = files(path.join(root,'.next/static'));
 if (!browser.length) throw Error('MissingClientBuild');
 const prohibited = /@stellar\/(?:stellar-base|stellar-sdk)|\bstellar-base\b|\bstellar-sdk\b|\bjs-xdr\b|\bTransactionBuilder\b|\bfromSecret\b|\bsignEnvelope\b|src\/server\/direct-review|\bserver-only\b/;
 const sensitiveNames = [...REVIEW_FORBIDDEN_ENV, 'PRIVATE_KEY','ADMIN_SECRET','SUPABASE_SERVICE','service_role'];
 let candidates = 0;
 for (const file of browser) {
  if (!/\.(?:js|map|css|json)$/.test(file)) continue;
  const text = fs.readFileSync(file,'utf8'), rel = path.relative(root,file).replaceAll('\\','/');
  for (const m of text.matchAll(/S[A-Z2-7]{55}/g)) {
   candidates++;
   if (StrKey.isValidEd25519SecretSeed(m[0])) findings.push({file:rel,type:'CHECKSUM_VALID_SEED_REDACTED',offset:m.index});
  }
  if (prohibited.test(text)) findings.push({file:rel,type:'STELLAR_OR_SERVER_MODULE_REDACTED'});
  for (const name of sensitiveNames) if (text.includes(name)) findings.push({file:rel,type:'SERVER_VARIABLE_NAME',name});
  if (text.includes('SECRET')) names.push({file:rel,type:'GENERIC_SECRET_WORD_REQUIRES_CLASSIFICATION'});
 }
 const paths = JSON.parse(fs.readFileSync(path.join(root,'.next/server/app-paths-manifest.json'),'utf8'));
 const normal = s => s.replace(/\/(?:page|route)$/,'').replaceAll(':batteryId','[batteryId]').replaceAll(':operationId','[operationId]') || '/';
 const actual = Object.keys(paths).map(normal).filter(s=>!['/_not-found','/_global-error'].includes(s)).sort();
 const expected = [...REVIEW_PAGES,...REVIEW_ROUTES.map(r=>normal(r.path))].sort();
 const routePass = JSON.stringify(actual)===JSON.stringify(expected);
 const actions = JSON.parse(fs.readFileSync(path.join(root,'.next/server/server-reference-manifest.json'),'utf8'));
 const actionCount = Object.keys(actions.node??{}).length+Object.keys(actions.edge??{}).length;
 const middleware = JSON.parse(fs.readFileSync(path.join(root,'.next/server/middleware-manifest.json'),'utf8'));
 const manifestFiles = ['app-paths-manifest.json','server-reference-manifest.json','middleware-manifest.json'].map(n=>({file:'.next/server/'+n,SHA256:digest(fs.readFileSync(path.join(root,'.next/server',n)))}));
 const content = browser.map(f=>({file:path.relative(root,f).replaceAll('\\','/'),SHA256:digest(fs.readFileSync(f))})).sort((a,b)=>a.file.localeCompare(b.file));
 return {level:'LOCAL_BUILD',pass:findings.length===0&&routePass&&actionCount===0,
  client:{files:browser.length,StrKeyCandidates:candidates,checksumValidSeeds:findings.filter(f=>f.type==='CHECKSUM_VALID_SEED_REDACTED').length,secretScan:findings.some(f=>f.type==='CHECKSUM_VALID_SEED_REDACTED')?'MATCH':'NO MATCH',findings,genericSecretWordOccurrences:names},
  manifests:{expectedRoutes:expected,actualRoutes:actual,routePass,serverActions:actionCount,expectedServerActions:0,loginLogout:'HTTP POST handlers; not Next server actions',middleware:Object.keys(middleware.middleware??{}),manifestFiles},
  buildId:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim(),outputTreeSHA256:digest(JSON.stringify(content)),clientFiles:content};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const r=await auditBuild(path.resolve(process.argv[2]));
 fs.writeFileSync(process.argv[3],JSON.stringify(r,null,2)+'\n');
 console.log(JSON.stringify({pass:r.pass,client:r.client,manifests:r.manifests,outputTreeSHA256:r.outputTreeSHA256},null,2));
 if(!r.pass)process.exitCode=1;
}
