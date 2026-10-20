import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request as rawRequest} from 'node:http';
import {bridge,TARGET} from './bridge.mts';
import {close} from '../../backend/src/application/http.ts';
test('owner wallet bridge enforces origin/session/target and exposes no lifecycle route',async t=>{
  let issued=0,verified=0;
  const b=await bridge({challenge:async()=>{issued++;return {status:201,body:{source:'TESTNET',version:2}};},verify:async()=>{verified++;return {status:200,body:{verified:true,source:'TESTNET'}};}});
  try{
    const page=await fetch(b.url),cookie=page.headers.get('set-cookie')!.split(';')[0];
    assert.match(await page.text(),/BYETERY-INSTAWARD-USER-1/);assert.match(page.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);
    const post=(route:string,body:unknown,overrides:Record<string,string>={})=>fetch(b.url+route,{method:'POST',headers:{Origin:b.url,Cookie:cookie,'content-type':'application/json','idempotency-key':'wallet-bridge-test',...overrides},body:JSON.stringify(body),redirect:'error'});
    await t.test('owner UI compiles the approved adapter and exact shared message builder',async()=>{
      const js=await (await fetch(b.url+'/wallet-adapter.js')).text();
      assert.ok(js.includes('c.source !== "TESTNET"'));assert.ok(js.includes('signMessage(message'));assert.ok(js.includes('challengeText'));
      assert.equal((await fetch(b.url+'/wallet-message.js')).status,200);
    });
    await t.test('foreign origin and missing session cannot invoke the gateway',async()=>{
      assert.equal((await post('/wallet/challenge',{address:TARGET},{Origin:'https://example.com'})).status,403);
      assert.equal((await post('/wallet/challenge',{address:TARGET},{Cookie:''})).status,403);
      assert.equal(issued,0);
    });
    await t.test('host rebinding and target substitution fail closed',async()=>{
      // fetch normalizes Host to the URL; raw HTTP is needed to exercise rebinding.
      const rebound=await new Promise<number>((resolve,reject)=>{const r=rawRequest(b.url,{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode!);});r.on('error',reject);r.end();});
      assert.equal(rebound,403);
      assert.equal((await post('/wallet/challenge',{address:'G'+'A'.repeat(55)})).status,400);
      assert.equal((await post('/wallet/challenge',{address:TARGET,userId:'forged'})).status,400);
      assert.equal(issued,0);
    });
    await t.test('only owner-approved wallet endpoints reach the authenticated API gateway',async()=>{
      for(const route of ['/api/batteries','/api/batteries/BYE-000001/returns','/wallet/reward','/wallet/collection'])assert.equal((await post(route,{})).status,404);
      assert.equal((await post('/wallet/challenge',{address:TARGET})).status,201);assert.equal(issued,1);
      assert.equal((await post('/wallet/verify',{challengeId:'id',signature:'public-test-input',version:1})).status,400);assert.equal(verified,0);
      assert.equal((await post('/wallet/verify',{challengeId:'id',signature:'public-test-input'})).status,200);assert.equal(verified,1);
    });
  }finally{await close(b.server);}
});
