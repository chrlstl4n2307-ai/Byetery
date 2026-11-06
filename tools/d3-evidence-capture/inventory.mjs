import {mkdirSync,writeFileSync,readdirSync,lstatSync,existsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {SPEC,check,hash,canonical,bytes,read,json,safeRelative,outputDirectory,provenance} from './common.mjs';
import {scanRaw} from './sanitizer.mjs';
function files(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const rel=prefix+e.name,p=resolve(dir,e.name);check(!lstatSync(p).isSymbolicLink(),'SYMLINK_DENIED');return e.isDirectory()?files(p,rel+'/'):[rel];});}
export function writeBundle(out,artifacts,summary){out=outputDirectory(out);check(!existsSync(out),'BUNDLE_ALREADY_EXISTS');for(const a of artifacts){safeRelative(a.path);provenance(a.provenance);scanRaw(a.data);}
 check(new Set(artifacts.map(a=>a.path)).size===artifacts.length,'DUPLICATE_ARTIFACT');
 mkdirSync(out,{recursive:true});const inventory=[];
 for(const a of [...artifacts].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)){const p=resolve(out,a.path);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,a.data,{flag:'wx'});inventory.push({path:a.path,bytes:a.data.length,sha256:hash(a.data),source:a.provenance.source,observedAt:a.provenance.observedAt,origin:{url:a.provenance.url??null,method:a.provenance.method??null,http:a.provenance.http??null},contentClassification:a.classification??'PUBLIC_CHAIN_EVIDENCE',rawPublic:a.rawPublic??true,sanitized:!(a.rawPublic??true)});}
 const value={schema:SPEC.version,businessExecutionSha:SPEC.businessSha,businessFingerprint:SPEC.fingerprint,summary,artifacts:inventory};
 const encoded=bytes(value);scanRaw(encoded);writeFileSync(resolve(out,'inventory.json'),encoded,{flag:'wx'});const digest=hash(encoded);writeFileSync(resolve(out,'BUNDLE_SHA256'),digest+'\n',{flag:'wx'});return {directory:out,BUNDLE_SHA256:digest};
}
export function verifyBundle(dir){const b=read(resolve(dir,'inventory.json')),j=JSON.parse(b.toString('utf8'));
 check(b.equals(bytes(j)),'NON_CANONICAL_INVENTORY');check(j.schema===SPEC.version&&j.businessExecutionSha===SPEC.businessSha&&j.businessFingerprint===SPEC.fingerprint,'WRONG_BUSINESS_PIN');
 const digestFile=read(resolve(dir,'BUNDLE_SHA256')),digest=digestFile.toString().trim();check(/^[a-f0-9]{64}$/.test(digest)&&digestFile.equals(Buffer.from(digest+'\n'))&&hash(b)===digest,'INVENTORY_HASH_MISMATCH');
 check(Array.isArray(j.artifacts)&&new Set(j.artifacts.map(a=>a.path)).size===j.artifacts.length,'INVALID_INVENTORY');
 check(j.artifacts.map(a=>a.path).join('\n')===[...j.artifacts].map(a=>a.path).sort().join('\n'),'NON_CANONICAL_INVENTORY');
 const expected=new Set(['inventory.json','BUNDLE_SHA256',...j.artifacts.map(a=>a.path)]);const actual=files(dir);check(actual.length===expected.size&&actual.every(p=>expected.has(p)),'UNINVENTORIED_ARTIFACT');
 for(const a of j.artifacts){safeRelative(a.path);provenance(a);check(a.contentClassification&&typeof a.rawPublic==='boolean'&&a.sanitized===!a.rawPublic,'MISSING_PROVENANCE');const raw=read(resolve(dir,a.path));check(raw.length===a.bytes&&hash(raw)===a.sha256,'ARTIFACT_HASH_MISMATCH',{path:a.path});scanRaw(raw);}
 scanRaw(b);return {status:'PASS',BUNDLE_SHA256:digest,inventory:j};
}
