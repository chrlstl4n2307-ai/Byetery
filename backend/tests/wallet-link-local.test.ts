import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {PGlite} from '@electric-sql/pglite';
import {Keypair} from '@stellar/stellar-sdk';
import {walletMessage} from '../src/wallet-message.ts';
import {Ed25519WalletVerifier} from '../src/application/wallet.ts';
import {Repository,type Db} from '../src/application/repository.ts';
import {SupabaseAuth} from '../src/application/auth.ts';
import {walletGateway,type WalletGateway} from '../src/wallet-link-local/gateway.ts';
import {walletServer} from '../src/wallet-link-local/http.ts';
import {browserAssets,localSettings} from '../src/wallet-link-local/runtime.ts';
import {challengeText,signChallenge,TARGET,WALLET_A,DEPLOYMENT,NETWORK_ID,PASSPHRASE,type Challenge,type Provider} from '../src/wallet-link-local/protocol.ts';
import {config,h} from './fixtures.ts';
import type {WalletChallenge} from '../src/wallet-verifier.ts';

function challenge(user=randomUUID()):{c:Challenge;user:string;message:string} {
  const id=randomUUID(),expiresAt=new Date(Date.now()+600000).toISOString();
  const message=walletMessage({deploymentId:DEPLOYMENT,id,userId:user,networkId:NETWORK_ID,address:TARGET,nonce:randomBytes(32).toString('hex'),expiresAt});
  return {user,message,c:{challengeId:id,version:2,signingScheme:'SEP53_V2',address:TARGET,network:'Testnet',purpose:'LINK_WALLET',
    messageBase64:Buffer.from(message).toString('base64'),expiresAt,source:'TESTNET'}};
}
test('D3-7D canonical challenge binds exact B, user, deployment, scheme and network',async t=>{
  const {c,user,message}=challenge();assert.equal(challengeText(c,user),message);
  for(const [name,changed] of Object.entries({address:{address:WALLET_A},network:{network:'Public'},source:{source:'MOCK'},
    version:{version:1},scheme:{signingScheme:'RAW_ED25519_V1'},purpose:{purpose:'PAYMENT'},expiry:{expiresAt:new Date(0).toISOString()}}))
    await t.test(name,()=>assert.throws(()=>challengeText({...c,...changed},user)));
  for(const [name,from,to] of [['deployment',DEPLOYMENT,randomUUID()],['user',user,randomUUID()],['network ID',NETWORK_ID,h(2)],['message bytes','Byetery -','Other -']])
    await t.test(name,()=>assert.throws(()=>challengeText({...c,messageBase64:Buffer.from(message.replace(from,to)).toString('base64')},user)));
  assert.throws(()=>challengeText(c,user,Date.parse(c.expiresAt)));
});
test('D3-7D provider signs only exact message on explicit invocation; checks selected address before and after',async t=>{
  const {c,user,message}=challenge();let address=TARGET,network=PASSPHRASE,calls=0;
  const proof=randomBytes(64).toString('base64');
  const p:Provider={requestAccess:async()=>({address}),getAddress:async()=>({address}),getNetwork:async()=>({networkPassphrase:network}),
    signMessage:async(text,opts)=>{calls++;assert.equal(text,message);assert.deepEqual(opts,{address:TARGET});return {signedMessage:proof,signerAddress:address};}};
  assert.equal(calls,0);assert.equal(await signChallenge(p,c,user),proof);assert.equal(calls,1);
  await t.test('wrong selected account cannot reach wallet signature',async()=>{address=WALLET_A;await assert.rejects(signChallenge(p,c,user));assert.equal(calls,1);address=TARGET;});
  await t.test('wrong network cannot reach wallet signature',async()=>{network='Public Global Stellar Network ; September 2015';await assert.rejects(signChallenge(p,c,user));assert.equal(calls,1);network=PASSPHRASE;});
  await t.test('expired challenge cannot reach wallet signature',async()=>{await assert.rejects(signChallenge(p,{...c,expiresAt:new Date(0).toISOString()},user));assert.equal(calls,1);});
  await t.test('wrong returned signer',async()=>{await assert.rejects(signChallenge({...p,signMessage:async()=>({signedMessage:proof,signerAddress:WALLET_A})},c,user));});
  await t.test('account changed while approval open',async()=>{await assert.rejects(signChallenge({...p,signMessage:async()=>{address=WALLET_A;return {signedMessage:proof,signerAddress:TARGET};}},c,user));address=TARGET;});
  await t.test('rejection and malformed signature fail closed',async()=>{for(const signedMessage of [null,'bad'])await assert.rejects(signChallenge({...p,signMessage:async()=>({signedMessage,signerAddress:TARGET})},c,user));});
});

test('D3-7D real wallet endpoints and persistence in isolated PGlite, with offline Auth transport',async t=>{
  const db=new PGlite(),user=randomUUID(),session=randomUUID(),other=randomUUID();
  const query=db.query.bind(db);
  db.query=(async(sql:string,params?:unknown[])=>{
    const values=params?.map((v,i)=>{if(!Buffer.isBuffer(v))return v;sql=sql.replace(new RegExp('\\$'+(i+1)+'(?![0-9])','g'),`decode($${i+1},'hex')`);return v.toString('hex');});
    const result=await query(sql,values);for(const row of result.rows as Record<string,unknown>[])for(const [k,v] of Object.entries(row))if(v instanceof Uint8Array)row[k]=Buffer.from(v);return result;
  }) as typeof db.query;
  const repo=Object.assign(Object.create(Repository.prototype) as Repository,{mode:'TESTNET',deploymentId:DEPLOYMENT,
    transaction:async<T>(work:(db:Db)=>Promise<T>):Promise<T>=>{await db.exec('begin');try{const r=await work(db as unknown as Db);await db.exec('commit');return r;}catch(e){await db.exec('rollback');throw e;}}});
  const url='https://aemxuqnnwfclzrwwiqfd.supabase.co';
  const token=[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({sub:user,role:'authenticated',session_id:session})).toString('base64url'),'offline-test'].join('.');
  const password=randomBytes(30).toString('hex'),fixtureProof=randomBytes(64),seen:string[]=[],transportCalls:string[]=[];
  const nativeFetch=globalThis.fetch;
  const fetchMock=mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    if(String(input)===url+'/auth/v1/user'){assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+token);return Response.json({id:user});}
    if(String(input).startsWith('http://127.0.0.1:'))return nativeFetch(input,init);
    throw new Error('UnexpectedNetworkDenied');
  });
  const transport:typeof fetch=async(input,init)=>{
    transportCalls.push(String(input));assert.equal(new Headers(init?.headers).get('apikey'),'sb_publishable_offline');
    if(String(input).endsWith('/auth/v1/token?grant_type=password')){assert.deepEqual(JSON.parse(init!.body as string),{email:'fixture@example.invalid',password});return Response.json({access_token:token,refresh_token:'discarded-offline',expires_in:3600});}
    assert.equal(String(input),url+'/auth/v1/logout?scope=local');return new Response(null,{status:204});
  };
  let server:Awaited<ReturnType<typeof walletServer>>|undefined;
  const logMocks=['log','warn','error'].map(method=>mock.method(console,method as 'log',(...args:unknown[])=>{seen.push(args.map(String).join(' '));}));
  try{
    await db.exec('create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create role anon;create role authenticated;');
    const dir=new URL('../../database/migrations/',import.meta.url);
    for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
    await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
      values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[DEPLOYMENT,NETWORK_ID,config.contractAddress,h(1),config.admin,config.service,config.rewardToken]);
    for(const u of [user,other]){await db.query('insert into auth.users values($1)',[u]);await db.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[u]);}
    await db.query('insert into auth.sessions values($1,$2,null)',[session,user]);
    await db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'USER')",[DEPLOYMENT,user]);
    // Existing Wallet A fixture, local database only. It is never a new live link.
    await db.query(`insert into app_private.wallet_links(deployment_id,network_id,user_id,address,proof_reference,verified_at)
      values($1,decode($2,'hex'),$3,$4,'offline-existing-A',now())`,[DEPLOYMENT,NETWORK_ID,user,WALLET_A]);
    const gateway=walletGateway(repo,new SupabaseAuth({url,publicKey:'sb_publishable_offline'} as ConstructorParameters<typeof SupabaseAuth>[0]),{url,publicKey:'sb_publishable_offline'},transport);
    server=await walletServer(gateway,{'/':{type:'text/html',bytes:'offline fixture'}},{});
    const origin=server.url;let cookie='';
    async function call(path:string,body?:unknown,key:string=randomUUID(),overrides:Record<string,string>={}){
      const response=await nativeFetch(origin+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),
        ...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key}),...overrides},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const payload=await response.json() as Record<string,any>;return {response,body:payload};
    }
    await t.test('missing session rejected',async()=>assert.equal((await call('/api/me')).response.status,401));
    await t.test('normal password grant; opaque cookie, no token in response',async()=>{
      const r=await call('/auth/login',{email:'fixture@example.invalid',password});assert.equal(r.response.status,200);
      assert.deepEqual(r.body,{authenticated:true,source:'TESTNET'});cookie=r.response.headers.get('set-cookie')!.split(';')[0];
      assert.match(r.response.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);assert.ok(!cookie.includes(token));
    });
    await t.test('normal me uses existing A profile',async()=>{const r=await call('/api/me');assert.equal(r.body.source,'TESTNET');assert.deepEqual(r.body.wallets.map((w:{address:string})=>w.address),[WALLET_A]);});
    await t.test('arbitrary address, injected user and missing idempotency key rejected',async()=>{
      assert.equal((await call('/api/wallet/challenge',{address:WALLET_A})).response.status,400);
      assert.equal((await call('/api/wallet/challenge',{address:TARGET,user_id:other})).response.status,400);
      assert.equal((await call('/api/wallet/challenge',{address:TARGET},'')).response.status,400);
    });
    await t.test('origin and Host guards',async()=>{
      assert.equal((await call('/api/wallet/challenge',{address:TARGET},randomUUID(),{Origin:'https://other.invalid'})).response.status,403);
      const status=await new Promise<number>((resolve,reject)=>{const req=httpRequest(origin+'/api/me',{headers:{Host:'evil.invalid',Cookie:cookie}},res=>{res.resume();resolve(res.statusCode!);});req.once('error',reject);req.end();});
      assert.equal(status,403);
    });
    await t.test('every lifecycle/operator/refresh/proxy path unavailable',async()=>{
      for(const path of ['/api/batteries','/api/batteries/BYE-TEST/returns','/api/batteries/BYE-TEST/reward','/api/returns/test/collection','/api/returns/test/recycling','/operator','/auth/refresh','/api/wallet/verify?operator=1'])
        assert.equal((await call(path,{})).response.status,404);
    });
    const issued=await call('/api/wallet/challenge',{address:TARGET}),c=issued.body as unknown as Challenge;
    await t.test('existing normal challenge endpoint issues expected protocol and binding',async()=>{
      assert.equal(issued.response.status,201);assert.equal(c.version,2);assert.equal(c.signingScheme,'SEP53_V2');challengeText(c,user);
      const row=(await db.query<Record<string,any>>('select * from api_private.wallet_challenges where id=$1',[c.challengeId])).rows[0];
      assert.equal(row.user_id,user);assert.equal(row.address,TARGET);assert.equal(row.expires_at.getTime()-row.created_at.getTime(),600000);
    });
    await t.test('real verifier rejects wrong-wallet proof',async()=>{
      const signature=Buffer.from(Keypair.random().signMessage(Buffer.from(c.messageBase64,'base64'))).toString('base64');
      assert.equal((await call('/api/wallet/verify',{challengeId:c.challengeId,signature})).response.status,422);
    });
    await t.test('offline verifier fixture proves atomic SQL consumption, preserves A, normal me returns both, fresh-key replay rejects',async()=>{
      // Explicit isolated persistence test seam, NOT a real proof for B; restored before leaving this subtest.
      const verifier=mock.method(Ed25519WalletVerifier.prototype,'verify',async(value:WalletChallenge)=>({verified:true as const,address:value.address,networkId:value.networkId,challengeId:value.id}));
      try{
        const body={challengeId:c.challengeId,signature:fixtureProof.toString('base64')},key=randomUUID();
        const result=await call('/api/wallet/verify',body,key);assert.equal(result.response.status,200);assert.equal(result.body.address,TARGET);assert.equal(result.body.verified,true);
        const p=await call('/api/me');assert.deepEqual(p.body.wallets.map((w:{address:string})=>w.address).sort(),[WALLET_A,TARGET].sort());
        assert.equal((await call('/api/wallet/verify',body)).response.status,409);
        assert.equal((await call('/api/wallet/verify',body,key)).response.status,200);
        const counts=(await db.query<{links:number;consumed:number}>(`select (select count(*)::int from app_private.wallet_links) links,(select count(*)::int from api_private.wallet_challenges where consumed_at is not null) consumed`)).rows[0];
        assert.deepEqual(counts,{links:2,consumed:1});
      }finally{verifier.mock.restore();}
    });
    await t.test('no lifecycle records or new users/memberships created',async()=>{
      for(const table of ['app_private.stellar_operations','app_private.return_requests','app_private.reward_attempts','api_private.testnet_work'])assert.equal((await db.query<{n:number}>('select count(*)::int n from '+table)).rows[0].n,0);
      assert.equal((await db.query<{n:number}>('select count(*)::int n from app_private.users')).rows[0].n,2);
      assert.equal((await db.query<{n:number}>('select count(*)::int n from api_private.memberships')).rows[0].n,1);
    });
    await t.test('revoked Auth session cannot request challenge or read me',async()=>{
      await db.query('delete from auth.sessions where id=$1',[session]);assert.equal((await call('/api/me')).response.status,401);
      await db.query('insert into auth.sessions values($1,$2,null)',[session,user]);
    });
    await t.test('disabled membership never reprovisions authority',async()=>{
      await db.query('update api_private.memberships set enabled=false where deployment_id=$1 and user_id=$2',[DEPLOYMENT,user]);
      assert.equal((await call('/api/me')).response.status,403);
      assert.equal((await call('/api/wallet/challenge',{address:TARGET})).response.status,403);
      assert.equal((await db.query<{enabled:boolean}>('select enabled from api_private.memberships where deployment_id=$1 and user_id=$2',[DEPLOYMENT,user])).rows[0].enabled,false);
      await db.query('update api_private.memberships set enabled=true where deployment_id=$1 and user_id=$2',[DEPLOYMENT,user]);
    });
    await t.test('logout uses only local Auth scope; subsequent request401',async()=>{
      assert.equal((await call('/auth/logout',{})).response.status,200);assert.equal((await call('/api/me')).response.status,401);
      assert.ok(transportCalls.every(u=>u===url+'/auth/v1/token?grant_type=password'||u===url+'/auth/v1/logout?scope=local'));
    });
    await t.test('no sensitive values reach logs',()=>{const output=seen.join('\n');for(const secret of [password,token,cookie,fixtureProof.toString('base64'),c.messageBase64])assert.ok(!output.includes(secret));});
  }finally{
    fetchMock.mock.restore();for(const m of logMocks)m.mock.restore();if(server){server.server.closeAllConnections();await new Promise<void>(resolve=>server!.server.close(()=>resolve()));}await db.close();
  }
});

test('D3-7D hosted/CI denial precedes config, listener and Auth side effects',async()=>{
  const gateway=new Proxy({} as WalletGateway,{get(){throw new Error('GatewayMustNotBeTouched');}});
  for(const env of [{VERCEL:'1'},{CI:'false'},{NODE_ENV:'production'},{AWS_LAMBDA_FUNCTION_NAME:'x'},{NETLIFY:'true'}]){
    await assert.rejects(walletServer(gateway,{},env),{message:'HostedExecutionDenied'});
    await assert.rejects(localSettings({...env,BYETERY_WALLET_CONFIG_FILE:'does-not-exist'}),{message:'HostedExecutionDenied'});
  }
  const r=spawnSync(process.execPath,['--experimental-strip-types','src/wallet-link-local/server.ts'],{cwd:new URL('../',import.meta.url),env:{...process.env,CI:'1'},encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/Local wallet linking unavailable/);assert.ok(!r.stderr.includes('does-not-exist'));
});
test('D3-7D browser assets are local and exclude server/session modules',async()=>{
  const assets=await browserAssets();assert.deepEqual(Object.keys(assets).sort(),['/','/browser.js','/freighter.js','/protocol.js','/style.css','/wallet-message.js'].sort());
  assert.match(String(assets['/browser.js'].bytes),/from ['"]\.\/protocol\.js/);
  assert.match(String(assets['/protocol.js'].bytes),/from ['"]\.\.\/wallet-message\.js/);
  const browser=['/browser.js','/protocol.js','/wallet-message.js','/'].map(k=>String(assets[k].bytes)).join('\n');
  for(const forbidden of ['DATABASE_URL','serverKey','TestnetStellarService','LocalSecureStoreSigner','signTransaction(','signAuthEntry(','localStorage','sessionStorage'])assert.ok(!browser.includes(forbidden));
});
test('D3-7D executable import graph has no operational worker, transport, signing or RPC module',async()=>{
  const visited=new Set<string>();
  async function visit(url:URL):Promise<void>{
    if(visited.has(url.href))return;visited.add(url.href);const code=await readFile(url,'utf8');
    assert.ok(!/\/(?:testnet|sprint)\//.test(url.pathname),url.pathname);
    assert.ok(!/local-secure-store-signer|\/d3\/(?:cli|live-operator)|\/application\/server\.ts/.test(url.pathname),url.pathname);
    for(const match of code.matchAll(/(?:import\s+(?!type\b)[\s\S]*?\sfrom\s*|import\s*\()['"]([^'"]+)['"]/g))
      if(match[1].startsWith('.') && match[1].endsWith('.ts'))await visit(new URL(match[1],url));
  }
  await visit(new URL('../src/wallet-link-local/server.ts',import.meta.url));assert.ok(visited.size>8);
  for(const name of ['gateway.ts','runtime.ts','http.ts']){
    const code=await readFile(new URL('../src/wallet-link-local/'+name,import.meta.url),'utf8');
    assert.ok(!/\.reconcile\(|\.process\(|signTransaction\(|signAuthEntry\(|insert into app_private\.wallet_links|service_role|generate_link|auth\.admin/.test(code));
  }
});
