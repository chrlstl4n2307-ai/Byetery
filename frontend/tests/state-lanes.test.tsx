import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { transactionPresentation } from "@/lib/state-lanes";
import { StateSummary } from "@/components/battery";
import type { Battery } from "@/lib/types";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const base: Battery = {
  batteryId: "BYE-STATE-FIXTURE",
  confirmedBatteryState: "COLLECTED",
  confirmedRewardState: "NOT_ELIGIBLE",
  pendingOperation: null,
  lastAttempt: null,
  source: "TESTNET",
};
it.each([
  ["QUEUED", "QUEUED"],
  ["AWAITING_AUTH", "PENDING"],
  ["READY", "PENDING"],
  ["SUBMITTED", "PENDING"],
  ["PENDING", "PENDING"],
  ["UNKNOWN", "UNCERTAIN"],
  ["UNCERTAIN", "UNCERTAIN"],
  ["CONFIRMED", "CONFIRMED"],
  ["FAILED", "FAILED"],
  ["REJECTED", "FAILED"],
  ["SENT", "UNCERTAIN"],
  ["new-unrecognized-value", "UNCERTAIN"],
  ["__proto__", "UNCERTAIN"],
])("presentation keeps API transaction %s separate as %s", (raw, expected) => {
  expect(
    transactionPresentation({
      id: "fixture-op",
      command: "confirm_recycling",
      state: raw,
    }).state,
  ).toBe(expected);
});
it("no pending operation never invents a terminal confirmation", () => {
  expect(transactionPresentation(null)).toEqual({
    state: "NO_PENDING_OPERATION",
    label: "Sin operación pendiente",
    raw: null,
  });
  render(
    <StateSummary
      battery={{
        ...base,
        confirmedBatteryState: "RECYCLED",
        confirmedRewardState: "SENT",
        lastAttempt: { state: "SUCCEEDED", error_code: null },
      }}
    />,
  );
  const lane = screen.getByRole("region", {
    name: "Estado de transacción Stellar",
  });
  expect(within(lane).getByText(/Sin operación pendiente/)).toBeTruthy();
  expect(within(lane).queryByText("Confirmada")).toBeNull();
  expect(lane.textContent).toContain("no confirma por sí sola");
});
it.each(["PENDING", "UNKNOWN", "QUEUED", "FAILED"])(
  "RECYCLED plus transaction %s does not imply paid",
  (state) => {
    render(
      <StateSummary
        battery={{
          ...base,
          confirmedBatteryState: "RECYCLED",
          confirmedRewardState: "PENDING",
          pendingOperation: { id: "fixture-op", command: "pay_reward", state },
        }}
      />,
    );
    const business = screen.getByRole("region", {
        name: "Estado de ciclo y atestación",
      }),
      transaction = screen.getByRole("region", {
        name: "Estado de transacción Stellar",
      }),
      reward = screen.getByRole("region", { name: "Estado de recompensa" });
    expect(business.textContent).toContain("RECYCLED");
    expect(business.textContent).toContain("atestación autorizada");
    expect(transaction.textContent).toContain(state);
    expect(
      within(reward).getByRole("heading", { name: "Pendiente" }),
    ).toBeTruthy();
    expect(within(reward).queryByText("Recompensa enviada ✓")).toBeNull();
    expect(screen.queryByText("Ciclo completado")).toBeNull();
  },
);
it("reward attempt failure leaves business and confirmed reward untouched", () => {
  render(
    <StateSummary
      battery={{
        ...base,
        confirmedBatteryState: "RECYCLED",
        confirmedRewardState: "PENDING",
        lastAttempt: { state: "FAILED", error_code: "FixtureRejected" },
      }}
    />,
  );
  expect(
    screen.getByRole("region", { name: "Estado de ciclo y atestación" })
      .textContent,
  ).toContain("RECYCLED");
  expect(
    screen.getByRole("region", { name: "Estado de recompensa" }).textContent,
  ).toContain("Intento fallido");
  expect(
    screen.getByRole("region", { name: "Estado de transacción Stellar" })
      .textContent,
  ).toContain("Sin operación pendiente");
});
it("already confirmed SENT is not erased by uncertainty of another operation", () => {
  render(
    <StateSummary
      battery={{
        ...base,
        confirmedBatteryState: "RECYCLED",
        confirmedRewardState: "SENT",
        pendingOperation: {
          id: "fixture-op",
          command: "fixture-observation",
          state: "UNKNOWN",
        },
      }}
    />,
  );
  expect(
    screen.getByRole("region", { name: "Estado de recompensa" }).textContent,
  ).toContain("SENT");
  const transaction = screen.getByRole("region", {
    name: "Estado de transacción Stellar",
  });
  expect(transaction.textContent).toContain("UNCERTAIN");
  expect(within(transaction).queryByText("Confirmada")).toBeNull();
});
