import { readFile, realpath, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { RUN1 } from '../d3-24-ratification/identity.mjs';
import { encodeD324SessionControl, verifyD324SessionPins } from '../d3-run1-launcher/session-pins.mjs';
import { verifyD324K5 } from '../d3-24-operational/policy.mjs';
import { SIGNER } from '../d3-24-composition/pins.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const BASE='bc9dc8bff9bbc34da37abfb51f59d1d58f165068';

/** Unsigned, sandbox-only control files. No grant, nonce or envelope is emitted.
 * Uses the unchanged production encoders/validators and exact executable bytes.
 * The real PowerShell parent check is exercised by the fixture driver.
 */
export async function createOfflineLocalControl({root,directory,pwshPath}) {
  await mkdir(directory,{recursive:true});
  const pin=async path=>({path:await realpath(path),sha256:sha(await readFile(path))});
  const session={schemaVersion:2,taskId:RUN1.taskId,compositionRootSha:BASE,
    live:await pin(join(root,'tools/d3-24-operational/live.mjs')),
    wrapper:await pin(join(root,'tools/d3-24-operational/launch.ps1')),
    pwsh:{...await pin(pwshPath),version:'7.6.9'},node:{...await pin(process.execPath),version:process.version}};
  if(execFileSync('git',['--no-replace-objects','rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()!==BASE||
    session.live.sha256!=='a6bfab15b16e64530ce1f167e5b254d230bb4cece9c80d3c4e5be9cec4f97098'||
    session.wrapper.sha256!=='3f46f03080e6ff290c7fda58e3992c3a94eb136876fa5178631c751d65f8984a')throw Error('OFFLINE_COMPOSITION_PIN_REJECTED');
  const sessionBytes=encodeD324SessionControl(session),sessionSha=sha(sessionBytes);
  const sessionPath=join(directory,'OFFLINE-session-control.json');
  const k5=Buffer.from(['BYETERY-D3-RUN1-OWNER-GRANT-V1','schemaVersion=1','action=AUTHORIZE_D3_24_RUN1_EXECUTION',
    ...Object.entries(RUN1).map(([k,v])=>k+'='+v),'jwtExpirySeconds=5400',
    'jwtObservedAt=<JWT_OBSERVED_AT_EPOCH_MS>','compositionRootSha='+BASE,
    'nonce=<NEW_32_BYTE_NONCE_LOWERCASE_HEX>','issuedAt=<ISSUED_AT_EPOCH_MS>','expiresAt=<EXPIRES_AT_EPOCH_MS>',''].join('\n'));
  const k5Path=join(directory,'OFFLINE-K5-UNSIGNED.txt'),k5Sha=sha(k5);
  await writeFile(sessionPath,sessionBytes,{flag:'wx',mode:0o600});
  await writeFile(k5Path,k5,{flag:'wx',mode:0o600});
  const verify=async()=>{
    verifyD324K5(await readFile(k5Path),k5Sha,BASE);
    await verifyD324SessionPins({BYETERY_D324_SESSION_CONTROL_PATH:sessionPath,BYETERY_D324_SESSION_CONTROL_SHA256:sessionSha},
      {root,head:BASE});
    if(SIGNER.binarySha256!=='9710311d384345f8197e7d8635c75808930e74bdda5081d83c2aa21b302b1f10'||SIGNER.custodyRiskAccepted!==false)
      throw Error('OFFLINE_SIGNER_PIN_REJECTED');
  };
  return Object.freeze({verify,k5Path,sessionPath,signer:Object.freeze({...SIGNER,executed:false,realCustodyApproved:false})});
}
