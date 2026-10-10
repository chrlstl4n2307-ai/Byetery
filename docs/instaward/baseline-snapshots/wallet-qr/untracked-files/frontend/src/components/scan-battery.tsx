"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { batteryFromQr, startCamera } from "@/lib/qr-scanner";
import { batteryPath, request } from "@/lib/client";
export function ScanBattery({
  onDetected,
}: {
  onDetected?: (id: string) => Promise<void>;
}) {
  const router = useRouter(),
    video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false),
    [message, setMessage] = useState(""),
    [manual, setManual] = useState(""),
    [busy, setBusy] = useState(false);
  const handler = useRef(onDetected);
  useEffect(() => {
    handler.current = onDetected;
  }, [onDetected]);
  async function open(id: string) {
    setBusy(true);
    setMessage("");
    try {
      if (handler.current) await handler.current(id);
      else {
        await request("/api/batteries/" + encodeURIComponent(id));
        router.push(batteryPath(id));
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos consultar esa batería.",
      );
    } finally {
      setBusy(false);
    }
  }
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    if (!active || !video.current) return;
    let alive = true;
    const stop = startCamera(
      video.current,
      (value) => {
        if (!alive) return;
        setActive(false);
        const id = batteryFromQr(value);
        if (!id) {
          setMessage("QR inválido. Usa un QR de batería generado por Byetery.");
          return;
        }
        void openRef.current(id);
      },
      (error) => {
        if (alive) {
          setMessage(error);
          setActive(false);
        }
      },
    );
    const hide = () => {
      stop();
      setActive(false);
    };
    const visibility = () => {
      if (document.hidden) hide();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("keydown", escape);
    return () => {
      alive = false;
      stop();
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("keydown", escape);
    };
  }, [active]);
  return (
    <section className="card scanner">
      <button
        className="secondary"
        disabled={active || busy}
        onClick={() => {
          setMessage("");
          setActive(true);
        }}
      >
        Escanear batería
      </button>
      <p className="caption">
        El QR solo identifica una batería. Escanear no confirma recepciones,
        reciclajes ni recompensas.
      </p>
      {active && (
        <div>
          <video
            ref={video}
            muted
            playsInline
            aria-label="Vista de cámara para escanear QR"
          />
          <button className="text-button" onClick={() => setActive(false)}>
            Cerrar cámara
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setActive(false);
          void open(manual);
        }}
      >
        <label>
          Ingresar ID manualmente
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            maxLength={32}
            pattern="[A-Z0-9-]{1,32}"
            required
          />
        </label>
        <button disabled={busy || !/^[A-Z0-9-]{1,32}$/.test(manual)}>
          Consultar ID
        </button>
      </form>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
