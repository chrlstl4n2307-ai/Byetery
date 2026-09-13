export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
export function requireThat(value: unknown, status: number, code: string): asserts value {
  if (!value) throw new AppError(status, code);
}
export interface Reply { status: number; body: Record<string, unknown> }
export function failure(status: number, code: string): Reply { return { status, body: { error: { code } } }; }
export function commandFailure(code: string): Reply {
  const status = code === 'Unauthorized' || code === 'RoleNotGranted' ? 403
    : code.includes('Evidence') ? 422 : code.endsWith('NotFound') ? 404 : 409;
  return failure(status, code);
}
export function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item));
}
