import {createServer,type Server} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const TARGET='GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS';
const root=fileURLToPath(new URL('../../',import.meta.url));
export interface WalletGateway {
  challenge:(key:string)=>Promise<{status:number;body:Record<string,any>}>;
  verify:(body:Record<string,unknown>,key:string)=>Promise<{status:number;body:Record<string,any>}>;
}
/** Local owner UI only. No route can select user/deployment/recipient or call a lifecycle operation. */
export async function bridge(gateway:WalletGateway):Promise<{server:Server;url:string}>{
  const cookie=randomBytes(32).toString('hex');let origin='';let count=0;let period=Date.now();
  const compiler=createRequire(path.join(root,'frontend/package.json'))('typescript');
  const archive=path.join(root,'docs/instaward/baseline-snapshots/wallet-qr/untracked-files/frontend/src/lib/wallet-adapter.ts');
  const snapshot=JSON.parse(await readFile(path.join(root,'docs/instaward/baseline-snapshots/wallet-qr/MANIFEST.json'),'utf8'));
  const adapterBytes=await readFile(archive);
  if(createHash('sha256').update(adapterBytes).digest('hex')!==snapshot.files.find((f:{path:string})=>f.path==='frontend/src/lib/wallet-adapter.ts')?.sha256)throw new Error('SnapshotAdapterChanged');
  let adapter=adapterBytes.toString('utf8');
  if(!adapter.includes('c.source !== "MOCK"'))throw new Error('SnapshotAdapterChanged');
  adapter=adapter.replace('c.source !== "MOCK"','c.source !== "TESTNET"').replace('from "../../../backend/src/wallet-message"','from "/wallet-message.js"');
  const compile=(s:string)=>compiler.transpileModule(s,{compilerOptions:{target:compiler.ScriptTarget.ES2022,module:compiler.ModuleKind.ESNext}}).outputText;
  const assets:Record<string,{type:string;bytes:string|Buffer}>={
    '/':{type:'text/html; charset=utf-8',bytes:await readFile(new URL('./index.html',import.meta.url))},
    '/browser.js':{type:'text/javascript',bytes:await readFile(new URL('./browser.js',import.meta.url))},
    '/style.css':{type:'text/css',bytes:await readFile(new URL('./style.css',import.meta.url))},
    '/wallet-adapter.js':{type:'text/javascript',bytes:compile(adapter)},
    '/wallet-message.js':{type:'text/javascript',bytes:compile(await readFile(path.join(root,'backend/src/wallet-message.ts'),'utf8'))},
    '/freighter.js':{type:'text/javascript',bytes:await readFile(new URL('./node_modules/@stellar/freighter-api/build/index.min.js',import.meta.url))},
  };
  const server=createServer({maxHeaderSize:8192},async(req,res)=>{
    const finish=(status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    try{
      if(Date.now()-period>60000){period=Date.now();count=0;}
      if(++count>100)return finish(429,{error:{code:'RateLimited'}});
      if(req.headers.host!==new URL(origin).host)return finish(403,{error:{code:'HostRejected'}});
      if(req.method==='GET'&&assets[req.url??'']){
        const asset=assets[req.url!];res.writeHead(200,{'Content-Type':asset.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
          'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'Referrer-Policy':'no-referrer',
          ...(req.url==='/'?{'Set-Cookie':`byetery_wallet_owner=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`}:{})});res.end(asset.bytes);return;
      }
      if(req.method!=='POST'||!['/wallet/challenge','/wallet/verify'].includes(req.url??''))return finish(404,{error:{code:'NotFound'}});
      if(req.headers.origin!==origin||!(req.headers.cookie??'').split(';').map(c=>c.trim()).includes('byetery_wallet_owner='+cookie))return finish(403,{error:{code:'OwnerSessionRequired'}});
      if(req.headers['content-type']!=='application/json')return finish(400,{error:{code:'JsonRequired'}});
      const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[A-Za-z0-9._:-]{8,128}$/.test(key))return finish(400,{error:{code:'IdempotencyKeyRequired'}});
      const chunks:Buffer[]=[];let size=0;
      for await(const c of req){size+=c.length;if(size>2048)return finish(413,{error:{code:'BodyTooLarge'}});chunks.push(c);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return finish(400,{error:{code:'InvalidInput'}});}
      if(!body||typeof body!=='object'||Array.isArray(body))return finish(400,{error:{code:'InvalidInput'}});
      if(req.url==='/wallet/challenge'){
        if(Object.keys(body).length!==1||body.address!==TARGET)return finish(400,{error:{code:'TargetWalletRequired'}});
        const result=await gateway.challenge(key);return finish(result.status,result.body);
      }
      if(Object.keys(body).sort().join(',')!=='challengeId,signature'||typeof body.challengeId!=='string'||typeof body.signature!=='string')return finish(400,{error:{code:'InvalidInput'}});
      const result=await gateway.verify(body,key);return finish(result.status,result.body);
    }catch{return finish(503,{error:{code:'WalletSetupUnavailable'}});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const a=server.address();if(!a||typeof a==='string')return reject(new Error('ListenFailed'));origin=`http://127.0.0.1:${a.port}`;resolve();});});
  return {server,url:origin};
}
