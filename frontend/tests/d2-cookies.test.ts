import { afterEach, expect, it, vi } from "vitest";
import { authClient, sameOrigin } from "@/lib/server";
import { TESTNET_DEPLOYMENT_ID } from "@/lib/web-config";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  set: vi.fn(),
  getAll: vi.fn(() => []),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set, getAll: mocks.getAll }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
afterEach(() => {
  vi.unstubAllEnvs();
  mocks.create.mockReset();
  mocks.set.mockReset();
});
function configure(preview: boolean) {
  const env = {
    SUPABASE_URL: "https://aemxuqnnwfclzrwwiqfd.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
    BYETERY_WEB_ENV: preview ? "D2_PREVIEW" : "LOCAL",
    BYETERY_SOURCE: preview ? "TESTNET" : "MOCK",
    BYETERY_DEPLOYMENT_ID: TESTNET_DEPLOYMENT_ID,
    BYETERY_WEB_ORIGIN: preview
      ? "https://byetery-preview.vercel.app"
      : "http://127.0.0.1:3000",
    BYETERY_API_URL: preview
      ? "https://api.byetery.example.com"
      : "http://127.0.0.1:3001",
    BYETERY_ALLOWED_WEB_ORIGINS: '["https://byetery-preview.vercel.app"]',
    BYETERY_ALLOWED_API_ORIGINS: '["https://api.byetery.example.com"]',
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}
it.each([true, false])(
  "actual authClient enforces cookie options (HTTPS=%s)",
  async (preview) => {
    configure(preview);
    await authClient();
    const options = mocks.create.mock.calls.at(-1)![2] as {
      cookieOptions: unknown;
      cookies: {
        setAll: (
          items: {
            name: string;
            value: string;
            options: Record<string, unknown>;
          }[],
        ) => void;
      };
    };
    expect(options.cookieOptions).toEqual({
      httpOnly: true,
      sameSite: "strict",
      secure: preview,
      path: "/",
    });
    options.cookies.setAll([
      {
        name: "fixture-session",
        value: "fixture-only",
        options: {
          httpOnly: false,
          secure: false,
          sameSite: "lax",
          path: "/other",
        },
      },
    ]);
    expect(mocks.set).toHaveBeenCalledWith(
      "fixture-session",
      "fixture-only",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        secure: preview,
        path: "/",
      }),
    );
  },
);
it("sameOrigin ignores spoofed forwarding headers and requires exact configured origin", () => {
  configure(true);
  expect(
    sameOrigin(
      new Request("https://byetery-preview.vercel.app/auth/login", {
        headers: { origin: "https://byetery-preview.vercel.app" },
      }),
    ),
  ).toBe(true);
  expect(
    sameOrigin(
      new Request("https://byetery-preview.vercel.app/auth/login", {
        headers: {
          origin: "https://evil.example.com",
          "x-forwarded-host": "byetery-preview.vercel.app",
        },
      }),
    ),
  ).toBe(false);
  expect(
    sameOrigin(new Request("https://byetery-preview.vercel.app/auth/login")),
  ).toBe(false);
});
