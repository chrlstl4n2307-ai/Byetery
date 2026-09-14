import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BatteryQR,
  BatteryView,
  SearchBattery,
  StateSummary,
  Timeline,
} from "@/components/battery";
import { Gate, RoleNavigation } from "@/components/session";
import { Operator } from "@/components/operator";
import { AuthForm } from "@/components/auth-form";
import { WalletLink } from "@/components/dashboard";
import { ApiFailure, request } from "@/lib/client";
import type { Battery, Profile } from "@/lib/types";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  session: {
    user: { id: "user", email: "dev@example.com" } as {
      id: string;
      email: string;
    } | null,
    profile: null as Profile | null,
    loading: false,
    error: "",
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => "/dashboard",
}));
vi.mock("@/components/session", async (original) => ({
  ...(await original<typeof import("@/components/session")>()),
  useSession: () => ({ ...mocks.session, refresh: mocks.refresh }),
}));
vi.mock("@/lib/client", async (original) => ({
  ...(await original<typeof import("@/lib/client")>()),
  request: vi.fn(),
}));
const req = vi.mocked(request);
const base: Battery = {
  batteryId: "BYE-000001",
  confirmedBatteryState: "REGISTERED",
  confirmedRewardState: "NOT_ELIGIBLE",
  source: "MOCK",
  pendingOperation: null,
  lastAttempt: null,
  metadata: { type: "AA", manufacturer: "Demo", batch: "L1" },
};
const profile: Profile = {
  userId: "user",
  roles: ["USER"],
  wallets: [{ id: "wallet", address: "GTEST", verifiedAt: "2026-09-13" }],
  requests: [],
  hasMoreRequests: false,
  source: "MOCK",
};
beforeEach(() => {
  mocks.session.user = { id: "user", email: "dev@example.com" };
  mocks.session.profile = structuredClone(profile);
  mocks.session.error = "";
  mocks.session.loading = false;
  mocks.refresh.mockResolvedValue(undefined);
  req.mockReset();
  mocks.push.mockReset();
});
describe("frontend critical flows", () => {
  it("role navigation displays only authorized panels", () => {
    render(<RoleNavigation roles={["USER", "COLLECTOR"]} />);
    expect(screen.queryByText("Administración")).toBeNull();
    expect(screen.getByText("Recolección")).toBeTruthy();
    expect(screen.queryByText("Reciclaje")).toBeNull();
  });
  it("manual search normalizes the battery route", () => {
    render(<SearchBattery />);
    fireEvent.change(screen.getByLabelText("Consultar una pila"), {
      target: { value: "bye-000001" },
    });
    fireEvent.click(screen.getByText("Buscar pila →"));
    expect(mocks.push).toHaveBeenCalledWith("/battery/BYE-000001");
  });
  it.each(["REGISTERED", "RETURNED", "COLLECTED", "RECYCLED"] as const)(
    "timeline uses only confirmed %s",
    (state) => {
      render(<Timeline state={state} />);
      expect(
        screen.getByRole("list").querySelector('[aria-current="step"]')
          ?.textContent,
      ).toContain(state);
      expect(screen.getByText("Devolución solicitada")).toBeTruthy();
    },
  );
  it("UNKNOWN does not imply recycling or reward success", () => {
    render(
      <StateSummary
        battery={{
          ...base,
          confirmedBatteryState: "COLLECTED",
          pendingOperation: {
            id: "op",
            state: "UNKNOWN",
            command: "confirm_recycling",
          },
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Resultado incierto",
    );
    expect(screen.queryByText("10 GREEN-TEST · Envío confirmado")).toBeNull();
  });
  it.each(["PENDING", "SENT"] as const)("shows separate reward %s", (state) => {
    render(
      <StateSummary
        battery={{
          ...base,
          confirmedBatteryState: "RECYCLED",
          confirmedRewardState: state,
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: state })).toBeTruthy();
    if (state === "SENT")
      expect(screen.getByText("10 GREEN-TEST · Envío confirmado")).toBeTruthy();
  });
  it("failed attempt is separate from physical state", () => {
    render(
      <StateSummary
        battery={{
          ...base,
          confirmedBatteryState: "RECYCLED",
          lastAttempt: { state: "FAILED", error_code: "Rejected" },
        }}
      />,
    );
    expect(screen.getByText(/Failed attempt/)).toBeTruthy();
    expect(screen.getByText("Reciclada")).toBeTruthy();
  });
  it("QR links to only the battery identity", () => {
    render(<BatteryQR id={base.batteryId} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/battery/BYE-000001",
    );
    expect(screen.getByTitle("QR de BYE-000001")).toBeTruthy();
  });
  it("return uses empty body and idempotency key", async () => {
    req.mockResolvedValue(base);
    render(<BatteryView id={base.batteryId} />);
    fireEvent.click(await screen.findByText("Solicitar devolución"));
    await waitFor(() =>
      expect(req).toHaveBeenCalledWith(
        "/api/batteries/BYE-000001/returns",
        {},
        expect.any(String),
      ),
    );
  });
  it("cancel uses the authenticated own request", async () => {
    req.mockResolvedValue({
      ...base,
      confirmedBatteryState: "RETURNED",
      ownRequest: {
        requestId: "a".repeat(64),
        requestState: "OPEN",
        reservationState: "HELD",
      },
    });
    render(<BatteryView id={base.batteryId} />);
    fireEvent.click(await screen.findByText("Cancelar devolución"));
    await waitFor(() =>
      expect(req).toHaveBeenCalledWith(
        "/api/returns/" + "a".repeat(64) + "/cancel",
        {},
        expect.any(String),
      ),
    );
  });
  it("does not offer cancellation after physical collection", async () => {
    req.mockResolvedValue({
      ...base,
      confirmedBatteryState: "COLLECTED",
      ownRequest: {
        requestId: "a".repeat(64),
        requestState: "CONFIRMED",
        reservationState: "CONSUMED",
      },
    });
    render(<BatteryView id={base.batteryId} />);
    await screen.findAllByText("COLLECTED");
    expect(screen.queryByText("Cancelar devolución")).toBeNull();
  });
  it("admin reward contains no recipient amount or token", async () => {
    mocks.session.profile!.roles = ["ADMIN"];
    req.mockResolvedValue({
      ...base,
      confirmedBatteryState: "RECYCLED",
      confirmedRewardState: "PENDING",
    });
    render(<BatteryView id={base.batteryId} />);
    fireEvent.click(await screen.findByText("Procesar recompensa DEV"));
    await waitFor(() =>
      expect(req).toHaveBeenCalledWith(
        "/api/batteries/BYE-000001/reward",
        {},
        expect.any(String),
      ),
    );
  });
  it("normal user has no admin reward action", async () => {
    req.mockResolvedValue({
      ...base,
      confirmedBatteryState: "RECYCLED",
      confirmedRewardState: "PENDING",
    });
    render(<BatteryView id={base.batteryId} />);
    await screen.findByText("PENDING");
    expect(screen.queryByText("Procesar recompensa DEV")).toBeNull();
  });
  it("shows uniform API error without internal details", async () => {
    req.mockRejectedValue(new ApiFailure(403, "RoleRequired"));
    render(<BatteryView id={base.batteryId} />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "no tiene permiso",
    );
  });
  it.each(["COLLECTION", "RECYCLING"] as const)(
    "%s operator sends evidence through existing route",
    async (kind) => {
      req.mockResolvedValue({
        ...base,
        confirmedBatteryState: kind === "COLLECTION" ? "RETURNED" : "COLLECTED",
      });
      render(<Operator kind={kind} />);
      fireEvent.change(screen.getByLabelText("Battery ID"), {
        target: { value: base.batteryId },
      });
      fireEvent.change(screen.getByLabelText("Return Request ID"), {
        target: { value: "a".repeat(64) },
      });
      fireEvent.click(screen.getByText("Consultar pila"));
      await screen.findAllByText(
        kind === "COLLECTION" ? "RETURNED" : "COLLECTED",
      );
      fireEvent.click(
        screen.getByRole("button", {
          name:
            kind === "COLLECTION"
              ? "Confirmar recepción física"
              : "Confirmar reciclaje",
        }),
      );
      await waitFor(() =>
        expect(req).toHaveBeenCalledWith(
          "/api/returns/" +
            "a".repeat(64) +
            (kind === "COLLECTION" ? "/collection" : "/recycling"),
          expect.objectContaining({
            evidence: expect.objectContaining({
              batteryId: base.batteryId,
              kind,
            }),
          }),
          expect.any(String),
        ),
      );
    },
  );
  it("wallet manual verification never bypasses server proof verification", async () => {
    req.mockResolvedValue({
      challengeId: "challenge",
      address: "G" + "A".repeat(55),
      messageBase64: "YWJj",
      expiresAt: "2026-09-14",
      source: "MOCK",
    });
    render(<WalletLink />);
    fireEvent.change(screen.getByLabelText("Dirección pública G…"), {
      target: { value: "G" + "A".repeat(55) },
    });
    fireEvent.click(screen.getByText("Solicitar challenge"));
    await screen.findByText(/Firma externa/);
    expect(req).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("button", { name: "Verificar firma" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("login sends only credentials and navigates after session refresh", async () => {
    req.mockResolvedValue({ confirmationRequired: false });
    render(<AuthForm />);
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "dev@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "example-only-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    expect(req).toHaveBeenCalledWith("/auth/login", {
      email: "dev@example.com",
      password: "example-only-pass",
    });
  });
});
// Gate reads the real context's deny-by-default value in isolation.
it("login required before protected content renders", () => {
  render(
    <Gate>
      <p>Protected content</p>
    </Gate>,
  );
  expect(screen.queryByText("Protected content")).toBeNull();
  expect(screen.getByRole("status")).toBeTruthy();
});
