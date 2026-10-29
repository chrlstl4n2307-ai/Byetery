import "server-only";
import Link from "next/link";
import type { ReviewBattery, ReviewProfile, Verification } from "@/shared/review/model";
import { transactionPresentation } from "@/lib/state-lanes";
import { CreateReviewIntent } from "./review-actions";
export function ReviewProfileView({ profile }: { profile: ReviewProfile }) {
 return <><h1>Revisión Byetery</h1><p className="notice">Rol de revisión: <strong>{profile.roles.join(", ")}</strong></p>
  <p>Modo revisión: las acciones operativas se demuestran mediante evidencia histórica de Testnet.</p>
  <nav><Link href="/dashboard">Resumen</Link> · <Link href="/review/evidence">Evidence V1</Link></nav>
  <h2>Baterías aprobadas</h2><ul>{profile.batteries.map(id => <li key={id}><Link href={`/battery/${id}`}>{id}</Link></li>)}</ul>
  {profile.roles.includes("COLLECTOR") && <p>Evidencia de recolección: consulta el historial de las baterías aprobadas.</p>}
  {profile.roles.includes("RECYCLER") && <p>Evidencia de reciclaje: consulta el historial y la recompensa por separado.</p>}
  {profile.roles.includes("ADMIN") && profile.canCreateIntent && <CreateReviewIntent />}
 </>;
}
export function ReviewBatteryView({ battery, verification }: { battery: ReviewBattery; verification: Verification }) {
 const op = battery.pendingOperation ?? battery.latestTerminalOperation;
 const tx = transactionPresentation(op ? { state: op.status } : null);
 return <section className="panel"><h1>{battery.batteryId}</h1><div className="grid">
  <article><h2>Lifecycle / atestación</h2><p>{battery.confirmedBatteryState ?? "Sin estado confirmado"}</p></article>
  <article><h2>Transacción Stellar · estado persistido</h2><p>{tx.label}</p><small>{tx.raw ?? "Sin operación: no implica éxito"}</small>
   {op?.errorCode === "APPLICATION_REJECTED" && <p>Rechazo de aplicación; no demuestra un fallo confirmado en cadena.</p>}
   {op?.errorCode === "CONFIRMED_CHAIN_FAILURE" && <p>Fallo confirmado en Stellar.</p>}
  </article>
  <article><h2>Recompensa</h2><p>{battery.confirmedRewardState ?? "Sin recompensa confirmada"}</p></article>
 </div><p>Verificación de red independiente: <strong>{verification.status}</strong> — {verification.reason}</p>
  <p>La indisponibilidad o expiración de datos de red no borra el estado persistido.</p>
  {battery.ownRequest && <p>Mi solicitud: {battery.ownRequest.requestId} · {battery.ownRequest.requestState ?? battery.ownRequest.reservationState}</p>}
 </section>;
}
