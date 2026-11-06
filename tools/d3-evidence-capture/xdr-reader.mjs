import {createRequire} from 'node:module';
import {createPublicKey,verify as verifyEd25519} from 'node:crypto';
import {SPEC,ROOT,check,hash,local,canonical} from './common.mjs';
import {scanRaw} from './sanitizer.mjs';
local();
// Only official pure XDR types: never import the SDK root, keypair, transaction,
// RPC client, application module, wallet, or a signing implementation.
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
export const X=require('@stellar/stellar-sdk/xdr');
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function crc(b){let n=0;for(const a of b){n^=a<<8;for(let i=0;i<8;i++)n=((n&32768)?(n<<1)^0x1021:n<<1)&65535;}return n;}
export function strkey(raw,tag){const b=Buffer.concat([Buffer.from([tag]),Buffer.from(raw)]),n=crc(b),all=Buffer.concat([b,Buffer.from([n&255,n>>8])]);let acc=0,bits=0,s='';for(const v of all){acc=(acc<<8)|v;bits+=8;while(bits>=5){bits-=5;s+=alphabet[(acc>>>bits)&31];}}if(bits)s+=alphabet[(acc<<(5-bits))&31];return s;}
function decodeStrkey(s,tag){check(typeof s==='string'&&s.length===56,'INVALID_ADDRESS');let acc=0,bits=0;const a=[];for(const c of s){const n=alphabet.indexOf(c);check(n>=0,'INVALID_ADDRESS');acc=(acc<<5)|n;bits+=5;if(bits>=8){bits-=8;a.push((acc>>>bits)&255);}}const b=Buffer.from(a),sum=crc(b.subarray(0,33));check(b.length===35&&b[0]===tag&&b[33]===(sum&255)&&b[34]===(sum>>8),'INVALID_ADDRESS');return b.subarray(1,33);}
export function rewardPoolKey(){return X.LedgerKey.contractData(new X.LedgerKeyContractData({contract:X.ScAddress.scAddressTypeContract(new X.ContractId(decodeStrkey(SPEC.token,16))),durability:X.ContractDataDurability.persistent,key:X.ScVal.scvVec([X.ScVal.scvSymbol('Balance'),X.ScVal.scvAddress(X.ScAddress.scAddressTypeContract(new X.ContractId(decodeStrkey(SPEC.contract,16))))])}));}
export function address(a){if(a.type==='scAddressTypeAccount')return strkey(a.accountId.ed25519.toBytes(),48);if(a.type==='scAddressTypeContract')return strkey(a.contractId.toBytes(),16);throw Error('UNSUPPORTED_ADDRESS');}
export function native(v){switch(v.type){case 'scvVoid':return null;case 'scvBool':return v.b;case 'scvU32':return v.u32;case 'scvI32':return v.i32;case 'scvU64':return v.u64.toString();case 'scvI64':return v.i64.toString();case 'scvI128':return ((BigInt(v.i128.hi)<<64n)+BigInt(v.i128.lo)).toString();case 'scvBytes':return Buffer.from(v.bytes.toBytes()).toString('hex');case 'scvString':return v.str.toString();case 'scvSymbol':return v.sym.toString();case 'scvAddress':return address(v.address);case 'scvVec':return (v.vec??[]).map(native);case 'scvMap':return Object.fromEntries((v.map??[]).map(e=>[native(e.key),native(e.val)]));case 'scvLedgerKeyContractInstance':return 'INSTANCE';case 'scvLedgerKeyNonce':return {kind:'AUTH_NONCE',nonce:v.nonceKey.nonce.toString()};default:throw Error('UNSUPPORTED_SCVAL');}}
export function classify(k){if(k.type==='contractCode'){const h=Buffer.from(k.contractCode.hash.toBytes()).toString('hex');check(h===SPEC.wasm,'UNKNOWN_LEDGER_KEY');return {kind:'Code',ttlEligible:true,durability:'persistent',hash:h};}
 if(k.type==='ttl')return {kind:'TTL bookkeeping',ttlEligible:false};
 if(k.type==='account'){const a=strkey(k.account.accountId.ed25519.toBytes(),48);check([...Object.values(SPEC.actors),...SPEC.wallets,SPEC.issuer].includes(a),'UNKNOWN_LEDGER_KEY');return {kind:'classic account',account:a,ttlEligible:false,NO_CONTRACT_TTL:true};}
 if(k.type==='trustline'){const a=strkey(k.trustLine.accountId.ed25519.toBytes(),48),asset=k.trustLine.asset,part=asset.alphaNum12??asset.alphaNum4;check(SPEC.wallets.includes(a)&&part&&Buffer.from(part.assetCode.toBytes()).toString('utf8').replace(/\0+$/,'')===SPEC.asset&&strkey(part.issuer.ed25519.toBytes(),48)===SPEC.issuer,'UNKNOWN_LEDGER_KEY');return {kind:'classic trustline',account:a,asset:SPEC.asset,issuer:SPEC.issuer,ttlEligible:false,NO_CONTRACT_TTL:true};}
 check(k.type==='contractData','UNKNOWN_LEDGER_KEY');const c=address(k.contractData.contract),d=k.contractData.durability.name,v=native(k.contractData.key);
 if(d==='temporary'){check(c===SPEC.actors.collector&&v?.kind==='AUTH_NONCE','UNKNOWN_LEDGER_KEY');return {kind:'temporary nonce',contract:c,durability:d,ttlEligible:false};}
 check(d==='persistent','UNKNOWN_LEDGER_KEY');
 if(v==='INSTANCE'){check([SPEC.contract,SPEC.token].includes(c),'UNKNOWN_LEDGER_KEY');return {kind:c===SPEC.token?'SAC':'Instance',contract:c,durability:d,ttlEligible:true};}
 check(Array.isArray(v),'UNKNOWN_LEDGER_KEY');const tag=v[0];
 if(c===SPEC.contract&&tag==='Battery'){check(v.length===2&&/^[A-Z0-9-]{1,32}$/.test(v[1]),'UNKNOWN_LEDGER_KEY');return {kind:'Battery',contract:c,id:v[1],durability:d,ttlEligible:true};}
 if(c===SPEC.contract&&tag==='Request'){check(v.length===2&&/^[0-9a-f]{64}$/.test(v[1]),'UNKNOWN_LEDGER_KEY');return {kind:'Request',contract:c,id:v[1],durability:d,ttlEligible:true};}
 if(c===SPEC.contract&&tag==='Role'){check((v[1]===SPEC.actors.collector&&canonical(v[2])==='["Collector"]')||(v[1]===SPEC.actors.recycler&&canonical(v[2])==='["Recycler"]'),'UNKNOWN_LEDGER_KEY');return {kind:'Role',contract:c,durability:d,ttlEligible:true};}
 if(c===SPEC.token&&tag==='Balance'){check(v.length===2&&v[1]===SPEC.contract,'UNKNOWN_LEDGER_KEY');return {kind:'reward balance',contract:c,holder:v[1],durability:d,ttlEligible:true};}
 throw Error('UNKNOWN_LEDGER_KEY');
}
function publicVerify(key,msg,sig){return verifyEd25519(null,msg,createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key)]),format:'der',type:'spki'}),Buffer.from(sig));}
export function identity(encoded,expected){check(expected.networkPassphrase===SPEC.network,'WRONG_NETWORK');let env;try{env=X.TransactionEnvelope.fromXDR(encoded,'base64');}catch{throw Error('INVALID_ENVELOPE');}
 check(env.type==='envelopeTypeTx'&&env.v1.tx.operations.length===1,'UNSUPPORTED_ENVELOPE');
 const tx=env.v1.tx;check(tx.sourceAccount.type==='keyTypeEd25519'&&tx.memo.type==='memoNone','UNSUPPORTED_ENVELOPE');
 const sourceKey=tx.sourceAccount.ed25519.toBytes(),source=strkey(sourceKey,48);
 const digest=hash(new X.TransactionSignaturePayload({networkId:Buffer.from(SPEC.networkId,'hex'),taggedTransaction:X.TransactionSignaturePayloadTaggedTransaction.envelopeTypeTx(tx)}).toXDR());
 check(digest===expected.hash,'WRONG_TX_HASH');
 const operation=tx.operations[0];check(operation.sourceAccount===null&&operation.body.type==='invokeHostFunction','WRONG_OPERATION');
 const op=operation.body.invokeHostFunctionOp;check(op.hostFunction.type==='hostFunctionTypeInvokeContract','WRONG_OPERATION');
 const call=op.hostFunction.invokeContract,method=call.functionName.toString(),args=call.args.map(native);
 check(address(call.contractAddress)===SPEC.contract&&SPEC.methods.includes(method)&&method===expected.method,'WRONG_CONTRACT_OR_METHOD');
 check(args[0]===expected.batteryId,'WRONG_BATTERY');
 if(method!=='register_battery'&&method!=='pay_reward'&&expected.requestId)check(args[1]===expected.requestId,'WRONG_REQUEST');
 if(method==='open_return'&&expected.recipient)check(args[2]===expected.recipient,'WRONG_RECIPIENT');
 const expectedSource=method==='register_battery'?SPEC.actors.admin:method==='confirm_recycling'?SPEC.actors.recycler:SPEC.actors.service;
 check(source===expectedSource,'WRONG_SOURCE');
 check(env.v1.signatures.length===1,'INVALID_SOURCE_SIGNATURE');const signature=env.v1.signatures[0];
 check(Buffer.from(signature.hint.toBytes()).equals(Buffer.from(sourceKey).subarray(28))&&publicVerify(sourceKey,Buffer.from(digest,'hex'),signature.signature.toBytes()),'INVALID_SOURCE_SIGNATURE');
 const expectedAuth=method==='confirm_collection'?2:1;check(op.auth.length===expectedAuth,'INVALID_AUTH_SET');let sourceSeen=false,collectorSeen=false;
 for(const auth of op.auth){check(auth.rootInvocation.function.type==='sorobanAuthorizedFunctionTypeContractFn'&&auth.rootInvocation.function.contractFn.toXDR('base64')===call.toXDR('base64')&&auth.rootInvocation.subInvocations.length===0,'INVALID_AUTH_TREE');
 if(auth.credentials.type==='sorobanCredentialsSourceAccount'){check(!sourceSeen,'INVALID_AUTH_SET');sourceSeen=true;continue;}
 const c=auth.credentials.type==='sorobanCredentialsAddress'?auth.credentials.address:auth.credentials.type==='sorobanCredentialsAddressV2'?auth.credentials.addressV2:null;
 check(c&&method==='confirm_collection'&&!collectorSeen&&address(c.address)===SPEC.actors.collector,'INVALID_AUTH_SET');
 const signatures=native(c.signature);check(Array.isArray(signatures)&&signatures.length===1,'INVALID_COLLECTOR_SIGNATURE');const s=signatures[0],pk=Buffer.from(s.public_key??'','hex');
 const preimage=X.HashIdPreimage.envelopeTypeSorobanAuthorization(new X.HashIdPreimageSorobanAuthorization({networkId:Buffer.from(SPEC.networkId,'hex'),nonce:c.nonce,signatureExpirationLedger:c.signatureExpirationLedger,invocation:auth.rootInvocation}));
 check(strkey(pk,48)===SPEC.actors.collector&&publicVerify(pk,Buffer.from(hash(preimage.toXDR()),'hex'),Buffer.from(s.signature??'','hex')),'INVALID_COLLECTOR_SIGNATURE');collectorSeen=true;
 }
 check(sourceSeen&&(method!=='confirm_collection'||collectorSeen),'INVALID_AUTH_SET');
 check(tx.ext.type==='sorobanData','MISSING_FOOTPRINT');const f=tx.ext.sorobanData.resources.footprint;
 const footprint=[...f.readOnly.map(k=>({access:'readOnly',keyXdr:k.toXDR('base64'),...classify(k)})),...f.readWrite.map(k=>({access:'readWrite',keyXdr:k.toXDR('base64'),...classify(k)}))];
 scanRaw(JSON.stringify(args));
 return {hash:digest,source,method,args,footprint,envelope:env,identityStatus:'PASS',sourceSignatureVerified:true,collectorSignatureVerified:collectorSeen};
}
function keyFrom(d){if(d.type==='contractData')return X.LedgerKey.contractData(new X.LedgerKeyContractData({contract:d.contractData.contract,key:d.contractData.key,durability:d.contractData.durability}));
 if(d.type==='contractCode')return X.LedgerKey.contractCode(new X.LedgerKeyContractCode({hash:d.contractCode.hash}));
 if(d.type==='account')return X.LedgerKey.account(new X.LedgerKeyAccount({accountId:d.account.accountId}));
 if(d.type==='trustline')return X.LedgerKey.trustline(new X.LedgerKeyTrustLine({accountId:d.trustLine.accountId,asset:d.trustLine.asset}));
 if(d.type==='ttl')return X.LedgerKey.ttl(new X.LedgerKeyTtl({keyHash:d.ttl.keyHash}));throw Error('UNKNOWN_LEDGER_KEY');}
function battery(v){return {state:{Registered:'REGISTERED',Returned:'RETURNED',Collected:'COLLECTED',Recycled:'RECYCLED'}[v.state?.[0]],rewardState:{NotEligible:'NOT_ELIGIBLE',Pending:'PENDING',Sent:'SENT'}[v.reward_state?.[0]],registrationHash:v.registration_hash,requestId:v.request_id,collector:v.collector,collectionHash:v.collection_hash,recycler:v.recycler,recyclingHash:v.recycling_hash};}
export function metadata(encoded){const m=X.TransactionMeta.fromXDR(encoded,'base64');check(m.type==='v3'||m.type==='v4','UNKNOWN_META_VERSION');const v=m.value,entries=[],after={},balances=[];
 const changes=[...(v.txChangesBefore??[]),...(v.operations??[]).flatMap(o=>o.changes??[]),...(v.txChangesAfter??[])];
 for(const c of changes){const e=c.type==='ledgerEntryRemoved'?null:c.value,k=e?keyFrom(e.data):c.removed,classification=classify(k);
 const row={change:c.type,keyXdr:k.toXDR('base64'),...classification,lastModifiedLedgerSeq:e?.lastModifiedLedgerSeq??null};entries.push(row);
 const d=e?.data;if(d?.type==='contractData'&&['Battery','Request','reward balance'].includes(row.kind)){
 const value=native(d.contractData.val);if(c.type==='ledgerEntryUpdated'||c.type==='ledgerEntryCreated'||(c.type==='ledgerEntryState'&&!after[row.kind==='Battery'?'battery':'request'])){if(row.kind==='Battery')after.battery=battery(value);if(row.kind==='Request')after.request={batteryId:value.battery_id,recipient:value.recipient,state:{Open:'OPEN',Confirmed:'CONFIRMED',Cancelled:'CANCELLED'}[value.state?.[0]]};}
 if(row.kind==='reward balance')balances.push({kind:'SAC_POOL',change:c.type,value});
 }
 if(d?.type==='trustline'){const asset=d.trustLine.asset;check(asset.type==='assetTypeCreditAlphanum12'||asset.type==='assetTypeCreditAlphanum4','WRONG_ASSET');
 const a=asset.alphaNum12??asset.alphaNum4,code=Buffer.from(a.assetCode.toBytes()).toString('utf8').replace(/\0+$/,'');check(code===SPEC.asset&&strkey(a.issuer.ed25519.toBytes(),48)===SPEC.issuer,'WRONG_ASSET');
 balances.push({kind:'WALLET_CLASSIC_TRUSTLINE',account:strkey(d.trustLine.accountId.ed25519.toBytes(),48),change:c.type,balance:d.trustLine.balance.toString(),asset:code,issuer:SPEC.issuer,NO_CONTRACT_TTL:true});}
 }
 const returnScVal=v.sorobanMeta?.returnValue,returnNative=returnScVal?native(returnScVal):null;
 return {entries,after,balances,returnNative,returnValue:returnScVal?.toXDR('base64')??null,metaVersion:m.type};
}
export function ledgerEntry(encodedKey,raw,observationLedger,observedAt){const key=X.LedgerKey.fromXDR(encodedKey,'base64'),c=classify(key);if(!raw)return {...c,keyXdr:encodedKey,status:'OMITTED_UNKNOWN',observationLedger,observedAt};
 check(raw.key===encodedKey,'LEDGER_KEY_RESPONSE_MISMATCH');const d=X.LedgerEntryData.fromXDR(raw.xdr,'base64');check(keyFrom(d).toXDR('base64')===encodedKey,'LEDGER_KEY_RESPONSE_MISMATCH');if(c.kind==='Code')check(hash(d.contractCode.code)===SPEC.wasm,'WASM_MISMATCH');
 return {...c,keyXdr:encodedKey,entryXdr:raw.xdr,lastModifiedLedgerSeq:raw.lastModifiedLedgerSeq,liveUntilLedgerSeq:raw.liveUntilLedgerSeq??null,observationLedger,observedAt,status:'PRESENT',...(c.kind==='reward balance'?{value:native(d.contractData.val)}:{})};}
export function ttlCandidates(entries,target){check(Number.isSafeInteger(target)&&target>0,'INVALID_TARGET');const selected=new Map();
 for(const e of entries){check(e.durability!=='temporary'||(!e.selectedForTtl&&!e.ttlEligible),'TEMPORARY_TTL_SELECTION');const c=classify(X.LedgerKey.fromXDR(e.keyXdr,'base64'));
 check(c.kind===e.kind&&c.durability===e.durability&&c.ttlEligible===e.ttlEligible,'KEY_CLASSIFICATION_MISMATCH');
 if(!c.ttlEligible)continue;check(e.status==='PRESENT'&&Number.isSafeInteger(e.liveUntilLedgerSeq),'TTL_ENTRY_UNCERTAIN');
 if(e.liveUntilLedgerSeq<target)selected.set(e.keyXdr,e);
 }return [...selected.values()].sort((a,b)=>Buffer.compare(Buffer.from(a.keyXdr,'base64'),Buffer.from(b.keyXdr,'base64')));}
