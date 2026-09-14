import { Gate } from "@/components/session";
import { SearchBattery, RegisterBattery } from "@/components/battery";
export default function Page() {
  return (
    <Gate role="ADMIN">
      <p className="eyebrow">ADMINISTRACIÓN DEV</p>
      <h1>Una identidad para cada pila</h1>
      <p>
        Registra pilas y consulta sus resultados. La asignación de roles
        continúa siendo una operación interna.
      </p>
      <div className="detail-grid">
        <RegisterBattery />
        <section className="card">
          <SearchBattery />
          <p>Abre una pila reciclada para procesar su recompensa simulada.</p>
        </section>
      </div>
    </Gate>
  );
}
