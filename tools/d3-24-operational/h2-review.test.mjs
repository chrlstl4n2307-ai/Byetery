import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { readD324H2ReviewBinding, requireD324RatifiedH2Binding, verifyD324H2FixtureStage } from './h2-review.mjs';

test('the H2 review package preserves decision A without granting V3 activation', () => {
  const binding = readD324H2ReviewBinding();
  assert.equal(binding.temporalDecision, 'OWNER_APPROVED');
  assert.equal(binding.decisionDate, '2026-11-14');
  assert.equal(binding.terminalWindowMs, 30000);
  assert.equal(binding.sqlOrder.at(-1), 'sql/h2-option-a.sql');
  assert.equal(Object.keys(binding.stagedSourceSha256).length, 17);
  assert.throws(() => requireD324RatifiedH2Binding({}), /D324_H2_EXTERNAL_RATIFICATION_REQUIRED/);
});

test('the stage rejects reused SIDs, credentials outside the fixture and substituted IPC bytes', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'byetery-h2-stage-')));
  t.after(() => rm(root, { recursive: true }));
  const binding = readD324H2ReviewBinding();
  const paths = Object.keys(binding.stagedSourceSha256);
  for (const relative of paths) {
    const [type, file] = relative.split('/');
    if (type === 'sql') continue;
    const destination = type === 'roles' ? join(root, 'candidate', '.test-output', 'server-worker', file) :
      join(root, 'bin', file === 'Relay-H2Role-Windows.mjs' ? 'Relay-H2Role.mjs' : file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(new URL('./h2/' + relative, import.meta.url), destination);
  }
  const roles = ['verifier', 'closer', 'revoker'];
  const manifest = {
    root, controllerSid: 'S-1-5-21-1-2-3-1000', database: 'd324_v3_' + '1'.repeat(32), port: 52000,
    actors: Object.fromEntries(roles.map((role, index) => [role, {
      sid: 'S-1-5-21-1-2-3-' + (1001 + index), secret: join(root, 'secrets', role + '.txt'),
    }])),
  };
  const publish = data => writeFile(join(root, 'local-manifest.json'), JSON.stringify(data));
  await publish(manifest);
  assert.deepEqual(verifyD324H2FixtureStage(root).roles, roles);
  const repeated = structuredClone(manifest);
  repeated.actors.closer.sid = manifest.actors.verifier.sid;
  await publish(repeated);
  assert.throws(() => verifyD324H2FixtureStage(root), /D324_H2_FIXTURE_STAGE_REJECTED/);
  const crossed = structuredClone(manifest);
  crossed.actors.closer.secret = manifest.actors.verifier.secret;
  await publish(crossed);
  assert.throws(() => verifyD324H2FixtureStage(root), /D324_H2_FIXTURE_STAGE_REJECTED/);
  await publish(manifest);
  await writeFile(join(root, 'bin', 'Invoke-H2RolePipe.ps1'), '# fixture tamper');
  assert.throws(() => verifyD324H2FixtureStage(root), /D324_H2_FIXTURE_STAGE_REJECTED/);
});
