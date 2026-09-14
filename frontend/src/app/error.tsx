"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="card">
      <h1>No pudimos cargar esta pantalla</h1>
      <p>Consulta el estado antes de repetir una operación.</p>
      <button onClick={reset}>Volver a cargar</button>
    </section>
  );
}
