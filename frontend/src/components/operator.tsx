"use client";
import { useState } from "react";
import { evidencePayload, request } from "@/lib/client";
import type { Battery } from "@/lib/types";
import { StateSummary, useMutation } from "./battery";
export function Operator({ kind }: { kind: "COLLECTION" | "RECYCLING" }) {
  const [id, setId] = useState(""),
    [rid, setRid] = useState(""),
    [note, setNote] = useState(
      "Evidencia local de prueba DEV; sin fotografías.",
    ),
    [battery, setBattery] = useState<Battery | null>(null),
    [error, setError] = useState("");
  async function load() {
    try {
      setBattery(
        await request<Battery>("/api/batteries/" + encodeURIComponent(id)),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setBattery(null);
    }
  }
  const action = useMutation(load),
    collection = kind === "COLLECTION",
    expected = collection ? "RETURNED" : "COLLECTED";
  return (
    <>
      <p className="eyebrow">
        {collection ? "PUNTO DE RECOLECCIÓN" : "CENTRO DE RECICLAJE"}
      </p>
      <h1>{collection ? "Confirmar recepción" : "Confirmar reciclaje"}</h1>
      <p>
        {collection
          ? "Verifica físicamente la pila y la solicitud entregada por el usuario."
          : "Comprueba la pila recolectada y registra la evidencia del reciclaje."}
      </p>
      <div className="detail-grid">
        <section className="card">
          <h2>
            {collection ? "RETURNED → COLLECTED" : "COLLECTED → RECYCLED"}
          </h2>
          <label>
            Battery ID
            <input
              value={id}
              onChange={(e) => {
                setId(e.target.value.toUpperCase());
                setBattery(null);
              }}
              maxLength={32}
            />
          </label>
          <label>
            Return Request ID
            <input
              value={rid}
              onChange={(e) => setRid(e.target.value.trim())}
              maxLength={64}
            />
          </label>
          <button
            className="secondary"
            onClick={load}
            disabled={!/^[A-Z0-9-]{1,32}$/.test(id)}
          >
            Consultar pila
          </button>
          <label>
            Nota de evidencia local
            <textarea
              rows={4}
              maxLength={3000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p className="caption">
            La API preserva el manifiesto exacto, calcula SHA-256 y el
            compromiso XDR. Las revisiones son inmutables.
          </p>
          <button
            disabled={
              action.busy ||
              battery?.confirmedBatteryState !== expected ||
              !!battery?.pendingOperation ||
              !/^[a-f0-9]{64}$/.test(rid)
            }
            onClick={() =>
              action.send(
                "/api/returns/" +
                  rid +
                  (collection ? "/collection" : "/recycling"),
                evidencePayload(id, rid, kind, note),
              )
            }
          >
            {collection ? "Confirmar recepción física" : "Confirmar reciclaje"}
          </button>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {action.message && (
            <p role="status" className="notice">
              {action.message}
            </p>
          )}
          {action.uncertain && (
            <button disabled={action.busy} onClick={action.retry}>
              Consultar/reintentar la misma operación
            </button>
          )}
        </section>
        <section className="card">
          {battery ? (
            <StateSummary battery={battery} />
          ) : (
            <div className="empty">
              <h2>Consulta antes de confirmar</h2>
              <p>
                Introduce el Battery ID y el Request ID correspondiente. No se
                modifica el destinatario de la recompensa.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
