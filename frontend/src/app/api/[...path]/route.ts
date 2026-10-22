import {
  authClient,
  configuration,
  error,
  json,
  readJson,
  sameOrigin,
} from "@/lib/server";
import { allowedApiPath } from "@/lib/proxy-policy";
import { matchesSource, WebConfigurationError } from "@/lib/web-config";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    if (!allowedApiPath(request.method, path)) return error(404, "NotFound");
    if (request.method === "POST" && !sameOrigin(request))
      return error(403, "OriginRejected");
    const config = configuration();
    if (request.method === "POST" && config.runtime.readOnly)
      return error(403, "ReadOnlyTestnet");
    const client = await authClient();
    const { data: sessionData, error: sessionError } =
      await client.auth.getSession();
    if (sessionError || !sessionData.session)
      return error(401, "AuthenticationRequired");
    // Session cookie is only a transport. The existing API validates the bearer
    // with Supabase and checks the live auth.sessions row on every operation.
    const headers: Record<string, string> = {
      Authorization: "Bearer " + sessionData.session.access_token,
    };
    let body: string | undefined;
    if (request.method === "POST") {
      const key = request.headers.get("idempotency-key");
      if (!key || !/^[A-Za-z0-9._:-]{8,128}$/.test(key))
        return error(400, "IdempotencyKeyRequired");
      headers["Idempotency-Key"] = key;
      headers["Content-Type"] = "application/json";
      try {
        body = JSON.stringify(await readJson(request));
      } catch {
        return error(400, "InvalidInput");
      }
    }
    const response = await fetch(config.upstream + "/api/" + path.join("/"), {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (response.status >= 500)
      return error(response.status, "ServiceUnavailable");
    const payload: unknown = await response.json();
    if (response.ok && !matchesSource(payload, config.runtime.source))
      return error(503, "SourceMismatch");
    return json(payload, response.status);
  } catch (failure) {
    if (failure instanceof WebConfigurationError)
      return error(503, "ConfigurationUnavailable");
    return error(504, "OutcomeUnknown");
  }
}
export const GET = handle;
export const POST = handle;
