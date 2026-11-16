// Lab adapter for the existing D3-26 h26 SQL fixture. Each invocation runs
// under its assigned Windows account and owns exactly one SCRAM credential.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const roles = ['verifier', 'closer', 'revoker'];
const check = (condition) => { if (!condition) throw Error('H2_LAB_INPUT_REJECTED'); };
const queries = {
  verifier: 'select h26.attest($1, $2, $3)',
  closer: 'select h26.close_operation($1, $2)',
  revoker: 'select h26.revoke($1)',
};

async function roleProbe(role, path, command) {
  check(process.platform === 'win32' && roles.includes(role) && isAbsolute(path) &&
    ['identity', 'act', 'hold'].includes(command) && !process.env.DATABASE_URL && !process.env.PGPASSWORD &&
    !process.env.PGSERVICE && !process.env.PGSERVICEFILE && !process.env.PGOPTIONS);
  const lab = JSON.parse(await readFile(path, 'utf8'));
  const sid = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {encoding: 'utf8', windowsHide: true})
    .match(/S-1-(?:5-21|5-80)-[0-9-]+/i)?.[0];
  const sids = roles.map(name => lab.actors?.[name]?.sid);
  check(sids.every(value => /^S-1-(5-21|5-80)-[0-9-]+$/.test(value ?? '')) && new Set(sids).size === 3 &&
    !sids.includes(lab.controllerSid) &&
    sid === lab.actors[role].sid && /^h2sid_[0-9a-f]{24}$/.test(lab.database) &&
    Number.isSafeInteger(lab.port) && lab.port >= 49152 && lab.port <= 65535);
  const root = await realpath(lab.root);
  check(root === lab.root && await realpath(path) === path && path === join(root, 'local-manifest.json'));
  const secret = join(root, 'secrets', role + '.txt');
  check((await lstat(secret)).isFile() && await realpath(secret) === secret &&
    lab.actors[role].secret === secret);
  const password = (await readFile(secret, 'utf8')).trim();
  check(/^[0-9a-f]{64}$/i.test(password));
  const { Client } = createRequire(new URL('../../backend/package.json', import.meta.url))('pg');
  const user = 'h26_' + role;
  const options = { host: '127.0.0.1', database: lab.database, port: lab.port, user, password,
    ssl: false, connectionTimeoutMillis: 3000, statement_timeout: 12000,
    options: '-c idle_in_transaction_session_timeout=15000' };
  const client = new Client(options);
  await client.connect();
  try {
    const { rows: [identity] } = await client.query('select current_user, session_user');
    check(identity.current_user === user && identity.session_user === user);
    if (command === 'identity') {
      for (const peer of roles.filter(name => name !== role)) {
        const target = 'h26_' + peer;
        await client.query('SET ROLE ' + target).then(
          () => { throw Error('H2_LAB_CROSS_ROLE_ACCEPTED'); },
          err => check(err.code === '42501'));
        const wrong = new Client({ ...options, user: target });
        try {
          await wrong.connect().then(
            () => { throw Error('H2_LAB_CROSS_LOGIN_ACCEPTED'); },
            err => check(err.code === '28P01'));
        } finally { await wrong.end(); }
      }
      return;
    }
    check(/^[a-f0-9-]{36}$/.test(lab.operationId) && /^[a-f0-9]{64}$/.test(lab.digest) &&
      Number.isSafeInteger(lab.generation) && lab.generation > 0);
    const params = role === 'verifier' ? [lab.operationId, lab.generation, lab.digest] :
      role === 'closer' ? [lab.operationId, lab.digest] : [lab.operationId];
    if (command === 'act') { await client.query(queries[role], params); return; }
    check(role !== 'verifier' && /^[a-f0-9]{24}$/.test(lab.race));
    const state = join(root, 'state', role);
    const fence = join(root, 'release-' + lab.race);
    check(await realpath(state) === state && lab.actors[role].stateDirectory === state);
    await client.query('BEGIN');
    try {
      await client.query(queries[role], params);
      await writeFile(join(state, 'locked-' + lab.race), String(client.processID), { flag: 'wx' });
      const deadline = performance.now() + 10000;
      while (true) {
        check(performance.now() < deadline);
        try {
          const signal = await lstat(fence);
          check(signal.isFile() && await realpath(fence) === fence);
          break;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await sleep(50);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally { await client.end(); }
}

try {
  const [role, path, command] = process.argv.slice(2);
  check(process.argv.length === 5 && resolve(path) === path);
  await roleProbe(role, path, command);
  process.stdout.write(JSON.stringify({ role, command, status: 'PASS' }) + '\n');
} catch (error) {
  const code = String(error.code ?? error.message);
  process.stdout.write(JSON.stringify({ status: 'REJECTED',
    code: /^(H2_LAB_[A-Z_]+|[0-9A-Z]{5})$/.test(code) ? code : 'H2_LAB_UNAVAILABLE' }) + '\n');
  process.exitCode = 1;
}
