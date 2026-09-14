import Link from "next/link";
export default function NotFound() {
  return (
    <section className="card">
      <h1>Página no encontrada</h1>
      <Link href="/dashboard">Volver a mi actividad</Link>
    </section>
  );
}
