"use client";
import { useState } from "react";
import Link from "next/link";
import { request, batteryPath, type WalletSigner } from "@/lib/client";
import type { Challenge } from "@/lib/types";
import { useSession } from "./session";
import { physicalLabel, rewardLabel } from "@/lib/labels";
import { SearchBattery, useMutation } from "./battery";
import { useWebRuntime } from "./web-runtime";
import { displayOperation, transactionPresentation } from "@/lib/state-lanes";
export function WalletLink({ signer }: { signer?: WalletSigner }) {
  const { source, readOnly } = useWebRuntime();
  const { refresh } = useSession();
  const [address, setAddress] = useState(""),
    [challenge, setChallenge] = useState<Challenge | null>(null),
    [signature, setSignature] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const verify = useMutation(async () => {
    await refresh();
    setChallenge(null);
    setSignature("");
  });
  if (readOnly)
    return (
      <section className="card">
        <h2>Wallet</h2>
        <p>Vinculación deshabilitada en la vista de verificación Testnet.</p>
      </section>
    );
  async function start() {
    setBusy(true);
    setMessage("");
    try {
      setChallenge(
        await request<Challenge>(
          "/api/wallet/challenge",
          { address },
          crypto.randomUUID(),
        ),
      );
      setSignature("");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sign() {
    if (!signer || !challenge) return;
    setBusy(true);
    try {
      const proof = await signer.signMessage({
        address: challenge.address,
        message: Uint8Array.from(atob(challenge.messageBase64), (c) =>
          c.charCodeAt(0),
        ),
      });
      setSignature(
        btoa(Array.from(proof, (b) => String.fromCharCode(b)).join("")),
      );
    } catch {
      setMessage("No se pudo obtener la firma. El desafío no fue verificado.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <p className="eyebrow">TU DESTINO DE RECOMPENSAS</p>
      <h2>Vincular wallet</h2>
      <p>
        Prueba el control de una dirección Stellar G… con una firma Ed25519. La
        recompensa{" "}
        {source === "MOCK"
          ? "sigue siendo MOCK"
          : "utiliza tokens de Testnet, sin valor monetario"}
        .
      </p>
      <label>
        Dirección pública G…
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value.trim())}
          maxLength={56}
          placeholder="G…"
          disabled={!!challenge}
        />
      </label>
      <button
        disabled={busy || !/^G[A-Z2-7]{55}$/.test(address)}
        onClick={start}
      >
        Solicitar challenge
      </button>
      {challenge && (
        <div className="challenge">
          <p>
            Firma los bytes exactos del mensaje Base64, una vez decodificados.
            No firmes el texto Base64.
          </p>
          <label>
            Mensaje Base64
            <textarea readOnly value={challenge.messageBase64} rows={5} />
          </label>
          <small>
            Caduca: {new Date(challenge.expiresAt).toLocaleString("es-CL")}
          </small>
          {signer ? (
            <button onClick={sign} disabled={busy}>
              Firmar con {signer.name}
            </button>
          ) : (
            <p className="notice">
              Firma externa: utiliza una herramienta o wallet compatible y pega
              solo la firma. La conexión a una wallet gráfica aún está
              pendiente. Nunca pegues tu clave privada.
            </p>
          )}
          <label>
            Firma Ed25519 en Base64
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value.trim())}
              maxLength={88}
            />
          </label>
          <button
            disabled={verify.busy || !signature}
            onClick={() =>
              verify.send("/api/wallet/verify", {
                challengeId: challenge.challengeId,
                signature,
              })
            }
          >
            Verificar firma
          </button>
          <button
            className="text-button"
            disabled={verify.busy}
            onClick={() => {
              setChallenge(null);
              setSignature("");
            }}
          >
            Nuevo desafío
          </button>
        </div>
      )}
      {(message || verify.message) && (
        <p role="status" className="notice">
          {message || verify.message}
        </p>
      )}
    </section>
  );
}
export function Dashboard() {
  const { user, profile, refresh } = useSession();
  const runtime = useWebRuntime();
  const source = profile?.source ?? runtime.source;
  return (
    <>
      <p className="eyebrow">CADA DEVOLUCIÓN CUENTA</p>
      <div className="page-heading">
        <div>
          <h1>Tu actividad circular</h1>
          <p>
            Consulta tus baterías, acompaña su recorrido y revisa tus
            recompensas.
          </p>
        </div>
        <button className="secondary" onClick={refresh}>
          Actualizar
        </button>
      </div>
      <div className="hero-strip">
        <div>
          <h2>El siguiente paso empieza con una batería.</h2>
          <p>
            Busca su identificador para conocer su estado y solicitar una
            devolución.
          </p>
        </div>
        <span aria-hidden="true">↻</span>
      </div>
      <SearchBattery />
      <div className="stats">
        <div className="card">
          <small>CUENTA</small>
          <strong className="email">{user?.email}</strong>
        </div>
        <div className="card">
          <small>WALLET</small>
          <strong>
            {profile?.wallets.length ? "Verificada ✓" : "Pendiente de vincular"}
          </strong>
        </div>
        <div className="card">
          <small>SOLICITUDES MOSTRADAS</small>
          <strong>{profile?.requests.length ?? 0}</strong>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <h2>Mis devoluciones</h2>
          <p>
            El ciclo atestado, la transacción Stellar y la recompensa se
            muestran por separado.
          </p>
          {!profile?.requests.length ? (
            <div className="empty">
              <span>↗</span>
              <h3>Tu primera devolución está por comenzar</h3>
              <p>Vincula tu wallet y busca una batería registrada.</p>
            </div>
          ) : (
            <div className="request-list">
              {profile.requests.map((r) => (
                <article key={r.requestId}>
                  <Link href={batteryPath(r.batteryId)}>
                    <strong>{r.batteryId} →</strong>
                  </Link>
                  <p>
                    {r.requestState === "CANCELLED"
                      ? "Solicitud cancelada"
                      : r.confirmedBatteryState === "RETURNED"
                        ? "Devolución solicitada"
                        : physicalLabel(r.confirmedBatteryState)}
                  </p>
                  <code>{r.requestId}</code>
                  <p>
                    Recompensa: <b>{rewardLabel(r.confirmedRewardState)}</b>
                    {r.confirmedRewardState === "SENT"
                      ? source === "MOCK"
                        ? " · 10 GREEN-TEST"
                        : " · 10 GREENTEST de Testnet"
                      : ""}
                  </p>
                  <p>
                    Transacción Stellar:{" "}
                    <b>{transactionPresentation(displayOperation(r)).label}</b>
                    {displayOperation(r)
                      ? ` · ${displayOperation(r)?.state}`
                      : " · Sin operación disponible para mostrar"}
                    {displayOperation(r)?.state === "REJECTED" &&
                      (displayOperation(r)?.failureScope === "CHAIN"
                        ? " · fallo confirmado en Stellar"
                        : " · rechazo de aplicación, no fallo confirmado en Stellar")}
                  </p>
                </article>
              ))}
            </div>
          )}
          {profile?.hasMoreRequests && (
            <p>Se muestran las 100 solicitudes más recientes.</p>
          )}
        </section>
        <div>
          {profile?.wallets.map((w) => (
            <div className="card wallet-summary" key={w.id}>
              <h3>Wallet verificada ✓</h3>
              <code>{w.address}</code>
              <p>
                {source === "MOCK"
                  ? "Dirección para GREEN-TEST simulado."
                  : "Dirección de recompensa registrada para GREENTEST de Testnet."}
              </p>
            </div>
          ))}
          <WalletLink />
        </div>
      </div>
    </>
  );
}
