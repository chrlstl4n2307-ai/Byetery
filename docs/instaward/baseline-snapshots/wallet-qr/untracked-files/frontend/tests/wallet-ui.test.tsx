import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi, beforeEach } from "vitest";
import { GraphicalWallet } from "@/components/graphical-wallet";
import { ApiFailure, request } from "@/lib/client";
import { walletMessage } from "../../backend/src/wallet-message";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/components/session", () => ({
  useSession: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/client", async (original) => ({
  ...(await original<typeof import("@/lib/client")>()),
  request: vi.fn(),
}));
const req = vi.mocked(request),
  address = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";
function setup() {
  const expiresAt = new Date(Date.now() + 600000).toISOString(),
    c = {
      version: 2,
      signingScheme: "SEP53_V2",
      network: "Testnet",
      purpose: "LINK_WALLET",
      source: "MOCK",
      challengeId: "challenge",
      address,
      expiresAt,
      messageBase64: btoa(
        walletMessage({
          deploymentId: "dep",
          id: "challenge",
          userId: "user",
          networkId: "ab",
          address,
          nonce: "cd",
          expiresAt,
        }),
      ),
    };
  const adapter = {
    name: "Test provider",
    isAvailable: vi.fn(async () => true),
    connect: vi.fn(async () => ({ address })),
    signChallenge: vi.fn(async () => ({
      address,
      signatureBase64: btoa("x".repeat(64)),
    })),
  };
  req.mockResolvedValueOnce(c);
  render(<GraphicalWallet adapter={adapter} />);
  return adapter;
}
beforeEach(() => {
  vi.clearAllMocks();
});
async function connect() {
  fireEvent.click(screen.getByText("Conectar wallet"));
  await screen.findByText("Firmar y verificar con Test provider");
}
it("does not show VERIFIED after connection or signature alone", async () => {
  setup();
  await connect();
  expect(screen.queryByText("Wallet verificada ✓")).toBeNull();
  let finish!: (v: unknown) => void;
  req.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByText("Firmar y verificar con Test provider"));
  await waitFor(() => expect(req).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Wallet verificada ✓")).toBeNull();
  finish({ verified: true, address, source: "MOCK" });
  await screen.findByText("Wallet verificada ✓");
});
it("invalid signature from API never marks verified", async () => {
  setup();
  await connect();
  req.mockRejectedValueOnce(new ApiFailure(422, "InvalidWalletProof"));
  fireEvent.click(screen.getByText("Firmar y verificar con Test provider"));
  await screen.findByText(/La firma no corresponde/);
  expect(screen.queryByText("Wallet verificada ✓")).toBeNull();
});
it("consumed challenge API response is explicit", async () => {
  setup();
  await connect();
  req.mockRejectedValueOnce(new ApiFailure(409, "ChallengeUnavailable"));
  fireEvent.click(screen.getByText("Firmar y verificar con Test provider"));
  await screen.findByText(/ya fue consumido/);
});
it("expired session stops verification", async () => {
  setup();
  await connect();
  req.mockRejectedValueOnce(new ApiFailure(401, "SessionExpired"));
  fireEvent.click(screen.getByText("Firmar y verificar con Test provider"));
  await screen.findByText(/Tu sesión terminó/);
  expect(screen.queryByText("Wallet verificada ✓")).toBeNull();
});
it("timeout retries exact proof and idempotency key without signing again", async () => {
  const adapter = setup();
  await connect();
  req.mockRejectedValueOnce(new ApiFailure(504, "OutcomeUnknown"));
  fireEvent.click(screen.getByText("Firmar y verificar con Test provider"));
  await screen.findByText("Consultar/reintentar la misma verificación");
  const first = req.mock.calls[1];
  req.mockResolvedValueOnce({ verified: true, address, source: "MOCK" });
  fireEvent.click(
    screen.getByText("Consultar/reintentar la misma verificación"),
  );
  await screen.findByText("Wallet verificada ✓");
  expect(req.mock.calls[2]).toEqual(first);
  expect(adapter.signChallenge).toHaveBeenCalledTimes(1);
});
