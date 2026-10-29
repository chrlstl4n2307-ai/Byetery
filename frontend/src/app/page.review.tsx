import "server-only";
import Link from "next/link";
export const dynamic="force-dynamic";
export default function Page(){return <section className="panel"><h1>Byetery — revisión Testnet</h1><p>Consulta de trazabilidad y atestaciones. Acceso controlado para evaluación.</p><Link href="/login">Iniciar sesión de revisión</Link></section>;}
