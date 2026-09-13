import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { Client } = require('pg');
const ref = 'aemxuqnnwfclzrwwiqfd';
let client;
let phase = 'CONFIGURATION';
try {
  const env = parseEnv(await readFile(resolve(root, '.env'), 'utf8'));
  for (const name of ['DATABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_SSL_CA']) {
    if (!env[name]?.trim()) throw new Error('MISSING_CONFIGURATION');
  }
  if (env.BYETERY_ENV !== 'DEV' || env.BYETERY_MODE !== 'MOCK' ||
      env.SUPABASE_PROJECT_REF !== ref || env.SUPABASE_URL !== `https://${ref}.supabase.co`) {
    throw new Error('WRONG_TARGET');
  }
  const url = new URL(env.DATABASE_URL);
  const user = decodeURIComponent(url.username);
  const direct = url.hostname === `db.${ref}.supabase.co`;
  const pooler = url.hostname.endsWith('.pooler.supabase.com') && user.endsWith(`.${ref}`);
  if ((!direct && !pooler) || !['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/postgres') {
    throw new Error('WRONG_DATABASE_TARGET');
  }
  phase = 'POSTGRES';
  client = new Client({
    host: url.hostname, port: Number(url.port || 5432), database: 'postgres', user,
    password: decodeURIComponent(url.password),
    // Explicit fields prevent URL sslmode parameters from weakening TLS validation.
    ssl: { rejectUnauthorized: true, ca: await readFile(resolve(root, env.DATABASE_SSL_CA), 'utf8') },
    connectionTimeoutMillis: 15000, query_timeout: 15000,
    application_name: 'byetery-dev-connectivity-check',
  });
  await client.connect();
  const stream = client.connection.stream;
  if (!stream.encrypted || !stream.authorized) throw new Error('TLS_NOT_VERIFIED');
  await client.query('begin read only');
  const result = await client.query(`select current_database() as database,
    (select count(*)::int from pg_tables where schemaname in ('app_private','chain_private')) as private_tables`);
  await client.query('rollback');
  console.log(JSON.stringify({ database: 'SUPABASE DEV', projectRef: ref,
    ...result.rows[0], tls: stream.getProtocol(), certificateValidated: true }));
  for (const [name, key, path] of [
    ['PUBLISHABLE_KEY', env.SUPABASE_PUBLISHABLE_KEY, '/auth/v1/settings'],
    ['SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY, '/auth/v1/admin/users?page=1&per_page=1'],
  ]) {
    phase = name;
    const headers = { apikey: key };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(env.SUPABASE_URL + path, {
      headers, redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    await response.body?.cancel();
    console.log(`${name}: HTTP ${response.status}`);
    if (!response.ok) throw new Error('AUTH_KEY_REJECTED');
  }
  console.log('DEV_CONNECTION_CHECK: PASS (read-only; no user sessions created)');
} catch (error) {
  // Never log raw driver/HTTP errors: they may contain credentials or user data.
  const safeCode = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
    ? error.code : 'CHECK_FAILED';
  console.error(`DEV_CONNECTION_CHECK: FAIL phase=${phase} code=${safeCode}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
