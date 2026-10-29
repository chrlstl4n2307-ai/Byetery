// @vitest-environment node
import { expect, it, vi } from "vitest";
import { reviewHttp, safeReviewPath } from "@/server/direct-review/http";
import { authenticate } from "@/server/direct-review/auth";
import { ReviewError } from "@/server/direct-review/errors";
import { reviewDeps, post } from "./review-fixture";
import { REVIEW_ROUTES } from "@/shared/review/model";

for (const route of REVIEW_ROUTES.filter(x => x.path.startsWith("/api/"))) it("Auth precedes SQL for " + route.path, async () => {
 const f = reviewDeps(), path = route.path.replace(":batteryId", "BYE-B2-LOCAL").replace(":operationId", f.id);
 const request = route.methods[0] === "POST" ? post(path) : new Request("https://byetery-unit.vercel.app" + path);
 await reviewHttp(request, f.deps); expect(f.order.indexOf("auth")).toBeLessThan(f.order.indexOf("sql"));
});
for (const state of ["invalid", "unavailable"] as const) for (const route of REVIEW_ROUTES.filter(x => x.path.startsWith("/api/"))) it(state + " Auth rejects before SQL: " + route.path, async () => {
 const f = reviewDeps(); f.deps.auth.getUser = async () => { throw state === "invalid" ? new ReviewError(401, "Unauthenticated") : Error("opaque outage"); };
 const path = route.path.replace(":batteryId", "BYE-B2-LOCAL").replace(":operationId", f.id);
 const r = await reviewHttp(route.methods[0] === "POST" ? post(path) : new Request("https://byetery-unit.vercel.app" + path), f.deps);
 expect(r.status).toBe(state === "invalid" ? 401 : 503); expect(f.calls.sql).toBe(0); expect(f.calls.chain).toBe(0);
});
for (const path of ["/api/batteries", "/api/batteries/BYE-X/reward", "/api/batteries/BYE-X/returns", "/api/returns/" + "ab".repeat(32) + "/cancel", "/api/returns/x/collection", "/api/returns/x/recycling", "/api/wallet/challenge", "/api/wallet/verify", "/api/roles", "/api/set_role", "/api/proxy", "/api/backend", "/api/batteries/%2f", "/api/batteries/%5c", "/api/batteries//X", "/api/batteries/..", "/api/batteries/%2e", "/api/%252e%252e/roles"]) it("ADMIN cannot reach unsupported mutation " + path, async () => {
 const f = reviewDeps(), r = await reviewHttp(post(path), f.deps); expect(r.status).toBe(404); expect(f.calls.sql).toBe(0); expect(f.calls.chain).toBe(0);
});
for (const path of ["/api/x/../me", "/api/%2e/me", "/api/%2fme", "/api/%5cme", "/api//me", "/api/\\me", "/api/%252e/me"]) it("raw ingress policy rejects suspicious target " + path, () => {
 expect(safeReviewPath("https://byetery-unit.vercel.app" + path)).toBeNull();
});
it("known wrong method is 405 with Allow, no Auth/SQL", async () => {
 const f = reviewDeps(), r = await reviewHttp(new Request("https://byetery-unit.vercel.app/api/me", { method: "DELETE" }), f.deps);
 expect(r.status).toBe(405); expect(r.headers.get("Allow")).toBe("GET"); expect(f.calls).toEqual({ sql: 0, chain: 0, auth: 0 });
});
for (const headers of [{ Origin: "" }, { Origin: "https://evil.vercel.app" }, { "Sec-Fetch-Site": "same-site" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "" }] as Record<string, string>[]) it("CSRF rejection before SQL " + JSON.stringify(headers), async () => {
 const f = reviewDeps(), r = await reviewHttp(post(undefined, headers), f.deps); expect(r.status).toBe(403); expect(f.calls.sql).toBe(0);
});
it("immutable and branch host may each submit same-origin, never cross-origin", async () => {
 const f = reviewDeps();
 const r = new Request("https://byetery-branch.vercel.app/api/review/registration-intents", { method: "POST", headers: { Origin: "https://byetery-branch.vercel.app", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", "Idempotency-Key": "same-origin-key" }, body: '{"templateVersion":1}' });
 expect((await reviewHttp(r, f.deps)).status).toBe(202);
});
it("JSON/content/body/key guards reject before SQL", async () => {
 for (const [request, status] of [[post(undefined, { "Content-Type": "text/plain" }), 415], [post(undefined, {}, " ".repeat(4097)), 413],
  [post(undefined, { "Idempotency-Key": "" }), 400], [post(undefined, {}, '{"templateVersion":1,"auth_uid":"untrusted"}'), 400],
  [post(undefined, {}, '{"templateVersion":1,"role":"ADMIN"}'), 400]] as const) {
  const f = reviewDeps(); expect((await reviewHttp(request, f.deps)).status).toBe(status); expect(f.calls.sql).toBe(0);
 }
});
it("exact POST has WAITING and no chain confirmation or calls", async () => {
 const f = reviewDeps(), r = await reviewHttp(post(), f.deps), b = await r.json(); expect(r.status).toBe(202); expect(b.status).toBe("WAITING"); expect(b.transactionHash).toBeNull(); expect(f.calls.chain).toBe(0);
});
it("Strategy A has no session_id requirement; future B is explicit and fail closed", async () => {
 const f = reviewDeps(); expect((await authenticate("opaque", f.deps.auth)).id).toBe(f.id);
 await expect(authenticate("opaque", f.deps.auth, "AUTH_USER_PLUS_SESSION_LIVENESS")).rejects.toMatchObject({ code: "ConfigurationUnavailable" });
 await expect(authenticate("opaque", f.deps.auth, "AUTH_USER_PLUS_SESSION_LIVENESS", { isLive: async () => false })).rejects.toMatchObject({ code: "Unauthenticated" });
 const spy = vi.fn(); f.deps.auth.getUser = async () => ({ id: f.id, role: "service_role" });
 await expect(authenticate("opaque", f.deps.auth)).rejects.toMatchObject({ code: "Unauthenticated" }); expect(spy).not.toHaveBeenCalled();
});
it("durable state survives network uncertainty; unexpected errors disclose only request correlation", async () => {
 const f = reviewDeps(), r = await reviewHttp(new Request("https://byetery-unit.vercel.app/api/batteries/BYE-B2-LOCAL"), f.deps), b = await r.json();
 expect(b.confirmedBatteryState).toBe("RECYCLED"); expect(b.confirmedRewardState).toBe("SENT"); expect(b.networkVerification.status).toBe("UNVERIFIED");
 f.deps.database.profile = async () => { throw Error("DO_NOT_DISCLOSE_SQL_INTERNALS"); };
 const fail = await reviewHttp(new Request("https://byetery-unit.vercel.app/api/me"), f.deps);
 expect(await fail.text()).not.toContain("DO_NOT_DISCLOSE"); expect(fail.status).toBe(500);
});
it("missing token, rate limit, DB outage and outcome uncertainty have distinct bounded errors", async () => {
 const f = reviewDeps(); f.deps.token = async () => null;
 expect((await reviewHttp(new Request("https://byetery-unit.vercel.app/api/me"), f.deps)).status).toBe(401); expect(f.calls.sql).toBe(0);
 f.deps.token = async () => "fixture"; f.deps.rateLimit = () => false;
 expect((await reviewHttp(post(), f.deps)).status).toBe(429); expect(f.calls.sql).toBe(0);
 f.deps.rateLimit = () => true; f.deps.database.create = async () => { throw new ReviewError(503, "OutcomeUnknown"); };
 expect((await (await reviewHttp(post(), f.deps)).json()).error.code).toBe("OutcomeUnknown");
 f.deps.database.profile = async () => { throw new ReviewError(503, "ReviewDataUnavailable"); };
 expect((await (await reviewHttp(new Request("https://byetery-unit.vercel.app/api/me"), f.deps)).json()).error.code).toBe("ReviewDataUnavailable");
});
