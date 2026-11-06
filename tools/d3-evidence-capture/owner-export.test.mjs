import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {SPEC,bytes,hash} from './common.mjs';
import {identity,metadata,X} from './xdr-reader.mjs';
import {OWNER_QUERY_SHA256,OWNER_QUERY_URL,assertOwnerQuery,parseOwnerExport,compareOwnerExport,strictJson} from './owner-export.mjs';
import {sameDecodedXdr} from './comparison.mjs';
import {chainReadiness,assertHandoff} from './gate.mjs';
import {captureRun,verifyPortable} from './capture.mjs';
import {main} from './cli.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/historical.json',import.meta.url),'utf8')).items;
const clone=v=>structuredClone(v);
// Explicitly SYNTHETIC SQL values made from PUBLIC historical chain records.
// These are test inputs, not an owner export, remote SQL observation or D3 completion.
function synthetic(){
 const rows=fixture.map((d,i)=>{
  const op=`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,meta=metadata(d.rpc.resultMetaXdr),id=identity(d.rpc.envelopeXdr,{...d.expected,networkPassphrase:SPEC.network});
  const c={transactionHash:d.rpc.txHash,observationLedger:d.rpc.ledger,confirmationLedger:d.rpc.ledger,resultXdr:d.rpc.resultXdr,resultMetaXdr:d.rpc.resultMetaXdr,events:(d.rpc.events?.contractEventsXdr??[]).flat(),sorobanResult:meta.returnValue,correlationId:op,confirmedAt:d.rpc.createdAt,facts:{battery:meta.after.battery,request:meta.after.request??null,stateReadLedger:d.rpc.ledger}};
  return {deployment_id:SPEC.deployment,operation_id:op,battery_id:d.expected.batteryId,command:d.expected.method,source_account:id.source,state:'CONFIRMED_SUCCESS',durable_state:'PROJECTED',logical_state:'CONFIRMED',confirmation:c,state_evidence:null,envelope:{transaction_hash:d.rpc.txHash,signed_envelope:d.rpc.envelopeXdr,network_id:SPEC.networkId,contract_address:SPEC.contract},terminal_evidence:[{kind:'SUCCESS',evidence:clone(c),observation_ledger:c.observationLedger,confirmation_ledger:c.confirmationLedger,state_read_ledger:null}]};
 });
 const scope={deployment_id:SPEC.deployment,operations:rows.map(r=>({operation_id:r.operation_id,transaction_hash:r.envelope.transaction_hash,command:r.command,battery_id:r.battery_id}))};
 const data={schema:'BYETERY_OWNER_EXPORT_V1',metadata:{query_sha256:OWNER_QUERY_SHA256,export_time:'2026-11-06T00:00:00Z',deployment_id:SPEC.deployment,database:'SUPABASE_DEV',project_ref:'aemxuqnnwfclzrwwiqfd',business_execution_sha:SPEC.businessSha,transaction_read_only:'on',requested_operation_ids:rows.map(r=>r.operation_id)},rows};
 return {data,scope};
}
function parsed(mutator=()=>{}){const {data,scope}=synthetic();mutator(data,scope);const raw=bytes(data);return parseOwnerExport(raw,hash(raw),scope);}
const success=()=>{const s=synthetic(),raw=bytes(s.data);return parseOwnerExport(raw,hash(raw),s.scope);};
test('A01 valid historical synthetic owner export parses and compares; never a live SQL claim',()=>{const r=compareOwnerExport(success(),clone(fixture));assert.equal(r.status,'SQL_INTEGRITY_PASS');assert.equal(r.ownerExportAssertionOnly,true);assert.equal(r.rows.length,3);});
test('A02 malformed owner export and duplicate JSON keys reject',()=>{const s=synthetic(),b=Buffer.from('{');assert.throws(()=>parseOwnerExport(b,hash(b),s.scope),/MALFORMED_OWNER_EXPORT/);assert.throws(()=>strictJson('{"a":1,"a":2}'),/DUPLICATE_JSON_KEY/);});
test('A03 wrong approved query hash rejects',()=>{assert.throws(()=>parsed(d=>{d.metadata.query_sha256='a'.repeat(64);}),/WRONG_OWNER_QUERY_HASH/);});
test('A04 wrong deployment rejects',()=>{assert.throws(()=>parsed(d=>{d.rows[0].deployment_id='00000000-0000-4000-8000-000000000099';}),/WRONG_DEPLOYMENT/);});
test('A05 unexpected operation state rejects',()=>{assert.throws(()=>parsed(d=>{d.rows[0].state='SUBMITTED_OR_UNKNOWN';}),/UNEXPECTED_OPERATION_STATE/);});
test('A06 duplicate operation rejects',()=>{assert.throws(()=>parsed(d=>{d.rows[1].operation_id=d.rows[0].operation_id;}),/DUPLICATE_OPERATION/);});
test('A07 missing confirmation rejects',()=>{assert.throws(()=>parsed(d=>{d.rows[0].confirmation=null;}),/MISSING_CONFIRMATION/);});
test('A08 unexpected PII rejects rather than sanitizing away a comparison input',()=>{assert.throws(()=>parsed(d=>{d.rows[0].confirmation.facts.email='fixture@example.invalid';}),/BLOCKED_EVIDENCE_SECRET_OR_PII/);});
test('A09 canonical decoded XDR equality accepts documented base64 line wrapping',()=>{const d=fixture[0];assert.equal(sameDecodedXdr('TransactionResult',d.rpc.resultXdr,d.rpc.resultXdr+'\n'),true);assert.equal(sameDecodedXdr('TransactionEnvelope',d.rpc.envelopeXdr,d.rpc.envelopeXdr.match(/.{1,76}/g).join('\n')),true);});
test('A10 semantic binary XDR mismatch rejects',()=>{const a=fixture[0].rpc.resultXdr,b=X.TransactionResult.fromXDR(a,'base64');b.feeCharged=X.Int64.fromString('1');assert.throws(()=>sameDecodedXdr('TransactionResult',a,b.toXDR('base64')),/EVIDENCE_SQL_RPC_MISMATCH/);});
function ready(runId){return {runId,status:'COMPLETE',counting:true,rpcLedgerReady:true,sqlReady:false,steps:SPEC.methods.map((method,i)=>({method,batteryId:`SYNTHETIC-${runId}`,confirmed:true,rpcLedger:'PASS',hash:hash(Buffer.from(runId+method))}))};}
test('A11 chain gate can be ready while SQL gate remains pending',()=>{assert.equal(chainReadiness(ready('RUN1')),true);assert.equal(ready('RUN1').sqlReady,false);});
test('A12 final handoff rejects SQL gate pending',()=>{assert.throws(()=>assertHandoff(['RUN1','RUN2','RUN3'].map(ready),null),/SQL_GATE_PENDING_BEFORE_HANDOFF/);});
test('A13 modified query after approval rejects',()=>{assert.throws(()=>assertOwnerQuery(Buffer.concat([readFileSync(OWNER_QUERY_URL),Buffer.from('\n')])),/OWNER_QUERY_CHANGED_REVIEW_REQUIRED/);});
test('A14 missing required field rejects',()=>{assert.throws(()=>parsed(d=>{delete d.rows[0].envelope;}),/OWNER_EXPORT_FIELDS_REJECTED/);});
test('A15 unrelated operation rejects',()=>{assert.throws(()=>parsed(d=>{d.metadata.requested_operation_ids[0]='00000000-0000-4000-8000-000000000099';}),/UNRELATED_OPERATION/);});
test('A16 resultXdr mismatch rejects',()=>{const p=success(),c=p.data.rows[0].confirmation;c.resultXdr=fixture[1].rpc.resultXdr;p.data.rows[0].terminal_evidence[0].evidence=clone(c);assert.throws(()=>compareOwnerExport(p,clone(fixture)),/EVIDENCE_SQL_RPC_MISMATCH/);});
test('A17 resultMetaXdr mismatch rejects',()=>{const p=success(),c=p.data.rows[0].confirmation;c.resultMetaXdr=fixture[1].rpc.resultMetaXdr;p.data.rows[0].terminal_evidence[0].evidence=clone(c);assert.throws(()=>compareOwnerExport(p,clone(fixture)),/EVIDENCE_SQL_RPC_MISMATCH/);});
test('A18 event mismatch rejects',()=>{const p=success(),c=p.data.rows[0].confirmation;c.events=[];p.data.rows[0].terminal_evidence[0].evidence=clone(c);assert.throws(()=>compareOwnerExport(p,clone(fixture)),/EVIDENCE_SQL_RPC_MISMATCH/);});
test('A19 modified JSON file hash rejects',()=>{const s=synthetic(),raw=bytes(s.data);assert.throws(()=>parseOwnerExport(Buffer.concat([raw,Buffer.from(' ')]),hash(raw),s.scope),/OWNER_EXPORT_FILE_HASH_MISMATCH/);});
test('A20 read-write owner export metadata rejects',()=>{assert.throws(()=>parsed(d=>{d.metadata.transaction_read_only='off';}),/UNVERIFIED_OWNER_EXPORT_PROVENANCE/);});
test('A21 original state mapping and duplicate terminal receipts retain exact data',()=>{const p=parsed(d=>{d.rows[0].terminal_evidence.push(clone(d.rows[0].terminal_evidence[0]));});assert.equal(compareOwnerExport(p,clone(fixture)).rows.length,3);assert.equal(p.data.rows[0].durable_state,'PROJECTED');});
test('A22 failed export retained for review, never made chain/handoff ready',()=>{const p=parsed(d=>{const r=d.rows[0];r.state=r.durable_state='CONFIRMED_FAILED';r.logical_state='REJECTED';r.terminal_evidence[0].kind='FAILED';});assert.throws(()=>compareOwnerExport(p,clone(fixture)),/FAILED_OPERATION_REQUIRES_REVIEW/);});
test('A23 exact retained result encoding remains strict despite decoded equality',()=>{const p=success(),c=p.data.rows[0].confirmation;c.resultXdr+='\n';p.data.rows[0].terminal_evidence[0].evidence=clone(c);assert.throws(()=>compareOwnerExport(p,clone(fixture)),/EVIDENCE_SQL_RPC_MISMATCH/);});
test('A24 owner export command uses only local files; original chain bundle unchanged',async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'byetery-owner-export-')),bundle=resolve(dir,'chain');captureRun({runId:'HISTORICAL-RUN1',retired:true,complete:false},clone(fixture),bundle);
 const s=synthetic(),raw=bytes(s.data),file=resolve(dir,'export.json'),scope=resolve(dir,'scope.json');writeFileSync(file,raw);writeFileSync(scope,bytes(s.scope));const before=verifyPortable(bundle).BUNDLE_SHA256;
 const r=await main(['--local','verify-owner-export','--export',file,'--sha256',hash(raw),'--scope',scope,'--bundle',bundle]);assert.equal(r.status,'SQL_INTEGRITY_PASS');assert.equal(verifyPortable(bundle).BUNDLE_SHA256,before);
});
test('A25 partial diagnostic bundle can be verified and never becomes eligible',()=>{const dir=mkdtempSync(resolve(tmpdir(),'byetery-attempt-')),d=clone(fixture[0]);d.attemptOnly=true;d.rpc={status:'NOT_FOUND'};captureRun({runId:'HISTORICAL-SINGLE-TX',retired:true,complete:false},[d],resolve(dir,'bundle'));assert.equal(verifyPortable(resolve(dir,'bundle')).inventory.summary.eligibleForNextRun,false);});
test('A27 APPLIED state_evidence facts compared to captured metadata; mismatch rejects',()=>{const p=parsed(d=>{const r=d.rows[0];r.state_evidence={outcome:'APPLIED',stateReadLedger:r.confirmation.confirmationLedger,correlationId:r.operation_id,evidence:JSON.stringify({predicate:r.command,matched:true,paymentProofRequired:false,entryStatus:['LIVE'],facts:r.confirmation.facts})};});assert.equal(compareOwnerExport(p,clone(fixture)).rows[0].stateEvidenceStatus,'APPLIED_FACTS_COMPARED_TO_CAPTURED_META');const e=JSON.parse(p.data.rows[0].state_evidence.evidence);e.facts.battery.state='RECYCLED';p.data.rows[0].state_evidence.evidence=JSON.stringify(e);assert.throws(()=>compareOwnerExport(p,clone(fixture)),/STATE_EVIDENCE_RPC_MISMATCH/);});
test('A28 no database connection even when legacy credentials are present',async()=>{const {readSqlReceipt}=await import('./sql-readonly.mjs');await assert.rejects(readSqlReceipt('a'.repeat(64),{BYETERY_EVIDENCE_READONLY_DATABASE_URL:'SHOULD_NEVER_BE_READ'}),/BLOCKED_PENDING_READONLY_CREDENTIAL/);const {auditDirectory,auditLoadedXdrTree}=await import('./audit-imports.mjs');assert.equal(auditDirectory(fileURLToPath(new URL('.',import.meta.url))).databaseDriverImports,0);assert.equal(auditLoadedXdrTree().sqlDriverLoaded,false);});
test('A29 EMPTY_OWNER_EXPORT_REJECTED for nonempty requested operation scope',()=>{assert.throws(()=>parsed(d=>{d.rows=[];}),/OWNER_EXPORT_ROWS_MISSING/);});
test('A30 missing requested operation and partial export scope reject',()=>{assert.throws(()=>parsed(d=>{d.rows.pop();}),/OWNER_EXPORT_ROWS_MISSING/);assert.throws(()=>parsed(d=>{d.metadata.requested_operation_ids.pop();}),/UNRELATED_OPERATION/);});
test('A31 extra unrequested operation rejects',()=>{assert.throws(()=>parsed(d=>{d.rows.push(clone(d.rows[0]));}),/OWNER_EXPORT_ROWS_MISSING/);});
test('A32 exported network_id mismatch rejects',()=>{assert.throws(()=>parsed(d=>{d.rows[0].envelope.network_id='a'.repeat(64);}),/WRONG_NETWORK_ID/);});
test('A33 internally consistent partial export cannot pass full captured-run gate',()=>{const s=synthetic();s.data.rows=s.data.rows.slice(0,1);s.scope.operations=s.scope.operations.slice(0,1);s.data.metadata.requested_operation_ids=s.data.metadata.requested_operation_ids.slice(0,1);const raw=bytes(s.data),p=parseOwnerExport(raw,hash(raw),s.scope);assert.throws(()=>compareOwnerExport(p,clone(fixture)),/CHAIN_EXPORT_SCOPE_MISMATCH/);});

test('A26 fixed query syntax/logic in PostgreSQL WASM using SELECT-only CTE fixtures; no remote SQL or DDL',async()=>{
 const require=createRequire(new URL('../../backend/package.json',import.meta.url));const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();const {data,scope}=synthetic();
 // Relational fixtures are SELECT CTEs only. No schemas, tables, functions, roles or data are created.
 const prefix=`WITH fixture_work AS (SELECT (j->>'deployment_id')::uuid deployment_id,(j->>'operation_id')::uuid operation_id,j->>'battery_id' battery_id,j->>'command' command,j->>'source_account' source_account,j->>'durable_state' state,j->'confirmation' confirmation,j->'state_evidence' state_evidence FROM pg_catalog.jsonb_array_elements($3::jsonb) j),
 fixture_operations AS (SELECT (j->>'deployment_id')::uuid deployment_id,(j->>'operation_id')::uuid id,j->>'logical_state' state FROM pg_catalog.jsonb_array_elements($3::jsonb) j),
 fixture_envelopes AS (SELECT (j->>'deployment_id')::uuid deployment_id,(j->>'operation_id')::uuid operation_id,pg_catalog.decode(j->'envelope'->>'transaction_hash','hex') transaction_hash,pg_catalog.decode(j->'envelope'->>'signed_envelope','base64') signed_envelope,pg_catalog.decode(j->'envelope'->>'network_id','hex') network_id,j->'envelope'->>'contract_address' contract_address FROM pg_catalog.jsonb_array_elements($3::jsonb) j),
 fixture_observations AS (SELECT (j->>'deployment_id')::uuid deployment_id,(j->>'operation_id')::uuid operation_id,n::bigint id,t->>'kind' kind,t->'evidence' evidence,(t->>'observation_ledger')::bigint observation_ledger,(t->>'confirmation_ledger')::bigint confirmation_ledger,(t->>'state_read_ledger')::bigint state_read_ledger FROM pg_catalog.jsonb_array_elements($3::jsonb) j CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(j->'terminal_evidence') WITH ORDINALITY a(t,n)), `;
 let query=readFileSync(OWNER_QUERY_URL,'utf8');query=query.slice(query.indexOf('WITH ')).replace('WITH ',prefix).replaceAll(":'operation_ids'",'$1').replaceAll(":'query_sha256'",'$2').replaceAll('api_private.testnet_work','fixture_work').replaceAll('app_private.stellar_operations','fixture_operations').replaceAll('api_private.testnet_envelopes','fixture_envelopes').replaceAll('api_private.testnet_observations','fixture_observations');
 try{await db.exec('BEGIN TRANSACTION READ ONLY');const output=(await db.query(query,[JSON.stringify(data.metadata.requested_operation_ids),OWNER_QUERY_SHA256,JSON.stringify(data.rows)])).rows[0].owner_export;const raw=bytes(output);assert.equal(compareOwnerExport(parseOwnerExport(raw,hash(raw),scope),clone(fixture)).status,'SQL_INTEGRITY_PASS');await db.exec('ROLLBACK');}finally{await db.close();}
});
