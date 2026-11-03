import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {TARGET,WALLET_A} from '../src/wallet-link-local/protocol.ts';
import {walletServer} from '../src/wallet-link-local/http.ts';

const {JSDOM}=createRequire(new URL('../../frontend/package.json',import.meta.url))('jsdom') as {
  JSDOM:new(html:string,options:{url:string})=>{window:Window & typeof globalThis & {close():void}};
};
interface State {
  active:boolean;loginStatus?:number;profileStatus?:number;walletA?:boolean;source?:string;
  logoutStatus?:number;keepSessionOnLogoutFailure?:boolean;holdLogout?:Promise<void>;
}
async function until(check:()=>boolean){const end=Date.now()+5000;while(!check()){assert.ok(Date.now()<end,'UI did not settle');await new Promise<void>(resolve=>setImmediate(resolve));}}
let instance=0;
async function fixture(state:State,work:(ui:{document:Document;calls:string[];status:()=>string;submit:()=>void;logout:()=>void;ready:()=>Promise<void>;providerCalls:()=>number})=>Promise<void>){
  const html=await readFile(new URL('../../tools/wallet-link-local/index.html',import.meta.url),'utf8');
  // Actual frozen HTML and actual browser.ts module, not a second UI implementation.
  const dom=new JSDOM(html,{url:'http://127.0.0.1:59999/'}),document=dom.window.document;
  const originals=['window','document'].map(key=>({key,descriptor:Object.getOwnPropertyDescriptor(globalThis,key)}));
  Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:dom.window});
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});
  let providerCalls=0;dom.window.freighterApi=new Proxy({},{get(){providerCalls++;throw Error('WalletMustNotBeInvoked');}}) as typeof dom.window.freighterApi;
  const calls:string[]=[],logs:string[]=[];
  const sensitive='OFFLINE_SENSITIVE_FIXTURE_NOT_A_REAL_PASSWORD';
  const consoleMocks=(['log','warn','error','debug','info'] as const).map(name=>mock.method(console,name,(...args:unknown[])=>{logs.push(args.map(String).join(' '));}));
  const fetchMock=mock.method(globalThis,'fetch',(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=String(input),method=init?.method??'GET';calls.push(method+' '+path);
    assert.equal(init?.credentials,'same-origin');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
    if(path==='/api/me'){
      if(state.profileStatus && state.profileStatus!==200)return Response.json({error:{code:'Unavailable',detail:sensitive}},{status:state.profileStatus});
      if(!state.active)return Response.json({error:{code:'AuthenticationRequired'}},{status:401});
      return Response.json({userId:'offline-fixture-user',source:state.source??'TESTNET',wallets:state.walletA===false?[]:[{id:'offline-wallet-link',address:WALLET_A,verifiedAt:'2026-01-01T00:00:00.000Z'}]});
    }
    if(path==='/auth/login'){
      assert.equal(method,'POST');assert.equal(new Headers(init?.headers).get('Content-Type'),'application/json');
      if(state.active && !state.loginStatus)return Response.json({error:{code:'LogoutFirst'}},{status:409});
      if(state.loginStatus && state.loginStatus!==200)return Response.json({error:{code:'LoginRejected',detail:sensitive}},{status:state.loginStatus});
      state.active=true;return Response.json({authenticated:true,source:'TESTNET'});
    }
    if(path==='/auth/logout'){
      assert.equal(method,'POST');assert.deepEqual(JSON.parse(init?.body as string),{});
      if(state.holdLogout)await state.holdLogout;
      if(state.logoutStatus && state.logoutStatus!==200){if(!state.keepSessionOnLogoutFailure)state.active=false;return Response.json({error:{code:'LogoutUnavailable',detail:sensitive}},{status:state.logoutStatus});}
      state.active=false;return Response.json({authenticated:false,source:'TESTNET'});
    }
    throw Error('UnexpectedEndpointDenied');
  }) as typeof fetch);
  const button=(id:string)=>document.getElementById(id) as HTMLButtonElement;
  const status=()=>document.getElementById('status')!.textContent!;
  const submit=()=>{
    (document.getElementById('email') as HTMLInputElement).value='fixture@example.invalid';
    (document.getElementById('password') as HTMLInputElement).value=sensitive;
    document.getElementById('login')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  };
  const ready=()=>until(()=>!status().startsWith('Inicia sesión para continuar') && (button('logout').disabled===!document.getElementById('wallets')!.textContent?.includes('VERIFICADA')));
  try{
    await import(new URL('../src/wallet-link-local/browser.ts?session='+ ++instance,import.meta.url).href);
    await ready();
    await work({document,calls,status,submit,logout:()=>button('logout').click(),ready,providerCalls:()=>providerCalls});
    assert.equal(providerCalls,0,'Session recovery must never invoke a wallet');
    assert.ok(!calls.some(c=>/challenge|verify|batteries|returns|reward/.test(c)));
    for(const output of [logs.join('\n'),status(),document.getElementById('wallets')!.textContent!]){
      assert.ok(!output.includes(sensitive),'Sensitive fixture value leaked');
      assert.ok(!output.includes('offline-fixture-user'),'Private user context must not be displayed');
    }
  }finally{
    fetchMock.mock.restore();for(const m of consoleMocks)m.mock.restore();
    for(const {key,descriptor} of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
    dom.window.close();
  }
}
function authenticated(document:Document){
  assert.match(document.getElementById('wallets')!.textContent!,/Wallet A: VERIFICADA/);
  assert.equal((document.getElementById('logout') as HTMLButtonElement).disabled,false);
  assert.equal((document.getElementById('login-button') as HTMLButtonElement).disabled,true);
}

test('D3-7G A: first normal login restores profile and clears password',()=>fixture({active:false},async ui=>{
  assert.deepEqual(ui.calls,['GET /api/me']);ui.submit();await until(()=>ui.status().startsWith('Sesión validada'));
  authenticated(ui.document);assert.equal((ui.document.getElementById('password') as HTMLInputElement).value,'');
  assert.deepEqual(ui.calls,['GET /api/me','POST /auth/login','GET /api/me']);
}));
test('D3-7G B: reload with active normal session restores me, no password grant',()=>fixture({active:true},async ui=>{
  authenticated(ui.document);assert.deepEqual(ui.calls,['GET /api/me']);assert.match(ui.status(),/Ya existe una sesión activa/);
}));
test('D3-7G C: repeat submit recovers real LogoutFirst code via me; logout enabled',()=>fixture({active:true},async ui=>{
  authenticated(ui.document);ui.submit();await until(()=>ui.calls.length===3 && !(ui.document.getElementById('logout') as HTMLButtonElement).disabled);
  authenticated(ui.document);assert.match(ui.status(),/Ya existe una sesión activa/);
  assert.deepEqual(ui.calls,['GET /api/me','POST /auth/login','GET /api/me']);
}));
test('D3-7G D: recoverable login error preserves current profile and logout',()=>fixture({active:true,loginStatus:503},async ui=>{
  ui.submit();await until(()=>ui.status().includes('perfil anterior se conserva'));authenticated(ui.document);
}));
test('D3-7G E: normal logout clears UI only after the response',async()=>{
  let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});
  await fixture({active:true,holdLogout:hold},async ui=>{
    ui.logout();assert.match(ui.document.getElementById('wallets')!.textContent!,/VERIFICADA/);
    assert.ok(ui.calls.includes('POST /auth/logout'));release();await until(()=>ui.status()==='Sesión local cerrada.');
    assert.equal(ui.document.getElementById('wallets')!.textContent,'');assert.equal((ui.document.getElementById('login-button') as HTMLButtonElement).disabled,false);
    assert.equal((ui.document.getElementById('logout') as HTMLButtonElement).disabled,true);
  });
});
test('D3-7G F: logout after repeat-login recovery works normally',()=>fixture({active:true},async ui=>{
  ui.submit();await until(()=>ui.calls.length===3 && !(ui.document.getElementById('logout') as HTMLButtonElement).disabled);
  ui.logout();await until(()=>ui.status()==='Sesión local cerrada.');assert.equal(ui.document.getElementById('wallets')!.textContent,'');
}));
for(const status of [401,403,503])test(`D3-7G G: profile restore ${status} fails closed to login state`,()=>fixture({active:true,profileStatus:status},async ui=>{
  assert.equal(ui.document.getElementById('wallets')!.textContent,'');assert.equal((ui.document.getElementById('login-button') as HTMLButtonElement).disabled,false);
  assert.equal((ui.document.getElementById('logout') as HTMLButtonElement).disabled,true);assert.deepEqual(ui.calls,['GET /api/me']);
}));
test('D3-7G H/I: wrong password creates no fake profile or sensitive output',()=>fixture({active:false,loginStatus:401},async ui=>{
  ui.submit();await until(()=>ui.status().startsWith('Login o perfil rechazado'));
  assert.equal(ui.document.getElementById('wallets')!.textContent,'');assert.equal((ui.document.getElementById('logout') as HTMLButtonElement).disabled,true);
  assert.equal((ui.document.getElementById('password') as HTMLInputElement).value,'');assert.deepEqual(ui.calls,['GET /api/me','POST /auth/login']);
}));
test('D3-7G J: restore without required A fails closed',()=>fixture({active:true,walletA:false},async ui=>{
  assert.equal(ui.document.getElementById('wallets')!.textContent,'');assert.equal((ui.document.getElementById('connect') as HTMLButtonElement).disabled,true);
}));
test('D3-7G K: restored session retains exact B target and never requests a wallet proof',()=>fixture({active:true},async ui=>{
  assert.equal(ui.document.querySelector('.address')!.textContent,TARGET);assert.match(ui.document.getElementById('wallets')!.textContent!,/Wallet B: PENDIENTE/);
  assert.equal((ui.document.getElementById('sign') as HTMLButtonElement).disabled,true);assert.equal(ui.providerCalls(),0);
}));
test('D3-7G: wrong source cannot restore a profile',()=>fixture({active:true,source:'MOCK'},async ui=>{
  assert.equal(ui.document.getElementById('wallets')!.textContent,'');assert.equal((ui.document.getElementById('connect') as HTMLButtonElement).disabled,true);
}));
test('D3-7G: unavailable logout keeps a still-valid session and logout available',()=>fixture({active:true,logoutStatus:503,keepSessionOnLogoutFailure:true},async ui=>{
  ui.logout();await until(()=>ui.status().startsWith('No se pudo confirmar el cierre'));authenticated(ui.document);
  assert.deepEqual(ui.calls,['GET /api/me','POST /auth/logout','GET /api/me']);
}));
test('D3-7G: remote logout uncertainty with missing local session does not claim remote success',()=>fixture({active:true,logoutStatus:503},async ui=>{
  ui.logout();await until(()=>ui.status().startsWith('Sesión local no disponible'));assert.match(ui.status(),/cierre remoto no confirmado/);
  assert.equal(ui.document.getElementById('wallets')!.textContent,'');
}));
test('D3-7G: expired session after a restored profile returns to login state',async()=>{
  const state:State={active:true};await fixture(state,async ui=>{
    state.active=false;state.loginStatus=401;ui.submit();await until(()=>ui.status().startsWith('Login o perfil rechazado'));
    assert.equal(ui.document.getElementById('wallets')!.textContent,'');assert.equal((ui.document.getElementById('logout') as HTMLButtonElement).disabled,true);
  });
});
test('D3-7G: LogoutFirst recovery with rejected me fails closed',async()=>{
  const state:State={active:true};await fixture(state,async ui=>{
    state.profileStatus=401;ui.submit();await until(()=>ui.status().startsWith('No se pudo restaurar'));
    assert.equal(ui.document.getElementById('wallets')!.textContent,'');assert.equal((ui.document.getElementById('connect') as HTMLButtonElement).disabled,true);
  });
});
test('D3-7G: password-grant success without profile A still cannot authenticate the UI',()=>fixture({active:false,walletA:false},async ui=>{
  ui.submit();await until(()=>ui.status().startsWith('Login o perfil rechazado'));
  assert.equal(ui.document.getElementById('wallets')!.textContent,'');assert.equal((ui.document.getElementById('connect') as HTMLButtonElement).disabled,true);
}));
test('D3-7G: unchanged real loopback server contract is login200, repeat409 LogoutFirst, me200, logout200',async()=>{
  let logins=0;const gateway={login:async()=>{logins++;return {bearer:'OFFLINE_FIXTURE_ONLY',expiresAt:Date.now()+60000};},logout:async()=>{},
    me:async()=>({status:200,body:{source:'TESTNET',wallets:[{address:WALLET_A}]}}),
    challenge:async()=>{throw Error('WalletMustNotBeInvoked');},verify:async()=>{throw Error('WalletMustNotBeInvoked');}};
  const {server,url}=await walletServer(gateway,{},{});
  try{
    const body=JSON.stringify({email:'fixture@example.invalid',password:'offline-fixture'}),headers={Origin:url,'Content-Type':'application/json'};
    const first=await fetch(url+'/auth/login',{method:'POST',headers,body});const cookie=first.headers.get('set-cookie')!.split(';')[0];await first.body?.cancel();
    assert.equal(first.status,200);const repeat=await fetch(url+'/auth/login',{method:'POST',headers:{...headers,Cookie:cookie},body});
    assert.equal(repeat.status,409);assert.equal((await repeat.json() as {error:{code:string}}).error.code,'LogoutFirst');assert.equal(logins,1);
    const me=await fetch(url+'/api/me',{headers:{Cookie:cookie}});assert.equal(me.status,200);await me.body?.cancel();
    const logout=await fetch(url+'/auth/logout',{method:'POST',headers:{...headers,Cookie:cookie},body:'{}'});assert.equal(logout.status,200);await logout.body?.cancel();
    const after=await fetch(url+'/api/me',{headers:{Cookie:cookie}});assert.equal(after.status,401);await after.body?.cancel();
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
