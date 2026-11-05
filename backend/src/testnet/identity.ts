import { createHash } from 'node:crypto';
import { Address, Keypair, Networks, Transaction, xdr } from '@stellar/stellar-sdk';
import { DomainError, ensure, type Battery, type Command, type Hash32, type ReturnRequest } from '../domain.ts';

export const NETWORK_ID = createHash('sha256').update(Networks.TESTNET).digest('hex');
export const SIGNER_FEE_CAP = 50_000_000n;
export const ENVELOPE_TIME_POLICY = {
  validitySeconds: 180,
  minimumBeforeAuthorization: 90,
  minimumBeforeEnvelopeSignature: 50,
  minimumBeforeDispatch: 15,
  expiryMarginSeconds: 10,
  maxLedgerAgeSeconds: 30,
  maxLedgerLeadSeconds: 60,
} as const;

export function hasSafeValidity(maxTime: string, closeTime: string, minimumSeconds: number): boolean {
  if (!/^\d+$/.test(maxTime) || !/^\d+$/.test(closeTime)) return false;
  const remaining = BigInt(maxTime) - BigInt(closeTime);
  return remaining >= BigInt(minimumSeconds) && remaining <= BigInt(ENVELOPE_TIME_POLICY.validitySeconds);
}
export type TransportState = 'CLAIMED' | 'PREPARING' | 'SIGNED' | 'READY' | 'DISPATCH_INTENT'
  | 'SUBMITTED_OR_UNKNOWN' | 'CONFIRMED_SUCCESS' | 'CONFIRMED_FAILED'
  | 'EXPIRED_NOT_APPLIED' | 'EXPIRED_UNRESOLVED' | 'PROJECTED' | 'ABORTED_PRE_DISPATCH';
/** Internal server objects only; none of these are HTTP response DTOs. */
export interface OperationContext {
  deploymentId: string; operationId: string; networkId: Hash32;
  contractAddress: string; sourceAccount: string; command: Command;
  contextHash: Hash32;
  /** Expected invocation arguments in their exact, ordered XDR encoding. */
  argumentsXdr: readonly string[];
}
export interface PreparedBody { transactionXdr: string; preparedLedger: number;
  simulation?:{resourceFee:string;totalFee:string;authRequirements:readonly string[];sourceSequence:string;sourceBalance:string;ledger:number} }
/** Body AFTER signed Soroban auth is attached, BEFORE source envelope signature. */
export interface FinalizedBody extends PreparedBody { transactionHash: Hash32 }
export interface TransactionIdentity {
  deploymentId: string; operationId: string; networkId: Hash32; contractAddress: string;
  sourceAccount: string; sequence: string; envelopeBytes: Uint8Array; transactionHash: Hash32;
  contextHash: Hash32; minTime: string; maxTime: string;
  authorizationExpirations: readonly number[]; preparedLedger: number;
}
export interface Confirmation {
  transactionHash: Hash32; observationLedger: number; confirmationLedger: number;
  resultXdr: string; resultMetaXdr: string; events: readonly string[];
  sorobanResult: string | null; correlationId: string;
  confirmedAt?: number;
  facts?: {battery:Battery;request:ReturnRequest|null;stateReadLedger:number;reward?:{recipient:string;token:string;amount:string}};
}
export type Observation =
  | { status: 'SUCCESS' | 'FAILED'; confirmation: Confirmation }
  | { status: 'NOT_FOUND'; observationLedger: number; ledgerCloseTime: string; oldestLedger?: number; correlationId: string };
export interface StateEvidence {
  outcome: 'APPLIED' | 'NOT_APPLIED' | 'UNRESOLVED';
  stateReadLedger: number; evidence: string; correlationId: string;
}

export function readSupportedEnvelope(encoded:string):Transaction{
  let env:xdr.TransactionEnvelope;
  try{env=xdr.TransactionEnvelope.fromXDR(encoded,'base64');}catch{throw new DomainError('PersistedEnvelopeUnreadable');}
  ensure(env.type === 'envelopeTypeTx', 'UnsupportedEnvelope');
  ensure(env.v1.tx.cond.type!=='precondNone','BoundedEnvelopeRequired');
  ensure(env.v1.tx.cond.type==='precondTime','UnsupportedEnvelopePreconditions');
  return new Transaction(encoded,Networks.TESTNET);
}
function body(context: OperationContext, value: PreparedBody): Transaction {
  ensure(context.networkId === NETWORK_ID, 'TestnetOnly');
  const tx = readSupportedEnvelope(value.transactionXdr);
  const env = tx.toEnvelope();
  ensure(env.type === 'envelopeTypeTx', 'UnsupportedEnvelope');
  ensure(tx.source === context.sourceAccount && BigInt(tx.sequence) > 0n, 'SourceMismatch');
  ensure(BigInt(tx.fee) > 0n && BigInt(tx.fee) <= SIGNER_FEE_CAP, 'SignerFeeCap');
  ensure(tx.timeBounds && BigInt(tx.timeBounds.maxTime) > BigInt(tx.timeBounds.minTime)
    && BigInt(tx.timeBounds.maxTime) > 0n, 'BoundedEnvelopeRequired');
  ensure(env.v1.tx.cond.type==='precondTime','UnsupportedEnvelopePreconditions');
  ensure(Number.isSafeInteger(value.preparedLedger) && value.preparedLedger > 0, 'InvalidPreparedLedger');
  const operations = env.v1.tx.operations;
  ensure(operations.length === 1 && operations[0].sourceAccount == null, 'UnsupportedOperation');
  const op = operations[0].body;
  ensure(op.type === 'invokeHostFunction' && op.invokeHostFunctionOp.hostFunction.type === 'hostFunctionTypeInvokeContract', 'UnsupportedOperation');
  const call = op.invokeHostFunctionOp.hostFunction.invokeContract;
  ensure(new Address(context.contractAddress).toScAddress().toXDR('base64') === call.contractAddress.toXDR('base64')
    && call.functionName.toString() === context.command.kind, 'InvocationMismatch');
  ensure(call.args.length === context.argumentsXdr.length
    && call.args.every((v, i) => v.toXDR('base64') === context.argumentsXdr[i]), 'ArgumentsMismatch');
  return tx;
}
export function finalizedBody(context: OperationContext, value: PreparedBody): FinalizedBody {
  const tx = body(context, value);
  ensure(tx.signatures.length === 0, 'EnvelopeAlreadySigned');
  return { ...value, transactionHash: Buffer.from(tx.hash()).toString('hex') };
}
export function preparedIdentity(body: FinalizedBody) {
  const tx=new Transaction(body.transactionXdr,Networks.TESTNET);
  ensure(tx.timeBounds && Buffer.from(tx.hash()).toString('hex')===body.transactionHash,'PreparedIdentityMismatch');
  return {transactionHash:body.transactionHash,sourceAccount:tx.source,sequence:tx.sequence,
    minTime:tx.timeBounds.minTime,maxTime:tx.timeBounds.maxTime};
}
export function signedIdentity(context: OperationContext, finalized: FinalizedBody, transactionXdr: string): TransactionIdentity {
  const before = body(context, finalized);
  ensure(before.signatures.length === 0 && Buffer.from(before.hash()).toString('hex') === finalized.transactionHash, 'FinalizedHashMismatch');
  const signed = body(context, { ...finalized, transactionXdr });
  const beforeEnvelope=before.toEnvelope(),signedEnvelope=signed.toEnvelope();
  ensure(beforeEnvelope.type==='envelopeTypeTx' && signedEnvelope.type==='envelopeTypeTx','UnsupportedEnvelope');
  ensure(Buffer.from(signed.hash()).toString('hex') === finalized.transactionHash
    && signedEnvelope.v1.tx.toXDR('base64') === beforeEnvelope.v1.tx.toXDR('base64'), 'SignedBodyChanged');
  verifySourceSignature(signed,context.sourceAccount);
  const signedOperation=signedEnvelope.v1.tx.operations[0].body;
  ensure(signedOperation.type==='invokeHostFunction','UnsupportedOperation');
  const op = signedOperation.invokeHostFunctionOp;
  const expirations = op.auth.flatMap(a => a.credentials.type === 'sorobanCredentialsAddress'
    ? [a.credentials.address.signatureExpirationLedger] : a.credentials.type === 'sorobanCredentialsAddressV2'
      ? [a.credentials.addressV2.signatureExpirationLedger] : []);
  ensure(expirations.every(v => v > finalized.preparedLedger), 'ExpiredAuthorization');
  return { deploymentId: context.deploymentId, operationId: context.operationId, networkId: context.networkId,
    contractAddress: context.contractAddress, sourceAccount: context.sourceAccount, sequence: signed.sequence,
    envelopeBytes: Buffer.from(signed.toXDR(), 'base64'), transactionHash: finalized.transactionHash,
    contextHash: context.contextHash, minTime: signed.timeBounds!.minTime, maxTime: signed.timeBounds!.maxTime,
    authorizationExpirations: expirations, preparedLedger: finalized.preparedLedger };
}
function verifySourceSignature(tx:Transaction,expectedSource:string):void{
  const key=Keypair.fromPublicKey(expectedSource);
  const signature=tx.signatures[0];
  ensure(tx.signatures.length===1&&Buffer.from(signature.hint.toBytes()).equals(key.signatureHint())
    &&key.verify(tx.hash(),Buffer.from(signature.signature.toBytes())),'InvalidEnvelopeSignature');
}

export function signedEnvelopeDigest(bytes:Uint8Array):string{
  return createHash('sha256').update(bytes).digest('hex');
}

/** Verify the exact signed envelope against its immutable operation context. */
export function assertPersistedEnvelope(identity:TransactionIdentity,context:OperationContext,expectedSource=context.sourceAccount):void{
  ensure(identity.deploymentId===context.deploymentId&&identity.operationId===context.operationId
    &&identity.contextHash===context.contextHash&&identity.contractAddress===context.contractAddress
    &&identity.networkId===NETWORK_ID&&context.networkId===NETWORK_ID
    &&identity.sourceAccount===context.sourceAccount,'PersistedEnvelopeMetadataMismatch');
  ensure(context.sourceAccount===expectedSource,'WrongSigner');
  let tx:Transaction;
  try{
    tx=body(context,{transactionXdr:Buffer.from(identity.envelopeBytes).toString('base64'),preparedLedger:identity.preparedLedger});
  }catch(error){
    if(error instanceof DomainError)throw error;
    throw new DomainError('PersistedEnvelopeUnreadable');
  }
  ensure(tx.sequence===identity.sequence&&Buffer.from(tx.hash()).toString('hex')===identity.transactionHash
    &&tx.timeBounds?.minTime===identity.minTime&&tx.timeBounds?.maxTime===identity.maxTime,
  'PersistedEnvelopeMetadataMismatch');
  verifySourceSignature(tx,context.sourceAccount);
}
/** Safe evidence label: deliberately no envelope/signature/result metadata. */
export function identityLabel(identity: TransactionIdentity) {
  return { deploymentId: identity.deploymentId, operationId: identity.operationId,
    transactionHash: identity.transactionHash, source: 'FIXTURE' as const };
}
