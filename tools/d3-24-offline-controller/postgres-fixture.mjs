import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { Repository } from '../../backend/src/application/repository.ts';
import { D324 } from '../../backend/src/application/d324-scope.ts';
import { ACTORS, CONTRACT, TOKEN, WASM } from '../../backend/src/testnet/abi.ts';
import { F } from './fixture-loader.mjs';

const { Pool } = createRequire(new URL('../../backend/package.json', import.meta.url))('pg');

export async function openOfflinePostgres() {
  const port = Number(process.env.BYETERY_D324_TEST_PG_PORT);
  if (!process.send || !Number.isInteger(port) || port < 49152 || port > 65535)
    throw Error('D324_FIXTURE_POSTGRES_REQUIRED');
  const base = { host: '127.0.0.1', port, user: 'byetery_d324_fixture',
    database: 'postgres', connectionTimeoutMillis: 5000 };
  const admin = new Pool(base);
  const database = 'd324_v3_' + randomUUID().replaceAll('-', '');
  let repo, created = false;
  async function close() {
    try { await repo?.pool.end(); }
    finally {
      try { if (created) await admin.query('drop database ' + database); }
      finally { await admin.end(); }
    }
  }
  try {
    await admin.query(`do $$begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end$$`);
    await admin.query('create database ' + database);
    created = true;
    repo = new Repository({ database: { ...base, database }, mode: 'TESTNET', deploymentId: D324.deploymentId });
    const db = { query: (sql, params) => repo.pool.query(sql, params), exec: sql => repo.pool.query(sql), close };
    await db.exec('create schema auth; create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
    const migrations = new URL('../../database/migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(file, migrations), 'utf8'));
    await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
      values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,
    [D324.deploymentId,D324.networkId,CONTRACT,WASM,ACTORS.admin,ACTORS.service,TOKEN]);
    const users = Object.fromEntries(F.roles.map(role => [role, randomUUID()]));
    for (const [role,user] of Object.entries(users)) {
      await db.query('insert into auth.users values($1)', [user]);
      await db.query('insert into app_private.users(id,auth_user_id) values($1,$1)', [user]);
      await db.query('insert into api_private.memberships(deployment_id,user_id,role,actor_address) values($1,$2,$3,$4)',
        [D324.deploymentId,user,role,role === 'COLLECTOR' ? ACTORS.collector : role === 'RECYCLER' ? ACTORS.recycler : null]);
    }
    return { db, repo, users, deploymentId: D324.deploymentId, identities: await F.setupSessions(repo, users) };
  } catch (error) {
    await close();
    throw error;
  }
}
