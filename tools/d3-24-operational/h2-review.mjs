import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { BOOTSTRAP_BINARIES } from './bootstrap-pins.mjs';
import { D324_H2_BUNDLE_SHA256 as bundleSha256 } from '../d3-24-composition/integration-bindings.mjs';

const directory = fileURLToPath(new URL('./h2', import.meta.url));
const sqlOrder = Object.freeze([
  'sql/h2-privilege-delta.sql',
  'sql/h2-verified-approval-proposal.sql',
  'sql/h2-revocable-approval-proposal.sql',
  'sql/h2-option-a.sql',
]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const roles = Object.freeze(['verifier', 'closer', 'revoker']);

function readPhysicalFile(path, limit) {
  const info = lstatSync(path);
  check(info.isFile() && info.size <= limit && realpathSync(path) === path, 'D324_H2_REVIEW_PINS_REJECTED');
  return readFileSync(path);
}

// Reads and verifies review bytes only. It does not open a socket or start a role.
export function readD324H2ReviewBinding() {
  try {
    const load = relative => readPhysicalFile(join(directory, relative), 262144);
    const manifest = load('pins.json');
    check(sha(manifest) === bundleSha256, 'D324_H2_REVIEW_PINS_REJECTED');
    const { schema, temporalDecision, decisionDate, terminalWindowMs, stagedSourceSha256 } =
      JSON.parse(manifest.toString('utf8'));
    for (const [relative, expected] of Object.entries(stagedSourceSha256)) {
      check(sha(load(relative)) === expected, 'D324_H2_REVIEW_PINS_REJECTED');
    }
    return Object.freeze({
      schema, bundleSha256, temporalDecision, decisionDate, terminalWindowMs, sqlOrder,
      classification: 'OFFLINE_SYNTHETIC',
      stagedSourceSha256: Object.freeze(stagedSourceSha256),
    });
  } catch {
    check(false, 'D324_H2_REVIEW_PINS_REJECTED');
  }
}

// Matches the existing laboratory staging layout. Each child will still
// authenticate the effective token and check its own DACL before reading SCRAM.
export function verifyD324H2FixtureStage(fixtureRoot) {
  const binding = readD324H2ReviewBinding();
  try {
    check(isAbsolute(fixtureRoot) && realpathSync(fixtureRoot) === fixtureRoot, 'D324_H2_FIXTURE_STAGE_REJECTED');
    const manifest = JSON.parse(readPhysicalFile(join(fixtureRoot, 'local-manifest.json'), 16384));
    const sids = [manifest.controllerSid, ...roles.map(role => manifest.actors[role].sid)];
    check(manifest.root === fixtureRoot && /^d324_v3_[a-f0-9]{32}$/.test(manifest.database) &&
      Number.isInteger(manifest.port) && manifest.port >= 49152 && manifest.port <= 65535 &&
      sids.every(sid => /^S-1-5-21-\d+-\d+-\d+-\d+$/.test(sid)) && new Set(sids).size === 4 &&
      roles.every(role => manifest.actors[role].secret === join(fixtureRoot, 'secrets', role + '.txt')),
    'D324_H2_FIXTURE_STAGE_REJECTED');
    for (const [relative, expected] of Object.entries(binding.stagedSourceSha256)) {
      const [type, name] = relative.split('/');
      if (type === 'sql') continue;
      const stagePath = type === 'roles' ? join(fixtureRoot, 'candidate', '.test-output', 'server-worker', name) :
        join(fixtureRoot, 'bin', name === 'Relay-H2Role-Windows.mjs' ? 'Relay-H2Role.mjs' : name);
      check(sha(readPhysicalFile(stagePath, 262144)) === expected, 'D324_H2_FIXTURE_STAGE_REJECTED');
    }
    return Object.freeze({ ...binding, stageVerified: true, roles });
  } catch {
    check(false, 'D324_H2_FIXTURE_STAGE_REJECTED');
  }
}

export function requireD324RatifiedH2Binding(reviewedPackage) {
  const binding = readD324H2ReviewBinding();
  // A local pin is suitable for fixture review. Real activation requires this
  // identity in the independently authenticated external package.
  check(reviewedPackage.h2BundleSha256 === binding.bundleSha256,
    'D324_H2_EXTERNAL_RATIFICATION_REQUIRED');
  return binding;
}

// The existing Windows controller consumes this launch plan. Keep the first
// manifest digest across child restarts, with a fresh pipe name for each spawn.
export function prepareD324H2Supervisor(root) {
  const manifest = join(root, 'local-manifest.json');
  const expected = sha(readPhysicalFile(manifest, 16384));
  function plan(role) {
    const binding = verifyD324H2FixtureStage(root);
    check(binding.roles.includes(role), 'D324_H2_ROLE_REJECTED');
    check(sha(readPhysicalFile(manifest, 16384)) === expected, 'D324_H2_RESTART_IDENTITY_REJECTED');
    const node = join(root, 'bin', 'node.exe');
    const pwsh = join(root, 'bin', 'pwsh', 'pwsh.exe');
    check(sha(readPhysicalFile(node, 150_000_000)) === BOOTSTRAP_BINARIES.nodeSha256 &&
      sha(readPhysicalFile(pwsh, 10_000_000)) === BOOTSTRAP_BINARIES.pwshSha256, 'D324_H2_BINARY_REJECTED');
    const pipeId = randomBytes(12).toString('hex');
    const pipe = join(root, 'bin', 'Invoke-H2RolePipe.ps1');
    const common = ['-Role', role, '-Manifest', manifest, '-ManifestSha256', expected, '-PipeId', pipeId];
    return Object.freeze({
      pwsh,
      controllerArgs: Object.freeze(['-NoProfile', '-NonInteractive', '-File', pipe, '-Mode', 'Controller', ...common]),
      actor: Object.freeze({ role, mode: role === 'revoker' ? 'revoke' : 'pipe', pipeId, manifestSha256: expected }),
    });
  }
  verifyD324H2FixtureStage(root);
  async function requestActor(command, signal) {
    const queue = join(root, 'controller');
    check(realpathSync(queue) === queue &&
      JSON.parse(readPhysicalFile(join(queue,'broker-ready.json'),2048)).state === 'READY',
    'D324_H2_BROKER_REQUIRED');
    const requestId = randomBytes(12).toString('hex');
    const request = join(queue, 'request-'+requestId+'.json');
    await writeFile(request+'.tmp', JSON.stringify(command), { flag:'wx' });
    await rename(request+'.tmp',request);
    const reply = join(queue,'reply-'+requestId+'.json');
    for (;;) {
      signal.throwIfAborted();
      try {
        const result = JSON.parse(readPhysicalFile(reply,2048));
        check(result.status === 'STARTED' && Number.isSafeInteger(result.pid) && result.pid > 0,
          'D324_H2_ACTOR_LAUNCH_REJECTED');
        return requestId;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await delay(35, undefined, { signal });
      }
    }
  }
  async function startRole(role, { launchActor = requestActor, operationId } = {}) {
    const launch = plan(role);
    check(typeof launchActor === 'function' &&
      (role === 'revoker' ? /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(operationId ?? '') : operationId === undefined),
    'D324_H2_ACTOR_LAUNCH_REQUIRED');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(SYSTEMROOT|WINDIR|SYSTEMDRIVE|COMSPEC|TEMP|TMP|OS)$/i.test(key)));
    const controller = spawn(launch.pwsh, launch.controllerArgs, { windowsHide: true, env,
      stdio: ['pipe', 'pipe', 'ignore'] });
    controller.stdin.on('error', () => {});
    const output = createInterface({ input: controller.stdout, crlfDelay: Infinity });
    const frames = output[Symbol.asyncIterator]();
    const cancellation = new AbortController();
    const stop = () => { cancellation.abort(); output.close(); controller.stdin.destroy(); controller.kill(); };
    let timeout;
    const launchFailed = new Promise((_, reject) => {
      controller.once('error', reject);
      timeout = setTimeout(() => reject(Error('D324_H2_START_TIMEOUT')), 30_000);
    });
    function readFrame(value) {
      check(!value.done && value.value.length <= 1024, 'D324_H2_IPC_AUTH_REJECTED');
      return JSON.parse(value.value);
    }
    async function authenticate() {
      const ready = readFrame(await frames.next());
      check(ready.ready === true && ready.role === role && ready.controllerPid === controller.pid,
        'D324_H2_IPC_AUTH_REJECTED');
      const requestId = await launchActor(Object.freeze({ ...launch.actor, controllerPid: controller.pid, operationId }), cancellation.signal);
      const authenticated = readFrame(await frames.next());
      check(authenticated.authenticated === true && authenticated.role === role, 'D324_H2_IPC_AUTH_REJECTED');
      const boundary = readFrame(await frames.next());
      check(boundary.preCredential === true && boundary.role === role && boundary.pipeId === launch.actor.pipeId,
        'D324_H2_PRE_CREDENTIAL_PROOF_REJECTED');
      await new Promise((resolve, reject) => controller.stdin.write(JSON.stringify({
        admitCredential: true, role, pipeId: launch.actor.pipeId,
      }) + '\n', error => error ? reject(error) : resolve()));
      return Object.freeze({ input: controller.stdin, frames, requestId, stop });
    }
    try {
      return await Promise.race([authenticate(), launchFailed]);
    } catch {
      stop();
      check(false, 'D324_H2_IPC_AUTH_REJECTED');
    } finally { clearTimeout(timeout); }
  }
  return Object.freeze({ plan, startRole });
}
