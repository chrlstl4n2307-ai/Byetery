import "server-only";
import { fixedEvidenceReview } from "@/server/direct-review/evidence";
import { protectedReviewContext } from "@/server/direct-review/pages";
import { ReviewError } from "@/server/direct-review/errors";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
 try { await protectedReviewContext(); } catch (e) { if (e instanceof ReviewError && e.status === 401) redirect("/login"); return <p role="alert">Acceso de revisión no disponible.</p>; }
 const data = fixedEvidenceReview();
 return <section className="panel"><h1>Evidence V1 — integridad</h1><p>Batería histórica: {data.batteryId} · {data.byteLength} bytes</p>
  <p>Bytes intactos: <strong>{data.intact.status}</strong></p><p>Un byte alterado: <strong>{data.tampered.status}</strong></p>
  <p>{data.limitation}</p><h2>Proveniencia de cadena, por separado</h2><p>La comprobación de integridad no constituye una lectura actual de Testnet. Consulta el historial verificado para su estado de red.</p>
  <a href={data.historicalEvidence}>Evidencia histórica D2.5</a></section>;
}
