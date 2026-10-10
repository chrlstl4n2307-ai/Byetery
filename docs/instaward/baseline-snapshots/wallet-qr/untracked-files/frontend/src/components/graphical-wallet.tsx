"use client";
import { useRef, useState } from "react";
import {
  FreighterAdapter,
  WalletError,
  challengeText,
  type WalletAdapter,
} from "@/lib/wallet-adapter";
import { ApiFailure, request } from "@/lib/client";
import type { Challenge } from "@/lib/types";
import { useSession } from "./session";
const freighter = new FreighterAdapter();
export function GraphicalWallet({
  adapter = freighter,
}: {
  adapter?: WalletAdapter;
}) {
  const { refresh } = useSession();
  const [challenge, setChallenge] = useState<Challenge | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [verified, setVerified] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<{
    key: string;
    body: { challengeId: string; signature: string };
  } | null>(null);
  const running = useRef(false);
  async function connect() {
    if (running.current || pending.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    setVerified("");
    setChallenge(null);
    try {
      const connection = await adapter.connect();
      const c = await request<Challenge>(
        "/api/wallet/challenge",
        { address: connection.address },
        crypto.randomUUID(),
      );
      if (c.address !== connection.address)
        throw new WalletError("AccountChanged");
      challengeText(c);
      setChallenge(c);
    } catch (e) {
      setMessage(
        e instanceof WalletError || e instanceof ApiFailure
          ? e.message
          : new WalletError("ProviderFailure").message,
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function signAndVerify() {
    if (running.current || !challenge) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (!pending.current) {
        const proof = await adapter.signChallenge(challenge);
        if (proof.address !== challenge.address)
          throw new WalletError("AccountChanged");
        pending.current = {
          key: crypto.randomUUID(),
          body: {
            challengeId: challenge.challengeId,
            signature: proof.signatureBase64,
          },
        };
      }
      const result = await request<{
        verified: boolean;
        address: string;
        source: string;
      }>("/api/wallet/verify", pending.current.body, pending.current.key);
      if (
        result.verified !== true ||
        result.address !== challenge.address ||
        result.source !== "MOCK"
      )
        throw new WalletError("InvalidSignature");
      pending.current = null;
      setUncertain(false);
      setVerified(result.address);
      setChallenge(null);
      await refresh();
    } catch (e) {
      setMessage(
        e instanceof WalletError || e instanceof ApiFailure
          ? e.message
          : new WalletError("ProviderFailure").message,
      );
      if (pending.current) {
        if (e instanceof ApiFailure && e.status >= 500) setUncertain(true);
        else {
          pending.current = null;
          setUncertain(false);
        }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <p className="eyebrow">WALLET · DEV + MOCK</p>
      <h2>Conecta tu wallet</h2>
      <p>
        Demuestra el control de tu dirección con {adapter.name}. Las claves
        permanecen en la wallet.
      </p>
      {verified && <p role="status">Wallet verificada ✓</p>}
      <button onClick={connect} disabled={busy || uncertain}>
        {challenge ? "Cambiar wallet / nuevo desafío" : "Conectar wallet"}
      </button>
      {challenge && (
        <div className="challenge">
          <p>Revisa el mensaje antes de aprobar la firma.</p>
          <pre className="wallet-message">
            {new TextDecoder().decode(
              Uint8Array.from(atob(challenge.messageBase64), (c) =>
                c.charCodeAt(0),
              ),
            )}
          </pre>
          <button disabled={busy} onClick={signAndVerify}>
            {uncertain
              ? "Consultar/reintentar la misma verificación"
              : `Firmar y verificar con ${adapter.name}`}
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <p className="caption">
        La verificación es criptográfica. Aún no se ejecutan transacciones
        Stellar en esta demo.
      </p>
    </section>
  );
}
export function WalletAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState("");
  return (
    <>
      <code>
        {address.slice(0, 6)}…{address.slice(-6)}
      </code>
      <details>
        <summary>Ver dirección completa</summary>
        <code>{address}</code>
      </details>
      <button
        className="text-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied("Dirección copiada");
          } catch {
            setCopied("Puedes copiar la dirección completa manualmente.");
          }
        }}
      >
        Copiar dirección
      </button>
      <small role="status">{copied}</small>
    </>
  );
}
