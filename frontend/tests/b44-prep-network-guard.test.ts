// @vitest-environment node
import {execFileSync} from 'node:child_process';
import {expect,it} from 'vitest';
it('PREP deny-only instrumentation blocks remote fetch, HTTP, sockets and DNS before transport',()=>{
 const guard=new URL('../../scripts/instaward/b44-prep-network-guard.mjs',import.meta.url).href;
 const code=`
 import https from 'node:https';import net from 'node:net';import dns from 'node:dns';
 const outcomes=[];const expectBlock=async(fn)=>{try{await fn();outcomes.push('NOT_BLOCKED');}catch(e){outcomes.push(e.code);}};
 await expectBlock(()=>fetch('https://control.example.invalid'));
 await expectBlock(()=>https.get('https://control.example.invalid'));
 await expectBlock(()=>net.connect({host:'control.example.invalid',port:443}));
 await expectBlock(()=>dns.promises.lookup('control.example.invalid'));
 console.log(JSON.stringify(outcomes));`;
 const result=execFileSync(process.execPath,['--import='+guard,'--input-type=module','-e',code],{encoding:'utf8',env:process.env});
 expect(JSON.parse(result.trim())).toEqual(['B44_OFFLINE','B44_OFFLINE','B44_OFFLINE','B44_OFFLINE']);
});
