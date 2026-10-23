import type {
  BatteryHistory,
  HistoryEntry,
} from "../../../backend/src/history/model";
import { TESTNET_DEPLOYMENT_ID } from "./web-config";
export type { BatteryHistory, HistoryEntry };
export const historyLabels: Record<HistoryEntry["kind"], string> = {
  REGISTERED: "Registro",
  RETURNED: "Devolución solicitada",
  COLLECTED: "Recolección",
  RECYCLED: "Atestación de reciclaje",
  REWARD: "Recompensa",
  CANCELLED: "Cancelación",
  OTHER: "Otra operación",
};
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
function date(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
export function historyResponse(
  value: unknown,
  batteryId: string,
): value is BatteryHistory {
  if (
    !record(value) ||
    value.source !== "TESTNET" ||
    value.network !== "STELLAR TESTNET" ||
    value.deploymentId !== TESTNET_DEPLOYMENT_ID ||
    value.contractAddress !==
      "CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON" ||
    value.batteryId !== batteryId ||
    !date(value.checkedAt) ||
    typeof value.hasMore !== "boolean" ||
    !Array.isArray(value.entries) ||
    value.entries.length > 100
  )
    return false;
  return value.entries.every(
    (e) =>
      record(e) &&
      typeof e.kind === "string" &&
      Object.hasOwn(historyLabels, e.kind) &&
      e.category === (e.kind === "REWARD" ? "REWARD" : "LIFECYCLE") &&
      typeof e.operationId === "string" &&
      typeof e.persistedState === "string" &&
      ["CONFIRMED", "UNVERIFIED"].includes(String(e.verification)) &&
      date(e.recordedAt) &&
      (e.confirmedAt === null || date(e.confirmedAt)) &&
      (e.transactionHash === null ||
        (typeof e.transactionHash === "string" &&
          /^[0-9a-f]{64}$/.test(e.transactionHash))) &&
      (e.ledger === null ||
        (typeof e.ledger === "number" &&
          Number.isSafeInteger(e.ledger) &&
          e.ledger > 0)) &&
      ["SUCCESS", "FAILED", null].includes(e.chainResult as string | null) &&
      (e.reason === null || typeof e.reason === "string") &&
      (e.verification !== "CONFIRMED" ||
        (e.persistedState === "CONFIRMED" &&
          e.chainResult === "SUCCESS" &&
          e.transactionHash !== null &&
          e.confirmedAt !== null &&
          e.ledger !== null)),
  );
}
