import {SPEC,check,hash,canonical,provenance} from './common.mjs';
import {identity,metadata,X} from './xdr-reader.mjs';
import {scanRaw} from './sanitizer.mjs';
import {native,strkey} from './xdr-reader.mjs';
import {decodedXdr,orderedEvents} from './comparison.mjs';
import {assertTestnetNetwork} from './network-identity.mjs';
import {D324_OWNER_EXPORT} from '../d3-24-ratification/profile.mjs';
export function rewardContent(meta,events){const r=meta.returnNative;check(r&&r.token===SPEC.token&&r.amount==='100000000'&&SPEC.wallets.includes(r.recipient)&&canonical(r.reward_state)==='["Sent"]','REWARD_RETURN_MISSING');
 const transfer=events.some(encoded=>{const e=X.ContractEvent.fromXDR(encoded,'base64');if(!e.contractId||strkey(e.contractId.toBytes(),16)!==SPEC.token)return false;const t=e.body.value.topics.map(native);return t[0]==='transfer'&&t[1]===SPEC.contract&&t[2]===r.recipient&&native(e.body.value.data)==='100000000';});check(transfer,'REWARD_TRANSFER_MISSING');
 const before=meta.balances.find(b=>b.kind==='SAC_POOL'&&b.change==='ledgerEntryState'),after=meta.balances.find(b=>b.kind==='SAC_POOL'&&b.change==='ledgerEntryUpdated'),wb=meta.balances.find(b=>b.account===r.recipient&&b.change==='ledgerEntryState'),wa=meta.balances.find(b=>b.account===r.recipient&&b.change==='ledgerEntryUpdated');
 check(before&&after&&wb&&wa&&BigInt(before.value.amount)-BigInt(after.value.amount)===100000000n&&BigInt(wa.balance)-BigInt(wb.balance)===100000000n,'REWARD_DELTA_UNPROVEN');return {recipient:r.recipient,token:r.token,amount:r.amount,provenance:'TRANSACTION_META_LOCAL_DELTA',independentPreObservation:false};}
function same(field,a,b){check(canonical(a)===canonical(b),'EVIDENCE_SQL_RPC_MISMATCH',{field,rpcSha256:hash(Buffer.from(canonical(a)??'null')),sqlSha256:hash(Buffer.from(canonical(b)??'null'))});}
export function crosscheck(rpc,sql,meta){check(sql&&sql.confirmation&&sql.success_evidence,'SQL_RECEIPT_UNAVAILABLE');
 const c=sql.confirmation;for(const f of ['transactionHash','confirmationLedger','resultXdr','resultMetaXdr','events','sorobanResult','facts','correlationId','confirmedAt','observationLedger'])same('success_evidence.'+f,c[f],sql.success_evidence[f]);
 const fields={transactionHash:rpc.txHash,confirmationLedger:rpc.ledger,resultXdr:rpc.resultXdr,resultMetaXdr:rpc.resultMetaXdr,events:(rpc.events?.contractEventsXdr??[]).flat(),sorobanResult:meta.returnValue};
 for(const [k,v] of Object.entries(fields))same(k,v,c[k]);
 for(const [type,f] of [['TransactionResult','resultXdr'],['TransactionMeta','resultMetaXdr']]){decodedXdr(type,rpc[f]);decodedXdr(type,c[f]);}
 same('canonicalOrderedEvents',orderedEvents(fields.events),orderedEvents(c.events));
 same('correlationId',sql.operation_id,c.correlationId);
 check(c.facts&&Number.isSafeInteger(c.facts.stateReadLedger)&&c.facts.stateReadLedger>=rpc.ledger,'EVIDENCE_SQL_RPC_MISMATCH',{field:'facts.stateReadLedger'});
 if(meta.after.battery)same('facts.battery',meta.after.battery,c.facts.battery);
 if(meta.after.request)same('facts.request',meta.after.request,c.facts.request);
 if(sql.command==='pay_reward'){const r=meta.returnNative;check(r&&r.token===SPEC.token&&r.amount==='100000000'&&SPEC.wallets.includes(r.recipient),'REWARD_RETURN_MISSING');same('facts.reward',{recipient:r.recipient,token:r.token,amount:r.amount},c.facts.reward);}
 return {status:'PASS',rawFieldsCompared:Object.keys(fields),factsCompared:Object.keys(meta.after),factsReadLedger:c.facts.stateReadLedger,successEvidenceExact:true,operationId:sql.operation_id};
}
export function verifyTx(input){return verifyWithQuery(input,SPEC.ownerExport?.querySha256);}
export function verifyD324ExportTransaction(input){return verifyWithQuery(input,D324_OWNER_EXPORT.querySha256);}
function verifyWithQuery(input,approvedOwnerQuerySha256){provenance(input.provenance);assertTestnetNetwork(input.network.passphrase,input.network.networkId);
 const r=input.rpc;check(['SUCCESS','FAILED','NOT_FOUND'].includes(r.status),'UNKNOWN_RPC_STATUS');check(r.status==='SUCCESS','UNCONFIRMED_TRANSACTION');check(r.txHash===input.expected.hash,'WRONG_TX_HASH');
 const id=identity(r.envelopeXdr,{...input.expected,networkPassphrase:input.network.passphrase});
 const h=input.horizon,l=input.horizonLedger;
 check(h&&h.hash===r.txHash&&h.successful===true&&h.ledger===r.ledger,'HORIZON_RPC_LEDGER_DISAGREEMENT');
 check(h.envelope_xdr===r.envelopeXdr&&h.result_xdr===r.resultXdr,'HORIZON_RPC_CONTENT_DISAGREEMENT');
 check(l&&l.sequence===r.ledger&&typeof l.closed_at==='string'&&Number.isFinite(Date.parse(l.closed_at)),'WRONG_LEDGER');
 check(Number(r.createdAt)*1000===Date.parse(l.closed_at)&&h.created_at===l.closed_at,'WRONG_LEDGER_TIME');
 check(typeof l.header_xdr==='string'&&l.header_xdr.length>0,'MISSING_LEDGER_HEADER');
 const header=Buffer.from(l.header_xdr,'base64');check(header.length>=36&&hash(header)===l.hash&&/^[a-f0-9]{64}$/.test(l.prev_hash)&&header.subarray(4,36).toString('hex')===l.prev_hash,'LEDGER_HEADER_HASH_MISMATCH');
 const rl=input.rpcLedger?.ledgers?.[0]??input.rpcLedger;
 if(rl){check(rl.sequence===r.ledger&&(rl.hash??rl.id)===l.hash,'HORIZON_RPC_LEDGER_DISAGREEMENT');
  // RPC supplies LedgerHeaderHistoryEntry; Horizon supplies LedgerHeader.
  // Verify the documented hash + exact opaque header + ext.v0 wrapper. Never
  // discard an unknown extension or weaken content equality.
  check(Number(rl.ledgerCloseTime)*1000===Date.parse(l.closed_at),'WRONG_LEDGER_TIME');const wrapped=Buffer.from(rl.headerXdr??'','base64');
  check(wrapped.length===header.length+36&&wrapped.subarray(0,32).toString('hex')===l.hash&&wrapped.subarray(32,32+header.length).equals(header)&&wrapped.readUInt32BE(wrapped.length-4)===0,'HORIZON_RPC_HEADER_DISAGREEMENT');
 }
 const result=X.TransactionResult.fromXDR(r.resultXdr,'base64');check(result.result.type==='txSuccess','RESULT_NOT_SUCCESS');
 const meta=metadata(r.resultMetaXdr);if(id.method==='pay_reward')rewardContent(meta,(r.events?.contractEventsXdr??[]).flat());scanRaw(Buffer.from(r.envelopeXdr,'base64'));scanRaw(Buffer.from(r.resultMetaXdr,'base64'));
 const sqlStatus=input.sql?crosscheck(r,input.sql,meta):{status:'BLOCKED_PENDING_READONLY_CREDENTIAL'};
 if(input.sql){provenance(input.sqlProvenance);const p=input.sqlProvenance;
  const owner=p.source==='OWNER_READONLY_EXPORT'&&/^[a-f0-9]{64}$/.test(approvedOwnerQuerySha256??'')&&p.querySha256===approvedOwnerQuerySha256&&/^[a-f0-9]{64}$/.test(p.fileSha256??'')&&p.assertion==='OWNER_ASSERTED_READONLY_EXPORT_NOT_SERVER_ATTESTED';
  const legacy=p.source==='SQL_READONLY'&&p.roleVerified===true&&p.capabilityProfile==='SELECT_ONLY_NO_DDL_NO_BYPASS_NO_EXECUTE';check(owner||legacy,'UNVERIFIED_SQL_PROVENANCE');}
 return {id,meta,sqlStatus,verification:{TX_IDENTITY_VERIFIED:'PASS',inclusion:'SERVICE_CORROBORATED_INCLUSION',headerSha256:hash(header),ledger:r.ledger,closeTime:l.closed_at,ledgerHash:l.hash,previousLedgerHash:l.prev_hash,headerDecode:'opaque bytes retained; no unsupported SDK header decode claimed',rpcLedgerCorroboration:rl?'PASS':'NOT_CAPTURED',sqlCrosscheck:sqlStatus.status,validatorGradeProof:false}};
}
