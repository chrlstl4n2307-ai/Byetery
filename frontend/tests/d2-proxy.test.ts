import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/[...path]/route";
const mocks = vi.hoisted(() => ({
  config: {
    origin: "https://byetery-preview.vercel.app",
    upstream: "https://api.byetery.example.com",
    runtime: { source: "TESTNET", readOnly: true },
  },
  session: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@/lib/server", () => ({
  configuration: () => mocks.config,
  sameOrigin: (r: Request) => r.headers.get("origin") === mocks.config.origin,
  authClient: mocks.auth,
  json: (body: unknown, status: number) => Response.json(body, { status }),
  error: (status: number, code: string) =>
    Response.json({ error: { code } }, { status }),
  readJson: (r: Request) => r.json(),
}));
beforeEach(() => {
  mocks.config.runtime = { source: "TESTNET", readOnly: true };
  mocks.session.mockResolvedValue({
    data: { session: { access_token: "isolated-session-fixture" } },
    error: null,
  });
  mocks.auth.mockReset();
  mocks.auth.mockResolvedValue({ auth: { getSession: mocks.session } });
});
const context = (path = ["batteries", "BYE-000001"]) => ({
  params: Promise.resolve({ path }),
});
it("forwards authenticated real read model through fixed upstream; no privileged client headers", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        source: "TESTNET",
        confirmedBatteryState: "RECYCLED",
        confirmedRewardState: "PENDING",
        pendingOperation: { state: "UNKNOWN" },
        lastAttempt: null,
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const result = await GET(
    new Request("https://byetery-preview.vercel.app/api/batteries/BYE-000001", {
      headers: {
        authorization: "Bearer untrusted-client-value",
        "x-upstream": "https://evil.example.com",
      },
    }),
    context(),
  );
  expect(result.status).toBe(200);
  expect((await result.json()).pendingOperation.state).toBe("UNKNOWN");
  expect(fetch).toHaveBeenCalledWith(
    "https://api.byetery.example.com/api/batteries/BYE-000001",
    expect.objectContaining({
      redirect: "error",
      cache: "no-store",
      headers: { Authorization: "Bearer isolated-session-fixture" },
    }),
  );
});
it.each(["MOCK", "STELLAR", undefined])(
  "rejects unexpected upstream source %s without fallback",
  async (source) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ source })),
    );
    const result = await GET(
      new Request("https://byetery-preview.vercel.app/api/me"),
      context(["me"]),
    );
    expect(result.status).toBe(503);
    expect((await result.json()).error.code).toBe("SourceMismatch");
  },
);
it("rejects sessionless reads before reaching upstream", async () => {
  mocks.session.mockResolvedValue({ data: { session: null }, error: null });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    (
      await GET(
        new Request("https://byetery-preview.vercel.app/api/me"),
        context(["me"]),
      )
    ).status,
  ).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("TESTNET business writes are blocked before auth or fetch even with valid origin", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const result = await POST(
    new Request("https://byetery-preview.vercel.app/api/batteries", {
      method: "POST",
      headers: { origin: mocks.config.origin },
    }),
    context(["batteries"]),
  );
  expect(result.status).toBe(403);
  expect((await result.json()).error.code).toBe("ReadOnlyTestnet");
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("incorrect or missing origin rejects before auth", async () => {
  for (const origin of ["https://evil.example.com", "null", ""]) {
    const result = await POST(
      new Request("https://byetery-preview.vercel.app/api/batteries", {
        method: "POST",
        headers: { origin },
      }),
      context(["batteries"]),
    );
    expect(result.status).toBe(403);
    expect((await result.json()).error.code).toBe("OriginRejected");
  }
  expect(mocks.auth).not.toHaveBeenCalled();
});
it("upstream outage never returns confirmed states or a MOCK fallback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("fixture outage")),
  );
  const result = await GET(
    new Request("https://byetery-preview.vercel.app/api/me"),
    context(["me"]),
  );
  expect(result.status).toBe(504);
  expect(await result.json()).toEqual({ error: { code: "OutcomeUnknown" } });
});
