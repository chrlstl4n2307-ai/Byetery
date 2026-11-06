import {check,canonical,hash} from './common.mjs';
import {X} from './xdr-reader.mjs';

// Use decoded bytes only where representations have a documented wrapper/encoding difference.
// SQL Confirmation.resultXdr/resultMetaXdr/events are copies of the SAME RPC representation:
// those retain exact encoded equality in verifier.crosscheck, in addition to decoding here.
export function decodedXdr(type,encoded){
 check(['TransactionResult','TransactionMeta','ContractEvent','TransactionEnvelope','ScVal'].includes(type),'UNSUPPORTED_XDR_TYPE');
 check(typeof encoded==='string'&&encoded.length>0&&/^[A-Za-z0-9+/=\r\n\t ]+$/.test(encoded),'INVALID_XDR_ENCODING');
 const flat=encoded.replace(/\s/g,''),raw=Buffer.from(flat,'base64');
 check(raw.toString('base64')===flat,'INVALID_XDR_ENCODING');
 let value;try{value=X[type].fromXDR(raw);}catch{check(false,'INVALID_XDR_ENCODING');}
 const roundtrip=value.toXDR();check(raw.equals(roundtrip),'NON_CANONICAL_XDR_OBJECT');return raw;
}
export function sameDecodedXdr(type,a,b){
 const left=decodedXdr(type,a),right=decodedXdr(type,b);
 check(left.equals(right),'EVIDENCE_SQL_RPC_MISMATCH',{field:type,leftSha256:hash(left),rightSha256:hash(right)});return true;
}
export function orderedEvents(values){
 check(Array.isArray(values),'INVALID_EVENT_LIST');return values.map(v=>decodedXdr('ContractEvent',v).toString('base64'));
}
export const COMPARISON_POLICY=Object.freeze({
 resultXdr:'TransactionResult decoded roundtrip validation AND exact SQL/RPC encoded equality (same retained representation)',
 resultMetaXdr:'TransactionMeta decoded roundtrip validation AND exact SQL/RPC encoded equality (same retained representation)',
 events:'Ordered ContractEvent canonical binary validation AND exact ordered retained values; no sorting/deduplication',
 header:'Wrapper-aware: RPC LedgerHeaderHistoryEntry hash + exact Horizon LedgerHeader bytes + ext.v0; unknown extension rejected',
 envelope:'TransactionEnvelope canonical decoded binary equality; SQL bytea base64 line wrapping removed by fixed query',
 facts:'Recursively sorted JSON object comparison, ordered arrays; compare getter facts and stateReadLedger separately'
});
