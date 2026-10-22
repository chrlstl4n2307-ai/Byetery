import type { PendingOperation } from "@/lib/types";
import { transactionPresentation } from "@/lib/state-lanes";
export function TransactionLane({
  operation,
}: {
  operation: PendingOperation | null;
}) {
  const presentation = transactionPresentation(operation);
  return (
    <section
      className="state-lane transaction-lane"
      aria-label="Estado de transacción Stellar"
    >
      <h2>Estado de transacción Stellar</h2>
      <p
        role={operation ? "status" : undefined}
        className={presentation.state === "FAILED" ? "notice error" : "notice"}
      >
        <strong>{presentation.label}</strong> · {presentation.state}
        {presentation.state === "UNCERTAIN" &&
          ". La incertidumbre no es éxito ni fallo confirmado."}
        {presentation.state === "PENDING" &&
          ". El envío o preparación no confirma el resultado."}
        {operation && " El estado físico confirmado no ha cambiado."}
      </p>
      {operation ? (
        <dl>
          <dt>Estado recibido de la API</dt>
          <dd>{presentation.raw}</dd>
          <dt>Operación</dt>
          <dd>{operation.command}</dd>
          <dt>Operation ID</dt>
          <dd>
            <code>{operation.id}</code>
          </dd>
        </dl>
      ) : (
        <p className="caption">
          El read model no incluye el último recibo terminal. La ausencia de una
          operación pendiente no confirma por sí sola una transacción.
        </p>
      )}
    </section>
  );
}
