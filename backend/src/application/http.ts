import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { SupabaseAuth } from './auth.ts';
import { Coordinator, type Action } from './coordinator.ts';
import { AppError, requireThat, type Reply } from './errors.ts';
interface Route { action?: Action; battery?: string }
function route(method: string, path: string): Route {
  let m: RegExpExecArray|null;
  if(method==='POST' && path==='/api/batteries') return {action:{kind:'register'}};
  if(method==='POST' && path==='/api/wallet/challenge') return {action:{kind:'challenge'}};
  if(method==='POST' && path==='/api/wallet/verify') return {action:{kind:'verify'}};
  if((m=/^\/api\/batteries\/([^/]+)$/.exec(path)) && method==='GET') return {battery:m[1]};
  if((m=/^\/api\/batteries\/([^/]+)\/(returns|reward)$/.exec(path)) && method==='POST') return {action:{kind:m[2]==='returns'?'return':'reward',resource:m[1]}};
  if((m=/^\/api\/returns\/([^/]+)\/(cancel|collection|recycling)$/.exec(path)) && method==='POST') return {action:{kind:m[2] as Action['kind'],resource:m[1]}};
  throw new AppError(404,'RouteNotFound');
}
async function body(req: IncomingMessage): Promise<unknown> {
  requireThat(req.headers['content-type']?.split(';')[0].trim()==='application/json',400,'JsonRequired');
  const chunks: Buffer[]=[];let size=0;
  for await(const chunk of req) {size+=chunk.length; requireThat(size<=32768,400,'BodyTooLarge');chunks.push(Buffer.from(chunk));}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw new AppError(400,'InvalidJson');}
}
export function api(auth: SupabaseAuth, coordinator: Coordinator): Server {
  let period=Date.now(),count=0;
  const server=createServer({maxHeaderSize:16384},async(req,res)=>{
    const requestId=randomUUID();let reply: Reply;
    try {
      if(Date.now()-period>=60000){period=Date.now();count=0;}
      requireThat(++count<=600,429,'RateLimited');
      requireThat(!req.headers.origin,403,'BrowserOriginNotEnabled');
      const target=route(req.method??'',(req.url??'').split('?')[0]);
      const identity=await auth.validate(req.headers.authorization);
      if(target.battery) reply=await coordinator.get(identity,target.battery);
      else {
        const key=req.headers['idempotency-key'];requireThat(typeof key==='string',400,'IdempotencyKeyRequired');
        reply=await coordinator.mutate(identity,target.action!,await body(req),key);
      }
    } catch(error) {
      const known=error instanceof AppError;
      reply={status:known?error.status:500,body:{error:{code:known?error.code:'InternalError'}}};
      if(!known) console.error(JSON.stringify({requestId,error:'InternalError'}));
    }
    if(reply.body.error) {
      const code=(reply.body.error as {code:string}).code;
      reply.body={error:{code,message:reply.status>=500?'Service could not complete this request.':'Request rejected: '+code,requestId}};
    }
    res.writeHead(reply.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Request-Id':requestId});
    res.end(JSON.stringify(reply.body));
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return server;
}
export async function listen(server: Server, port=0): Promise<string> {
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
export async function close(server: Server): Promise<void> {
  server.closeIdleConnections(); await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
}
