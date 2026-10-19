import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { batteryId, nonzeroHash, ensure, type Command, type Evidence } from '../domain.ts';
export const CONTRACT='CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON';
export const TOKEN='CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G';
export const WASM='c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6';
export const ACTORS={admin:'GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F',
  service:'GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX',
  collector:'GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V',
  recycler:'GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2'} as const;
export const string=(s:string)=>nativeToScVal(s,{type:'string'});
export const bytes=(s:string)=>xdr.ScVal.scvBytes(Buffer.from(nonzeroHash(s),'hex'));
export function evidenceValue(e:Evidence){return xdr.ScVal.scvMap([
  ['battery_id',string(e.batteryId)],['kind',xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(e.kind==='COLLECTION'?'Collection':'Recycling')])],
  ['payload_hash',bytes(e.payloadHash)],['request_id',bytes(e.requestId)],['version',xdr.ScVal.scvU32(e.version)],
].map(([key,val])=>new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol(key as string),val:val as xdr.ScVal})));}
export function invocation(c:Command):{args:xdr.ScVal[];signers:string[]}{
  ensure(c.kind!=='set_role','MethodNotAllowed');const id=string(batteryId(c.batteryId));
  switch(c.kind){
    case 'register_battery':return {args:[id,bytes(c.registrationHash)],signers:[ACTORS.admin]};
    case 'open_return':return {args:[id,bytes(c.requestId),new Address(c.recipient).toScVal()],signers:[ACTORS.service]};
    case 'cancel_return':return {args:[id,bytes(c.requestId)],signers:[ACTORS.service]};
    case 'pay_reward':return {args:[id],signers:[ACTORS.service]};
    default:{const collection=c.kind==='confirm_collection';
      ensure(c.evidence.version===1&&c.evidence.batteryId===c.batteryId&&c.evidence.requestId===c.requestId
        &&c.evidence.kind===(collection?'COLLECTION':'RECYCLING'),'EvidenceContextMismatch');
      const actor=collection?c.collector:c.recycler;
      ensure(actor===(collection?ACTORS.collector:ACTORS.recycler),'WrongSigner');
      return {args:[id,bytes(c.requestId),new Address(actor).toScVal(),evidenceValue(c.evidence)],
        signers:collection?[ACTORS.service,ACTORS.collector]:[ACTORS.recycler]};}
  }
}
