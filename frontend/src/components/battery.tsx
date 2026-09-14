"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ApiFailure, batteryPath, qrValue, request } from "@/lib/client";
import type { Battery, BatteryState } from "@/lib/types";
import { useSession } from "./session";
import { physicalLabel, rewardLabel } from "@/lib/labels";
export const stages: {
  state: BatteryState;
  label: string;
  description: string;
}[] = [
  { state: "REGISTERED", label: "Registrada", description: "Identidad creada" },
  {
    state: "RETURNED",
    label: "Devolución solicitada",
    description: "Pendiente de recepción física",
  },
  {
    state: "COLLECTED",
    label: "Recolectada",
    description: "Recepción confirmada",
  },
  {
    state: "RECYCLED",
    label: "Reciclada",
    description: "Reciclaje confirmado",
  },
];
export function Timeline({ state }: { state: BatteryState | null }) {
  const current = stages.findIndex((s) => s.state === state);
  return (
    <ol className="timeline" aria-label="Estado físico confirmado">
      {stages.map((s, i) => (
        <li
          key={s.state}
          className={i <= current ? "done" : ""}
          aria-current={i === current ? "step" : undefined}
        >
          <span className="step-icon">{i <= current ? "✓" : i + 1}</span>
          <div>
            <strong>{s.label}</strong>
            <small>{s.state}</small>
            <p>{s.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function SearchBattery() {
  const router = useRouter();
  const [id, setId] = useState("");
  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(batteryPath(id));
      }}
    >
      <label htmlFor="battery-search">
        Consultar una batería
        <input
          id="battery-search"
          value={id}
          onChange={(e) => setId(e.target.value.toUpperCase())}
          pattern="[A-Z0-9-]{1,32}"
          maxLength={32}
          required
          placeholder="BYE-000001"
        />
      </label>
      <button type="submit">Buscar batería →</button>
    </form>
  );
}
export function BatteryQR({ id }: { id: string }) {
  return (
    <div className="qr">
      <QRCodeSVG value={qrValue(id)} size={136} title={"QR de " + id} />
      <Link href={qrValue(id)}>{id}</Link>
      <small>Solo identifica la batería. No concede permisos.</small>
    </div>
  );
}
export function StateSummary({ battery }: { battery: Battery }) {
  const completed =
    battery.confirmedBatteryState === "RECYCLED" &&
    battery.confirmedRewardState === "SENT";
  return (
    <>
      <div className="status-line">
        <span className="pill">
          {physicalLabel(battery.confirmedBatteryState).toLocaleUpperCase("es")}
        </span>
        <span className="caption">
          {battery.confirmedBatteryState
            ? "Confirmado"
            : "Pendiente de confirmación"}{" "}
          · Entorno de demostración
        </span>
      </div>
      <Timeline state={battery.confirmedBatteryState} />
      {battery.pendingOperation && (
        <p className="notice" role="status">
          {battery.pendingOperation.state === "UNKNOWN"
            ? "Resultado incierto"
            : "Operación pendiente"}
          . El estado físico confirmado no ha cambiado.
        </p>
      )}
      {battery.lastAttempt?.state === "FAILED" && (
        <p className="notice error">
          Intento fallido · El último intento de recompensa fue rechazado. El
          estado físico se conserva.
        </p>
      )}
      <div className={completed ? "reward reward-complete" : "reward"}>
        <span className="reward-icon" aria-hidden="true">
          {completed ? "↻" : "✳"}
        </span>
        <div>
          <small>RECOMPENSA SIMULADA</small>
          {completed && (
            <>
              <h2>Ciclo completado</h2>
              <p>
                Tu batería fue reciclada correctamente en esta demostración.
              </p>
              <p className="reward-amount">
                +10 <span>GREEN-TEST</span>
              </p>
            </>
          )}
          <h3>{rewardLabel(battery.confirmedRewardState)}</h3>
          <p>
            {completed
              ? "Recompensa enviada ✓"
              : battery.confirmedRewardState === "PENDING"
                ? "Lista para procesar tras el reciclaje confirmado"
                : "Disponible después del reciclaje confirmado"}
          </p>
        </div>
      </div>
      <details className="technical-details">
        <summary>Detalles técnicos</summary>
        <dl>
          <dt>Estado físico</dt>
          <dd>{battery.confirmedBatteryState ?? "Sin confirmar"}</dd>
          <dt>Estado de recompensa</dt>
          <dd>{battery.confirmedRewardState ?? "Sin confirmar"}</dd>
          <dt>Origen blockchain</dt>
          <dd>{battery.source} · El mock no ejecuta el contrato Soroban.</dd>
          {battery.pendingOperation && (
            <>
              <dt>Operación</dt>
              <dd>
                {battery.pendingOperation.state} ·{" "}
                {battery.pendingOperation.command}
              </dd>
            </>
          )}
        </dl>
      </details>
    </>
  );
}

/** Preserve an idempotency key + exact input in memory until a definitive response.
 * No automatic retry of mutations. Different uncertain operations cannot replace it. */
export function useMutation(onSuccess: () => Promise<void> | void) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const operation = useRef<{ path: string; body: unknown; key: string } | null>(
    null,
  );
  const running = useRef(false);
  async function send(path: string, body: unknown = {}) {
    if (running.current) return;
    if (
      operation.current &&
      (operation.current.path !== path ||
        JSON.stringify(operation.current.body) !== JSON.stringify(body))
    ) {
      setMessage(
        "Primero resuelve la operación incierta anterior con el mismo contenido.",
      );
      return;
    }
    operation.current ??= { path, body, key: crypto.randomUUID() };
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await request<{
        pendingOperation?: { state: string } | null;
      }>(path, body, operation.current.key);
      if (result.pendingOperation) {
        setUncertain(true);
        setMessage(
          "Operación pendiente de confirmación. Actualiza para consultar el resultado.",
        );
      } else {
        operation.current = null;
        setUncertain(false);
        setMessage("Operación confirmada por la API.");
      }
      await onSuccess();
    } catch (e) {
      setMessage((e as Error).message);
      if (e instanceof ApiFailure && e.status < 500) {
        operation.current = null;
        setUncertain(false);
      } else setUncertain(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const retry = () => {
    const pending = operation.current;
    if (pending) return send(pending.path, pending.body);
  };
  return { send, retry, busy, message, uncertain };
}
export function BatteryView({ id }: { id: string }) {
  const { profile, refresh } = useSession();
  const [battery, setBattery] = useState<Battery | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setBattery(
        await request<Battery>("/api/batteries/" + encodeURIComponent(id)),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    let active = true;
    request<Battery>("/api/batteries/" + encodeURIComponent(id)).then(
      (value) => {
        if (active) {
          setBattery(value);
          setError("");
        }
      },
      (e) => {
        if (active) setError((e as Error).message);
      },
    );
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!battery?.pendingOperation) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [battery?.pendingOperation, load]);
  const action = useMutation(async () => {
    await load();
    await refresh();
  });
  if (error)
    return (
      <p role="alert" className="notice error">
        {error}
        <button onClick={load}>Volver a consultar</button>
      </p>
    );
  if (!battery) return <p role="status">Consultando batería…</p>;
  const own = battery.ownRequest;
  const canCancel =
    battery.confirmedBatteryState === "RETURNED" &&
    own?.requestState === "OPEN";
  return (
    <>
      <p className="eyebrow">EL RECORRIDO DE TU BATERÍA</p>
      <div className="page-heading">
        <div>
          <h1>{battery.batteryId}</h1>
          <p>Una identidad. Cada etapa verificable.</p>
        </div>
        <button className="secondary" onClick={load}>
          Actualizar estado
        </button>
      </div>
      <div className="detail-grid">
        <section className="card">
          <StateSummary battery={battery} />
          <div className="actions">
            {battery.confirmedBatteryState === "REGISTERED" && (
              <button
                disabled={
                  action.busy ||
                  !profile?.wallets.length ||
                  !!battery.pendingOperation
                }
                onClick={() => action.send("/api/batteries/" + id + "/returns")}
              >
                Solicitar devolución
              </button>
            )}
            {battery.confirmedBatteryState === "REGISTERED" &&
              !profile?.wallets.length && (
                <Link href="/dashboard">
                  Vincula una wallet verificada para continuar
                </Link>
              )}
            {canCancel && (
              <button
                className="secondary"
                disabled={action.busy || !!battery.pendingOperation}
                onClick={() =>
                  action.send("/api/returns/" + own.requestId + "/cancel")
                }
              >
                Cancelar devolución
              </button>
            )}
            {profile?.roles.includes("ADMIN") &&
              battery.confirmedRewardState === "PENDING" && (
                <button
                  disabled={action.busy || !!battery.pendingOperation}
                  onClick={() =>
                    action.send("/api/batteries/" + id + "/reward")
                  }
                >
                  Procesar recompensa DEV
                </button>
              )}
            {action.uncertain && (
              <button
                className="secondary"
                disabled={action.busy}
                onClick={action.retry}
              >
                Consultar/reintentar la misma operación
              </button>
            )}
            {action.message && (
              <p role="status" className="notice">
                {action.message}
              </p>
            )}
          </div>
          {own && (
            <div className="request-code">
              <small>Tu Request ID</small>
              <code>{own.requestId}</code>
              <p>
                {own.requestState === "CANCELLED"
                  ? "Solicitud cancelada"
                  : own.reservationState}
              </p>
            </div>
          )}
        </section>
        <section className="card">
          <h2>Ficha de la batería</h2>
          <dl>
            <dt>Tipo</dt>
            <dd>{battery.metadata?.type || "No registrado"}</dd>
            <dt>Marca / fabricante</dt>
            <dd>{battery.metadata?.manufacturer || "No registrado"}</dd>
            <dt>Lote</dt>
            <dd>{battery.metadata?.batch || "No registrado"}</dd>
          </dl>
          <BatteryQR id={id} />
        </section>
      </div>
    </>
  );
}
export function RegisterBattery() {
  const [id, setId] = useState("");
  const action = useMutation(() => {});
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action.send("/api/batteries", {
      batteryId: id,
      metadata: {
        type: f.get("type"),
        manufacturer: f.get("manufacturer"),
        batch: f.get("batch"),
      },
    });
  }
  return (
    <section className="card">
      <h2>Registrar una batería</h2>
      <form onSubmit={submit}>
        <label>
          Battery ID
          <input
            required
            pattern="[A-Z0-9-]{1,32}"
            maxLength={32}
            value={id}
            onChange={(e) => setId(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Tipo
          <input
            name="type"
            required
            maxLength={160}
            placeholder="Pila AA alcalina"
          />
        </label>
        <label>
          Marca / fabricante
          <input name="manufacturer" required maxLength={160} />
        </label>
        <label>
          Lote
          <input name="batch" required maxLength={160} />
        </label>
        <button disabled={action.busy}>Registrar batería</button>
      </form>
      {action.message && (
        <p role="status" className="notice">
          {action.message}
        </p>
      )}
      {action.uncertain && (
        <button disabled={action.busy} onClick={action.retry}>
          Reintentar misma operación
        </button>
      )}
      {action.message && !action.uncertain && (
        <Link href={batteryPath(id)}>Consultar resultado →</Link>
      )}
    </section>
  );
}
