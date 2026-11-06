import {check,CaptureError,hash} from './common.mjs';
const dangerous=/^(?:auth[_-]?(?:uid|user[_-]?id)|authUserId|user[_-]?id|userId|principal(?:_id)?|email|sessions?|jwt|(?:access|refresh)[_-]?token|api[_-]?key|authorization|cookie|set-cookie|password|database[_-]?url|service[_-]?role|private[_-]?key|seed|secure[_-]?store|ip(?:_address)?)$/i;
const patterns=[
 ['STELLAR_SEED',/\bS[A-Z2-7]{55}\b/],['PRIVATE_KEY',/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY|ssh-ed25519\s+[A-Za-z0-9+/]+/],
 ['JWT',/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/],['BEARER',/\bBearer\s+[A-Za-z0-9_.-]+/i],
 ['DATABASE_URL',/postgres(?:ql)?:\/\/[^\s"']+/i],['API_KEY',/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/],
 ['EMAIL',/[A-Z0-9.!#$%&'*+/=?^_{}|~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/i],
 ['ENV_CONTENT',/(?:^|\n)\s*(?:SUPABASE_[A-Z_]*(?:KEY|TOKEN)|DATABASE_URL|PGPASSWORD|PASSWORD)\s*=/i],
 ['COOKIE',/(?:^|\n)\s*(?:set-cookie|cookie)\s*:/i],['PRIVILEGED_ROLE',/\bservice_role\b/],
 ['SECRET_FIELD',/["'](?:password|service_role_key|refresh_token|access_token|auth_uid|auth_user_id)["']\s*:/i],
];
export function scanRaw(data){const text=Buffer.isBuffer(data)?data.toString('utf8'):String(data);for(const [kind,re] of patterns)check(!re.test(text),'BLOCKED_EVIDENCE_SECRET_OR_PII',{kind,artifactSha256:hash(Buffer.from(text))});let obj;try{obj=JSON.parse(text);}catch{return true;}walk(obj);return true;}
function walk(v){if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){check(!dangerous.test(k),'BLOCKED_EVIDENCE_SECRET_OR_PII',{kind:'FORBIDDEN_FIELD',field:k});walk(x);}}
export function sanitize(v){const redactions=[];function visit(x,path){if(Array.isArray(x))return x.map((a,i)=>visit(a,path+'/'+i));if(x&&typeof x==='object'){const out={};for(const [k,a] of Object.entries(x)){if(dangerous.test(k)){redactions.push({path:path+'/'+k,reason:'PRIVATE_FIELD_REMOVED'});continue;}out[k]=visit(a,path+'/'+k);}return out;}return x;}const value=visit(v,'');scanRaw(JSON.stringify(value));return {value,redactions};}
