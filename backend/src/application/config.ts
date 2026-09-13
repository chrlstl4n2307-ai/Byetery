import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { PoolConfig } from 'pg';
import { requireThat } from './errors.ts';
export const root = fileURLToPath(new URL('../../../', import.meta.url));
export interface Settings { url: string; publicKey: string; serverKey: string; deploymentId: string; database: PoolConfig }
export async function settings(): Promise<Settings> {
  const env = { ...parseEnv(await readFile(resolve(root, '.env'), 'utf8')), ...process.env };
  const ref = 'aemxuqnnwfclzrwwiqfd';
  requireThat(env.BYETERY_ENV === 'DEV' && env.BYETERY_MODE === 'MOCK' && env.SUPABASE_PROJECT_REF === ref
    && env.SUPABASE_URL === `https://${ref}.supabase.co`, 500, 'DevTargetRequired');
  for (const name of ['DATABASE_URL','DATABASE_SSL_CA','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','BYETERY_DEPLOYMENT_ID'])
    requireThat(env[name], 500, 'MissingConfiguration');
  const url = new URL(env.DATABASE_URL!);
  const user = decodeURIComponent(url.username);
  requireThat(['postgres:','postgresql:'].includes(url.protocol) && url.pathname === '/postgres' &&
    (url.hostname === `db.${ref}.supabase.co` || (url.hostname.endsWith('.pooler.supabase.com') && user.endsWith(`.${ref}`))), 500, 'DevDatabaseRequired');
  return { url: env.SUPABASE_URL!, publicKey: env.SUPABASE_PUBLISHABLE_KEY!, serverKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    deploymentId: env.BYETERY_DEPLOYMENT_ID!, database: { host: url.hostname, port: Number(url.port || 5432),
      database: 'postgres', user, password: decodeURIComponent(url.password), max: 6,
      ssl: { rejectUnauthorized: true, ca: await readFile(resolve(root, env.DATABASE_SSL_CA!), 'utf8') },
      connectionTimeoutMillis: 15000, query_timeout: 20000, application_name: 'byetery-dev-api' } };
}
