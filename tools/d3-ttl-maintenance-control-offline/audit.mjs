import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,check} from './core.mjs';
import {parseImports} from './custody.mjs';

export function auditInstalledBoundaries(){const directory=dirname(fileURLToPath(import.meta.url));const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(d,e.name)):[resolve(d,e.name)]);const files=walk(directory).filter(f=>f.endsWith('.mjs')&&!f.endsWith('.test.mjs')&&!f.endsWith('/audit.mjs')&&!f.endsWith('\\audit.mjs'));
 for(const file of files){const source=readFileSync(file,'utf8');for(const dep of parseImports(source,file)){check(!/backend\/src|frontend\/src|local-secure-store|(?:^|\/)signer|^(?:node:)?(?:http|https|net|tls)$|^@stellar\/stellar-sdk$|^pg$/.test(dep),'CONTROL_IMPORT_BOUNDARY_VIOLATION');}check(!/\bfetch\s*\(|\.\s*(?:sign|signEnvelope|signDecorated|simulateTransaction|sendTransaction|generateKeyPair)\s*\(/.test(source),'CONTROL_LIVE_OR_SIGNING_PATH');}
 const color=file=>file.endsWith('business-loader.mjs')?'BUSINESS':file.endsWith('maintenance-loader.mjs')?'MAINTENANCE':'SCOPED_HELPER';
 for(const role of ['BUSINESS','MAINTENANCE']){const seen=new Set(),queue=[resolve(directory,'loaders',role.toLowerCase()+'-loader.mjs')];while(queue.length){const file=queue.pop();if(seen.has(file))continue;seen.add(file);check(color(file)==='SCOPED_HELPER'||color(file)===role,'CUSTODY_CROSS_IMPORT');for(const dep of parseImports(readFileSync(file,'utf8'),file)){if(dep.startsWith('.')){const next=resolve(dirname(file),dep),rel=relative(directory,next);if(!rel.startsWith('..')&&existsSync(next))queue.push(next);}}}}
 const inspected=new Set(),queue=[resolve(ROOT,'backend/src/local-secure-store-signer.ts'),resolve(ROOT,'backend/src/stellar-signer.ts')];
 while(queue.length){const file=queue.pop();if(inspected.has(file))continue;inspected.add(file);const source=readFileSync(file,'utf8');for(const dep of parseImports(source,file)){check(!/ttl-maintenance|maintenance\/loader|maintenance-secret/.test(dep),'CUSTODY_CROSS_IMPORT');if(dep.startsWith('.')){const bare=resolve(dirname(file),dep),candidates=[bare.replace(/\.js$/,'.ts'),bare,bare+'.ts',resolve(bare,'index.ts')],found=candidates.find(existsSync);check(found,'BUSINESS_IMPORT_GRAPH_UNRESOLVED');if(found.endsWith('.ts'))queue.push(found);}}}
 return {status:'CUSTODY_IMPORT_ISOLATION_PASS',auxiliaryFiles:files.length,frozenBusinessModulesReadOnly:inspected.size,noBusinessModulesExecuted:true,noRealStoreAdapter:true,parser:'Installed TypeScript 6.0.3 AST',operationalCustodyProven:false};
}
