import { Gate } from "@/components/session";
import { SearchBattery, RegisterBattery } from "@/components/battery";
export default function Page() {
  return (
    <Gate role="ADMIN">
      <p className="eyebrow">ADMINISTRACIÓN DEV</p>
      <h1>Una identidad para cada batería</h1>
      <p>
        Registra baterías y consulta sus resultados. La asignación de roles
        continúa siendo una operación interna.
      </p>
      <div className="detail-grid">
        <RegisterBattery />
        <section className="card">
          <SearchBattery />
          <p>
            Abre una batería reciclada para procesar su recompensa simulada.
          </p>
        </section>
      </div>
    </Gate>
  );
}
