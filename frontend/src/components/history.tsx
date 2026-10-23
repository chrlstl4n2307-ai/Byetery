"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/client";
import {
  historyLabels as labels,
  historyResponse,
  type BatteryHistory,
} from "@/lib/history";
export function HistoryTimeline({ history }: { history: BatteryHistory }) {
  const entries = history.entries.toSorted(
    (a, b) =>
      Date.parse(a.confirmedAt ?? a.recordedAt) -
        Date.parse(b.confirmedAt ?? b.recordedAt) ||
      a.operationId.localeCompare(b.operationId),
  );
  return (
    <section
      className="card history-card"
      aria-label="Historial verificado de Testnet"
    >
      <h2>Historial de Stellar Testnet</h2>
      <p>
        Operaciones persistidas y verificación independiente. Este historial no
        reemplaza los tres estados actuales.
      </p>
      <p className="caption">
        RECYCLED registra una atestación autorizada; no es una certificación
        física o ambiental.
      </p>
      {entries.length === 0 ? (
        <p>No hay operaciones persistidas para esta batería.</p>
      ) : (
        <ol className="history-list">
          {entries.map((e) => (
            <li key={e.operationId}>
              <h3>
                {labels[e.kind]} <small>· {e.kind}</small>
              </h3>
              <p>
                <strong>
                  {e.verification === "CONFIRMED"
                    ? "Confirmada"
                    : "Sin verificar"}
                </strong>{" "}
                · <code>{e.verification}</code>
              </p>
              <dl>
                <dt>Carril</dt>
                <dd>
                  {e.category === "REWARD"
                    ? "Recompensa · separada del lifecycle"
                    : "Ciclo / atestación"}
                </dd>
                <dt>Estado persistido de la operación</dt>
                <dd>{e.persistedState}</dd>
                <dt>
                  {e.confirmedAt
                    ? "Fecha del ledger (UTC)"
                    : "Registro SQL (UTC)"}
                </dt>
                <dd>
                  <time dateTime={e.confirmedAt ?? e.recordedAt}>
                    {new Date(e.confirmedAt ?? e.recordedAt)
                      .toISOString()
                      .replace("T", " ")}
                  </time>
                </dd>
                {e.confirmedAt && (
                  <>
                    <dt>Registro SQL (UTC)</dt>
                    <dd>
                      <time dateTime={e.recordedAt}>{e.recordedAt}</time>
                    </dd>
                  </>
                )}
                <dt>Resultado independiente de cadena</dt>
                <dd>{e.chainResult ?? "No disponible"}</dd>
                {e.ledger !== null && (
                  <>
                    <dt>Ledger</dt>
                    <dd>{e.ledger}</dd>
                  </>
                )}
                <dt>Operation ID</dt>
                <dd>
                  <code>{e.operationId}</code>
                </dd>
                <dt>Referencia Testnet</dt>
                <dd>
                  {e.transactionHash ? (
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${e.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <code>{e.transactionHash}</code>
                    </a>
                  ) : (
                    "Sin hash persistido"
                  )}
                </dd>
              </dl>
              {e.verification === "UNVERIFIED" && (
                <p className="notice">
                  UNVERIFIED · {e.reason ?? "Verificación no disponible"}. No se
                  considera éxito por existir en SQL.
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {history.hasMore && (
        <p className="notice">
          Historial limitado a 100 registros; no se afirma que esta lista sea
          completa.
        </p>
      )}
      <p className="caption">
        Deployment: <code>{history.deploymentId}</code> · Source: TESTNET
      </p>
      <p className="caption">
        Verificación consultada:{" "}
        <time dateTime={history.checkedAt}>{history.checkedAt}</time>. Una
        referencia puede quedar fuera de la retención del proveedor.
      </p>
    </section>
  );
}
export function BatteryHistoryView({ batteryId }: { batteryId: string }) {
  const [history, setHistory] = useState<BatteryHistory | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request<BatteryHistory>(
      `/api/batteries/${encodeURIComponent(batteryId)}/history`,
    ).then(
      (value) => {
        if (!active) return;
        if (!historyResponse(value, batteryId)) {
          setError(
            "El historial no coincide con la batería y el deployment TESTNET esperado.",
          );
          return;
        }
        setHistory(value);
      },
      () => {
        if (active)
          setError(
            "No se pudo consultar el historial. No se infiere ninguna confirmación.",
          );
      },
    );
    return () => {
      active = false;
    };
  }, [batteryId]);
  if (error)
    return (
      <section
        className="card history-card"
        aria-label="Historial verificado de Testnet"
      >
        <h2>Historial de Stellar Testnet</h2>
        <p role="alert">{error}</p>
      </section>
    );
  if (!history) return <p role="status">Consultando historial de Testnet…</p>;
  return <HistoryTimeline history={history} />;
}
