import {expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {TestnetReviewReader} from '@/server/direct-review/chain';
import {reviewHttp} from '@/server/direct-review/http';
import {CONTRACT,NETWORK_ID,type HistoryRow} from '@/shared/review/model';
import {ReviewBatteryView} from '@/components/review-view';
import {battery,reviewDeps} from './review-fixture';
import rpc from './fixtures/direct-review/rpc.json';
import horizon from './fixtures/direct-review/horizon.json';
import scenarios from './fixtures/b44-prep/scenarios.json';
const id='BYE-W1-002-64257020134D4A0F';
const b={...battery,batteryId:id};
const row:HistoryRow={operationId:'11111111-1111-4111-8111-111111111111',kind:'RECYCLED',status:'CONFIRMED',transactionHash:horizon.hash,ledger:horizon.ledger,
 createdAt:horizon.created_at,updatedAt:null,errorCode:null,revision:null,payloadHash:null,commitment:null,identityContract:CONTRACT,identityNetwork:NETWORK_ID,requestId:null};
function transport(body:unknown,retained=false){return vi.fn<typeof fetch>().mockImplementation(async(url,init)=>{
 if(String(url)==='https://soroban-testnet.stellar.org'){expect(JSON.parse(init?.body as string).method).toBe('getLedgerEntries');return Response.json(body);}
 if(String(url).startsWith('https://horizon-testnet.stellar.org/transactions/')){expect(init?.method).toBe('GET');return retained?Response.json(horizon):new Response(null,{status:404});}
 throw Error('UnexpectedOfflineFixtureURL');
});}
for(const name of ['STATE_EXPIRED','NETWORK_RESET','MISSING_INSTANCE_WITHOUT_RESET_PROOF'] as const)
 it('PREP D2-S1 '+name+' preserves persisted lifecycle; no absent-battery inference',async()=>{
  const copy=structuredClone(rpc);
  if(name==='STATE_EXPIRED')copy.result.entries=copy.result.entries.slice(0,2);
  if(name==='NETWORK_RESET'){copy.result.latestLedger=scenarios.NETWORK_RESET.latestLedger;copy.result.entries=[];}
  if(name==='MISSING_INSTANCE_WITHOUT_RESET_PROOF')copy.result.entries=copy.result.entries.slice(1);
  const fetchStub=transport(copy),reader=new TestnetReviewReader(fetchStub);
  const f=reviewDeps();f.deps.chain=reader;f.deps.database.battery=async()=>b;
  const r=await reviewHttp(new Request('https://byetery-unit.vercel.app/api/batteries/'+id),f.deps),v=await r.json();
  const expected=name==='NETWORK_RESET'?'NETWORK_RESET':'STATE_EXPIRED';
  expect(r.status).toBe(200);expect(v.networkVerification.status).toBe(expected);
  expect(v.confirmedBatteryState).toBe('RECYCLED');expect(v.confirmedRewardState).toBe('SENT');
  expect(JSON.stringify(v)).not.toContain('NotFound');expect(fetchStub).toHaveBeenCalledTimes(1);
  render(<ReviewBatteryView battery={v} verification={v.networkVerification}/>);
  expect(screen.getByText(expected)).toBeTruthy();expect(screen.getByText('RECYCLED')).toBeTruthy();expect(screen.queryByText('Sin estado confirmado')).toBeNull();
 });
it('PREP D2-S1 NOT_RETAINED with valid local contract state remains uncertain, not NotFound',async()=>{
 const fetchStub=transport(rpc),f=reviewDeps();f.deps.chain=new TestnetReviewReader(fetchStub);f.deps.database.battery=async()=>b;f.deps.database.history=async()=>({entries:[row]});
 const r=await reviewHttp(new Request('https://byetery-unit.vercel.app/api/batteries/'+id+'/history'),f.deps),v=await r.json();
 expect(r.status).toBe(200);expect(v.networkVerification.status).toBe('VERIFIED');
 expect(v.entries[0].verification).toMatchObject({status:'RETENTION_UNAVAILABLE',reason:'NOT_RETAINED_BY_HORIZON'});
 expect(v.entries[0].status).toBe('CONFIRMED');expect(v.entries[0].transactionHash).toBe(horizon.hash);expect(fetchStub).toHaveBeenCalledTimes(2);
 expect(JSON.stringify(v)).not.toContain('NotFound');
});
