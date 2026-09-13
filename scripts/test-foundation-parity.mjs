// Executes the same rollback-only SQL smoke suite used against Supabase DEV.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const db = new PGlite();
try {
  await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;');
  await db.exec(await readFile(new URL('../database/migrations/20260909142956_backend_foundation.sql', import.meta.url), 'utf8'));
  const results = await db.exec(await readFile(new URL('../database/tests/foundation-dev.sql', import.meta.url), 'utf8'));
  const summary = results.flatMap(result => result.rows).find(row => row.suite === 'foundation-dev-sql');
  assert.ok(summary, 'SQL test result missing');
  assert.equal(Number(summary.passed), 82);
  const remaining = await db.query('select count(*)::int n from chain_private.deployments');
  assert.equal(remaining.rows[0].n, 0, 'Fixture transaction was not rolled back');
  console.log(JSON.stringify({ database: 'PGLITE', ...summary, remainingFixtures: 0 }));
} finally {
  await db.close();
}
