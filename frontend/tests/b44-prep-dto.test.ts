// @vitest-environment node
import {expect,it} from 'vitest';
import type {Pool} from 'pg';
import {PgReviewDatabase} from '@/server/direct-review/database';
import {reviewHttp} from '@/server/direct-review/http';
import {DEPLOYMENT, type HistoryRow} from '@/shared/review/model';
import {battery,post,profile,reviewDeps} from './review-fixture';
const origin='https://byetery-unit.vercel.app';
const marker='LOCAL_PRIVATE_DIAGNOSTIC_DO_NOT_EXPOSE';
const poison={command:marker,envelope_xdr:marker,signer:marker,secret:marker,private_key:marker,rawSqlError:marker,stack:marker,transport_details:marker};
function bounded(value:unknown){
 if(value&&typeof value==='object')for(const [key,v] of Object.entries(value)){
  expect(key).not.toMatch(/command|xdr|signer|secret|private[_-]?key|raw.*error|stack|transport/i);bounded(v);
 }
 expect(JSON.stringify(value)).not.toContain(marker);
}
for(const role of ['USER','ADMIN','COLLECTOR','RECYCLER'] as const)it('PREP profile DTO whitelist '+role,async()=>{
 const f=reviewDeps();f.deps.database.profile=async()=>({...profile,roles:[role],canCreateIntent:false});
 const r=await reviewHttp(new Request(origin+'/api/me'),f.deps),v=await r.json();
 expect(r.status).toBe(200);expect(Object.keys(v).sort()).toEqual(['roles','canCreateIntent','batteries','source','deploymentId'].sort());bounded(v);
});
it('PREP battery top-level projection discards non-DTO command/XDR/secret/error fields',async()=>{
 const f=reviewDeps();f.deps.database.battery=async()=>({...battery,...poison});
 const r=await reviewHttp(new Request(origin+'/api/batteries/'+battery.batteryId),f.deps),v=await r.json();
 expect(r.status).toBe(200);expect(v.confirmedBatteryState).toBe('RECYCLED');expect(v.confirmedRewardState).toBe('SENT');bounded(v);
 expect(v).not.toHaveProperty('confirmedLedger');
});
it('PREP public history removes internal identity/request and injected non-DTO fields',async()=>{
 const f=reviewDeps();const row={operationId:f.id,kind:'RECYCLED',status:'CONFIRMED',transactionHash:null,ledger:null,
  createdAt:'2026-10-31T00:00:00Z',updatedAt:null,errorCode:null,revision:null,payloadHash:null,commitment:null,
  identityContract:'LOCAL_INTERNAL_CONTRACT',identityNetwork:'LOCAL_INTERNAL_NETWORK',requestId:'LOCAL_INTERNAL_REQUEST',...poison} as HistoryRow;
 f.deps.database.history=async()=>({entries:[row]});
 const r=await reviewHttp(new Request(origin+'/api/batteries/'+battery.batteryId+'/history'),f.deps),v=await r.json();
 expect(r.status).toBe(200);bounded(v);for(const key of ['identityContract','identityNetwork','requestId'])expect(v.entries[0]).not.toHaveProperty(key);
 expect(v.entries[0]).toHaveProperty('verification');expect(v.deploymentId).toBe(DEPLOYMENT);
});
for(const phase of ['profile','battery','history','create','intent'] as const)it('PREP raw backend exception redaction '+phase,async()=>{
 const f=reviewDeps();f.deps.database[phase]=async()=>{throw Object.assign(new Error(marker),{stack:marker,command:marker});};
 const path=phase==='profile'?'/api/me':phase==='create'?'/api/review/registration-intents':phase==='intent'?'/api/review/registration-intents/'+f.id:'/api/batteries/'+battery.batteryId+(phase==='history'?'/history':'');
 const r=await reviewHttp(phase==='create'?post(path):new Request(origin+path),f.deps),v=await r.json();
 expect(r.status).toBe(500);expect(v.error.code).toBe('InternalError');expect(v.error.requestId).toBeTypeOf('string');bounded(v);
});
for(const [code,status,expected] of [['42501',403,'ReviewAccessDisabled'],['P0002',404,'NotFound'],['23505',409,'ReviewIntentConflict'],['08006',503,'ReviewDataUnavailable']] as const)
 it('PREP actual DB adapter sanitizes SQL diagnostics '+code,async()=>{
  const f=reviewDeps();const pool={connect:async()=>({query:async()=>{throw {code,message:marker,stack:marker,detail:marker};},release:()=>{}})} as unknown as Pool;
  f.deps.database=new PgReviewDatabase(pool);const r=await reviewHttp(new Request(origin+'/api/me'),f.deps),v=await r.json();
  expect(r.status).toBe(status);expect(v).toEqual({error:{code:expected}});bounded(v);
 });
it('PREP write connection uncertainty remains OutcomeUnknown without raw transport diagnostics',async()=>{
 const f=reviewDeps();const pool={connect:async()=>({query:async()=>{throw {code:'08006',message:marker};},release:()=>{}})} as unknown as Pool;
 f.deps.database=new PgReviewDatabase(pool);const r=await reviewHttp(post(),f.deps),v=await r.json();
 expect(r.status).toBe(503);expect(v).toEqual({error:{code:'OutcomeUnknown'}});bounded(v);
});
