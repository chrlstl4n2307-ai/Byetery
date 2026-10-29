import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import models from "../../docs/instaward/d2/evidence/d2-007/state-read-models.json";
import historical from "../../docs/instaward/d2/evidence/d2-007/historical-control.json";
import { BatteryView as BatteryDetail, StateSummary } from "@/components/battery";
import { Dashboard } from "@/components/dashboard";
import type { Battery } from "@/lib/types";
import { displayOperation } from "@/lib/state-lanes";
const mock = vi.hoisted(() => ({
  battery: null as Battery | null,
  requests: [] as unknown[],
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/client", async (original) => ({
  ...(await original<typeof import("@/lib/client")>()),
  request: vi.fn(async () => mock.battery),
}));
vi.mock("@/components/session", () => ({
  useSession: () => ({
    user: {},
    refresh: vi.fn(),
    profile: {
      roles: ["USER", "ADMIN"],
      wallets: [{ id: "LOCAL-WALLET" }],
      requests: mock.requests,
      source: "MOCK",
    },
  }),
}));
beforeEach(() => {
  mock.battery = null;
  mock.requests = [];
});

for (const record of models.cases)
  it(`D2.3 actual API disclosure ${record.case}: three independent lanes`, () => {
    const b = record.battery as Battery;
    render(<StateSummary battery={b} />);
    const lifecycle = screen.getByRole("region", {
      name: "Estado de ciclo y atestación",
    });
    const transaction = screen.getByRole("region", {
      name: "Estado de transacción Stellar",
    });
    const reward = screen.getByRole("region", { name: "Estado de recompensa" });
    expect(transaction.textContent).toContain(record.expected.lane);
    const txLabels: Record<string, string> = { PENDING: "Pendiente", UNCERTAIN: "Resultado incierto", CONFIRMED: "Confirmada", FAILED: "Fallida", QUEUED: "En cola", NO_PENDING_OPERATION: "Sin operación pendiente" };
    expect(transaction.querySelector("strong")?.textContent).toBe(txLabels[record.expected.lane]);
    expect(reward.textContent).toContain(b.confirmedRewardState);
    const labels = {
      REGISTERED: "REGISTRADA",
      COLLECTED: "RECOLECTADA",
      RECYCLED: "RECICLADA",
    };
    expect(lifecycle.textContent).toContain(
      labels[b.confirmedBatteryState as keyof typeof labels],
    );
    expect(lifecycle.querySelector('li[aria-current="step"] small')?.textContent).toBe(b.confirmedBatteryState);
    if (record.expected.lane !== "CONFIRMED")
      expect(within(transaction).queryByText("Confirmada")).toBeNull();
    if (b.confirmedRewardState !== "SENT") {
      expect(reward.textContent).not.toContain("Recompensa enviada");
      expect(within(reward).queryByText("SENT")).toBeNull();
      expect(screen.queryByText("Ciclo completado")).toBeNull();
      expect(reward.querySelector(".reward-amount")).toBeNull();
    }
    if (record.case === "E")
      expect(reward.textContent).toContain("Intento fallido");
    if (record.case === "F")
      expect(reward.textContent).toContain("Recompensa enviada");
  });

it("D2.3 H: unrecognized raw transaction state fails safe to UNCERTAIN", () => {
  const b = structuredClone(
    models.cases.find((c) => c.case === "B")!.battery,
  ) as Battery;
  b.pendingOperation!.state = "UNRECOGNIZED_FUTURE_VALUE";
  render(<StateSummary battery={b} />);
  const lane = screen.getByRole("region", {
    name: "Estado de transacción Stellar",
  });
  expect(lane.textContent).toContain("UNCERTAIN");
  expect(lane.textContent).toContain("no es éxito ni fallo confirmado");
  expect(within(lane).queryByText("Confirmada")).toBeNull();
});
it("D2.3 display prioritizes unresolved UNKNOWN over even a newer confirmed terminal", () => {
  const b = structuredClone(
    models.cases.find((c) => c.case === "B")!.battery,
  ) as Battery;
  b.latestTerminalOperation = {
    id: "NEWER-LOCAL-TERMINAL",
    state: "CONFIRMED",
    command: "confirm_recycling",
  };
  expect(displayOperation(b)).toBe(b.pendingOperation);
  render(<StateSummary battery={b} />);
  const lane = screen.getByRole("region", {
    name: "Estado de transacción Stellar",
  });
  expect(lane.textContent).toContain("UNCERTAIN");
  expect(within(lane).queryByText("Confirmada")).toBeNull();
});
it("D2.3 confirmed pay_reward operation alone cannot replace a PENDING reward projection", () => {
  const b = structuredClone(
    models.cases.find((c) => c.case === "C")!.battery,
  ) as Battery;
  b.latestTerminalOperation!.command = "pay_reward";
  render(<StateSummary battery={b} />);
  expect(
    screen.getByRole("region", { name: "Estado de transacción Stellar" })
      .textContent,
  ).toContain("CONFIRMED");
  const reward = screen.getByRole("region", { name: "Estado de recompensa" });
  expect(reward.textContent).toContain("PENDING");
  expect(reward.textContent).not.toContain("Recompensa enviada");
  expect(reward.querySelector(".reward-amount")).toBeNull();
  expect(screen.queryByText("Ciclo completado")).toBeNull();
});
it.each(["APPLICATION", "CHAIN"] as const)(
  "D2.3 failed operation identifies %s scope without rolling back lifecycle",
  (failureScope) => {
    const b = structuredClone(
      models.cases.find((c) => c.case === "E")!.battery,
    ) as Battery;
    b.latestTerminalOperation!.failureScope = failureScope;
    render(<StateSummary battery={b} />);
    const lane = screen.getByRole("region", {
      name: "Estado de transacción Stellar",
    });
    expect(lane.textContent).toContain("FAILED");
    expect(lane.textContent).toContain(
      failureScope === "CHAIN"
        ? "Fallo confirmado de la transacción en Stellar"
        : "no acredita un fallo confirmado en Stellar",
    );
    expect(
      screen.getByRole("region", { name: "Estado de ciclo y atestación" })
        .textContent,
    ).toContain("RECYCLED");
    expect(
      screen.getByRole("region", { name: "Estado de recompensa" }).textContent,
    ).toContain("PENDING");
  },
);
it("D2.3 HISTORICAL TESTNET CONFIRMED control reuses accepted archived evidence, without a fresh provider read", () => {
  expect(historical.classification).toContain("archived");
  expect(historical.transactionHash).toBe(
    "d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02",
  );
  render(<StateSummary battery={historical.battery as Battery} />);
  expect(
    screen.getByRole("region", { name: "Estado de transacción Stellar" })
      .textContent,
  ).toContain("CONFIRMED");
  const reward = screen.getByRole("region", { name: "Estado de recompensa" });
  expect(reward.textContent).toContain("SENT");
  expect(reward.textContent).toContain("+10 GREENTEST");
  expect(reward.textContent).toContain("sin valor monetario");
  expect(
    screen.getByRole("region", { name: "Estado de ciclo y atestación" })
      .textContent,
  ).toContain("no una certificación");
});
it.each(["CONFIRMED", "REJECTED"] as const)(
  "D2.3 terminal %s does not disable the existing legitimate reward control",
  async (state) => {
    const b = structuredClone(
      models.cases.find((c) => c.case === "C")!.battery,
    ) as Battery;
    b.latestTerminalOperation!.state = state;
    mock.battery = b;
    render(<BatteryDetail id={b.batteryId} />);
    expect(
      (
        await screen.findByRole("button", { name: "Procesar recompensa DEV" })
      ).hasAttribute("disabled"),
    ).toBe(false);
  },
);
it("D2.3 unresolved UNKNOWN still disables the same reward control despite a confirmed terminal", async () => {
  const b = structuredClone(
    models.cases.find((c) => c.case === "D")!.battery,
  ) as Battery;
  mock.battery = b;
  render(<BatteryDetail id={b.batteryId} />);
  expect(
    (
      await screen.findByRole("button", { name: "Procesar recompensa DEV" })
    ).hasAttribute("disabled"),
  ).toBe(true);
});
it("D2.3 profile/dashboard consumes the separate terminal display without inventing chain failure", () => {
  const b = models.cases.find((c) => c.case === "E")!.battery;
  mock.requests = [
    { ...b, requestId: "LOCAL-FIXTURE-REQUEST", requestState: "CONFIRMED" },
  ];
  render(<Dashboard />);
  expect(screen.getByText(/Transacción Stellar:/).textContent).toContain(
    "Fallida",
  );
  expect(screen.getByText(/Transacción Stellar:/).textContent).toContain(
    "rechazo de aplicación",
  );
  expect(screen.getByText(/Recompensa:/).textContent).toContain("Pendiente");
});
