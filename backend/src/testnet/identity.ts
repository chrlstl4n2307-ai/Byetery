import { createHash } from 'node:crypto';
import { Address, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { ensure, type Battery, type Command, type Hash32, type ReturnRequest } from '../domain.ts';

export const NETWORK_ID = createHash('sha256').update(Networks.TESTNET).digest('hex');
export const SIGNER_FEE_CAP = 50_000_000n;
export type TransportState = 'CLAIMED' | 'PREPARING' | 'SIGNED' | 'READY' | 'DISPATCH_INTENT'
  | 'SUBMITTED_OR_UNKNOWN' | 'CONFIRMED_SUCCESS' | 'CONFIRMED_FAILED'
  | 'EXPIRED_NOT_APPLIED' | 'EXPIRED_UNRESOLVED' | 'PROJECTED';
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
  | { status: 'NOT_FOUND'; observationLedger: number; ledgerCloseTime: string; correlationId: string };
export interface StateEvidence {
  outcome: 'APPLIED' | 'NOT_APPLIED' | 'UNRESOLVED';
  stateReadLedger: number; evidence: string; correlationId: string;
}

function body(context: OperationContext, value: PreparedBody): Transaction {
  ensure(context.networkId === NETWORK_ID, 'TestnetOnly');
  const tx = new Transaction(value.transactionXdr, Networks.TESTNET);
  const env = tx.toEnvelope();
  ensure(env.type === 'envelopeTypeTx', 'UnsupportedEnvelope');
  ensure(tx.source === context.sourceAccount && BigInt(tx.sequence) > 0n, 'SourceMismatch');
  ensure(BigInt(tx.fee) > 0n && BigInt(tx.fee) <= SIGNER_FEE_CAP, 'SignerFeeCap');
  ensure(tx.timeBounds && BigInt(tx.timeBounds.maxTime) > BigInt(tx.timeBounds.minTime)
    && BigInt(tx.timeBounds.maxTime) > 0n, 'BoundedEnvelopeRequired');
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
export function signedIdentity(context: OperationContext, finalized: FinalizedBody, transactionXdr: string): TransactionIdentity {
  const before = body(context, finalized);
  ensure(before.signatures.length === 0 && Buffer.from(before.hash()).toString('hex') === finalized.transactionHash, 'FinalizedHashMismatch');
  const signed = body(context, { ...finalized, transactionXdr });
  const beforeEnvelope=before.toEnvelope(),signedEnvelope=signed.toEnvelope();
  ensure(beforeEnvelope.type==='envelopeTypeTx' && signedEnvelope.type==='envelopeTypeTx','UnsupportedEnvelope');
  ensure(Buffer.from(signed.hash()).toString('hex') === finalized.transactionHash
    && signedEnvelope.v1.tx.toXDR('base64') === beforeEnvelope.v1.tx.toXDR('base64'), 'SignedBodyChanged');
  const key = Keypair.fromPublicKey(context.sourceAccount);
  ensure(signed.signatures.length === 1 && key.verify(signed.hash(), Buffer.from(signed.signatures[0].signature.toBytes())), 'InvalidEnvelopeSignature');
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
/** Safe evidence label: deliberately no envelope/signature/result metadata. */
export function identityLabel(identity: TransactionIdentity) {
  return { deploymentId: identity.deploymentId, operationId: identity.operationId,
    transactionHash: identity.transactionHash, source: 'FIXTURE' as const };
}
