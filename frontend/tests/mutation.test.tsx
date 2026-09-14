import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { useMutation } from "@/components/battery";
import { request, ApiFailure } from "@/lib/client";
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
