import "server-only";
import { DEPLOYMENT, REVIEW_FORBIDDEN_ENV, REVIEW_FORBIDDEN_ENV_PATTERN } from "@/shared/review/model";
import { requireReview } from "./errors";
export interface ReviewConfig { origins: string[]; supabaseUrl: string; publishableKey: string; expectedSha?: string; }
function approvedOrigin(value: unknown): value is string {
 if (typeof value !== "string") return false;
 try { const u = new URL(value); return u.protocol === "https:" && u.origin === value && !u.port && !u.username && !u.password &&
  /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(u.hostname) && !/\.(local|internal|test|invalid)$/.test(u.hostname); } catch { return false; }
}
export function reviewConfiguration(env: Record<string, string | undefined>): ReviewConfig {
 requireReview(!Object.keys(env).some(k => (REVIEW_FORBIDDEN_ENV as readonly string[]).includes(k) || REVIEW_FORBIDDEN_ENV_PATTERN.test(k)), 503, "ConfigurationUnavailable");
 requireReview(env.BYETERY_REVIEW_ADAPTER === "DIRECT_REVIEW" && env.BYETERY_WEB_ENV === "D2_PREVIEW" && env.BYETERY_SOURCE === "TESTNET" &&
  env.BYETERY_DEPLOYMENT_ID === DEPLOYMENT, 503, "ConfigurationUnavailable");
 requireReview(env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "instaward/d2-web-mvp", 503, "ConfigurationUnavailable");
 if (env.BYETERY_EXPECTED_GIT_SHA) requireReview(/^[0-9a-f]{40}$/.test(env.BYETERY_EXPECTED_GIT_SHA) && env.VERCEL_GIT_COMMIT_SHA === env.BYETERY_EXPECTED_GIT_SHA, 503, "ConfigurationUnavailable");
 let origins: unknown; try { origins = JSON.parse(env.BYETERY_ALLOWED_WEB_ORIGINS ?? ""); } catch { origins = null; }
 requireReview(Array.isArray(origins) && origins.length > 0 && origins.length <= 4 && origins.every(approvedOrigin) && new Set(origins).size === origins.length, 503, "ConfigurationUnavailable");
 requireReview(approvedOrigin(env.BYETERY_WEB_ORIGIN) && origins.includes(env.BYETERY_WEB_ORIGIN), 503, "ConfigurationUnavailable");
 const platformOrigins = [env.VERCEL_URL, env.VERCEL_BRANCH_URL].filter(Boolean).map(x => `https://${x}`);
 requireReview(platformOrigins.length > 0 && origins.every(o => platformOrigins.includes(o)), 503, "ConfigurationUnavailable");
 requireReview(env.SUPABASE_URL === "https://aemxuqnnwfclzrwwiqfd.supabase.co", 503, "ConfigurationUnavailable");
 const key = env.SUPABASE_PUBLISHABLE_KEY;
 let safe = typeof key === "string" && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
 if (key?.startsWith("eyJ")) {
  try { const claim = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()); safe = key.split(".").length === 3 && claim.role === "anon" && claim.ref === "aemxuqnnwfclzrwwiqfd"; } catch { safe = false; }
 }
 requireReview(safe && key && !key.startsWith("sb_secret_"), 503, "ConfigurationUnavailable");
 return { origins, supabaseUrl: env.SUPABASE_URL, publishableKey: key, expectedSha: env.BYETERY_EXPECTED_GIT_SHA };
}
