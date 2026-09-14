import { authClient, error, json, readJson, sameOrigin } from "@/lib/server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
export async function GET(_request: Request, context: Context) {
  if ((await context.params).action !== "session")
    return error(404, "NotFound");
  try {
    const client = await authClient(),
      { data, error: failure } = await client.auth.getUser();
    if (failure || !data.user) return error(401, "AuthenticationRequired");
    return json({ user: { id: data.user.id, email: data.user.email } });
  } catch {
    return error(503, "AuthUnavailable");
  }
}
export async function POST(request: Request, context: Context) {
  try {
    if (!sameOrigin(request)) return error(403, "OriginRejected");
    const { action } = await context.params;
    if (!["login", "signup", "logout"].includes(action))
      return error(404, "NotFound");
    const client = await authClient();
    if (action === "logout") {
      const { error: failure } = await client.auth.signOut({ scope: "local" });
      return failure ? error(503, "LogoutUnavailable") : json({ ok: true });
    }
    let body: Record<string, unknown>;
    try {
      body = await readJson(request);
    } catch {
      return error(400, "InvalidInput");
    }
    if (
      Object.keys(body).some((k) => !["email", "password"].includes(k)) ||
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      body.email.length > 254 ||
      body.password.length > 256 ||
      body.password.length < 8
    )
      return error(422, "InvalidInput");
    const credentials = { email: body.email, password: body.password };
    const result =
      action === "signup"
        ? await client.auth.signUp(credentials)
        : await client.auth.signInWithPassword(credentials);
    if (result.error)
      return error(result.error.status === 429 ? 429 : 400, "AuthRejected");
    return json({ ok: true, confirmationRequired: !result.data.session });
  } catch {
    return error(503, "AuthUnavailable");
  }
}
