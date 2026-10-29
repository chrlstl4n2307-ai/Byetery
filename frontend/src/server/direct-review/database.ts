import "server-only";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import type { ReviewBattery, ReviewProfile, RegistrationIntent, HistoryRow } from "@/shared/review/model";
import { ReviewError, requireReview } from "./errors";
export interface ReviewDatabase {
 profile(authUid: string): Promise<ReviewProfile>;
 battery(authUid: string, id: string): Promise<ReviewBattery & { confirmedLedger: number | null }>;
 history(authUid: string, id: string): Promise<{ entries: HistoryRow[] }>;
 create(authUid: string, key: string, input: unknown): Promise<RegistrationIntent>;
 intent(authUid: string, id: string): Promise<RegistrationIntent>;
}
export function reviewPoolConfiguration(env: Record<string, string | undefined>): PoolConfig {
 let u: URL; try { u = new URL(env.BYETERY_REVIEW_DATABASE_URL ?? ""); } catch { throw new ReviewError(503, "ConfigurationUnavailable"); }
 const ca = env.DATABASE_SSL_CA;
 requireReview(u.protocol === "postgresql:" && u.port === "6543" && /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(u.hostname) &&
  decodeURIComponent(u.username) === "byetery_d2_review_app.aemxuqnnwfclzrwwiqfd" && u.pathname === "/postgres" && !u.search &&
  u.password && ca?.includes("-----BEGIN CERTIFICATE-----") && ca.length < 65536, 503, "ConfigurationUnavailable");
 return { host: u.hostname, port: 6543, database: "postgres", user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  ssl: { rejectUnauthorized: true, ca }, max: 1, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000,
  query_timeout: 6000, application_name: "byetery-direct-review" };
}
export function databaseFailure(error: unknown, write = false): never {
 const e = error as { code?: string; message?: string; constraint?: string };
 if (e.code === "P0002") throw new ReviewError(404, "NotFound");
 if (e.code === "42501") throw new ReviewError(403, "ReviewAccessDisabled");
 if (e.message === "ReviewDeploymentMismatch") throw new ReviewError(503, "ConfigurationUnavailable");
 if (e.message === "ReviewIdempotencyConflict") throw new ReviewError(409, "IdempotencyConflict");
 if (e.code === "23505") throw new ReviewError(409, e.constraint === "review_one_waiting_per_principal" ? "ReviewWaitingLimit" : "ReviewIntentConflict");
 if (e.code === "22023") throw new ReviewError(400, "InvalidInput");
 throw new ReviewError(503, write ? "OutcomeUnknown" : "ReviewDataUnavailable");
}
export class PgReviewDatabase implements ReviewDatabase {
 constructor(private readonly pool: Pool) {}
 private async call<T>(sql: string, args: unknown[], write = false): Promise<T> {
  let client: PoolClient; try { client = await this.pool.connect(); } catch { throw new ReviewError(503, "ReviewDataUnavailable"); }
  let broken = false;
  try { return (await client.query<{ result: T }>(sql, args)).rows[0].result; }
  catch (e) { broken = !/^(22|23|42|P0)/.test((e as { code?: string }).code ?? ""); return databaseFailure(e, write); }
  finally { client.release(broken); }
 }
 profile(u: string) { return this.call<ReviewProfile>("select review_private.profile($1) result", [u]); }
 battery(u: string, id: string) { return this.call<ReviewBattery & { confirmedLedger: number | null }>("select review_private.battery($1,$2) result", [u, id]); }
 history(u: string, id: string) { return this.call<{ entries: HistoryRow[] }>("select review_private.history_rows($1,$2) result", [u, id]); }
 create(u: string, key: string, body: unknown) { return this.call<RegistrationIntent>("select review_private.create_review_registration_intent($1,$2,$3::jsonb) result", [u, key, JSON.stringify(body)], true); }
 intent(u: string, id: string) { return this.call<RegistrationIntent>("select review_private.review_registration_intent_status($1,$2) result", [u, id]); }
}
export function productionDatabase(env: Record<string, string | undefined>) { const p = new Pool(reviewPoolConfiguration(env)); p.on("error", () => {}); return new PgReviewDatabase(p); }
