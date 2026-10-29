import { randomUUID } from "node:crypto";
import type { ReviewDependencies } from "@/server/direct-review/http";
import { DEPLOYMENT, type ReviewProfile, type ReviewBattery } from "@/shared/review/model";
export const userId = () => randomUUID();
export const battery: ReviewBattery & { confirmedLedger: number } = {
 batteryId: "BYE-B2-LOCAL", confirmedBatteryState: "RECYCLED", confirmedRewardState: "SENT", pendingOperation: null, latestTerminalOperation: null,
 lastAttempt: null, metadata: { type: "Synthetic AA" }, ownRequest: null, source: "TESTNET", deploymentId: DEPLOYMENT, confirmedLedger: 5315915,
};
export const profile: ReviewProfile = { roles: ["ADMIN"], canCreateIntent: true, batteries: [battery.batteryId], source: "TESTNET", deploymentId: DEPLOYMENT };
export function reviewDeps() {
 const order: string[] = [], id = userId(), intentId = randomUUID();
 const calls = { sql: 0, chain: 0, auth: 0 };
 const sql = <T>(value: T) => { calls.sql++; order.push("sql"); return Promise.resolve(value); };
 const deps: ReviewDependencies = {
  config: { origins: ["https://byetery-unit.vercel.app", "https://byetery-branch.vercel.app"], supabaseUrl: "https://aemxuqnnwfclzrwwiqfd.supabase.co", publishableKey: "sb_publishable_UNIT_ONLY" },
  token: async () => "local-fixture-opaque-token", auth: { getUser: async () => { calls.auth++; order.push("auth"); return { id, role: "authenticated" }; } },
  database: { profile: () => sql(profile), battery: () => sql(battery), history: () => sql({ entries: [] }),
   create: () => sql({ operationId: intentId, batteryId: "BYE-REVIEW-ABCDEF0123456789ABCD", registrationHash: "ab".repeat(32), status: "WAITING", adoptedOperationId: null, createdAt: new Date().toISOString(), adoptedAt: null, transactionHash: null, source: "TESTNET", deploymentId: DEPLOYMENT }),
   intent: async () => { calls.sql++; order.push("sql"); throw Error("not configured"); } },
  chain: { transaction: async () => { calls.chain++; return { status: "VERIFIED", reason: "LOCAL_FIXTURE_ONLY", verifiedAt: new Date().toISOString() }; },
   state: async () => { calls.chain++; return { status: "UNVERIFIED", reason: "LOCAL_FIXTURE_ONLY", verifiedAt: new Date().toISOString() }; } },
  login: async () => {}, logout: async () => {},
 };
 return { deps, calls, order, id };
}
export function post(path = "/api/review/registration-intents", headers: Record<string, string> = {}, body = '{"templateVersion":1}') {
 return new Request("https://byetery-unit.vercel.app" + path, { method: "POST", headers: { Origin: "https://byetery-unit.vercel.app", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", "Idempotency-Key": "B2-fixture-idempotency", ...headers }, body });
}
