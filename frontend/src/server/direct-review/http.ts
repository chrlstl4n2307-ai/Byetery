import "server-only";
import { randomUUID } from "node:crypto";
import { DEPLOYMENT, type HistoryRow, type ReviewBattery } from "@/shared/review/model";
import type { ReviewConfig } from "./config";
import type { AuthoritativeAuth, SessionStrategy, SessionLiveness } from "./auth";
import { authenticate } from "./auth";
import type { ReviewDatabase } from "./database";
import type { ReviewChain } from "./chain";
import { verifySnapshot } from "./chain";
import { ReviewError, requireReview } from "./errors";
import { safeReviewPath, routeReview } from "./policy";
export { safeReviewPath, routeReview } from "./policy";
export interface ReviewDependencies {
 config: ReviewConfig; auth: AuthoritativeAuth; token(): Promise<string | null>;
 database: ReviewDatabase; chain: ReviewChain; strategy?: SessionStrategy; liveness?: SessionLiveness;
 login?(body: { email: string; password: string }): Promise<void>; logout?(): Promise<void>;
 rateLimit?(authUid: string, path: string): boolean;
}
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", ...extra } });
function errorResponse(e: unknown) {
 return e instanceof ReviewError ? reply({ error: { code: e.code } }, e.status) : reply({ error: { code: "InternalError", requestId: randomUUID() } }, 500);
}
export async function reviewBody(request: Request): Promise<Record<string, unknown>> {
 requireReview(request.headers.get("content-type") === "application/json", 415, "JsonRequired");
 const declared = Number(request.headers.get("content-length") ?? 0);
 requireReview(Number.isFinite(declared) && declared <= 4096, 413, "BodyTooLarge");
 const reader = request.body?.getReader(); requireReview(reader, 400, "InvalidInput");
 const chunks: Uint8Array[] = []; let size = 0;
 for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 4096) { await reader.cancel(); throw new ReviewError(413, "BodyTooLarge"); } chunks.push(next.value); }
 let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ReviewError(400, "InvalidInput"); }
 requireReview(body && typeof body === "object" && !Array.isArray(body), 400, "InvalidInput");
 return body as Record<string, unknown>;
}
function originCheck(request: Request, config: ReviewConfig) {
 const origin = request.headers.get("origin"), actual = new URL(request.url).origin;
 requireReview(origin && origin === actual && config.origins.includes(origin) && request.headers.get("sec-fetch-site") === "same-origin", 403, "OriginRejected");
}
function safeBattery(v: ReviewBattery) {
 requireReview(v.source === "TESTNET" && v.deploymentId === DEPLOYMENT, 503, "ConfigurationUnavailable");
 return { batteryId: v.batteryId, confirmedBatteryState: v.confirmedBatteryState, confirmedRewardState: v.confirmedRewardState,
  pendingOperation: v.pendingOperation, latestTerminalOperation: v.latestTerminalOperation, lastAttempt: v.lastAttempt,
  metadata: v.metadata, ownRequest: v.ownRequest, source: v.source, deploymentId: v.deploymentId };
}
function safeHistoryRow(row: HistoryRow) {
 return { operationId: row.operationId, kind: row.kind, status: row.status, transactionHash: row.transactionHash, ledger: row.ledger,
  createdAt: row.createdAt, updatedAt: row.updatedAt, errorCode: row.errorCode, revision: row.revision, payloadHash: row.payloadHash, commitment: row.commitment };
}
/** Route + method + CSRF/body guards, THEN authoritative Auth, THEN bounded SQL. */
export async function reviewHttp(request: Request, deps: ReviewDependencies): Promise<Response> {
 try {
  const path = safeReviewPath(request.url), rule = path ? routeReview(path) : null;
  if (!path || !rule) return reply({ error: { code: "NotFound" } }, 404);
  if (!(rule.methods as readonly string[]).includes(request.method)) return reply({ error: { code: "MethodNotAllowed" } }, 405, { Allow: rule.methods.join(", ") });
  let body: Record<string, unknown> | undefined, key: string | null = null;
  if (request.method === "POST") {
   originCheck(request, deps.config); body = await reviewBody(request);
   if (path === "/api/review/registration-intents") {
    key = request.headers.get("idempotency-key"); requireReview(key && /^[A-Za-z0-9._:-]{8,128}$/.test(key), 400, "IdempotencyKeyRequired");
    requireReview(Object.keys(body).length === 1 && typeof body.templateVersion === "number" && Number.isInteger(body.templateVersion) && [1, 2].includes(body.templateVersion), 400, "InvalidInput");
   }
  }
  if (path === "/auth/login") {
   requireReview(body && Object.keys(body).every(k => ["email", "password"].includes(k)) && typeof body.email === "string" && body.email.length <= 254 && typeof body.password === "string" && body.password.length >= 8 && body.password.length <= 256, 400, "InvalidInput");
   requireReview(deps.login, 503, "AuthUnavailable"); await deps.login({ email: body.email, password: body.password }); return reply({ ok: true });
  }
  const user = await authenticate(await deps.token(), deps.auth, deps.strategy, deps.liveness);
  requireReview(!deps.rateLimit || deps.rateLimit(user.id, path), 429, "RateLimited");
  if (path === "/auth/logout") { requireReview(deps.logout, 503, "AuthUnavailable"); await deps.logout(); return reply({ ok: true }); }
  if (path === "/api/me") {
   const p = await deps.database.profile(user.id); requireReview(p.source === "TESTNET" && p.deploymentId === DEPLOYMENT, 503, "ConfigurationUnavailable"); return reply(p);
  }
  if (path === "/api/review/registration-intents") return reply(await deps.database.create(user.id, key!, body), 202);
  if (path.startsWith("/api/review/registration-intents/")) return reply(await deps.database.intent(user.id, path.split("/").at(-1)!));
  const id = path.split("/")[3];
  if (path.endsWith("/history")) {
   const rows = await deps.database.history(user.id, id);
   const battery = await deps.database.battery(user.id, id);
   const { entries, networkVerification, mismatch } = await verifySnapshot(battery, rows.entries, deps.chain);
   return reply({ batteryId: id, source: "TESTNET", deploymentId: DEPLOYMENT, networkVerification,
    entries: entries.map(e => ({ ...safeHistoryRow(e), verification: e.verification })) }, mismatch ? 503 : 200);
  }
  const battery = await deps.database.battery(user.id, id);
  const verification = await deps.chain.state(battery, battery.confirmedLedger ?? 0);
  return reply({ ...safeBattery(battery), networkVerification: verification }, verification.status === "MISMATCH" ? 503 : 200);
 } catch (e) { return errorResponse(e); }
}
