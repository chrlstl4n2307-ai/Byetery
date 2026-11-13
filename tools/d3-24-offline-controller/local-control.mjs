import { readFile, realpath, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { RUN1 } from '../d3-24-ratification/identity.mjs';
import { encodeD324SessionControl, verifyD324SessionPins } from '../d3-run1-launcher/session-pins.mjs';
import { verifyD324K5 } from '../d3-24-operational/policy.mjs';
import { SIGNER } from '../d3-24-composition/pins.mjs';
import { BOOTSTRAP_BINARIES } from '../d3-24-operational/bootstrap-pins.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const BASE='bc9dc8bff9bbc34da37abfb51f59d1d58f165068';
export const BRIDGE_BASE='5dfe151fdfcfbc4afd747410eb097515d4ac9a9c';
const bridgeTree='e214ad3a215a3fb92a2d4cf73c50355c74edb152';
const liveHash='a6bfab15b16e64530ce1f167e5b254d230bb4cece9c80d3c4e5be9cec4f97098';
const wrapperHash='3f46f03080e6ff290c7fda58e3992c3a94eb136876fa5178631c751d65f8984a';
const bridgePublished = {
  'tools/d3-24-offline-controller/controller.mjs': '864b203c43765b4c583feac0515791df265efc0021936990ec16634e65dfe538',
  'tools/d3-24-operational/operator-binding.mjs': '4be99c2619809e3fbd6a56d50ee4e5866527c23d78128163c1ca69a92d33562e',
  'tools/d3-24-ratification/capture.mjs': '6037cf939e7c16ad87e4a4fedc9e1dd2ee156299e02660755721480247b568da',
  'backend/src/application/auth.ts': 'ed3191fe7d77c8be29b27dfcd256aad37a6663bd71803ce8bbefd38f7a901d6e',
  'backend/src/application/d324-sessions.ts': '6fe90806e039a76292166f6777fa4a6a8d32ec64b66208121849fe79c64554ed',
  'backend/src/application/d324-authority.ts': '9f5b161182000a2ed9e3c2c25185c3c44b95ab3ee76700a713aae9bf0bbcd02a',
};
const bridgeCandidate = [
  'tools/d3-24-operational/prelive-bridge.mjs',
  'tools/d3-24-composition/session-wrapper.mjs',
  'tools/d3-24-composition/session-control.mjs',
  'tools/d3-24-offline-controller/launch-fixture.ps1',
  'tools/d3-24-offline-controller/local-control.mjs',
  'tools/d3-24-offline-controller/client-fixture.mjs',
  'tools/d3-24-offline-controller/server-fixture.mjs',
  'tools/d3-24-offline-controller/run-offline.mjs',
];

// Check the actual parent and both executables before credentials or control I/O.
async function inspectParent() {
  const executable=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const {stdout}=await promisify(execFile)(executable, ['-NoProfile','-NonInteractive','-Command',
    '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); (Get-Process -Id '+process.ppid+').Path'],
  {encoding:'utf8',timeout:10000,windowsHide:true});
  return realpath(stdout.trim());
}

export async function verifyBridgeLauncher(root, pwshPath) {
  if(await inspectParent()!==pwshPath ||
    sha(await readFile(pwshPath))!==BOOTSTRAP_BINARIES.pwshSha256 ||
    sha(await readFile(process.execPath))!==BOOTSTRAP_BINARIES.nodeSha256 ||
    sha(await readControl(join(root,'tools/d3-24-operational/live.mjs'),65536))!==liveHash ||
    sha(await readControl(join(root,'tools/d3-24-operational/launch.ps1'),65536))!==wrapperHash)
    throw Error('D324_BRIDGE_LAUNCHER_REJECTED');
}

async function readControl(path, maxBytes=8192) {
  const file = await lstat(path);
  if (!file.isFile() || !file.size || file.size > maxBytes || await realpath(path) !== path)
    throw Error('OFFLINE_CONTROL_FILE_REJECTED');
  return readFile(path);
}

/** Unsigned, sandbox-only control files. No grant, nonce or envelope is emitted.
 * Uses the unchanged production encoders/validators and exact executable bytes.
 * The real PowerShell parent check is exercised by the fixture driver.
 */
export async function createOfflineLocalControl({root,directory,pwshPath,bridge=false}) {
  const head=bridge?BRIDGE_BASE:BASE;
  const git=(...args)=>execFileSync('git',['--no-replace-objects',...args],
    {cwd:root,encoding:'utf8',windowsHide:true,timeout:10000}).trim();
  function checkComposition() {
    if(git('rev-parse','HEAD')!==head || (bridge &&
      (git('rev-parse','HEAD^{tree}')!==bridgeTree || git('rev-parse','HEAD^')!==BASE ||
       git('for-each-ref','--count=1','refs/replace'))))
      throw Error('OFFLINE_COMPOSITION_PIN_REJECTED');
  }
  checkComposition();
  const bridgeHashes = new Map();
  if (bridge) {
    for (const [path, expected] of Object.entries(bridgePublished)) bridgeHashes.set(path, expected);
    // Review-only continuity for uncommitted bytes. Future authorization must
    // use a committed tree and an independently approved external manifest.
    for (const path of bridgeCandidate) bridgeHashes.set(path, sha(await readControl(join(root,path),65536)));
  }
  await mkdir(directory,{recursive:true});
  const pin=async path=>({path:await realpath(path),sha256:sha(await readFile(path))});
  const session={schemaVersion:2,taskId:RUN1.taskId,compositionRootSha:head,
    live:await pin(join(root,'tools/d3-24-operational/live.mjs')),
    wrapper:await pin(join(root,'tools/d3-24-operational/launch.ps1')),
    pwsh:{...await pin(pwshPath),version:'7.6.9'},node:{...await pin(process.execPath),version:process.version}};
  if(session.live.sha256!==liveHash || session.wrapper.sha256!==wrapperHash ||
    session.node.sha256!==BOOTSTRAP_BINARIES.nodeSha256 || session.pwsh.sha256!==BOOTSTRAP_BINARIES.pwshSha256)
    throw Error('OFFLINE_COMPOSITION_PIN_REJECTED');
  const sessionBytes=encodeD324SessionControl(session),sessionSha=sha(sessionBytes);
  const sessionPath=join(directory,'OFFLINE-session-control.json');
  const k5=Buffer.from(['BYETERY-D3-RUN1-OWNER-GRANT-V1','schemaVersion=1','action=AUTHORIZE_D3_24_RUN1_EXECUTION',
    ...Object.entries(RUN1).map(([k,v])=>k+'='+v),'jwtExpirySeconds=5400',
    'jwtObservedAt=<JWT_OBSERVED_AT_EPOCH_MS>','compositionRootSha='+head,
    'nonce=<NEW_32_BYTE_NONCE_LOWERCASE_HEX>','issuedAt=<ISSUED_AT_EPOCH_MS>','expiresAt=<EXPIRES_AT_EPOCH_MS>',''].join('\n'));
  const k5Path=join(directory,'OFFLINE-K5-UNSIGNED.txt'),k5Sha=sha(k5);
  await writeFile(sessionPath,sessionBytes,{flag:'wx',mode:0o600});
  await writeFile(k5Path,k5,{flag:'wx',mode:0o600});
  const verify=async()=>{
    checkComposition();
    for(const [path,expected] of bridgeHashes){
      if(sha(await readControl(join(root,path),65536))!==expected)throw Error('D324_BRIDGE_ARTIFACT_CHANGED');
    }
    verifyD324K5(await readControl(k5Path),k5Sha,head);
    await verifyD324SessionPins({BYETERY_D324_SESSION_CONTROL_PATH:sessionPath,BYETERY_D324_SESSION_CONTROL_SHA256:sessionSha},
      {root,head});
    if(SIGNER.binarySha256!=='9710311d384345f8197e7d8635c75808930e74bdda5081d83c2aa21b302b1f10'||SIGNER.custodyRiskAccepted!==false)
      throw Error('OFFLINE_SIGNER_PIN_REJECTED');
  };
  return Object.freeze({verify,k5Path,sessionPath,signer:Object.freeze({...SIGNER,executed:false,realCustodyApproved:false})});
}
