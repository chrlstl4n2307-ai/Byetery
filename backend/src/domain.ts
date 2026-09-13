import { randomBytes } from 'node:crypto';

export type Hash32 = string;
export type Address = string;
export type BatteryState = 'REGISTERED' | 'RETURNED' | 'COLLECTED' | 'RECYCLED';
export type RequestState = 'OPEN' | 'CANCELLED' | 'CONFIRMED';
export type RewardState = 'NOT_ELIGIBLE' | 'PENDING' | 'SENT';
export type ActorRole = 'COLLECTOR' | 'RECYCLER';
export type OperationState = 'QUEUED' | 'AWAITING_AUTH' | 'READY' | 'SUBMITTED' | 'UNKNOWN' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED_LOCAL';
export type RewardAttemptState = 'QUEUED' | 'SUBMITTED' | 'UNKNOWN' | 'SUCCEEDED' | 'FAILED';
export interface Deployment {
  deploymentId: string; mode: 'MOCK' | 'TESTNET'; networkId: Hash32;
  contractAddress: Address; admin: Address; service: Address;
  rewardToken: Address; rewardAmount: bigint; schemaVersion: 1;
}
export interface Battery {
  state: BatteryState; registrationHash: Hash32; requestId: Hash32 | null;
  collector: Address | null; collectionHash: Hash32 | null;
  recycler: Address | null; recyclingHash: Hash32 | null; rewardState: RewardState;
}
export interface ReturnRequest { batteryId: string; recipient: Address; state: RequestState }
export interface User { id: string; authUserId: string | null; status: 'ACTIVE' | 'DISABLED' }
export interface WalletLink {
  id: string; deploymentId: string; networkId: Hash32; userId: string; address: Address;
  proofReference: string; verifiedAt: Date; revokedAt: Date | null;
}
export interface BatteryRecord { deploymentId: string; batteryId: string; metadata: Record<string, unknown>; createdBy: string | null }
export interface LocalReturnRequest {
  deploymentId: string; requestId: Hash32; batteryId: string; userId: string;
  walletLinkId: string; recipientSnapshot: Address;
  reservationState: 'HELD' | 'CONSUMED' | 'RELEASED'; associationConfirmedAt: Date | null;
}
export interface EvidenceVersion {
  id: string; deploymentId: string; batteryId: string; requestId: Hash32 | null;
  kind: 'REGISTRATION' | 'COLLECTION' | 'RECYCLING'; revision: number; formatVersion: 1;
  manifestBytes: Uint8Array; payloadHash: Hash32; commitment: Hash32 | null; objectPath: string;
}
export interface StellarOperation {
  id: string; deploymentId: string; principal: string; idempotencyKey: string;
  command: Command; parametersHash: Hash32; state: OperationState; errorCode: string | null;
}
export interface RewardAttempt {
  id: string; deploymentId: string; batteryId: string; requestId: Hash32;
  operationId: string; attemptNumber: number; state: RewardAttemptState; errorCode: string | null;
}
export interface Evidence {
  version: number; batteryId: string; requestId: Hash32;
  kind: 'COLLECTION' | 'RECYCLING'; payloadHash: Hash32;
}
export type Command =
  | { kind: 'register_battery'; batteryId: string; registrationHash: Hash32 }
  | { kind: 'set_role'; actor: Address; role: ActorRole; enabled: boolean }
  | { kind: 'open_return'; batteryId: string; requestId: Hash32; recipient: Address }
  | { kind: 'cancel_return'; batteryId: string; requestId: Hash32 }
  | { kind: 'confirm_collection'; batteryId: string; requestId: Hash32; collector: Address; evidence: Evidence }
  | { kind: 'confirm_recycling'; batteryId: string; requestId: Hash32; recycler: Address; evidence: Evidence }
  | { kind: 'pay_reward'; batteryId: string };
export class DomainError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'DomainError'; this.code = code; }
}
export function ensure(condition: unknown, code: string): asserts condition {
  if (!condition) throw new DomainError(code);
}
export function hash32(value: string): Hash32 {
  ensure(/^[0-9a-f]{64}$/.test(value), 'InvalidHash32'); return value;
}
export function nonzeroHash(value: string): Hash32 {
  hash32(value); ensure(value !== '0'.repeat(64), 'InvalidEvidence'); return value;
}
export function batteryId(value: string): string {
  ensure(/^[A-Z0-9-]{1,32}$/.test(value), 'InvalidBatteryId'); return value;
}
/** Server-only generation. Storage uniqueness and retained rows enforce non-reuse. */
export function newRequestId(): Hash32 { return randomBytes(32).toString('hex'); }
