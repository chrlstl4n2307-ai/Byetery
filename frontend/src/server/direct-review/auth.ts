import "server-only";
import { ReviewError, requireReview } from "./errors";
export interface AuthUser { id: string; role: string; }
export interface AuthoritativeAuth { getUser(accessToken: string): Promise<AuthUser>; }
export type SessionStrategy = "AUTH_USER_ONLY" | "AUTH_USER_PLUS_SESSION_LIVENESS";
export interface SessionLiveness { isLive(user: AuthUser, accessToken: string): Promise<boolean>; }
export async function authenticate(token: string | null, auth: AuthoritativeAuth, strategy: SessionStrategy = "AUTH_USER_ONLY", liveness?: SessionLiveness): Promise<AuthUser> {
 requireReview(token && token.length <= 16384, 401, "Unauthenticated");
 let user: AuthUser;
 try { user = await auth.getUser(token); } catch (e) { if (e instanceof ReviewError) throw e; throw new ReviewError(503, "AuthUnavailable"); }
 requireReview(user && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(user.id) && user.role === "authenticated", 401, "Unauthenticated");
 if (strategy === "AUTH_USER_PLUS_SESSION_LIVENESS") {
  requireReview(liveness, 503, "ConfigurationUnavailable");
  requireReview(await liveness.isLive(user, token), 401, "Unauthenticated");
 }
 return user;
}
