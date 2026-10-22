import { describe, expect, it } from "vitest";
import {
  matchesSource,
  sessionCookieOptions,
  TESTNET_DEPLOYMENT_ID,
  webConfiguration,
} from "@/lib/web-config";
const common = {
  SUPABASE_URL: "https://aemxuqnnwfclzrwwiqfd.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
};
export const previewEnv = {
  ...common,
  BYETERY_WEB_ENV: "D2_PREVIEW",
  BYETERY_SOURCE: "TESTNET",
  BYETERY_DEPLOYMENT_ID: TESTNET_DEPLOYMENT_ID,
  BYETERY_WEB_ORIGIN: "https://byetery-preview.vercel.app",
  BYETERY_API_URL: "https://api.byetery.example.com",
  BYETERY_ALLOWED_WEB_ORIGINS: '["https://byetery-preview.vercel.app"]',
  BYETERY_ALLOWED_API_ORIGINS: '["https://api.byetery.example.com"]',
};
describe("explicit local / D2 HTTPS configuration", () => {
  it("preserves the existing DEV/MOCK defaults", () => {
    expect(webConfiguration(common)).toMatchObject({
      origin: "http://127.0.0.1:3000",
      upstream: "http://127.0.0.1:3001",
      secureCookies: false,
      runtime: { environment: "DEV", source: "MOCK", readOnly: false },
    });
  });
  it("allows local TESTNET reads only with the full pinned deployment", () => {
    expect(
      webConfiguration({
        ...common,
        BYETERY_SOURCE: "TESTNET",
        BYETERY_DEPLOYMENT_ID: TESTNET_DEPLOYMENT_ID,
      }).runtime,
    ).toEqual({ environment: "DEV", source: "TESTNET", readOnly: true });
  });
  it("accepts exact approved HTTPS preview and upstream", () => {
    expect(webConfiguration(previewEnv)).toMatchObject({
      secureCookies: true,
      runtime: { environment: "D2_PREVIEW", source: "TESTNET", readOnly: true },
    });
  });
  it.each([
    "BYETERY_ALLOWED_WEB_ORIGINS",
    "BYETERY_ALLOWED_API_ORIGINS",
    "BYETERY_WEB_ORIGIN",
    "BYETERY_API_URL",
    "BYETERY_DEPLOYMENT_ID",
  ])("preview fails closed without %s", (key) => {
    expect(() => webConfiguration({ ...previewEnv, [key]: undefined })).toThrow(
      "WebConfigurationInvalid",
    );
  });
  it.each([
    "https://evil.example.com",
    "https://byetery-preview.vercel.app.evil.com",
    "https://byetery-preview.vercel.app/path",
    "https://user:pass@byetery-preview.vercel.app",
    "https://byetery-preview.vercel.app#x",
    "null",
    "*",
  ])("rejects unapproved or noncanonical web origin %s", (origin) => {
    expect(() =>
      webConfiguration({ ...previewEnv, BYETERY_WEB_ORIGIN: origin }),
    ).toThrow();
  });
  it.each([
    "http://127.0.0.1:3001",
    "https://127.0.0.1",
    "https://localhost",
    "https://service.internal",
    "https://evil.example.com",
    "https://api.byetery.example.com/redirect",
    "https://metadata.google.internal",
  ])("rejects unsafe upstream %s", (upstream) => {
    expect(() =>
      webConfiguration({ ...previewEnv, BYETERY_API_URL: upstream }),
    ).toThrow();
  });
  it.each([
    '["*"]',
    '["https://*.vercel.app"]',
    '"https://byetery-preview.vercel.app"',
    "[]",
  ])("rejects malformed/wildcard allowlist %s", (list) => {
    expect(() =>
      webConfiguration({ ...previewEnv, BYETERY_ALLOWED_WEB_ORIGINS: list }),
    ).toThrow();
  });
  it.each([
    "http://127.0.0.1.evil.com:3000",
    "http://127.0.0.1:3000/path",
    "http://user:pass@127.0.0.1:3000",
    "https://evil.example.com",
  ])("local rejects origin %s", (origin) => {
    expect(() =>
      webConfiguration({ ...common, BYETERY_WEB_ORIGIN: origin }),
    ).toThrow();
  });
  it("rejects wrong deployment, unknown mode, MOCK preview and another Supabase", () => {
    for (const override of [
      { BYETERY_DEPLOYMENT_ID: "5c0cad2f" },
      { BYETERY_SOURCE: "MOCK" },
      { BYETERY_SOURCE: "STELLAR" },
      { BYETERY_WEB_ENV: "PRODUCTION" },
      { SUPABASE_URL: "https://other.supabase.co" },
    ])
      expect(() => webConfiguration({ ...previewEnv, ...override })).toThrow();
  });
  it("Vercel must attest preview, exact branch and deployment/branch URL", () => {
    const vercel = {
      ...previewEnv,
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "instaward/d2-web-mvp",
      VERCEL_URL: "byetery-preview.vercel.app",
    };
    expect(webConfiguration(vercel).secureCookies).toBe(true);
    for (const override of [
      { VERCEL_ENV: "production" },
      { VERCEL_GIT_COMMIT_REF: "main" },
      { VERCEL_URL: "unapproved.vercel.app" },
    ])
      expect(() => webConfiguration({ ...vercel, ...override })).toThrow();
    expect(() =>
      webConfiguration({ ...common, VERCEL: "1", VERCEL_ENV: "preview" }),
    ).toThrow();
  });
  it("HTTPS cookies stay Secure, HttpOnly, Strict and host-path scoped", () => {
    expect(
      sessionCookieOptions(webConfiguration(previewEnv).secureCookies),
    ).toEqual({ secure: true, httpOnly: true, sameSite: "strict", path: "/" });
    expect(sessionCookieOptions(false).sameSite).toBe("strict");
  });
  it("read model source cannot downgrade, disappear or masquerade as TESTNET", () => {
    expect(matchesSource({ source: "TESTNET" }, "TESTNET")).toBe(true);
    for (const body of [{ source: "MOCK" }, {}, null, { source: "STELLAR" }])
      expect(matchesSource(body, "TESTNET")).toBe(false);
  });
});
