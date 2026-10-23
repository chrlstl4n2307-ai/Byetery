import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HistoryTimeline, BatteryHistoryView } from "@/components/history";
import { StateSummary } from "@/components/battery";
import {
  historyResponse,
  type BatteryHistory,
  type HistoryEntry,
} from "@/lib/history";
import { TESTNET_DEPLOYMENT_ID } from "@/lib/web-config";
import { request, ApiFailure } from "@/lib/client";
import { allowedApiPath } from "@/lib/proxy-policy";
import observed from "../../docs/instaward/d2/D2-003-TIMELINE.json";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/client", async (original) => ({
  ...(await original<typeof import("@/lib/client")>()),
  request: vi.fn(),
}));
const battery = "BYE-D2-003-FIXTURE",
  hash = "ab".repeat(32);
const entry: HistoryEntry = {
  operationId: "fixture-registration",
  kind: "REGISTERED",
  category: "LIFECYCLE",
  persistedState: "CONFIRMED",
  recordedAt: "2026-10-19T17:21:41Z",
  confirmedAt: "2026-10-19T17:22:17Z",
  transactionHash: hash,
  ledger: 5281390,
  verification: "CONFIRMED",
  chainResult: "SUCCESS",
  reason: null,
};
const history: BatteryHistory = {
  batteryId: battery,
  source: "TESTNET",
  network: "STELLAR TESTNET",
  deploymentId: TESTNET_DEPLOYMENT_ID,
  contractAddress: "CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON",
  checkedAt: "2026-10-22T19:00:00Z",
  entries: [entry],
  hasMore: false,
};
beforeEach(() => {
  vi.mocked(request).mockReset();
});
it("history renders real reference and confirmed result with distinct SQL and ledger timestamps", () => {
  render(<HistoryTimeline history={history} />);
  expect(screen.getByText("Confirmada")).toBeTruthy();
  expect(screen.getByText("SUCCESS")).toBeTruthy();
  const link = screen.getByRole("link", { name: hash });
  expect(link.getAttribute("href")).toBe(
    "https://stellar.expert/explorer/testnet/tx/" + hash,
  );
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  const times = screen.getAllByText(/2026-10-19/);
  expect(times.length).toBe(2);
});
it("history orders by confirmation time, preserving lifecycle versus reward", () => {
  render(
    <HistoryTimeline
      history={{
        ...history,
        entries: [
          {
            ...entry,
            operationId: "reward",
            kind: "REWARD",
            category: "REWARD",
            confirmedAt: "2026-10-21T00:00:00Z",
            recordedAt: "2026-10-18T00:00:00Z",
          },
          entry,
        ],
      }}
    />,
  );
  const rows = screen.getAllByRole("listitem");
  expect(rows[0].textContent).toContain("REGISTERED");
  expect(rows[1].textContent).toContain("REWARD");
  expect(rows[1].textContent).toContain("separada del lifecycle");
});
it("unverifiable persisted confirmation stays visible and is never shown as successful", () => {
  render(
    <HistoryTimeline
      history={{
        ...history,
        entries: [
          {
            ...entry,
            verification: "UNVERIFIED",
            chainResult: null,
            confirmedAt: null,
            ledger: null,
            reason: "NOT_FOUND_OR_OUTSIDE_RETENTION",
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("Sin verificar")).toBeTruthy();
  expect(screen.queryByText("Confirmada")).toBeNull();
  expect(screen.queryByText("SUCCESS")).toBeNull();
  expect(screen.getByText(/No se considera éxito/)).toBeTruthy();
  expect(screen.getByRole("link", { name: hash })).toBeTruthy();
});
it("empty history invents no events or successful transaction", () => {
  render(<HistoryTimeline history={{ ...history, entries: [] }} />);
  expect(screen.getByText(/No hay operaciones persistidas/)).toBeTruthy();
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});
it("missing hash has no fabricated explorer link", () => {
  render(
    <HistoryTimeline
      history={{
        ...history,
        entries: [
          {
            ...entry,
            transactionHash: null,
            confirmedAt: null,
            ledger: null,
            chainResult: null,
            verification: "UNVERIFIED",
            reason: "MISSING_TRANSACTION_HASH",
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("Sin hash persistido")).toBeTruthy();
  expect(screen.queryAllByRole("link")).toHaveLength(0);
});
it("timeline adds history without replacing the three current state lanes", () => {
  render(
    <>
      <StateSummary
        battery={{
          batteryId: battery,
          source: "TESTNET",
          confirmedBatteryState: "RECYCLED",
          confirmedRewardState: "PENDING",
          pendingOperation: {
            id: "pending",
            command: "pay_reward",
            state: "UNKNOWN",
          },
          lastAttempt: null,
        }}
      />
      <HistoryTimeline history={history} />
    </>,
  );
  for (const name of [
    "Estado de ciclo y atestación",
    "Estado de transacción Stellar",
    "Estado de recompensa",
    "Historial verificado de Testnet",
  ])
    expect(screen.getByRole("region", { name })).toBeTruthy();
  expect(
    within(
      screen.getByRole("region", { name: "Estado de recompensa" }),
    ).queryByText("Recompensa enviada ✓"),
  ).toBeNull();
});
it.each([
  null,
  { ...history, source: "MOCK" },
  { ...history, deploymentId: "11111111-1111-4111-8111-111111111111" },
  { ...history, batteryId: "BYE-OTHER" },
  { ...history, contractAddress: "C" + "A".repeat(55) },
  { ...history, contractAddress: undefined },
  { ...history, entries: [null] },
  { ...history, entries: [{ ...entry, transactionHash: "javascript:unsafe" }] },
  { ...history, entries: [{ ...entry, chainResult: null }] },
  { ...history, entries: [{ ...entry, confirmedAt: "invalid" }] },
])("rejects malformed, wrong source or mismatched history", (value) =>
  expect(historyResponse(value, battery)).toBe(false),
);
it("valid history is loaded through the authenticated same-origin read route", async () => {
  vi.mocked(request).mockResolvedValue(history);
  render(<BatteryHistoryView batteryId={battery} />);
  await screen.findByText("Confirmada");
  expect(request).toHaveBeenCalledWith(
    "/api/batteries/" + battery + "/history",
  );
});
it("unknown battery does not receive a fabricated history", async () => {
  vi.mocked(request).mockRejectedValue(new ApiFailure(404, "BatteryNotFound"));
  render(<BatteryHistoryView batteryId="BYE-UNKNOWN" />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "No se infiere",
  );
  expect(screen.queryByText("Confirmada")).toBeNull();
});
it("MOCK history cannot appear as TESTNET evidence", async () => {
  vi.mocked(request).mockResolvedValue({ ...history, source: "MOCK" });
  render(<BatteryHistoryView batteryId={battery} />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("link", { name: hash })).toBeNull();
});
it("only GET history is added to the proxy allowlist", () => {
  expect(allowedApiPath("GET", ["batteries", battery, "history"])).toBe(true);
  expect(allowedApiPath("POST", ["batteries", battery, "history"])).toBe(false);
  expect(
    allowedApiPath("GET", ["batteries", battery, "history", "debug"]),
  ).toBe(false);
});

it("renders all five real D1 receipts captured by the independent read-only evidence run", () => {
  const snapshot: unknown = observed.history;
  if (!historyResponse(snapshot, "BYE-W1-002-64257020134D4A0F"))
    throw Error("Recorded evidence is not a valid Testnet history");
  render(<HistoryTimeline history={snapshot} />);
  expect(screen.getAllByText("Confirmada")).toHaveLength(5);
  const rows = screen.getAllByRole("listitem");
  expect(rows.map((row) => row.querySelector("h3 small")?.textContent)).toEqual(
    ["· REGISTERED", "· RETURNED", "· COLLECTED", "· RECYCLED", "· REWARD"],
  );
  for (const entry of snapshot.entries)
    expect(
      screen
        .getByRole("link", { name: entry.transactionHash! })
        .getAttribute("href"),
    ).toBe(
      "https://stellar.expert/explorer/testnet/tx/" + entry.transactionHash,
    );
});
