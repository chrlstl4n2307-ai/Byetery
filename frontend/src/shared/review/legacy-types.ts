// Dependency-neutral accepted public wire declarations. No runtime imports.
export type BatteryState="REGISTERED"|"RETURNED"|"COLLECTED"|"RECYCLED";
export type RewardState="NOT_ELIGIBLE"|"PENDING"|"SENT";
export type HistoryKind =
  | "REGISTERED"
  | "RETURNED"
  | "COLLECTED"
  | "RECYCLED"
  | "REWARD"
  | "CANCELLED"
  | "OTHER";
export interface HistoryEntry {
  operationId: string;
  kind: HistoryKind;
  category: "LIFECYCLE" | "REWARD";
  persistedState: string;
  recordedAt: string;
  confirmedAt: string | null;
  transactionHash: string | null;
  ledger: number | null;
  verification: "CONFIRMED" | "UNVERIFIED";
  chainResult: "SUCCESS" | "FAILED" | null;
  reason: string | null;
}
export interface BatteryHistory {
  batteryId: string;
  source: "TESTNET";
  network: "STELLAR TESTNET";
  deploymentId: string;
  contractAddress: string;
  checkedAt: string;
  entries: HistoryEntry[];
  hasMore: boolean;
}
