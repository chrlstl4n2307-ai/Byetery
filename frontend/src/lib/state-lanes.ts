import type { PendingOperation } from "./types";
/** Display vocabulary only: no lifecycle transitions or reward eligibility rules. */
export type TransactionLaneState =
  | "NO_PENDING_OPERATION"
  | "QUEUED"
  | "PENDING"
  | "UNCERTAIN"
  | "CONFIRMED"
  | "FAILED";
const states: Record<string, TransactionLaneState> = {
  QUEUED: "QUEUED",
  AWAITING_AUTH: "PENDING",
  READY: "PENDING",
  SUBMITTED: "PENDING",
  PENDING: "PENDING",
  UNKNOWN: "UNCERTAIN",
  UNCERTAIN: "UNCERTAIN",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
  REJECTED: "FAILED",
};
const labels: Record<TransactionLaneState, string> = {
  NO_PENDING_OPERATION: "Sin operación pendiente",
  QUEUED: "En cola",
  PENDING: "Pendiente",
  UNCERTAIN: "Resultado incierto",
  CONFIRMED: "Confirmada",
  FAILED: "Fallida",
};
export function transactionPresentation(operation: PendingOperation | null) {
  const state = operation
    ? Object.hasOwn(states, operation.state)
      ? states[operation.state]
      : "UNCERTAIN"
    : "NO_PENDING_OPERATION";
  return { state, label: labels[state], raw: operation?.state ?? null };
}
