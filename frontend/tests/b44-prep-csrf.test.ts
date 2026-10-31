// @vitest-environment node
import {expect,it} from 'vitest';
import {reviewConfiguration} from '@/server/direct-review/config';
import {reviewHttp} from '@/server/direct-review/http';
import {DEPLOYMENT} from '@/shared/review/model';
import {post,reviewDeps} from './review-fixture';
const origin='https://byetery-unit.vercel.app';
function env():Record<string,string|undefined>{return {
 BYETERY_REVIEW_ADAPTER:'DIRECT_REVIEW',BYETERY_WEB_ENV:'D2_PREVIEW',BYETERY_SOURCE:'TESTNET',BYETERY_DEPLOYMENT_ID:DEPLOYMENT,
 BYETERY_WEB_ORIGIN:origin,BYETERY_ALLOWED_WEB_ORIGINS:JSON.stringify([origin]),VERCEL_ENV:'preview',
 VERCEL_GIT_COMMIT_REF:'instaward/d2-web-mvp',VERCEL_URL:'byetery-unit.vercel.app',
 SUPABASE_URL:'https://aemxuqnnwfclzrwwiqfd.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_UNIT_ONLY'};}
it('PREP exact allowed origin proceeds; no network transaction implied',async()=>{
 const f=reviewDeps();expect(reviewConfiguration(env()).origins).toEqual([origin]);
 expect((await reviewHttp(post(),f.deps)).status).toBe(202);expect(f.calls.chain).toBe(0);
});
for(const path of ['/auth/login','/auth/logout','/api/review/registration-intents'])
 for(const attack of ['missing-origin','cross-origin','malformed-origin','missing-fetch-site','cross-site','bad-host'] as const)
 it('PREP CSRF zero-effect rejection '+path+' '+attack,async()=>{
  const f=reviewDeps(),h=new Headers({'Origin':origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','Idempotency-Key':'B44-LOCAL-ONLY'});
  if(attack==='missing-origin')h.delete('origin');
  if(attack==='cross-origin')h.set('origin','https://cross-origin.example.invalid');
  if(attack==='malformed-origin')h.set('origin','not-an-origin');
  if(attack==='missing-fetch-site')h.delete('sec-fetch-site');
  if(attack==='cross-site')h.set('sec-fetch-site','cross-site');
  const loginCalls:string[]=[];f.deps.login=async()=>{loginCalls.push('login');};f.deps.logout=async()=>{loginCalls.push('logout');};
  const request=new Request((attack==='bad-host'?'https://wrong-host.example.invalid':origin)+path,{method:'POST',headers:h,body:JSON.stringify(path==='/auth/login'?{email:'fixture@example.invalid',password:'test-only-password'}:path==='/auth/logout'?{}:{templateVersion:1})});
  const r=await reviewHttp(request,f.deps);expect(r.status).toBe(403);expect(await r.json()).toEqual({error:{code:'OriginRejected'}});
  expect(f.calls).toEqual({sql:0,chain:0,auth:0});expect(loginCalls).toEqual([]);
 });
for(const variant of ['missing-all-runtime-urls','inconsistent-runtime-url','malformed-runtime-url','unapproved-host'] as const)
 it('PREP ambiguous platform configuration fails closed: '+variant,()=>{
  const e=env();
  if(variant==='missing-all-runtime-urls'){delete e.VERCEL_URL;delete e.VERCEL_BRANCH_URL;}
  if(variant==='inconsistent-runtime-url')e.VERCEL_URL='other-project.vercel.app';
  if(variant==='malformed-runtime-url')e.VERCEL_URL='https://byetery-unit.vercel.app/path';
  if(variant==='unapproved-host')e.BYETERY_WEB_ORIGIN='https://unapproved.vercel.app';
  expect(()=>reviewConfiguration(e)).toThrowError(expect.objectContaining({status:503,code:'ConfigurationUnavailable'}));
 });
it('PREP missing primary VERCEL_URL may use the existing exact branch-URL fallback',()=>{
 const e=env();delete e.VERCEL_URL;e.VERCEL_BRANCH_URL='byetery-unit.vercel.app';
 expect(reviewConfiguration(e).origins).toEqual([origin]);
});
