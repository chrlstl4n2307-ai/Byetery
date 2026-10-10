// Prints finding locations only, never matching credential contents.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(args,options={})=>execFileSync('git',args,{cwd:root,maxBuffer:128*1024*1024,...options});
const secrets=[];
if(process.argv[2]){
 const env=parseEnv(fs.readFileSync(process.argv[2],'utf8'));
 for(const [name,value] of Object.entries(env))if(/KEY|TOKEN|PASSWORD|SECRET|DATABASE_URL/.test(name)&&value.length>=12)secrets.push(value);
 if(env.DATABASE_URL){const password=new URL(env.DATABASE_URL).password;if(password.length>=8)secrets.push(password,decodeURIComponent(password));}
}
const patterns=[/\bS[A-Z2-7]{55}\b/,/\bsbp_[A-Za-z0-9]{30,}\b/,/\bsb_secret_[A-Za-z0-9_-]{20,}\b/,/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/(?:seed_phrase|mnemonic)\s*[:=]\s*["'][a-z]+(?: [a-z]+){11,23}["']/i];
const findings=[];
function scan(file,bytes){const text=bytes.toString('utf8');if(patterns.some(p=>p.test(text))||secrets.some(s=>text.includes(s)))findings.push({file,kind:'potential-credential'});}
const files=new Set(git(['ls-files','-z','--cached','--others','--exclude-standard']).toString().split('\0').filter(Boolean));
function walk(dir){if(!fs.existsSync(dir))return;for(const item of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isSymbolicLink())continue;if(item.isDirectory())walk(full);else if(/\.(?:json|md|log|txt|mjs|mts|ps1|cmd)$/.test(full))files.add(path.relative(root,full));}}
walk(path.join(root,'.tools/testnet'));walk(path.join(root,'.tools/verification'));walk(path.join(root,'.tools/cli-signing-review'));
for(const file of files){const full=path.join(root,file);if(fs.existsSync(full)&&fs.statSync(full).isFile())scan(file,fs.readFileSync(full));}
const objects=git(['rev-list','--objects','--all']).toString().trim().split('\n').map(row=>{const at=row.indexOf(' ');return {id:at<0?row:row.slice(0,at),name:at<0?'object':row.slice(at+1)};});
const batch=git(['cat-file','--batch'],{input:objects.map(o=>o.id).join('\n')+'\n'});let cursor=0,blobs=0;
for(const obj of objects){const end=batch.indexOf(10,cursor),head=batch.subarray(cursor,end).toString().split(' '),size=Number(head[2]);cursor=end+1;if(head[1]==='blob'){scan('history:'+obj.name,batch.subarray(cursor,cursor+size));blobs++;}cursor+=size+1;}
const staged=git(['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
for(const file of staged)scan('staged:'+file,git(['show',':'+file]));
console.log(JSON.stringify({files:files.size,historicalBlobs:blobs,stagedFiles:staged.length,findings},null,2));
if(findings.length)process.exitCode=1;
