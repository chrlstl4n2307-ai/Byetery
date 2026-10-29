import type { BatteryState, RewardState } from "@/shared/review/legacy-types";
import type { BlockchainSource } from "./web-config";
export type { BatteryState, RewardState };
export type Role = "USER" | "ADMIN" | "COLLECTOR" | "RECYCLER";
export interface TransactionOperation {
  id: string;
  state: string;
  command: string;
  failureScope?: "APPLICATION" | "CHAIN" | null;
}
export type PendingOperation = TransactionOperation;
export interface OwnRequest {
  requestId: string;
  reservationState: string;
  requestState: string | null;
}
export interface Battery {
  batteryId: string;
  confirmedBatteryState: BatteryState | null;
  confirmedRewardState: RewardState | null;
  source: BlockchainSource;
  pendingOperation: PendingOperation | null;
  latestTerminalOperation?: TransactionOperation | null;
  lastAttempt: { state: string; error_code: string | null } | null;
  metadata?: { type?: string; manufacturer?: string; batch?: string };
  ownRequest?: OwnRequest | null;
}
export interface Profile {
  userId: string;
  roles: Role[];
  wallets: { id: string; address: string; verifiedAt: string }[];
  requests: (OwnRequest &
    Pick<
      Battery,
      | "batteryId"
      | "confirmedBatteryState"
      | "confirmedRewardState"
      | "pendingOperation"
      | "latestTerminalOperation"
    > & { createdAt: string })[];
  hasMoreRequests: boolean;
  source: BlockchainSource;
}
export interface Challenge {
  challengeId: string;
  address: string;
  messageBase64: string;
  expiresAt: string;
  source: BlockchainSource;
}
