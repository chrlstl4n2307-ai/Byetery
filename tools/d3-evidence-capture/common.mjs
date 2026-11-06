import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const SPEC=Object.freeze(JSON.parse(readFileSync(new URL('./spec.json',import.meta.url),'utf8')));
export class CaptureError extends Error {constructor(code,details={}){super(code);this.name='CaptureError';this.code=code;this.details=details;}}
export function check(ok,code,details){if(!ok)throw new CaptureError(code,details);}
export const hash=b=>createHash('sha256').update(b).digest('hex');
export function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
export const bytes=v=>Buffer.from(canonical(v)+'\n','utf8');
export function local(env=process.env){check(process.release.name==='node','LOCAL_NODE_REQUIRED');const blocked=['VERCEL','NOW_','AWS_','LAMBDA_','CF_','CLOUDFLARE_','NETLIFY','RENDER','RAILWAY_','FLY_','K_SERVICE','WEBSITE_','FUNCTIONS_','GITHUB_ACTIONS'];check(!Object.keys(env).some(k=>blocked.some(p=>k.startsWith(p)))&&env.CI===undefined&&env.NODE_ENV!=='production','HOSTED_EXECUTION_DENIED');}
export function read(path,max=SPEC.maxBytes){const p=resolve(path);let a=p;while(true){check(!lstatSync(a).isSymbolicLink(),'SYMLINK_DENIED');const b=dirname(a);if(a===b)break;a=b;}check(lstatSync(p).isFile(),'REGULAR_FILE_REQUIRED');const b=readFileSync(p);check(b.length<=max,'INPUT_TOO_LARGE');return b;}
export function json(path){try{return JSON.parse(read(path).toString('utf8'));}catch(e){if(e instanceof CaptureError)throw e;throw new CaptureError('INVALID_JSON');}}
export function safeRelative(path){check(typeof path==='string'&&path.length<240&&!path.split('/').some(p=>p==='.env'||p.startsWith('.env.')||p==='.git'||p==='.npmrc')&&!path.includes('\\')&&!path.split('/').some(p=>!p||p==='.'||p==='..')&&!isAbsolute(path)&&/^[A-Za-z0-9_.\/-]+$/.test(path),'UNSAFE_ARTIFACT_PATH');return path;}
export function outputDirectory(path){const p=resolve(path);const rel=relative(ROOT,p).replaceAll('\\','/');check(!['backend','frontend','contracts','database','.git'].some(d=>rel===d||rel.startsWith(d+'/')),'OUTPUT_PRODUCT_PATH_DENIED');return p;}
export function provenance(p){check(p&&['RPC','HORIZON','LOCAL_HISTORICAL','SQL_READONLY','OWNER_READONLY_EXPORT','LOCAL_DERIVED'].includes(p.source)&&typeof p.observedAt==='string'&&Number.isFinite(Date.parse(p.observedAt)),'MISSING_PROVENANCE');return p;}
