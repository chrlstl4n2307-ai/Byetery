/** Public history DTOs only. No command payload, identity, envelope or recipient. */
export const HISTORY_DEPLOYMENT_ID = "5c0cad2f-5f25-4216-8068-6cb9d2d26325";
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
export interface HistoryRow {
  id: string;
  kind: HistoryKind;
  state: string;
  created_at: Date | string;
  transaction_hash: string | null;
  identity_network: string | null;
  identity_contract: string | null;
  confirmation_ledger: string | null;
}
export function chronological(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.toSorted(
    (a, b) =>
      Date.parse(a.confirmedAt ?? a.recordedAt) -
        Date.parse(b.confirmedAt ?? b.recordedAt) ||
      a.operationId.localeCompare(b.operationId),
  );
}
