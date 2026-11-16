import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { lstat, realpath, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readH2Launch, readH2Credential } from './Verify-H2NodeBoundary.mjs';

const [manifest, request, operation] = process.argv.slice(2);
const input = createInterface({input:process.stdin,crlfDelay:Infinity});
const incoming = input[Symbol.asyncIterator]();
const first = await incoming.next();
assert(!first.done && first.value.length <= 1024);
const proof = JSON.parse(first.value);
const {lab} = await readH2Launch('revoker',manifest,proof);
assert(await realpath(lab.root) === lab.root && await realpath(manifest) === join(lab.root,'local-manifest.json'));
const sid = execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true,encoding:'utf8'}).match(/S-1-5-21-[0-9-]+/)?.[0];
assert(sid && sid === lab.actors.revoker.sid && sid !== lab.controllerSid);
assert(/^d324_v3_[a-f0-9]{32}$/.test(lab.database) && lab.port >= 49152 && lab.port <= 65535);
assert(/^[a-f0-9]{24}$/.test(request) && /^[a-f0-9-]{36}$/.test(operation));
const {password} = await readH2Credential('revoker',manifest,proof,'sql',async receipt => {
  console.log(JSON.stringify(receipt));
  const approval = await incoming.next();
  assert(!approval.done && approval.value.length <= 1024);
  return JSON.parse(approval.value);
}).finally(() => { input.close(); process.stdin.destroy(); });
const { Client } = createRequire(new URL('./../candidate/backend/package.json',import.meta.url))('pg');
const options = {host:'127.0.0.1',port:lab.port,database:lab.database,user:'d324_fixture_h2_revoker',password,connectionTimeoutMillis:3000,statement_timeout:16000};
const db = new Client(options);
await db.connect();
try {
  assert.equal((await db.query('select session_user')).rows[0].session_user,options.user);
  for (const role of ['verifier','closer']) {
    const user = 'd324_fixture_h2_'+role;
    const wrong = new Client({...options,user});
    try { await assert.rejects(wrong.connect(),{code:'28P01'}); } finally { await wrong.end(); }
    await assert.rejects(db.query('set role '+user),{code:'42501'});
  }
  await db.query('begin');
  const updated = await db.query("update api_private.d324_h2_verified_approval set revoked_at='2000-01-01' where operation_id=$1",[operation]);
  assert.equal(updated.rowCount,1);
  await writeFile(join(lab.root,'state','revoker','locked-'+request),String(db.processID),{flag:'wx'});
  const fence = join(lab.root,'release-'+request);
  const until = performance.now()+12000;
  while (true) {
    try { assert((await lstat(fence)).isFile() && await realpath(fence) === fence); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    assert(performance.now()<until);
    await delay(30);
  }
  await db.query('commit');
  console.log(JSON.stringify({result:'PASS',status:'REVOCATION_COMMITTED',crossChecks:2}));
} catch (error) {
  await db.query('rollback').catch(()=>{});
  console.log(JSON.stringify({result:'FAIL',code:/^[0-9A-Z]{5}$/.test(error.code ?? '')?error.code:'D336_REVOKER_ERROR'}));
  process.exitCode=1;
} finally { await db.end(); }
