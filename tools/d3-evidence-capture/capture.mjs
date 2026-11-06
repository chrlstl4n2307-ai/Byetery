import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {SPEC,check,bytes,canonical,hash,provenance,local} from './common.mjs';
import {scanRaw,sanitize} from './sanitizer.mjs';
import {verifyTx} from './verifier.mjs';
import {ledgerEntry,X,classify,rewardPoolKey,identity} from './xdr-reader.mjs';
import {PublicReads} from './network.mjs';
import {readSqlReceipt} from './sql-readonly.mjs';
import {writeBundle,verifyBundle} from './inventory.mjs';
export function validateRun(run,steps){check(run&&/^(?:RUN[123]|HISTORICAL-[A-Z0-9-]+)$/.test(run.runId)&&typeof run.retired==='boolean','INVALID_RUN_CONTEXT');check(steps.length>0&&steps.length<=5,'INVALID_RUN_CONTEXT');const names=steps.map(s=>s.method);check(run.runId==='HISTORICAL-SINGLE-TX'?steps.length===1&&SPEC.methods.includes(names[0]):names.every((n,i)=>n===SPEC.methods[i]),'INVALID_STEP_ORDER');
 const historical=steps.some(s=>s.batteryId===SPEC.retiredBattery);check(!historical||run.retired,'HISTORICAL_RUN_MUST_BE_RETIRED');
 const complete=steps.length===5&&steps.every(s=>s.confirmed);
 check(new Set(steps.map(s=>s.batteryId)).size===1,'MIXED_LIFECYCLE');
 check(steps.slice(0,-1).every(s=>s.confirmed),'STEP_AFTER_FAILED_ATTEMPT');
 const requests=steps.filter(s=>s.method!=='register_battery'&&s.requestId).map(s=>s.requestId);
 check(new Set(requests).size<=1,'MIXED_REQUEST');
 check(!complete||requests.length===4,'MISSING_REQUEST_CONTEXT');
 check(new Set(steps.filter(s=>s.hash).map(s=>s.hash)).size===steps.filter(s=>s.hash).length,'DUPLICATE_TRANSACTION');
 check(!run.complete||(!run.retired&&complete),'PARTIAL_RUN_MARKED_COMPLETE');
 return {runId:run.runId,status:run.retired||!complete?'RUN_RETIRED_OR_STOPPED':'COMPLETE',counting:!run.retired&&complete};
}
export async function collect(input,reader=new PublicReads(),sqlReader=readSqlReceipt){local();check(input&&input.expected&&/^[a-f0-9]{64}$/.test(input.expected.hash),'INVALID_CAPTURE_INPUT');
 const network=await reader.rpc('getNetwork');check(network.value.passphrase===SPEC.network,'WRONG_NETWORK');
 const tx=await reader.rpc('getTransaction',{hash:input.expected.hash});
 check(['SUCCESS','FAILED','NOT_FOUND'].includes(tx.value.status),'UNKNOWN_RPC_STATUS');
 if(tx.value.status!=='SUCCESS')return {network:network.value,rpc:tx.value,expected:input.expected,provenance:tx.provenance,attemptOnly:true};
 const horizon=await reader.horizon('/transactions/'+input.expected.hash),hl=await reader.horizon('/ledgers/'+tx.value.ledger),rl=await reader.rpc('getLedgers',{startLedger:tx.value.ledger,pagination:{limit:1}});
 const rpcl=rl.value.ledgers?.[0];check(rpcl,'MISSING_RPC_LEDGER');
 let sql=null,sqlProvenance=null;
 try{const r=await sqlReader(input.expected.hash);sql=r.value;sqlProvenance=r.provenance;}catch(e){if(e?.code!=='BLOCKED_PENDING_READONLY_CREDENTIAL')throw e;}
 // Only needed ledger-header data is retained, not unrelated ledger transaction metadata.
 const rpcLedger={sequence:rpcl.sequence,hash:rpcl.hash??rpcl.id,headerXdr:rpcl.headerXdr,ledgerCloseTime:rpcl.ledgerCloseTime};
 const data={network:network.value,rpc:tx.value,horizon:horizon.value,horizonLedger:hl.value,rpcLedger,expected:input.expected,provenance:tx.provenance,sql,sqlProvenance,
 sources:{network:network.provenance,rpc:tx.provenance,horizon:horizon.provenance,horizonLedger:hl.provenance,rpcLedger:rl.provenance}};
 const verified=verifyTx(data);
 const keys=[...new Set([...verified.id.footprint,...verified.meta.entries,{...classify(rewardPoolKey()),keyXdr:rewardPoolKey().toXDR('base64')}].filter(k=>k.ttlEligible||k.kind==='classic trustline').map(k=>k.keyXdr))];
 const current=[];for(let i=0;i<keys.length;i+=24){const subset=keys.slice(i,i+24),r=await reader.rpc('getLedgerEntries',{keys:subset});for(const key of subset)current.push(ledgerEntry(key,r.value.entries?.find(e=>e.key===key),r.value.latestLedger,r.provenance.observedAt));}
 data.ledgerEntries=current;return data;
}
export function bundleArtifacts(data,prefix=''){provenance(data.provenance);const prov=data.provenance,artifacts=[];
 const add=(path,value,p=prov,raw=true)=>{const body=Buffer.isBuffer(value)?value:bytes(value);scanRaw(body);artifacts.push({path:prefix+path,data:body,provenance:p,rawPublic:raw,classification:raw?'RAW_PUBLIC_CHAIN':'SANITIZED_DERIVED'});};
 const localProv={source:'LOCAL_DERIVED',observedAt:prov.observedAt};
 if(data.attemptOnly){check(['FAILED','NOT_FOUND'].includes(data.rpc.status),'UNKNOWN_RPC_STATUS');check(!data.rpc.txHash||data.rpc.txHash===data.expected.hash,'WRONG_TX_HASH');
  let identityStatus='NOT_AVAILABLE';if(data.rpc.envelopeXdr){identity(data.rpc.envelopeXdr,{...data.expected,networkPassphrase:data.network.passphrase});identityStatus='PASS';add('envelope.xdr',Buffer.from(data.rpc.envelopeXdr,'base64'));}
  if(data.rpc.resultXdr){const result=X.TransactionResult.fromXDR(data.rpc.resultXdr,'base64');check(data.rpc.status!=='FAILED'||result.result.type!=='txSuccess','RPC_RESULT_MISMATCH');add('result.xdr',Buffer.from(data.rpc.resultXdr,'base64'));}
  if(data.rpc.resultMetaXdr)add('result-meta.xdr',Buffer.from(data.rpc.resultMetaXdr,'base64'));
  add('rpc-transaction.json',data.rpc);add('transaction.json',{expected:data.expected,networkPassphrase:data.network.passphrase},localProv,false);add('verification.json',{status:'UNCONFIRMED_ATTEMPT',reportedStatus:data.rpc.status,TX_IDENTITY_VERIFIED:identityStatus,inclusion:'UNVERIFIED',counting:false,method:data.expected.method,hash:data.expected.hash},localProv,false);return {artifacts,summary:{method:data.expected.method,batteryId:data.expected.batteryId,confirmed:false,requestId:data.expected.requestId??null,hash:data.expected.hash,sqlCrosscheck:'NOT_APPLICABLE'}};}
 const v=verifyTx(data),r=data.rpc,sources=data.sources??{};
 add('envelope.xdr',Buffer.from(r.envelopeXdr,'base64'));add('result.xdr',Buffer.from(r.resultXdr,'base64'));add('result-meta.xdr',Buffer.from(r.resultMetaXdr,'base64'));
 add('events.json',r.events??{});add('ledger-header.xdr',Buffer.from(data.horizonLedger.header_xdr,'base64'),sources.horizonLedger??prov);
 add('rpc-transaction.json',r,sources.rpc??prov);add('horizon-transaction.json',data.horizon,sources.horizon??prov);add('horizon-ledger.json',data.horizonLedger,sources.horizonLedger??prov);
 add('rpc-ledger.json',data.rpcLedger??{status:'NOT_CAPTURED'},sources.rpcLedger??prov,false);
 if(data.rpcLedger?.headerXdr)add('rpc-ledger-header.xdr',Buffer.from(data.rpcLedger.headerXdr,'base64'),sources.rpcLedger??prov);
 add('transaction.json',{networkPassphrase:SPEC.network,networkId:SPEC.networkId,expected:data.expected,source:v.id.source,hash:v.id.hash},localProv,false);
 add('history-reference.json',{inclusion:'SERVICE_CORROBORATED_INCLUSION',horizonTransaction:'https://horizon-testnet.stellar.org/transactions/'+v.id.hash,horizonLedger:'https://horizon-testnet.stellar.org/ledgers/'+r.ledger,historyArchive:{status:'NOT_CAPTURED',reason:'No self-contained validator-grade archive proof assembled; Horizon/RPC service corroboration only'}},localProv,false);
 add('footprint.json',{readOnly:v.id.footprint.filter(k=>k.access==='readOnly'),readWrite:v.id.footprint.filter(k=>k.access==='readWrite'),changedEntries:v.meta.entries},localProv,false);
 add('ledger-entries.json',data.ledgerEntries??[],localProv,false);
 add('balances.json',{asset:SPEC.asset,issuer:SPEC.issuer,amountBaseUnits:data.expected.method==='pay_reward'?'100000000':null,metaDelta:v.meta.balances,provenance:'TRANSACTION_META_LOCAL_DELTA',preObservation:data.preBalances??{status:'NOT_CAPTURED_DO_NOT_FABRICATE'},postObservation:data.postBalances??{status:'NOT_CAPTURED_DO_NOT_FABRICATE'},confirmationLedger:r.ledger,observationTime:prov.observedAt},localProv,false);
 if(data.sql){const sanitized=sanitize(data.sql);add('sql-confirmation.json',sanitized.value,data.sqlProvenance??localProv,false);add('sql-sanitization.json',{redactions:sanitized.redactions},localProv,false);add('sql-provenance.json',data.sqlProvenance,localProv,false);}
 add('sql-crosscheck.json',v.sqlStatus,localProv,false);add('verification.json',v.verification,localProv,false);
 return {artifacts,summary:{method:data.expected.method,batteryId:data.expected.batteryId,confirmed:true,requestId:v.id.method==='register_battery'?null:(v.id.args[1]??v.meta.after.battery?.requestId??null),hash:v.id.hash,sqlCrosscheck:v.sqlStatus.status,rpcLedger:v.verification.rpcLedgerCorroboration}};
}
export function captureRun(run,observations,out){const parts=observations.map((d,i)=>bundleArtifacts(d,String(i+1).padStart(2,'0')+'-'+d.expected.method+'/'));const summary=validateRun(run,parts.map(p=>p.summary));summary.sqlReady=parts.every(p=>p.summary.sqlCrosscheck==='PASS');summary.rpcLedgerReady=parts.every(p=>p.summary.rpcLedger==='PASS');summary.gatePolicy=SPEC.gates.policy;summary.chainGateReady=summary.counting&&summary.rpcLedgerReady;summary.eligibleForNextRun=summary.chainGateReady;
 return writeBundle(out,parts.flatMap(p=>p.artifacts),{...summary,steps:parts.map(p=>p.summary)});}
export function verifyPortable(dir){const verified=verifyBundle(dir),inv=verified.inventory,steps=inv.summary.steps??[];const observed=[];
 for(let i=0;i<steps.length;i++){const prefix=String(i+1).padStart(2,'0')+'-'+steps[i].method+'/';const load=n=>JSON.parse(readFileSync(resolve(dir,prefix+n),'utf8'));
  if(!steps[i].confirmed){const r=load('rpc-transaction.json'),tx=load('transaction.json');check(['FAILED','NOT_FOUND'].includes(r.status)&&inv.summary.status==='RUN_RETIRED_OR_STOPPED','PARTIAL_RUN_MARKED_COMPLETE');check(steps[i].hash===tx.expected.hash&&steps[i].method===tx.expected.method&&steps[i].batteryId===tx.expected.batteryId,'VERIFICATION_SUMMARY_MISMATCH');observed.push({...steps[i],confirmed:false,requestId:tx.expected.requestId??null,hash:tx.expected.hash,sqlCrosscheck:'NOT_APPLICABLE'});continue;}
  const tx=load('transaction.json'),sqlPath=resolve(dir,prefix+'sql-confirmation.json'),p=prefix+'rpc-transaction.json';
  const sql=existsSync(sqlPath)?load('sql-confirmation.json'):null;
  const sqlSource=sql?load('sql-provenance.json'):null;
  const rl=load('rpc-ledger.json');
  const data={network:{passphrase:tx.networkPassphrase},rpc:load('rpc-transaction.json'),horizon:load('horizon-transaction.json'),horizonLedger:load('horizon-ledger.json'),rpcLedger:rl?.status==='NOT_CAPTURED'?null:rl,expected:tx.expected,provenance:{source:'LOCAL_HISTORICAL',observedAt:inv.artifacts.find(a=>a.path===p).observedAt},sql,sqlProvenance:sqlSource};
  const result=verifyTx(data);
  const row={method:data.expected.method,batteryId:data.expected.batteryId,confirmed:true,requestId:result.id.method==='register_battery'?null:(result.id.args[1]??result.meta.after.battery?.requestId??null),hash:result.id.hash,sqlCrosscheck:result.verification.sqlCrosscheck,rpcLedger:result.verification.rpcLedgerCorroboration};
  check(canonical(row)===canonical(steps[i]),'VERIFICATION_SUMMARY_MISMATCH');observed.push(row);
 }
 const derived=validateRun({runId:inv.summary.runId,retired:inv.summary.status==='RUN_RETIRED_OR_STOPPED',complete:inv.summary.status==='COMPLETE'},observed);
 derived.sqlReady=observed.every(x=>x.sqlCrosscheck==='PASS');derived.rpcLedgerReady=observed.every(x=>x.rpcLedger==='PASS');derived.eligibleForNextRun=derived.counting&&derived.sqlReady&&derived.rpcLedgerReady;
 if(inv.summary.gatePolicy!==undefined){check(inv.summary.gatePolicy===SPEC.gates.policy,'UNKNOWN_GATE_POLICY');derived.gatePolicy=SPEC.gates.policy;derived.chainGateReady=derived.counting&&derived.rpcLedgerReady;derived.eligibleForNextRun=derived.chainGateReady;}
 for(const k of Object.keys(derived))check(inv.summary[k]===derived[k],'VERIFICATION_SUMMARY_MISMATCH');
 return verified;}
