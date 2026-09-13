import { requireThat } from './errors.ts';
import { batteryId, hash32 } from '../domain.ts';
export function object(value: unknown, allowed: string[]): Record<string, unknown> {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 400, 'InvalidBody');
  const obj = value as Record<string, unknown>;
  requireThat(Object.keys(obj).every(k => allowed.includes(k)), 400, 'UnexpectedField'); return obj;
}
export function text(value: unknown, max = 256): string {
  requireThat(typeof value === 'string' && value.length > 0 && value.length <= max, 400, 'InvalidInput'); return value;
}
export function bid(value: unknown): string { const s = text(value,32); requireThat(/^[A-Z0-9-]+$/.test(s),400,'InvalidBatteryId'); return batteryId(s); }
export function rid(value: unknown): string { const s = text(value,64); requireThat(/^[a-f0-9]{64}$/.test(s),400,'InvalidRequestId'); return hash32(s); }
export function uuid(value: unknown): string { const s=text(value,36); requireThat(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s),400,'InvalidIdentifier'); return s; }
export function bytes(value: unknown, max = 16384): Buffer {
  const s = text(value, Math.ceil(max/3)*4);
  requireThat(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s),400,'InvalidBase64');
  const b = Buffer.from(s,'base64'); requireThat(b.length > 0 && b.length <= max,400,'InvalidPayload'); return b;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value !== null && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(value);
}
