import { Gate } from "@/components/session";
import { BatteryView } from "@/components/battery";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ batteryId: string }>;
}) {
  const { batteryId } = await params;
  if (!/^[A-Z0-9-]{1,32}$/.test(batteryId)) notFound();
  return (
    <Gate>
      <BatteryView id={batteryId} />
    </Gate>
  );
}
