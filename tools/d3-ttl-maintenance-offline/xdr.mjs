import {check,hash,canonical,SPEC} from '../d3-evidence-capture/common.mjs';
import {X,strkey} from '../d3-evidence-capture/xdr-reader.mjs';
import {assertTestnetNetwork} from '../d3-evidence-capture/network-identity.mjs';
import {POLICY,decimal,fees,relativeExtend,fresh} from './policy.mjs';
import {keyBytes} from './scope.mjs';

export function footprint(data){return {readOnly:data.resources.footprint.readOnly.map(k=>k.toXDR('base64')),readWrite:data.resources.footprint.readWrite.map(k=>k.toXDR('base64'))};}
export function simulationGuard(sim,subset,target,config,now,current,account){
 check(sim&&sim.status==='SUCCESS'&&!sim.restorePreamble&&Array.isArray(sim.auth)&&sim.auth.length===0,'SIMULATION_REQUIRES_OWNER_REVIEW');fresh(sim.observedAt,now,sim.ledger,current);let data;try{data=X.SorobanTransactionData.fromXDR(sim.sorobanDataXdr,'base64');}catch{check(false,'INVALID_SIMULATION_DATA');}
 check(data.ext.type==='v0','SIMULATION_RESTORE_OR_EXTENSION_UNSUPPORTED');
 let prototype;try{prototype=X.TransactionEnvelope.fromXDR(sim.inputEnvelopeXdr,'base64');}catch{check(false,'SIMULATION_INPUT_IDENTITY_MISMATCH');}
 check(prototype.type==='envelopeTypeTx'&&prototype.v1.signatures.length===0&&prototype.toXDR('base64')===sim.inputEnvelopeXdr,'SIMULATION_INPUT_IDENTITY_MISMATCH');const t=prototype.v1.tx;
 check(t.sourceAccount.type==='keyTypeEd25519'&&strkey(t.sourceAccount.ed25519.toBytes(),48)===account.address&&t.seqNum.toString()===(decimal(account.sequence)+1n).toString()&&t.operations.length===1&&t.operations[0].sourceAccount===null&&t.operations[0].body.type==='extendFootprintTtl'&&t.operations[0].body.value.extendTo===relativeExtend(target,sim.ledger,config)&&t.operations[0].body.value.ext.type==='v0'&&t.memo.type==='memoNone'&&t.cond.type==='precondTime'&&t.ext.type==='sorobanData'&&t.ext.sorobanData.ext.type==='v0','SIMULATION_INPUT_IDENTITY_MISMATCH');
 check(canonical(footprint(t.ext.sorobanData))===canonical({readOnly:subset.readOnly,readWrite:[]}),'SIMULATION_FOOTPRINT_MISMATCH');
 const min=BigInt(t.cond.timeBounds.minTime.toString()),max=BigInt(t.cond.timeBounds.maxTime.toString());check(min<=BigInt(now)&&min>=BigInt(now-30)&&max>BigInt(now)&&max<=BigInt(now+120),'SIMULATION_INPUT_IDENTITY_MISMATCH');
 const fp=footprint(data);check(canonical(fp.readOnly)===canonical(subset.readOnly)&&fp.readWrite.length===0,'SIMULATION_FOOTPRINT_MISMATCH');
 check(subset.readOnly.length>0,'EMPTY_EFFECTIVE_MAINTENANCE_SET');
 check(subset.readOnly.length<=config.maxFootprintEntries&&subset.readOnly.length<=config.maxReadEntries&&subset.readOnly.every(k=>keyBytes(k).raw.length<=config.maxKeyBytes)&&data.resources.instructions<=config.maxInstructions&&data.resources.diskReadBytes<=config.maxDiskReadBytes&&data.resources.writeBytes<=config.maxWriteBytes,'MAINTENANCE_NETWORK_RESOURCE_LIMIT');
 return {data,extendTo:relativeExtend(target,sim.ledger,config),fee:fees(sim.minResourceFee,sim.inclusionFee),simulationLedger:sim.ledger};
}
export function buildUnsigned({account,subset,simulation,target,config,now,current}){
 check(subset.readOnly.length>0,'EMPTY_EFFECTIVE_MAINTENANCE_SET');const s=simulationGuard(simulation,subset,target,config,now,current,account);check(s.extendTo>0,'MAINTENANCE_NOT_REQUIRED');
 const raw=Buffer.from(account.publicKeyBytesBase64??'','base64');check(raw.length===32&&raw.toString('base64')===account.publicKeyBytesBase64&&strkey(raw,48)===account.address,'MAINTENANCE_ACCOUNT_MISMATCH');
 const resources=X.SorobanResources.fromXDR(s.data.resources.toXDR());const data=new X.SorobanTransactionData({ext:X.SorobanTransactionDataExt.v0(),resources,resourceFee:X.Int64.fromString(s.fee.resourceFeeBudget)});
 const tx=new X.Transaction({sourceAccount:X.MuxedAccount.keyTypeEd25519(raw),fee:Number(s.fee.txFee),seqNum:X.Int64.fromString((decimal(account.sequence)+1n).toString()),cond:X.Preconditions.precondTime(new X.TimeBounds({minTime:X.Uint64.fromString(String(now)),maxTime:X.Uint64.fromString(String(now+POLICY.validitySeconds))})),memo:X.Memo.memoNone(),operations:[new X.Operation({sourceAccount:null,body:X.OperationBody.extendFootprintTtl(new X.ExtendFootprintTtlOp({ext:X.ExtensionPoint.v0(),extendTo:s.extendTo}))})],ext:X.TransactionExt.sorobanData(data)});
 return X.TransactionEnvelope.envelopeTypeTx(new X.TransactionV1Envelope({tx,signatures:[]}));
}
export function inspectUnsigned(encoded,context){
 const {account,subset,simulation,target,config,now,current}=context;let envelope;try{envelope=X.TransactionEnvelope.fromXDR(encoded,'base64');}catch{check(false,'INVALID_MAINTENANCE_ENVELOPE');}
 check(envelope.type==='envelopeTypeTx','MAINTENANCE_NORMAL_V1_REQUIRED');check(envelope.toXDR('base64')===encoded,'NONCANONICAL_MAINTENANCE_ENVELOPE');
 check(envelope.v1.signatures.length===0,'UNEXPECTED_MAINTENANCE_SIGNATURE');const tx=envelope.v1.tx;
 check(tx.sourceAccount.type==='keyTypeEd25519'&&strkey(tx.sourceAccount.ed25519.toBytes(),48)===account.address,'MAINTENANCE_SOURCE_OR_MUXED_ACCOUNT_MISMATCH');
 check(tx.operations.length===1,'MAINTENANCE_OPERATION_COUNT');const op=tx.operations[0];check(op.sourceAccount===null&&op.body.type==='extendFootprintTtl'&&op.body.value.ext.type==='v0','MAINTENANCE_OPERATION_TYPE_FORBIDDEN');check(tx.memo.type==='memoNone','MAINTENANCE_MEMO_FORBIDDEN');
 check(tx.cond.type==='precondTime','MAINTENANCE_TIMEBOUNDS_REQUIRED');const min=BigInt(tx.cond.timeBounds.minTime.toString()),max=BigInt(tx.cond.timeBounds.maxTime.toString());
 check(min<=BigInt(now)&&min>=BigInt(now-30)&&max>BigInt(now)&&max>min&&max<=BigInt(now+120),'MAINTENANCE_TIMEBOUNDS_INVALID');
 check(tx.seqNum.toString()===(decimal(account.finalSequence)+1n).toString()&&account.finalSequence===account.sequence,'MAINTENANCE_SEQUENCE_CHANGED');
 const checked=simulationGuard(simulation,subset,target,config,now,current,account);check(op.body.value.extendTo===checked.extendTo&&checked.extendTo>0,'MAINTENANCE_EXTEND_TO_MISMATCH');
 check(tx.ext.type==='sorobanData'&&tx.ext.sorobanData.ext.type==='v0','MAINTENANCE_SOROBAN_DATA_REQUIRED');const data=tx.ext.sorobanData,fp=footprint(data);
 check(fp.readWrite.length===0&&canonical(fp.readOnly)===canonical(subset.readOnly),'SIMULATION_FOOTPRINT_MISMATCH');
 check(Buffer.from(data.resources.toXDR()).equals(checked.data.resources.toXDR()),'SIMULATION_RESOURCE_MISMATCH');
 const resource=BigInt(data.resourceFee.toString());check(BigInt(tx.fee)<=POLICY.maxFeeStroops,'MAINTENANCE_FEE_CAP_EXCEEDED');
 check(resource===BigInt(checked.fee.resourceFeeBudget)&&BigInt(tx.fee)===BigInt(simulation.inclusionFee)+resource&&String(tx.fee)===checked.fee.txFee,'MAINTENANCE_FEE_ACCOUNTING_MISMATCH');
 // Adding exactly one future Ed25519 DecoratedSignature requires 72 bytes.
 check(envelope.toXDR().length+72<=config.maxTxBytes,'MAINTENANCE_NETWORK_RESOURCE_LIMIT');
 const networkId=assertTestnetNetwork(SPEC.network,SPEC.networkId),transactionHash=hash(new X.TransactionSignaturePayload({networkId:Buffer.from(networkId,'hex'),taggedTransaction:X.TransactionSignaturePayloadTaggedTransaction.envelopeTypeTx(tx)}).toXDR());
 return {status:'OFFLINE_UNSIGNED_SHAPE_PASS',transactionHash,unsignedEnvelopeSha256:hash(envelope.toXDR()),sequence:tx.seqNum.toString(),extendTo:checked.extendTo,fee:checked.fee,signatures:0,readOnly:fp.readOnly,readWrite:fp.readWrite,simulationLedger:simulation.ledger};
}
