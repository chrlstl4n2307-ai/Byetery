import { randomBytes } from 'node:crypto';
import { fixture,evidence } from './dev-fixture.ts';
import { requireThat } from './errors.ts';
let f: Awaited<ReturnType<typeof fixture>>|undefined;
try {
  f=await fixture(); const {a,admin,collector,recycler}=f.users;
  const id='BYE-'+randomBytes(8).toString('hex').toUpperCase();
  await f.wallet(a);
  const registered=await f.call(admin,'POST','/api/batteries',{batteryId:id,metadata:{demo:true}});
  requireThat(registered.status===201 && registered.body.confirmedBatteryState==='REGISTERED',500,'DemoRegistrationFailed');
  const returned=await f.call(a,'POST',`/api/batteries/${id}/returns`,{});
  requireThat(returned.status===201 && returned.body.confirmedBatteryState==='RETURNED',500,'DemoReturnFailed');
  const rid=returned.body.requestId;
  const collected=await f.call(collector,'POST',`/api/returns/${rid}/collection`,evidence(id,rid,'COLLECTION'));
  requireThat(collected.status===200 && collected.body.confirmedBatteryState==='COLLECTED',500,'DemoCollectionFailed');
  const recycled=await f.call(recycler,'POST',`/api/returns/${rid}/recycling`,evidence(id,rid,'RECYCLING'));
  requireThat(recycled.status===200 && recycled.body.confirmedRewardState==='PENDING',500,'DemoRecyclingFailed');
  const paid=await f.call(a,'POST',`/api/batteries/${id}/reward`,{});
  requireThat(paid.status===200 && paid.body.confirmedRewardState==='SENT',500,'DemoPaymentFailed');
  console.log(`${id}\n\nREGISTERED ✓\nRETURNED   ✓\nCOLLECTED  ✓\nRECYCLED   ✓\n\nReward:\nSENT\n10 GREEN-TEST\n\nSource:\nMOCK\n\nDatabase:\nSUPABASE DEV`);
} catch {console.error('API demo failed; no credentials or internal errors printed.');process.exitCode=1;}
finally {try {await f?.cleanup();}catch{console.error('DEV cleanup incomplete; retain run records for investigation.');process.exitCode=1;}}
