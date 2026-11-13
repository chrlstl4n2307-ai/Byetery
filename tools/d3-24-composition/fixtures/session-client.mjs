import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { prepareCompositionSessions } from '../session-wrapper.mjs';
import { RUN1 } from '../../d3-24-ratification/identity.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const origin = process.env.REVIEW_LOOPBACK;
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
const checked = [], phases = [];
const check = async (name, fn) => { await fn(); checked.push(name); };
const post = async (path, body) => { const r = await fetch(origin + path, {method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify(body)}); return {status:r.status,body:await r.json()}; };
const state = async () => (await fetch(origin + '/state')).json();
let headers;
const proxy = {
  async prepare(h) { headers=h;const r=await post('/prepare',{headers:h});if(r.status!==200)throw Error(r.body.code);return r.body; },
  async admit(id,input) {const r=await post('/admit',{id,...input});if(r.status!==200)throw Error(r.body.code);return r.body;},
  async checkAdmission(ack) {const r=await post('/admission-check',{ack});if(r.status!==200)throw Error(r.body.code);},
};
const fetcher=async(input,init)=>{const u=new URL(String(input));
  if(u.origin==='https://aemxuqnnwfclzrwwiqfd.supabase.co')return fetch(origin+u.pathname+u.search,init);
  assert.equal(u.origin,origin);return fetch(input,init);};
async function prepare(control=proxy){const phase=await prepareCompositionSessions({root,operatorRoot:resolve(root,'../B24repair-op'),
  apiOrigin:origin,publishableKey:'sb_publishable_fixture',fetcher,control,
  credentials:async role=>({email:role.toLowerCase()+'@synthetic.invalid',password:'synthetic-only'})});phases.push(phase);return phase;}
try {
 const initial=await prepare();
 await check('WRAPPER_OPERATOR_SERVER_SAME_FOUR_SESSIONS',async()=>{
   assert.equal(initial.summary.operatorSha,RUN1.businessSha);assert.equal(initial.summary.planHash,RUN1.planHash);
   assert.match(initial.summary.identityDigest,/^[a-f0-9]{64}$/);const s=await state();assert.equal(s.logins,4);assert(s.authReads>=8);});
 await check('PHASE_A_NO_BUSINESS_OR_ADMISSION',async()=>{const s=await state();assert.equal(s.operations,0);assert.equal(s.admissions,0);assert.equal(s.steps,0);});
 await check('OPERATOR_OPTIONS_REQUIRE_PHASE_B',async()=>assert.throws(()=>initial.operatorBindings(async()=>''),/D324_ADMISSION_REQUIRED/));
 await check('NO_TOKENS_IN_PUBLIC_SUMMARY',async()=>assert.doesNotMatch(JSON.stringify(initial.summary),/Bearer|eyJ|password|email|authUserId|sessionId/));
 await check('BAD_SERVER_RECEIPT_DIGEST_REJECTED',async()=>await assert.rejects(prepare({...proxy,prepare:async h=>({...await proxy.prepare(h),identityDigest:'0'.repeat(64)})}),/OperatorSessionPreparationStopped/));
 await check('MISSING_SESSION_REJECTED',async()=>{const h={...headers};delete h.RECYCLER;assert.equal((await post('/prepare',{headers:h})).status,403);});
 await check('INVALID_SIGNED_TOKEN_REJECTED',async()=>{assert.equal((await post('/prepare',{headers:{...headers,USER:headers.USER.slice(0,-8)+'AAAAAAAA'}})).status,401);});
 const restored=await prepare();
 await check('WRONG_ROLE_REJECTED',async()=>assert.equal((await post('/prepare',{headers:{...headers,USER:headers.ADMIN}})).status,403));
 await check('HANDLE_ALONE_CANNOT_SKIP_AUTHORITY',async()=>{const p=await prepare();await assert.rejects(p.admit({fault:'live'}),/D324/);});
 await check('REJECTED_PHASE_B_IS_SINGLE_ATTEMPT',async()=>{await assert.rejects(phases.at(-1).admit({}),/D324_SESSION_ADMISSION_CONSUMED/);});
 await check('MISSING_MANIFEST_REJECTED',async()=>{const p=await prepare();await assert.rejects(p.admit({fault:'manifest'}),/D324/);});
 await check('REVOKED_SESSION_BETWEEN_PHASES_REJECTED',async()=>{const p=await prepare();await post('/fault',{kind:'revoke'});await assert.rejects(p.admit({}),/D324/);await post('/fault',{kind:'restore'});});
 await check('SHORTEST_SQL_EXPIRY_RECHECKED',async()=>{const p=await prepare();await post('/fault',{kind:'shorten'});await assert.rejects(p.admit({}),/D324/);await post('/fault',{kind:'restore'});});
 await check('SERVER_CONTROL_RESTART_INVALIDATES_HANDLE',async()=>{await post('/restart-control',{});await assert.rejects(restored.admit({}),/D324_SESSION_HANDLE_REJECTED/);});
 await check('PREPARATION_CANNOT_REGISTER_RESERVED_BATTERY',async()=>{const p=await prepare();const r=await fetch(origin+'/api/batteries',{method:'POST',headers:{authorization:headers.ADMIN,'content-type':'application/json','idempotency-key':'composition-only'},body:JSON.stringify({batteryId:RUN1.batteryId})});assert.equal(r.status,403);assert.equal((await state()).operations,0);});
 const good=await prepare();
 let admitted;
 await check('PHASE_B_INDEPENDENT_SERVER_ADMISSION_ONCE',async()=>{admitted=await good.admit({});assert.match(admitted.admissionId,/^[a-f0-9-]{36}$/);assert.equal((await state()).admissions,1);});
 await check('ACK_DIGEST_MUST_MATCH_DURABLE_FOUR_SESSIONS',async()=>await assert.rejects(proxy.checkAdmission({...admitted,
   taskId:RUN1.taskId,operatorSha:RUN1.businessSha,planHash:RUN1.planHash,identityDigest:'0'.repeat(64)}),/D324_ADMISSION_IDENTITY_REJECTED/));
 await check('CLIENT_REUSE_AND_SERVER_REPLAY_REJECTED',async()=>{await assert.rejects(good.admit({}),/D324_SESSION_ADMISSION_CONSUMED/);await assert.rejects(proxy.admit(good.summary.id,{}),/D324_SESSION_HANDLE_REJECTED/);});
 const bindings=good.operatorBindings(async()=> 'synthetic-proof');
 await check('OPERATOR_BOUND_TO_EXACT_ADMISSION_AND_SCOPE',async()=>{await bindings.d324Proofs.assertAdmission({taskId:RUN1.taskId,operatorSha:RUN1.businessSha,planHash:RUN1.planHash,batteryId:RUN1.batteryId,recipient:RUN1.recipient});await assert.rejects(bindings.d324Proofs.assertAdmission({taskId:'D3-23-RUN1'}),/D324_ADMISSION_IDENTITY_REJECTED/);assert.equal(bindings.preparedSessions.prepared,true);});
 await check('DURABLE_DUPLICATE_ADMISSION_REJECTED',async()=>{const p=await prepare();await assert.rejects(p.admit({}),/D324/);assert.equal((await state()).admissions,1);assert.equal((await state()).operations,0);});
 await good.close();
 await check('CLOSE_PREVENTS_LATER_PROOF_OR_REUSE',async()=>await assert.rejects(bindings.d324Proofs.proofFor({}),/D324_SESSION_CLOSED/));
 console.log(JSON.stringify({COMPOSITION_SESSION_BINDING:'PASS',checks:checked.length,cases:checked,source:'SYNTHETIC_LOOPBACK',realAuthSessions:0,realAdmissions:0,businessOperations:0}));
} catch(e){console.log(JSON.stringify({COMPOSITION_SESSION_BINDING:'FAIL',completed:checked.length,last:checked.at(-1),code:e.code??e.message}));process.exitCode=1;}
finally {for(const p of phases)await p.close().catch(()=>{});}
