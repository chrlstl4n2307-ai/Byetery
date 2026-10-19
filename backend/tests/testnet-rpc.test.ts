import test from 'node:test';
import assert from 'node:assert/strict';
import { Networks } from '@stellar/stellar-sdk';
import { TestnetRpc,TESTNET_RPC } from '../src/testnet/rpc.ts';
const response=(result:unknown)=>new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}));
test('real RPC is fixed to Testnet and rejects another network',async()=>{
  const client=new TestnetRpc(async(url,init)=>{assert.equal(url,TESTNET_RPC);assert.equal(init?.redirect,'error');return response({passphrase:Networks.PUBLIC});});
  await assert.rejects(client.network(),/WrongNetwork/);
});
test('RPC ledger projection drops provider metadata and signed envelopes',async()=>{
  const client=new TestnetRpc(async()=>response({sequence:1,closeTime:'1',id:'abc',protocolVersion:'29',metadataXdr:'unrelated-public-envelope',headerXdr:'private-large-data'}));
  assert.deepEqual(await client.latest(),{sequence:1,closeTime:'1',id:'abc',protocolVersion:'29'});
});
test('RPC errors, outages and invalid JSON are sanitized',async()=>{
  for(const transport of [async()=>{throw Error('sensitive-provider-data');},async()=>new Response('sensitive-provider-data'),
    async()=>new Response(JSON.stringify({jsonrpc:'2.0',id:1,error:{message:'sensitive-provider-data'}}))]){
    const client=new TestnetRpc(transport);
    await assert.rejects(client.latest(),e=>/RpcUnavailable|RpcRejected/.test(String(e))&&!String(e).includes('sensitive-provider-data'));
  }
});
test('RPC response size is bounded',async()=>{
  const client=new TestnetRpc(async()=>new Response('x'.repeat(8*1024*1024+1)));
  await assert.rejects(client.latest(),/RpcResponseTooLarge/);
});
test('transaction evidence keeps original hash and omits envelope/auth diagnostics',async()=>{
  const h='01'.repeat(32);const client=new TestnetRpc(async(_url,init)=>{
    const request=JSON.parse(String(init?.body));assert.equal(request.params.hash,h);
    return response({status:'SUCCESS',txHash:h,ledger:2,latestLedger:3,latestLedgerCloseTime:10,resultXdr:'result',resultMetaXdr:'meta',envelopeXdr:'sensitive',diagnosticEventsXdr:['auth']});
  });
  const result=await client.transaction(h);assert.equal(result.txHash,h);assert.ok(!JSON.stringify(result).includes('sensitive'));assert.ok(!('envelopeXdr' in result));
});
