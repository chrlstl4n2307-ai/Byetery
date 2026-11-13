
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {generateKeyPairSync,sign,verify,randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../../',import.meta.url)).replaceAll(String.fromCharCode(92),'/').replace(/\/$/,'');
const fixtureUrl=pathToFileURL(root+'/backend/tests/__external_final_security_review__.ts').href;
let prefix=readFileSync(root+'/backend/tests/d324-authority.test.ts','utf8').split("\ntest('four verified")[0];
if(!prefix.includes('async function local()')||prefix.split('new FixtureAuthority(').length!==2)throw Error('FixtureDrift');
prefix=prefix.replace('new FixtureAuthority(','new D324Authority(').replace("const compositionSha='a'.repeat(40),operatorSha='b'.repeat(40),planHash='c'.repeat(64);", "const compositionSha='a'.repeat(40),operatorSha='d85e54e00e98c8d8bc6294c883708a701ce55440',planHash='0435d8436d13881ebbdf31e729cf36a80e538bc149300219353f68817b37d72d';");
registerHooks({resolve(s,c,n){if(s==='review:fixture')return {url:fixtureUrl,shortCircuit:true};return n(s,c);},
load(u,c,n){if(u===fixtureUrl)return {format:'module-typescript',source:prefix+'\nexport {local,fixtureApproval,roles,count,D324Authority};',shortCircuit:true};return n(u,c);}});
const F=await import('review:fixture');
const {SupabaseAuth}=await import(pathToFileURL(root+'/backend/src/application/auth.ts'));
const {prepareD324Sessions}=await import(pathToFileURL(root+'/backend/src/application/d324-sessions.ts'));
const {api}=await import(pathToFileURL(root+'/backend/src/application/http.ts'));
const {Coordinator}=await import(pathToFileURL(root+'/backend/src/application/coordinator.ts'));
const f=await F.local();
for(const identity of Object.values(f.identities))identity.tokenExpiresAt=Math.floor(identity.tokenExpiresAt/1000)*1000;
const approval=F.fixtureApproval(f.identities);
const keys=generateKeyPairSync('ed25519'),revoked=new Set(),receipts=new Map();
let authReads=0,logins=0,logouts=0;
let app,origin,control;
const {createD324SessionControl}=await import(pathToFileURL(root+'/tools/d3-24-composition/session-control.mjs'));
const resetControl=()=>{control?.close();control=createD324SessionControl({repo:f.repo,auth:new SupabaseAuth({url:origin,publicKey:'sb_publishable_fixture'}),authority:approval.authority,challenge:approval.input.execution.challenge});};
const jwt=role=>{
 const i=f.identities[role],head=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({sub:i.authUserId,session_id:i.sessionId,role:'authenticated',jti:randomUUID(),exp:Math.floor(i.tokenExpiresAt/1000)})).toString('base64url');
 const data=head+'.'+payload;return data+'.'+sign(null,Buffer.from(data),keys.privateKey).toString('base64url');
};
const decode=header=>{
 const token=header?.slice(7),p=token?.split('.');
 if(!p||p.length!==3||revoked.has(token)||!verify(null,Buffer.from(p[0]+'.'+p[1]),keys.publicKey,Buffer.from(p[2],'base64url')))throw Error('InvalidSyntheticToken');
 const claims=JSON.parse(Buffer.from(p[1],'base64url'));if(claims.exp*1000<=Date.now())throw Error('ExpiredSyntheticToken');return claims;
};
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
const server=createServer(async(req,res)=>{
 try{
  const p=req.url;
  if(p==='/auth/v1/user'){authReads++;const c=decode(req.headers.authorization);return reply(res,200,{id:c.sub});}
  if(p==='/auth/v1/logout?scope=local'){decode(req.headers.authorization);revoked.add(req.headers.authorization.slice(7));logouts++;return reply(res,200,{});}
  if(p==='/state')return reply(res,200,{admissions:await F.count(f.repo,'d324_admission'),operations:await F.count(f.repo,'stellar_operations'),steps:await F.count(f.repo,'d324_step'),logins,logouts,authReads});
  if(p.startsWith('/api/'))return app.emit('request',req,res);
  let raw='';for await(const b of req){raw+=b;if(raw.length>50000)throw Error('TooLarge');}
  const input=JSON.parse(raw||'{}');
  if(p==='/auth/v1/token?grant_type=password'){
   const role=String(input.email).split('@')[0].toUpperCase();
   if(!F.roles.includes(role)||input.password!=='synthetic-only')return reply(res,401,{});
   logins++;return reply(res,200,{access_token:jwt(role)});
  }
  if(p==='/prepare')return reply(res,200,await control.prepare(input.headers));
  if(p==='/restart-control'){resetControl();return reply(res,200,{reset:true});}
  if(p==='/admission-check'){await control.checkAdmission(input.ack);return reply(res,200,{valid:true});}
  if(p==='/fault'){
   const i=f.identities.RECYCLER;
   if(input.kind==='revoke')await f.db.query('delete from auth.sessions where id=$1',[i.sessionId]);
   else if(input.kind==='restore')await f.db.query('insert into auth.sessions values($1,$2,null) on conflict(id) do update set not_after=null',[i.sessionId,i.authUserId]);
   else if(input.kind==='shorten')await f.db.query('update auth.sessions set not_after=$2 where id=$1',[i.sessionId,new Date(Date.now()+180000)]);
   else throw Error('FaultNotAllowed');
   return reply(res,200,{fixtureOnly:true});
  }
  if(p==='/admit'){
   let data=approval.input;
   if(input.fault==='live')data={...data,live:undefined};
   if(input.fault==='manifest')data={...data,manifestApproval:data.liveSignature};
   return reply(res,200,await control.admit(input.id,data));
  }
  return reply(res,404,{});
 }catch(e){reply(res,e.status??403,{code:/^[A-Za-z0-9_]+$/.test(e.code??e.message)?(e.code??e.message):'SyntheticReviewRejected'});}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
app=api(new SupabaseAuth({url:origin,publicKey:'sb_publishable_fixture'}),new Coordinator(f.repo));
resetControl();process.send({ready:true,origin});
process.on('message',async m=>{if(m?.stop){control.close();server.closeAllConnections();await new Promise(r=>server.close(r));await f.db.close();process.exit(0);}});
