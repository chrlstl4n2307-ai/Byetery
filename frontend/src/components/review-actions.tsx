"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RegistrationIntent } from "@/shared/review/model";
export function ReviewLogin() {
 const [error, setError] = useState(""), router = useRouter();
 return <form onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); try {
  const r = await fetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.get("email"), password: f.get("password") }) });
  if (!r.ok) throw Error("No fue posible iniciar sesión. Revisa tus datos o vuelve a intentar."); router.push("/dashboard"); router.refresh();
 } catch (e) { setError((e as Error).message); } }}>
  <label>Correo<input type="email" name="email" required autoComplete="username" /></label>
  <label>Contraseña<input type="password" name="password" required autoComplete="current-password" /></label>
  <button type="submit">Iniciar sesión</button>{error && <p role="alert">{error}</p>}
 </form>;
}
export function ReviewLogout() { const [error, setError] = useState(""), router = useRouter(); return <><button onClick={async () => {
 try { const r = await fetch("/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!r.ok) throw Error(); router.push("/login"); router.refresh(); } catch { setError("No fue posible cerrar la sesión."); }
 }}>Cerrar sesión</button>{error && <p role="alert">{error}</p>}</>; }
export function CreateReviewIntent() {
 const key = useRef<string | null>(null), [intent, setIntent] = useState<RegistrationIntent | null>(null), [error, setError] = useState(""), [pending, setPending] = useState(false);
 async function send() {
  key.current ??= crypto.randomUUID(); setPending(true); setError("");
  try { const r = await fetch("/api/review/registration-intents", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key.current }, body: JSON.stringify({ templateVersion: 1 }) });
   const b = await r.json(); if (!r.ok) { setError(b.error?.code === "OutcomeUnknown" ? "Resultado incierto. Reintenta con la misma clave; no se creará una intención de reemplazo." : "Solicitud rechazada o servicio no disponible."); return; } setIntent(b);
  } catch { setError("Resultado incierto. Conserva esta pantalla y reintenta la misma intención."); } finally { setPending(false); }
 }
 return <section className="panel"><h2>Intención de registro sintético</h2><button disabled={pending || !!intent} onClick={send}>{pending ? "Enviando…" : error ? "Reintentar la misma intención" : "Crear intención de revisión"}</button>
  {error && <p role="alert">{error}</p>}{intent && <><p>Estado: <strong>{intent.status}</strong></p><p>La intención está registrada, pero todavía no existe una transacción Stellar confirmada.</p>
   <p>Batería: {intent.batteryId}</p><p>Operación reservada: {intent.operationId}</p><p>Compromiso de registro: {intent.registrationHash}</p>
   <button onClick={async () => { const r = await fetch(`/api/review/registration-intents/${intent.operationId}`, { cache: "no-store" }); if (r.ok) setIntent(await r.json()); else setError("No fue posible consultar el estado."); }}>Consultar intención</button></>}
 </section>;
}
