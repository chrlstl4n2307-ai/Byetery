import assert from 'node:assert/strict';
import { execFileSync, fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { readH2Launch, verifyH2NodeBoundary } from './Verify-H2NodeBoundary.mjs';

// Test transport only. h2-role-process.mjs remains the implementation of Ed25519 and close.
const [role, manifest] = process.argv.slice(2);
assert(process.platform === 'win32' && process.argv.length === 4 && ['verifier','closer'].includes(role));
assert(!process.env.DATABASE_URL && !process.env.PGPASSWORD && !process.env.PGSERVICE &&
  !process.env.BYETERY_D324_FIXTURE_ADMIN_PASSWORD);
const input = createInterface({input:process.stdin,crlfDelay:Infinity});
const incoming = input[Symbol.asyncIterator]();
const first = await incoming.next();
assert(!first.done && first.value.length <= 1024);
const proof = JSON.parse(first.value);
const {lab} = await readH2Launch(role,manifest,proof);
const sid = execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true,encoding:'utf8'})
  .match(/S-1-5-21-[0-9-]+/)?.[0];
assert(sid && sid === lab.actors[role].sid && sid !== lab.controllerSid);
const root = await realpath(lab.root);
assert(root === lab.root && await realpath(manifest) === join(root,'local-manifest.json'));
const secret = join(root,'secrets',role+'.txt');
assert(lab.actors[role].secret === secret && await realpath(secret) === secret);
assert(/^d324_v3_[0-9a-f]{32}$/.test(lab.database) && Number.isInteger(lab.port) && lab.port >= 49152 && lab.port <= 65535);
const target = join(root,'candidate','.test-output','server-worker','h2-role-process.mjs');
assert.equal(await realpath(target), target);
assert.equal(createHash('sha256').update(await readFile(target)).digest('hex'),
  '1cbfaa627a570e4022e126b9cb0ba73d3f8eaccde3ddb52684b0abaf334c86c1');
verifyH2NodeBoundary(root,role,'relay',proof.manifestSha256);
const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|PATHEXT|SYSTEMDRIVE|OS)$/i.test(key)));
const child = fork(new URL('Protect-H2Fork.mjs',import.meta.url),[role,target,manifest],
  {windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{...clean,
    BYETERY_D324_TEST_PG_PORT:String(lab.port),BYETERY_D324_H2_DB:lab.database}});
const done = once(child,'exit');
let acceptBoundary;
const boundaryReady=new Promise(resolve=>{acceptBoundary=resolve;});
const allowed = new Set(['init','stop','attest','close','try-mint']);
let initId;
let lastId = 0;
let initialized = false;
let proofSent = false;
const outstanding = new Set();
let omitReply;
let phase='wait-for-candidate';
child.on('message', reply => {
  if (reply?.preCredential === true && reply.role === role && reply.pipeId === proof.pipeId) {
    if (proofSent) { child.kill(); return; }
    proofSent = true;
    process.stdout.write(JSON.stringify(reply)+'\n');
    return;
  }
  if (reply?.boundaryReady === true) { acceptBoundary(true); return; }
  if (!outstanding.delete(reply?.id)) { child.kill(); return; }
  if (reply.id === initId) initialized = reply.ok === true;
  if (reply.id === omitReply && reply.ok === true) {
    // Inject a lost acknowledgement after the existing close has returned from COMMIT.
    process.stdout.end();
    input.close();
    process.stdin.destroy();
    return;
  }
  process.stdout.write(JSON.stringify(reply)+'\n');
});
child.once('exit', () => { acceptBoundary(false); input?.close(); process.stdin.destroy(); });
child.send(proof);
try {
  const approval = await incoming.next();
  assert(proofSent && !approval.done && approval.value.length <= 1024);
  child.send(JSON.parse(approval.value));
  assert(await boundaryReady);
  phase='relay-messages';
  for await (const line of incoming) {
    assert(line.length <= 65536);
    const request = JSON.parse(line);
    assert(Number.isSafeInteger(request.id) && request.id > lastId);
    lastId = request.id;
    assert(allowed.has(request.command));
    if (request.command === 'init') {
      assert(initId === undefined);
      initId = request.id;
    } else if (request.command !== 'stop') {
      assert(initialized);
    }
    if (request.fixtureDropReply === true) {
      assert(role === 'closer' && request.command === 'close' && omitReply === undefined);
      omitReply = request.id;
      delete request.fixtureDropReply;
    }
    outstanding.add(request.id);
    await new Promise((resolve,reject) => child.send(request, error => error ? reject(error) : resolve()));
    if (request.command === 'stop') { await done; break; }
  }
} catch(error) {
  const frames=String(error.stack??'').match(/Relay-H2Role\.mjs:[0-9]+/g)??[];
  const code=/^[A-Z0-9_]{3,40}$/.test(error.code??'')?error.code:null;
  await writeFile(join(root,'state',role,'relay-startup-'+process.pid+'.json'),JSON.stringify({role,phase,result:'FAIL',type:error.name,code,frames:frames.slice(0,3)}));
  throw error;
} finally {
  input?.close();
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await done;
}
