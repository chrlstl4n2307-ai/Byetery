import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { assertLocalRuntime } from '../d3/operator-guard.ts';
import { AppError, requireThat } from '../application/errors.ts';
import type { WalletGateway, Login } from './gateway.ts';

export type Assets = Readonly<Record<string,{type:string;bytes:string|Buffer}>>;
const COOKIE='byetery_wallet_local';
const security={
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
async function jsonBody(req:IncomingMessage):Promise<Record<string,unknown>> {
  requireThat(req.headers['content-type']==='application/json',400,'JsonRequired');
  const chunks:Buffer[]=[];let size=0;
  for await(const part of req) {size+=part.length;requireThat(size<=8192,413,'BodyTooLarge');chunks.push(Buffer.from(part));}
  try {const result:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requireThat(result && typeof result==='object' && !Array.isArray(result),400,'InvalidInput');return result as Record<string,unknown>;
  }catch{throw new AppError(400,'InvalidInput');}
}
/** Fixed loopback host and exact route allowlist, with opaque in-memory sessions. */
export async function walletServer(gateway:WalletGateway,assets:Assets,env:NodeJS.ProcessEnv=process.env):Promise<{server:Server;url:string}> {
  assertLocalRuntime(env);
  const sessions=new Map<string,Login>();let origin='',period=Date.now(),count=0,loginCount=0;
  const server=createServer({maxHeaderSize:8192},async(req,res)=>{
    const finish=(status:number,body:unknown,cookie?:string)=>{
      res.writeHead(status,{...security,'Content-Type':'application/json; charset=utf-8',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(body));
    };
    try {
      assertLocalRuntime(env);
      if(Date.now()-period>=60000){period=Date.now();count=0;loginCount=0;}
      requireThat(++count<=100,429,'RateLimited');
      requireThat(req.headers.host===new URL(origin).host,403,'HostRejected');
      requireThat(!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site']==='same-origin' || req.headers['sec-fetch-site']==='none',403,'OriginRejected');
      const path=req.url??'',method=req.method;
      if(method==='GET' && Object.hasOwn(assets,path)) {
        res.writeHead(200,{...security,'Content-Type':assets[path].type});res.end(assets[path].bytes);return;
      }
      const allowed=method==='GET'&&path==='/api/me' || method==='POST'&&['/auth/login','/auth/logout','/api/wallet/challenge','/api/wallet/verify'].includes(path);
      requireThat(allowed,404,'NotFound');
      if(method==='POST') requireThat(req.headers.origin===origin,403,'OriginRejected');
      for(const [id,session] of sessions)if(Date.now()>=session.expiresAt)sessions.delete(id);
      const cookies=(req.headers.cookie??'').split(';').map(c=>c.trim()).filter(c=>c.startsWith(COOKIE+'='));
      const id=cookies.length===1?cookies[0].slice(COOKIE.length+1):'';
      if(path==='/auth/login') {
        requireThat(++loginCount<=10 && sessions.size<4,429,'LoginRateLimited');
        requireThat(!sessions.has(id),409,'LogoutFirst');
        const body=await jsonBody(req);
        requireThat(Object.keys(body).sort().join(',')==='email,password' && typeof body.email==='string' && body.email.length<=320 &&
          typeof body.password==='string' && body.password.length>0 && body.password.length<=2048,400,'InvalidInput');
        let session:Login;
        try {session=await gateway.login(body.email,body.password);}finally{body.password='';}
        const next=randomBytes(32).toString('hex');sessions.set(next,session);
        return finish(200,{authenticated:true,source:'TESTNET'},`${COOKIE}=${next}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1,Math.floor((session.expiresAt-Date.now())/1000))}`);
      }
      const session=sessions.get(id);requireThat(session,401,'AuthenticationRequired');
      if(path==='/auth/logout') {
        sessions.delete(id);
        try {await gateway.logout(session.bearer);}catch{return finish(503,{error:{code:'LogoutUnavailable'}},`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);}
        return finish(200,{authenticated:false,source:'TESTNET'},`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      }
      if(path==='/api/me'){const reply=await gateway.me(session.bearer);return finish(reply.status,reply.body);}
      const key=req.headers['idempotency-key'];requireThat(typeof key==='string' && /^[A-Za-z0-9._:-]{8,128}$/.test(key),400,'IdempotencyKeyRequired');
      const body=await jsonBody(req);
      const reply=path==='/api/wallet/challenge'?await gateway.challenge(session.bearer,body,key):await gateway.verify(session.bearer,body,key);
      return finish(reply.status,reply.body);
    }catch(error){return finish(error instanceof AppError?error.status:503,{source:'TESTNET',error:{code:error instanceof AppError?error.code:'WalletLinkUnavailable'}});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.on('close',()=>sessions.clear());
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{
    origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;resolve();
  });});
  return {server,url:origin};
}
