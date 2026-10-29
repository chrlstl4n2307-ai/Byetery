// @vitest-environment node
import { expect, it } from "vitest";
import { reviewConfiguration } from "@/server/direct-review/config";
import { reviewPoolConfiguration, databaseFailure } from "@/server/direct-review/database";
import { DEPLOYMENT } from "@/shared/review/model";
function env(): Record<string, string | undefined> { return {
 BYETERY_REVIEW_ADAPTER: "DIRECT_REVIEW", BYETERY_WEB_ENV: "D2_PREVIEW", BYETERY_SOURCE: "TESTNET", BYETERY_DEPLOYMENT_ID: DEPLOYMENT,
 BYETERY_WEB_ORIGIN: "https://byetery-immutable.vercel.app", BYETERY_ALLOWED_WEB_ORIGINS: JSON.stringify(["https://byetery-immutable.vercel.app", "https://byetery-branch.vercel.app"]),
 VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "instaward/d2-web-mvp", VERCEL_URL: "byetery-immutable.vercel.app", VERCEL_BRANCH_URL: "byetery-branch.vercel.app",
 SUPABASE_URL: "https://aemxuqnnwfclzrwwiqfd.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_UNIT_ONLY",
 }; }
it("exact immutable and branch origins supported, no upstream or DB fallback", () => { expect(reviewConfiguration(env()).origins).toHaveLength(2); });
for (const name of ["BYETERY_API_URL", "BYETERY_ALLOWED_API_ORIGINS", "BYETERY_LOCAL_TESTNET_MUTATIONS", "DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "BYETERY_UPSTREAM_PROXY", "NEXT_PUBLIC_DATABASE_URL", "STELLAR_ADMIN_SECRET_KEY", "BYETERY_SIGNER_BINARY"]) it("forbidden variable presence rejects even empty: " + name, () => {
 expect(() => reviewConfiguration({ ...env(), [name]: "" })).toThrow("ConfigurationUnavailable");
});
for (const [name, value] of [["BYETERY_SOURCE", "MOCK"], ["BYETERY_WEB_ENV", "LOCAL"], ["BYETERY_DEPLOYMENT_ID", "wrong"], ["VERCEL_ENV", "production"], ["VERCEL_GIT_COMMIT_REF", "main"], ["BYETERY_ALLOWED_WEB_ORIGINS", '["https://*.vercel.app"]'], ["SUPABASE_PUBLISHABLE_KEY", "sb_secret_NOT_A_REAL_KEY"], ["SUPABASE_URL", "https://wrong.supabase.co"]]) it("configuration mismatch " + name, () => {
 expect(() => reviewConfiguration({ ...env(), [name]: value })).toThrow("ConfigurationUnavailable");
});
it("service_role JWT rejected; only explicit anon project format accepted", () => {
 const key = (role: string) => ["eyJ" + Buffer.from("fixture").toString("base64url"), Buffer.from(JSON.stringify({ role, ref: "aemxuqnnwfclzrwwiqfd" })).toString("base64url"), "fixture"].join(".");
 expect(() => reviewConfiguration({ ...env(), SUPABASE_PUBLISHABLE_KEY: key("service_role") })).toThrow();
 expect(reviewConfiguration({ ...env(), SUPABASE_PUBLISHABLE_KEY: key("anon") }).origins).toHaveLength(2);
});
it("optional exact SHA guard fails closed", () => {
 expect(() => reviewConfiguration({ ...env(), BYETERY_EXPECTED_GIT_SHA: "a".repeat(40), VERCEL_GIT_COMMIT_SHA: "b".repeat(40) })).toThrow();
 expect(reviewConfiguration({ ...env(), BYETERY_EXPECTED_GIT_SHA: "a".repeat(40), VERCEL_GIT_COMMIT_SHA: "a".repeat(40) }).expectedSha).toBe("a".repeat(40));
});
it("production pool is restricted, transaction-pooler scoped, max one, verified TLS", () => {
 const uri = new URL("postgresql://unit.invalid/postgres"); uri.hostname = "aws-0-us-east-1.pooler.supabase.com"; uri.port = "6543"; uri.username = "byetery_d2_review_app.aemxuqnnwfclzrwwiqfd"; uri.password = "LOCAL_FIXTURE_ONLY";
 const c = reviewPoolConfiguration({ BYETERY_REVIEW_DATABASE_URL: uri.toString(), DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\nLOCAL_CA_FIXTURE\n-----END CERTIFICATE-----" });
 expect(c.max).toBe(1); expect(c.idleTimeoutMillis).toBe(10000); expect(c.connectionTimeoutMillis).toBe(5000); expect(c.ssl).toMatchObject({ rejectUnauthorized: true });
 uri.username = "postgres"; expect(() => reviewPoolConfiguration({ BYETERY_REVIEW_DATABASE_URL: uri.toString() })).toThrow();
});
it("connection/commit uncertainty stays explicit; no SQL internals returned", () => {
 expect(() => databaseFailure(Error("private db diagnostic"))).toThrow("ReviewDataUnavailable");
 expect(() => databaseFailure(Error("private connection loss"), true)).toThrow("OutcomeUnknown");
});
