import type { Battery, PendingOperation } from "./types";
/** Display only. Mutation controls must continue to use unresolved pendingOperation. */
export function displayOperation(
  battery: Pick<Battery, "pendingOperation" | "latestTerminalOperation">,
) {
  return battery.pendingOperation ?? battery.latestTerminalOperation ?? null;
}
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
export function transactionPresentation<T extends Pick<PendingOperation, "state">>(operation: T | null) {
  const state = operation
    ? Object.hasOwn(states, operation.state)
      ? states[operation.state]
      : "UNCERTAIN"
    : "NO_PENDING_OPERATION";
  return { state, label: labels[state], raw: operation?.state ?? null };
}
