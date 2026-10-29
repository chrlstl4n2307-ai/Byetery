import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { reviewConfiguration } from "./config";
import { productionDatabase } from "./database";
import { TestnetReviewReader } from "./chain";
import { ReviewError } from "./errors";
import { reviewHttp, type ReviewDependencies } from "./http";
let database: ReturnType<typeof productionDatabase> | undefined;
// Per-instance abuse bound, not a distributed authority/uniqueness mechanism.
const windows = new Map<string, { until: number; count: number }>();
function rateLimit(uid: string, path: string) {
 const now = Date.now(), write = path === "/api/review/registration-intents", key = uid + (write ? ":intent" : ":read");
 for (const [k, v] of windows) if (v.until <= now) windows.delete(k);
 if (!windows.has(key) && windows.size >= 1000) return false;
 const w = windows.get(key) ?? { until: now + 60000, count: 0 }; w.count++; windows.set(key, w); return w.count <= (write ? 5 : 90);
}
export async function productionReviewDependencies(): Promise<ReviewDependencies> {
 const config = reviewConfiguration(process.env), jar = await cookies();
 const client = createServerClient(config.supabaseUrl, config.publishableKey, {
  cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  cookies: { getAll: () => jar.getAll(), setAll: entries => { for (const e of entries) jar.set(e.name, e.value, { ...e.options, httpOnly: true, secure: true, sameSite: "lax", path: "/" }); } },
  global: { fetch: (url, init) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(5000) }) },
 });
 return { config, token: async () => { try { const r = await client.auth.getSession(); if (r.error) throw new ReviewError([400, 401, 403].includes(r.error.status ?? 0) ? 401 : 503, [400, 401, 403].includes(r.error.status ?? 0) ? "Unauthenticated" : "AuthUnavailable"); return r.data.session?.access_token ?? null; } catch (e) { if (e instanceof ReviewError) throw e; throw new ReviewError(503, "AuthUnavailable"); } },
  auth: { getUser: async token => {
   try { const r = await client.auth.getUser(token); if (r.error) { if ([400, 401, 403].includes(r.error.status ?? 0)) throw new ReviewError(401, "Unauthenticated"); throw new ReviewError(503, "AuthUnavailable"); }
    if (!r.data.user) throw new ReviewError(401, "Unauthenticated"); return { id: r.data.user.id, role: r.data.user.role ?? "" };
   } catch (e) { if (e instanceof ReviewError) throw e; throw new ReviewError(503, "AuthUnavailable"); }
  } },
  // Lazy connection: no DB initialization/query happens before authoritative Auth.
  database: { profile: u => (database ??= productionDatabase(process.env)).profile(u),
   battery: (u, b) => (database ??= productionDatabase(process.env)).battery(u, b), history: (u, b) => (database ??= productionDatabase(process.env)).history(u, b),
   create: (u, k, b) => (database ??= productionDatabase(process.env)).create(u, k, b), intent: (u, id) => (database ??= productionDatabase(process.env)).intent(u, id) },
  chain: new TestnetReviewReader(), strategy: "AUTH_USER_ONLY", rateLimit,
  login: async body => {
   try { const r = await client.auth.signInWithPassword(body); if (r.error) {
    const invalid = [400, 401, 403, 422].includes(r.error.status ?? 0);
    throw new ReviewError(r.error.status === 429 ? 429 : invalid ? 401 : 503, r.error.status === 429 ? "RateLimited" : invalid ? "Unauthenticated" : "AuthUnavailable");
   } } catch (e) { if (e instanceof ReviewError) throw e; throw new ReviewError(503, "AuthUnavailable"); }
  },
  logout: async () => { try { const r = await client.auth.signOut({ scope: "local" }); if (r.error) throw new ReviewError(503, "AuthUnavailable"); }
   catch { throw new ReviewError(503, "AuthUnavailable"); } },
 };
}
export async function directReviewRoute(request: Request) {
 try { return await reviewHttp(request, await productionReviewDependencies()); }
 catch { return Response.json({ error: { code: "ConfigurationUnavailable" } }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
