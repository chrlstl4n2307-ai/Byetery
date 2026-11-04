import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { useMutation } from "@/components/battery";
import { request, ApiFailure } from "@/lib/client";
import { WebRuntimeProvider } from "@/components/web-runtime";
vi.mock("@/lib/client", async (original) => ({
  ...(await original<typeof import("@/lib/client")>()),
  request: vi.fn(),
}));
function Harness() {
  const action = useMutation(() => {});
  return (
    <>
      <button onClick={() => action.send("/api/batteries/BYE-1/reward")}>
        Pay
      </button>
      <button onClick={action.retry}>Retry</button>
      <p>{action.message}</p>
    </>
  );
}
it("timeout retry keeps the original body and idempotency key", async () => {
  const req = vi.mocked(request);
  req
    .mockRejectedValueOnce(new ApiFailure(504, "OutcomeUnknown"))
    .mockResolvedValueOnce({ pendingOperation: null });
  render(<Harness />);
  fireEvent.click(screen.getByText("Pay"));
  await screen.findByText(/Resultado incierto/);
  fireEvent.click(screen.getByText("Retry"));
  await waitFor(() => expect(req).toHaveBeenCalledTimes(2));
  expect(req.mock.calls[0]).toEqual(req.mock.calls[1]);
  expect(req.mock.calls[0][1]).toEqual({});
});
const testnet = {
  environment: "DEV",
  source: "TESTNET",
  readOnly: true,
} as const;
const operationId = "cce6eb8b-1ca1-4e70-839e-068aaec4193d";
it("observes a TESTNET acknowledgement by GET and displays local closure", async () => {
  const req = vi.mocked(request);
  req.mockClear();
  req
    .mockResolvedValueOnce({
      source: "TESTNET",
      operationId,
      statusUrl: `/api/operations/${operationId}`,
    })
    .mockResolvedValueOnce({
      source: "TESTNET",
      operationId,
      class: "TERMINAL_UNSIGNED",
      terminal: true,
      transactionHash: null,
      result: "NOT_SUBMITTED",
    });
  render(
    <WebRuntimeProvider value={testnet}>
      <Harness />
    </WebRuntimeProvider>,
  );
  fireEvent.click(screen.getByText("Pay"));
  await screen.findByText("Cerrada antes del envío");
  expect(req.mock.calls).toHaveLength(2);
  expect(req.mock.calls[1].slice(0, 3)).toEqual([
    `/api/operations/${operationId}`,
    undefined,
    undefined,
  ]);
  expect(screen.queryByText(/Fallida en Stellar/)).toBeNull();
});
it("observes a lost TESTNET acknowledgement using the original key only", async () => {
  const req = vi.mocked(request);
  req.mockClear();
  const interrupted = {
    source: "TESTNET",
    operationId,
    class: "PRE_DISPATCH_INTERRUPTED",
    terminal: false,
    transactionHash: null,
    result: null,
  };
  req
    .mockRejectedValueOnce(new ApiFailure(504, "OutcomeUnknown"))
    .mockResolvedValueOnce(interrupted)
    .mockResolvedValueOnce(interrupted);
  render(
    <WebRuntimeProvider value={testnet}>
      <Harness />
    </WebRuntimeProvider>,
  );
  fireEvent.click(screen.getByText("Pay"));
  await screen.findByText(/requiere revisión/);
  fireEvent.click(screen.getByText("Retry"));
  await waitFor(() => expect(req).toHaveBeenCalledTimes(3));
  const originalKey = req.mock.calls[0][2]!;
  expect(req.mock.calls.slice(1).map(([path, body]) => [path, body])).toEqual([
    [`/api/operations/lookup?key=${originalKey}`, undefined],
    [`/api/operations/lookup?key=${originalKey}`, undefined],
  ]);
});
