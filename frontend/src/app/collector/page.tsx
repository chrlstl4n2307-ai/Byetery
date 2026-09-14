import { Gate } from "@/components/session";
import { Operator } from "@/components/operator";
export default function Page() {
  return (
    <Gate role="COLLECTOR">
      <Operator kind="COLLECTION" />
    </Gate>
  );
}
