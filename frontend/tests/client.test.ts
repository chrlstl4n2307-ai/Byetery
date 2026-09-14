import { it, expect, vi } from "vitest";
import { request, friendly, evidencePayload, qrValue } from "@/lib/client";
import { allowedApiPath } from "@/lib/proxy-policy";
it.each([401, 403, 404, 409, 422, 500])(
  "friendly API error %s never uses server details",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: "Example", message: "SQL secret stack" } },
            { status },
          ),
        ),
    );
    await expect(request("/api/me")).rejects.toThrow(friendly(status));
  },
);
it("network timeout is UNKNOWN", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("Timeout", "TimeoutError")),
  );
  await expect(request("/api/me")).rejects.toThrow("Resultado incierto");
});
it("evidence retains exact UTF-8 manifest binding", () => {
  const { evidence: e } = evidencePayload(
    "BYE-1",
    "a".repeat(64),
    "COLLECTION",
    "Pila física",
  );
  const raw = Uint8Array.from(atob(e.manifestBase64), (c) => c.charCodeAt(0));
  expect(JSON.parse(new TextDecoder().decode(raw))).toEqual({
    batteryId: "BYE-1",
    requestId: "a".repeat(64),
    kind: "COLLECTION",
    note: "Pila física",
  });
});
it("QR contains no wallet user or authorization", () =>
  expect(qrValue("BYE-1")).toBe("/battery/BYE-1"));
it("proxy permits only known API operations", () => {
  expect(allowedApiPath("GET", ["me"])).toBe(true);
  expect(allowedApiPath("POST", ["roles"])).toBe(false);
  expect(allowedApiPath("GET", ["..", "auth"])).toBe(false);
  expect(allowedApiPath("POST", ["batteries", "BYE-1", "reward"])).toBe(true);
  expect(allowedApiPath("DELETE", ["batteries", "BYE-1"])).toBe(false);
});
