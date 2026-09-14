import { Gate } from "@/components/session";
import { Dashboard } from "@/components/dashboard";
export default function Page() {
  return (
    <Gate>
      <Dashboard />
    </Gate>
  );
}
