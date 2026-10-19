import { settings } from './config.ts';
import { Repository } from './repository.ts';
import { Coordinator } from './coordinator.ts';
import { SupabaseAuth } from './auth.ts';
import { api,listen,close } from './http.ts';
import { TestnetStellarService } from '../testnet/service.ts';
import { TestnetRpc } from '../testnet/rpc.ts';
import { LocalSecureStoreSigner,signerProcess } from '../local-secure-store-signer.ts';
try {
  const config=await settings(),repo=new Repository(config);
  const real=config.mode==='TESTNET'?new TestnetStellarService(repo,new TestnetRpc(),new LocalSecureStoreSigner(signerProcess(config.signerBinary!))):undefined;
  const coordinator=new Coordinator(repo,{},undefined,real);
  await repo.transaction(db=>repo.config(db));
  await coordinator.reconcile();
  const server=api(new SupabaseAuth(config),coordinator);
  const port=Number(process.env.BYETERY_PORT??3001);
  if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('InvalidPort');
  console.log(`Byetery API: ${await listen(server,port)} | Database: SUPABASE DEV | Source: ${repo.mode}`);
  let busy=false;
  const timer=setInterval(async()=>{if(busy)return;busy=true;try{await coordinator.reconcile();}catch{console.error('Reconciliation pending; no operation assumed failed.');}finally{busy=false;}},2000);
  for(const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,()=>{clearInterval(timer);void close(server).then(()=>repo.pool.end());});
} catch {console.error('API startup failed. Check DEV configuration and provision the mock deployment.');process.exitCode=1;}
