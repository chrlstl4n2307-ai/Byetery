import { Gate } from "@/components/session";
import { Operator } from "@/components/operator";
export default function Page() {
  return (
    <Gate role="RECYCLER">
      <Operator kind="RECYCLING" />
    </Gate>
  );
}
