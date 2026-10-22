import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NetworkIndicator, WebRuntimeProvider } from "@/components/web-runtime";
import { StateSummary, BatteryView } from "@/components/battery";
import { Operator } from "@/components/operator";
import { WalletLink } from "@/components/dashboard";
import { request } from "@/lib/client";
import type { Battery } from "@/lib/types";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard",
}));
vi.mock("@/components/session", () => ({
  useSession: () => ({
    profile: { roles: ["ADMIN"], wallets: [{ id: "fixture" }] },
    refresh: vi.fn(),
  }),
}));
vi.mock("@/lib/client", async (original) => ({
  ...(await original<typeof import("@/lib/client")>()),
  request: vi.fn(),
}));
const battery: Battery = {
  batteryId: "BYE-W1-002-64257020134D4A0F",
  source: "TESTNET",
  confirmedBatteryState: "RECYCLED",
  confirmedRewardState: "PENDING",
  pendingOperation: null,
  lastAttempt: null,
};
const runtime = {
  environment: "D2_PREVIEW" as const,
  source: "TESTNET" as const,
  readOnly: true,
};
it("TESTNET renders correct network and reward labels without MOCK claims", () => {
  const { container } = render(
    <WebRuntimeProvider value={runtime}>
      <NetworkIndicator source="TESTNET" />
      <StateSummary battery={battery} />
    </WebRuntimeProvider>,
  );
  expect(screen.getByText("STELLAR TESTNET")).toBeTruthy();
  expect(screen.getByText("RECOMPENSA TESTNET")).toBeTruthy();
  expect(container.textContent).not.toMatch(
    /MOCK|SIMULADA|reciclada correctamente/i,
  );
  expect(screen.queryByText("Ciclo completado")).toBeNull();
});
it("TESTNET reads do not expose mutation actions even for ADMIN", async () => {
  vi.mocked(request).mockResolvedValue(battery);
  render(
    <WebRuntimeProvider value={runtime}>
      <BatteryView id={battery.batteryId} />
    </WebRuntimeProvider>,
  );
  await screen.findByRole("heading", { name: battery.batteryId });
  expect(
    screen.queryByRole("button", {
      name: /Procesar recompensa|Solicitar devolución|Cancelar/,
    }),
  ).toBeNull();
  expect(screen.getByText(/mutaciones están deshabilitadas/)).toBeTruthy();
});
it("read-only operator and wallet screens cannot dispatch", () => {
  render(
    <WebRuntimeProvider value={runtime}>
      <Operator kind="COLLECTION" />
      <WalletLink />
    </WebRuntimeProvider>,
  );
  expect(
    screen.queryByRole("button", {
      name: /Confirmar|challenge|Verificar firma/,
    }),
  ).toBeNull();
});
it("MOCK still states that it does not execute Soroban", () => {
  render(<StateSummary battery={{ ...battery, source: "MOCK" }} />);
  expect(
    screen.getByText(/El mock no ejecuta el contrato Soroban/),
  ).toBeTruthy();
  expect(screen.getByText("RECOMPENSA SIMULADA")).toBeTruthy();
});
