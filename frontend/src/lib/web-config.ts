/** Server-side configuration policy. Never derive trust from request headers. */
export type BlockchainSource = "MOCK" | "TESTNET";
export const TESTNET_DEPLOYMENT_ID = "5c0cad2f-5f25-4216-8068-6cb9d2d26325";
export interface WebRuntime {
  environment: "DEV" | "D2_PREVIEW";
  source: BlockchainSource;
  readOnly: boolean;
}
export const localRuntime: WebRuntime = {
  environment: "DEV",
  source: "MOCK",
  readOnly: false,
};
export class WebConfigurationError extends Error {
  constructor() {
    super("WebConfigurationInvalid");
  }
}
function requireConfig(value: unknown): asserts value {
  if (!value) throw new WebConfigurationError();
}
function exactOrigin(value: string | undefined, local: boolean): string {
  requireConfig(value);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebConfigurationError();
  }
  requireConfig(url.origin === value && !url.username && !url.password);
  if (local) {
    requireConfig(
      url.protocol === "http:" &&
        url.hostname === "127.0.0.1" &&
        Number(url.port) >= 1024 &&
        Number(url.port) <= 65535,
    );
  } else {
    requireConfig(
      url.protocol === "https:" &&
        !url.port &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
          url.hostname,
        ) &&
        !/^\d+(?:\.\d+){3}$/.test(url.hostname) &&
        !/\.(?:localhost|local|internal|test|invalid)$/.test(url.hostname),
    );
  }
  return value;
}
function approvedOrigins(value: string | undefined): string[] {
  requireConfig(value);
  let list: unknown;
  try {
    list = JSON.parse(value);
  } catch {
    throw new WebConfigurationError();
  }
  requireConfig(Array.isArray(list) && list.length > 0 && list.length <= 10);
  return list.map((entry: unknown) => {
    requireConfig(typeof entry === "string");
    return exactOrigin(entry, false);
  });
}
export function webConfiguration(env: Record<string, string | undefined>) {
  const preview = env.BYETERY_WEB_ENV === "D2_PREVIEW";
  requireConfig(
    !env.BYETERY_WEB_ENV ||
      ["LOCAL", "D2_PREVIEW"].includes(env.BYETERY_WEB_ENV),
  );
  const source = env.BYETERY_SOURCE ?? "MOCK";
  requireConfig(source === "MOCK" || source === "TESTNET");
  if (preview) requireConfig(source === "TESTNET");
  if (source === "TESTNET")
    requireConfig(env.BYETERY_DEPLOYMENT_ID === TESTNET_DEPLOYMENT_ID);
  const onVercel = env.VERCEL === "1" || !!env.VERCEL_ENV;
  if (onVercel)
    requireConfig(
      preview &&
        env.VERCEL_ENV === "preview" &&
        env.VERCEL_GIT_COMMIT_REF === "instaward/d2-web-mvp",
    );
  const origin = exactOrigin(
    env.BYETERY_WEB_ORIGIN ?? (preview ? undefined : "http://127.0.0.1:3000"),
    !preview,
  );
  const upstream = exactOrigin(
    env.BYETERY_API_URL ?? (preview ? undefined : "http://127.0.0.1:3001"),
    !preview,
  );
  requireConfig(origin !== upstream);
  if (preview) {
    requireConfig(
      approvedOrigins(env.BYETERY_ALLOWED_WEB_ORIGINS).includes(origin),
    );
    requireConfig(
      approvedOrigins(env.BYETERY_ALLOWED_API_ORIGINS).includes(upstream),
    );
    if (onVercel)
      requireConfig(
        [env.VERCEL_URL, env.VERCEL_BRANCH_URL].some(
          (host) => host && origin === `https://${host}`,
        ),
      );
  }
  const url = env.SUPABASE_URL,
    key = env.SUPABASE_PUBLISHABLE_KEY;
  requireConfig(key);
  requireConfig(
    url === "https://aemxuqnnwfclzrwwiqfd.supabase.co" &&
      key?.startsWith("sb_publishable_"),
  );
  const runtime: WebRuntime = {
    environment: preview ? "D2_PREVIEW" : "DEV",
    source,
    readOnly: source === "TESTNET",
  };
  return { origin, upstream, url, key, runtime, secureCookies: preview };
}
export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "strict" as const, secure, path: "/" };
}
export function matchesSource(
  body: unknown,
  source: BlockchainSource,
): boolean {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "source" in body &&
    body.source === source
  );
}
