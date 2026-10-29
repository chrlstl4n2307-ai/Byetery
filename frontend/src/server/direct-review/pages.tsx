import "server-only";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { productionReviewDependencies } from "./runtime";
import { authenticate } from "./auth";
import { ReviewError } from "./errors";
import { ReviewProfileView, ReviewBatteryView } from "@/components/review-view";
import { historyLabels } from "@/lib/history";
import { verifySnapshot } from "./chain";
export async function protectedReviewContext() {
 await headers(); const deps = await productionReviewDependencies(); const user = await authenticate(await deps.token(), deps.auth, deps.strategy, deps.liveness);
 const profile = await deps.database.profile(user.id); return { deps, user, profile };
}
export async function reviewPage(role?: string, batteryId?: string) {
 try {
  const { deps, user, profile } = await protectedReviewContext();
  if (role && !profile.roles.includes(role as typeof profile.roles[number])) return <p role="alert">Acceso de revisión no habilitado para esta función.</p>;
  if (!batteryId) return <ReviewProfileView profile={profile} />;
  const [battery, rows] = await Promise.all([deps.database.battery(user.id, batteryId), deps.database.history(user.id, batteryId)]);
  const { networkVerification: verification, entries, mismatch } = await verifySnapshot(battery, rows.entries, deps.chain);
  if (mismatch) return <p role="alert">MISMATCH: la evidencia de red contradice el contexto esperado. Revisión detenida.</p>;
  return <><ReviewProfileView profile={{ ...profile, canCreateIntent: false }} /><ReviewBatteryView battery={battery} verification={verification} />
   <section className="panel"><h2>Historial confirmado y su verificación</h2><ol>{entries.map(e => <li key={e.operationId}><strong>{historyLabels[e.kind]}</strong> · {e.status} · {e.verification.confirmedAt ?? e.createdAt}
    <p>Verificación: {e.verification.status} · {e.verification.verifiedAt}</p>{e.transactionHash && <a href={`https://stellar.expert/explorer/testnet/tx/${e.transactionHash}`} target="_blank" rel="noreferrer">Transacción pública</a>}
   </li>)}</ol></section></>;
 } catch (e) {
  if (e instanceof ReviewError && e.status === 401) redirect("/login");
  if (e instanceof ReviewError && e.status === 404) notFound();
  return <p role="alert">La revisión no está disponible. No se ha inferido ningún éxito de red.</p>;
 }
}
