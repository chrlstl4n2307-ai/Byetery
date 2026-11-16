import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareD324H2Supervisor, readD324H2ReviewBinding } from './h2-review.mjs';
import { readH2Credential } from './h2/windows/Verify-H2NodeBoundary.mjs';

const roles = ['verifier', 'closer', 'revoker'];
const sid = n => 'S-1-5-21-1-2-3-' + n;

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'byetery-supervisor-test-')));
  t.after(() => rm(root, { recursive: true }));
  await mkdir(join(root, 'secrets'));
  const manifest = join(root, 'local-manifest.json');
  const lab = { root, controllerSid: sid(1000), database: 'd324_v3_' + '1'.repeat(32), port: 52000,
    actors: Object.fromEntries(roles.map((role, index) => [role, {
      sid: sid(1001 + index), secret: join(root, 'secrets', role + '.txt'),
    }])) };
  const write = async (data = lab) => {
    const bytes = JSON.stringify(data);
    await writeFile(manifest, bytes);
    return createHash('sha256').update(bytes).digest('hex');
  };
  for (const actor of Object.values(lab.actors)) await writeFile(actor.secret, '');
  return { root, lab, manifest, write };
}

const approved = receipt => ({
  admitCredential: true, role: receipt.role, pipeId: receipt.pipeId,
});

test('valid roles require kernel-boundary checks and a fresh supervisor acknowledgement before SCRAM', async t => {
  const f = await fixture(t);
  const manifestSha256 = await f.write();
  for (const role of roles) {
    const steps = [];
    const proof = { role, manifestSha256, pipeId: 'a'.repeat(24) };
    await readH2Credential(role, f.manifest, proof, 'test', receipt => {
      steps.push('ack');
      assert.deepEqual(receipt,{ preCredential: true, role, pipeId: proof.pipeId });
      return approved(receipt);
    }, {
      verifyBoundary(root, actor, stage, digest) {
        assert.deepEqual([root, actor, stage, digest],[f.root, role, 'test', manifestSha256]);
        steps.push('boundary');
      },
      readCredential(path) {
        assert.equal(path, f.lab.actors[role].secret);
        steps.push('load');
        return randomBytes(32).toString('hex');
      },
    });
    assert.deepEqual(steps,['boundary','ack','load']);
  }
});

for (const [name, rejected] of [['wrong SID','SID_REJECTED'],['permissive DACL','DACL_REJECTED']]) {
  test(name + ' stops before the credential reader or acknowledgement', async t => {
    const f = await fixture(t);
    const proof = { role:'closer', manifestSha256: await f.write(), pipeId:'a'.repeat(24) };
    await assert.rejects(readH2Credential('closer', f.manifest, proof, 'test', () => assert.fail('ack'), {
      verifyBoundary() { throw Error(rejected); },
      readCredential() { assert.fail('credential read'); },
    }), new RegExp(rejected));
  });
}

test('a substituted credential path cannot reach the credential reader', async t => {
  const f = await fixture(t);
  f.lab.actors.revoker.secret = f.lab.actors.closer.secret;
  const proof = { role:'revoker', manifestSha256:await f.write(), pipeId:'a'.repeat(24) };
  await assert.rejects(readH2Credential('revoker', f.manifest, proof, 'test', () => assert.fail('ack'), {
    verifyBoundary() { assert.fail('native step after invalid configuration'); },
    readCredential() { assert.fail('credential read'); },
  }), /D338_SUBJECT_REJECTED/);
});

test('missing IPC proof or a mismatched acknowledgement cannot open the credential', async t => {
  const f = await fixture(t);
  const proof = { role:'closer', manifestSha256:await f.write(), pipeId:'a'.repeat(24) };
  const io = { verifyBoundary() {}, readCredential() { assert.fail('credential read'); } };
  await assert.rejects(readH2Credential('closer', f.manifest, {}, 'test', () => assert.fail('ack'), io),
    /D338_IPC_PROOF_REJECTED/);
  await assert.rejects(readH2Credential('closer', f.manifest, proof, 'test', () => ({
    admitCredential:true, role:'closer', pipeId:'b'.repeat(24),
  }), io), /D338_CREDENTIAL_ACK_REJECTED/);
});

async function stage(f) {
  for (const relative of Object.keys(readD324H2ReviewBinding().stagedSourceSha256)) {
    const [type, file] = relative.split('/');
    if (type === 'sql') continue;
    const to = type === 'roles' ? join(f.root,'candidate','.test-output','server-worker',file) :
      join(f.root,'bin',file === 'Relay-H2Role-Windows.mjs' ? 'Relay-H2Role.mjs' : file);
    await mkdir(dirname(to),{recursive:true});
    await copyFile(new URL('./h2/'+relative,import.meta.url),to);
  }
  await f.write();
  return prepareD324H2Supervisor(f.root);
}

test('altered binary rejects before the actor launcher is called', async t => {
  const f = await fixture(t);
  const supervisor = await stage(f);
  await writeFile(join(f.root,'bin','node.exe'),'altered synthetic executable');
  await assert.rejects(supervisor.startRole('verifier',{ launchActor: () => assert.fail('actor launched') }), /D324_H2_BINARY_REJECTED/);
});

test('a restart rejects a changed identity before the actor is called', async t => {
  const f = await fixture(t);
  const supervisor = await stage(f);
  // The original launch plan retains the identity observed at preparation.
  // This rejection precedes binary staging, so it needs no executable copy.
  f.lab.actors.verifier.sid = sid(7999);
  await f.write();
  await assert.rejects(supervisor.startRole('verifier',{ launchActor: () => assert.fail('actor launched') }),
    /D324_H2_RESTART_IDENTITY_REJECTED/);
});

test('the Windows probe rejects a real token mismatch before inspecting credential files', async t => {
  const f = await fixture(t);
  await f.write();
  const probe = fileURLToPath(new URL('./h2/windows/windows-probe.ps1',import.meta.url));
  assert.throws(() => execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-File',
    probe,'-Role','verifier','-Manifest',f.manifest,'-BeforeCredential'],{
    encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],
  }), e => e.status === 1 && /Effective SID mismatch/.test(e.stderr));
});
