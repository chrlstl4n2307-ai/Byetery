import type { BatteryState, RewardState } from "../../../backend/src/domain";
export type { BatteryState, RewardState };
export type Role = "USER" | "ADMIN" | "COLLECTOR" | "RECYCLER";
export interface PendingOperation {
  id: string;
  state: string;
  command: string;
}
export interface OwnRequest {
  requestId: string;
  reservationState: string;
  requestState: string | null;
}
export interface Battery {
  batteryId: string;
  confirmedBatteryState: BatteryState | null;
  confirmedRewardState: RewardState | null;
  source: "MOCK";
  pendingOperation: PendingOperation | null;
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
    > & { createdAt: string })[];
  hasMoreRequests: boolean;
  source: "MOCK";
}
export interface Challenge {
  challengeId: string;
  address: string;
  messageBase64: string;
  expiresAt: string;
  source: "MOCK";
}
