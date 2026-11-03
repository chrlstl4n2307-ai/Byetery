import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Settings } from '../application/config.ts';
import { SupabaseAuth } from '../application/auth.ts';
import { Repository, one } from '../application/repository.ts';
import { requireThat } from '../application/errors.ts';
import { assertLocalRuntime } from '../d3/operator-guard.ts';
import { walletGateway } from './gateway.ts';
import { walletServer, type Assets } from './http.ts';
import { DEPLOYMENT } from './protocol.ts';

const root=fileURLToPath(new URL('../../../',import.meta.url));
/** Dedicated ignored config: only public Auth key and DB TLS connection are used. */
export async function localSettings(env:NodeJS.ProcessEnv=process.env):Promise<Settings> {
  assertLocalRuntime(env);
  const file=resolve(root,env.BYETERY_WALLET_CONFIG_FILE??'.env.wallet-link.local');
  const values={...parseEnv(await readFile(file,'utf8')),...env};
  const ref='aemxuqnnwfclzrwwiqfd',url=`https://${ref}.supabase.co`;
  requireThat(values.BYETERY_ENV==='DEV' && values.BYETERY_MODE==='TESTNET' && values.SUPABASE_PROJECT_REF===ref &&
    values.SUPABASE_URL===url && values.BYETERY_TESTNET_DEPLOYMENT_ID===DEPLOYMENT,503,'WalletConfigurationRejected');
  requireThat(values.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_') && values.DATABASE_URL && values.DATABASE_SSL_CA,503,'WalletConfigurationRejected');
  const db=new URL(values.DATABASE_URL),user=decodeURIComponent(db.username);
  requireThat(['postgres:','postgresql:'].includes(db.protocol) && db.pathname==='/postgres' && !db.search && !db.hash &&
    (db.hostname===`db.${ref}.supabase.co` || db.hostname.endsWith('.pooler.supabase.com') && user.endsWith('.'+ref)),503,'WalletDatabaseRejected');
  return {url,publicKey:values.SUPABASE_PUBLISHABLE_KEY!,serverKey:'',deploymentId:DEPLOYMENT,mode:'TESTNET',
    database:{host:db.hostname,port:Number(db.port||5432),database:'postgres',user,password:decodeURIComponent(db.password),max:2,
      ssl:{rejectUnauthorized:true,ca:await readFile(resolve(dirname(file),values.DATABASE_SSL_CA),'utf8')},
      connectionTimeoutMillis:15000,query_timeout:20000,application_name:'byetery-local-wallet-link'}};
}
export async function browserAssets():Promise<Assets> {
  const compiler=createRequire(resolve(root,'frontend/package.json'))('typescript') as {
    transpileModule(source:string,options:Record<string,unknown>):{outputText:string};
    ScriptTarget:{ES2022:number};ModuleKind:{ESNext:number};
  };
  const compile=(source:string)=>compiler.transpileModule(source,{compilerOptions:{target:compiler.ScriptTarget.ES2022,
    module:compiler.ModuleKind.ESNext,rewriteRelativeImportExtensions:true}}).outputText;
  const assets:Record<string,{type:string;bytes:Buffer|string}>={};
  for(const [route,file] of [['/','index.html'],['/style.css','style.css']])
    assets[route]={type:route==='/'?'text/html; charset=utf-8':'text/css',bytes:await readFile(resolve(root,'tools/wallet-link-local',file))};
  for(const [route,file] of [['/browser.js','wallet-link-local/browser.ts'],['/protocol.js','wallet-link-local/protocol.ts'],['/wallet-message.js','wallet-message.ts']])
    assets[route]={type:'text/javascript; charset=utf-8',bytes:compile(await readFile(resolve(root,'backend/src',file),'utf8'))};
  assets['/freighter.js']={type:'text/javascript; charset=utf-8',bytes:await readFile(resolve(root,'tools/wallet-link/node_modules/@stellar/freighter-api/build/index.min.js'))};
  return assets;
}
export async function startWalletLocal():Promise<void> {
  assertLocalRuntime();
  const config=await localSettings(),repo=new Repository(config);
  try {
    await repo.transaction(async db=>{
      await repo.config(db);
      const row=await one(db,'select contract_address,encode(wasm_hash,\'hex\') as wasm from chain_private.deployments where id=$1',[DEPLOYMENT]);
      requireThat(row?.contract_address==='CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON' &&
        row.wasm==='c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6',503,'DeploymentIdentityMismatch');
    });
    const {server,url}=await walletServer(walletGateway(repo,new SupabaseAuth(config),config),await browserAssets());
    console.log(`Byetery LOCAL wallet-only | TESTNET | ${url} | message signature only`);
    for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server.closeIdleConnections();server.close(()=>void repo.pool.end());});
  }catch(error){await repo.pool.end();throw error;}
}
