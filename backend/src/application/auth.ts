import type { Settings } from './config.ts';
import { AppError, requireThat } from './errors.ts';
export interface Identity { authUserId: string; sessionId: string; tokenExpiresAt?: number }
export class SupabaseAuth {
  readonly config: Settings;
  constructor(config: Settings) { this.config = config; }
  async validate(header: string | undefined): Promise<Identity> {
    requireThat(header && /^Bearer [A-Za-z0-9_.-]+$/.test(header) && header.length < 12000, 401, 'AuthenticationRequired');
    const token = header.slice(7);
    let response: Response;
    try { response = await fetch(this.config.url + '/auth/v1/user', { headers: { apikey: this.config.publicKey, Authorization: header },
      signal: AbortSignal.timeout(10000), redirect: 'error' }); }
    catch { throw new AppError(503, 'AuthUnavailable'); }
    if (!response.ok) { await response.body?.cancel(); throw new AppError(response.status >= 500 ? 503 : 401, 'InvalidSession'); }
    const user = await response.json() as { id?: string };
    // Claims are read only AFTER the Auth server has validated this exact bearer.
    let claims: { session_id?: string; sub?: string; role?: string; exp?: number };
    try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); }
    catch { throw new AppError(401, 'InvalidSession'); }
    requireThat(user.id && claims.sub === user.id && claims.role === 'authenticated' &&
      /^[0-9a-f-]{36}$/i.test(claims.session_id ?? ''), 401, 'InvalidSession');
    // D3-24 additionally requires a fixed deadline from the validated bearer.
    const expiry = typeof claims.exp === 'number' ? claims.exp * 1000 : NaN;
    return { authUserId: user.id, sessionId: claims.session_id!,
      ...(Number.isSafeInteger(expiry) && expiry > 0 ? {tokenExpiresAt:expiry} : {}) };
  }
}
