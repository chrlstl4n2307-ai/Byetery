import type { ActorRole, Address, Battery, Command, Deployment, Hash32, ReturnRequest } from './domain.ts';

export interface PreparedOperation {
  deploymentId: string; preparationId: string; command: Command;
  requiredSigners: Address[]; expiresAt: number;
}
export interface Authorization { signer: Address; proof: string }
export interface Submission { deploymentId: string; reference: string; source: 'MOCK' | 'TESTNET' }
export type TransactionResult =
  | { status: 'UNKNOWN' | 'PENDING' }
  | { status: 'FAILED'; error: string }
  | { status: 'SUCCESS'; ledger: number; result: unknown };
export interface StellarService {
  getConfig(deploymentId: string): Promise<Deployment>;
  getBattery(deploymentId: string, batteryId: string): Promise<Battery | null>;
  getReturnRequest(deploymentId: string, requestId: Hash32): Promise<ReturnRequest | null>;
  hasRole(deploymentId: string, actor: Address, role: ActorRole): Promise<boolean>;
  getRewardBalance(deploymentId: string): Promise<bigint>;
  prepare(deploymentId: string, command: Command): Promise<PreparedOperation>;
  submit(prepared: PreparedOperation, authorizations: Authorization[]): Promise<Submission>;
  getTransactionResult(submission: Submission): Promise<TransactionResult>;
}
