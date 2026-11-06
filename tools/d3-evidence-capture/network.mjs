import {local,SPEC,check,provenance,CaptureError} from './common.mjs';
const RPC='https://soroban-testnet.stellar.org',HORIZON='https://horizon-testnet.stellar.org';
const methods=new Set(['getNetwork','getTransaction','getLedgerEntries','getLedgers','getLatestLedger']);
export class PublicReads {
 constructor(fetcher=fetch){local();this.fetcher=fetcher;this.calls=[];}
 async #read(url,options){local();const u=new URL(url);check(u.protocol==='https:'&&[new URL(RPC).host,new URL(HORIZON).host].includes(u.host)&&!u.username&&!u.password&&!u.hash,'ENDPOINT_DENIED');
 let response;try{response=await this.fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000),credentials:'omit'});}catch{throw new CaptureError('PUBLIC_READ_UNAVAILABLE');}
 check(response.ok&&response.body,'PUBLIC_READ_UNAVAILABLE');let n=0;const chunks=[];for await(const c of response.body){n+=c.length;check(n<=SPEC.maxBytes,'RESPONSE_TOO_LARGE');chunks.push(c);}
 const raw=Buffer.concat(chunks);let value;try{value=JSON.parse(raw.toString('utf8'));}catch{throw new CaptureError('INVALID_PUBLIC_JSON');}
 return {value,raw,provenance:{source:u.host===new URL(RPC).host?'RPC':'HORIZON',url,method:options.method,http:response.status,observedAt:new Date().toISOString(),contentType:response.headers.get('content-type')}};
 }
 async rpc(method,params={}){check(methods.has(method),'RPC_METHOD_DENIED');this.calls.push(method);const r=await this.#read(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});check(r.value.jsonrpc==='2.0'&&r.value.id===1&&!r.value.error&&r.value.result,'RPC_REJECTED');return {...r,value:r.value.result};}
 horizon(path){check(/^\/(?:transactions\/[a-f0-9]{64}|ledgers\/[1-9][0-9]*)$/.test(path),'HORIZON_PATH_DENIED');return this.#read(HORIZON+path,{method:'GET',headers:{accept:'application/json'}});}
}
