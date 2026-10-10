import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { batteryFromQr, startCamera } from "@/lib/qr-scanner";
import { ScanBattery } from "@/components/scan-battery";
import { request, ApiFailure } from "@/lib/client";
const mocks = vi.hoisted(() => ({ push: vi.fn(), decode: vi.fn() }));
vi.mock("jsqr", () => ({ default: mocks.decode }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/client", async (original) => ({
  ...(await original<typeof import("@/lib/client")>()),
  request: vi.fn(),
}));
const req = vi.mocked(request);
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function camera(value?: string) {
  const stop = vi.fn(),
    stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  });
  vi.stubGlobal(
    "BarcodeDetector",
    class {
      static async getSupportedFormats() {
        return ["qr_code"];
      }
      async detect() {
        return value === undefined ? [] : [{ rawValue: value }];
      }
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(2);
  return { stop, stream };
}
it("official QR extracts exact battery ID", () =>
  expect(batteryFromQr("/battery/BYE-000001")).toBe("BYE-000001"));
it.each([
  "/battery/BYE-1\n",
  "/battery/BYE-1\r\n",
  "/battery/BYE-1\u2028",
  "https://evil.test/battery/BYE-1",
  "//evil.test",
  "/battery/BYE-1?reward=true",
  "/battery/BYE-1#x",
  "/battery/%42YE-1",
  "/battery/../admin",
  "BYE-1",
  " /battery/BYE-1",
  "/battery/bye-1",
  "/battery/" + "A".repeat(33),
])("rejects noncanonical QR %s", (value) =>
  expect(batteryFromQr(value)).toBeNull(),
);
it("scan only GETs battery then opens correct resource and stops camera", async () => {
  const c = camera("/battery/BYE-000001");
  req.mockResolvedValue({ batteryId: "BYE-000001" });
  render(<ScanBattery />);
  fireEvent.click(screen.getByText("Escanear batería"));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/battery/BYE-000001"),
  );
  expect(c.stop).toHaveBeenCalled();
  expect(req.mock.calls).toEqual([["/api/batteries/BYE-000001"]]);
});
it("invalid external QR never requests API or navigates", async () => {
  const c = camera("https://evil.test");
  render(<ScanBattery />);
  fireEvent.click(screen.getByText("Escanear batería"));
  await screen.findByText(/QR inválido/);
  expect(c.stop).toHaveBeenCalled();
  expect(req).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});
it("missing battery stays on current page", async () => {
  camera("/battery/BYE-MISSING");
  req.mockRejectedValue(new ApiFailure(404, "BatteryNotFound"));
  render(<ScanBattery />);
  fireEvent.click(screen.getByText("Escanear batería"));
  await screen.findByText(/No encontramos/);
  expect(mocks.push).not.toHaveBeenCalled();
});
it("denied camera preserves manual fallback", async () => {
  camera();
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
    new DOMException("denied", "NotAllowedError"),
  );
  render(<ScanBattery />);
  fireEvent.click(screen.getByText("Escanear batería"));
  await screen.findByText(/Permiso de cámara rechazado/);
  req.mockResolvedValue({});
  fireEvent.change(screen.getByLabelText("Ingresar ID manualmente"), {
    target: { value: "BYE-1" },
  });
  fireEvent.click(screen.getByText("Consultar ID"));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/battery/BYE-1"),
  );
});
it("closing camera stops every track", async () => {
  const c = camera();
  render(<ScanBattery />);
  fireEvent.click(screen.getByText("Escanear batería"));
  await waitFor(() =>
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
  );
  fireEvent.click(screen.getByText("Cerrar cámara"));
  expect(c.stop).toHaveBeenCalled();
});
it("unmount stops camera", async () => {
  const c = camera();
  const view = render(<ScanBattery />);
  fireEvent.click(screen.getByText("Escanear batería"));
  await waitFor(() =>
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
  );
  view.unmount();
  expect(c.stop).toHaveBeenCalled();
});
it("permission resolving after cancellation stops its late stream", async () => {
  const c = camera();
  let grant!: (s: MediaStream) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  const close = startCamera(document.createElement("video"), vi.fn(), vi.fn());
  close();
  grant(c.stream);
  await waitFor(() => expect(c.stop).toHaveBeenCalled());
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
it("pagehide stops active capture", async () => {
  const c = camera();
  render(<ScanBattery />);
  fireEvent.click(screen.getByText("Escanear batería"));
  await waitFor(() =>
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
  );
  window.dispatchEvent(new Event("pagehide"));
  await waitFor(() => expect(c.stop).toHaveBeenCalled());
});
it("operator scan invokes lookup callback only", async () => {
  const c = camera("/battery/BYE-1"),
    lookup = vi.fn(async () => {});
  render(<ScanBattery onDetected={lookup} />);
  fireEvent.click(screen.getByText("Escanear batería"));
  await waitFor(() => expect(lookup).toHaveBeenCalledWith("BYE-1"));
  expect(req).not.toHaveBeenCalled();
  expect(c.stop).toHaveBeenCalled();
});

it("uses local jsQR when native QR detection is unsupported", async () => {
  const c = camera();
  vi.stubGlobal("BarcodeDetector", undefined);
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", { value: 100 });
  Object.defineProperty(video, "videoHeight", { value: 100 });
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(40000) })),
    clearRect: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  mocks.decode.mockReturnValue({ data: "/battery/BYE-1" });
  const found = vi.fn();
  const close = startCamera(video, found, vi.fn());
  await waitFor(() => expect(found).toHaveBeenCalledWith("/battery/BYE-1"));
  expect(c.stop).toHaveBeenCalled();
  expect(context.clearRect).toHaveBeenCalled();
  close();
});
