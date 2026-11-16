import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';

export async function readH2Launch(role, manifest, proof) {
  if (proof?.role !== role || !/^[a-f0-9]{24}$/.test(proof.pipeId ?? '') ||
      !/^[a-f0-9]{64}$/.test(proof.manifestSha256 ?? '')) throw Error('D338_IPC_PROOF_REJECTED');
  const info = await lstat(manifest);
  if (!info.isFile() || info.size > 16384) throw Error('D338_MANIFEST_REJECTED');
  const bytes = await readFile(manifest);
  if (createHash('sha256').update(bytes).digest('hex') !== proof.manifestSha256) throw Error('D338_MANIFEST_REJECTED');
  const lab = JSON.parse(bytes);
  const secret = join(lab.root, 'secrets', role + '.txt');
  if (await realpath(lab.root) !== lab.root || await realpath(manifest) !== join(lab.root,'local-manifest.json') ||
      lab.actors?.[role]?.secret !== secret || !/^d324_v3_[a-f0-9]{32}$/.test(lab.database) ||
      !Number.isInteger(lab.port) || lab.port < 49152 || lab.port > 65535) throw Error('D338_SUBJECT_REJECTED');
  return { lab, secret };
}

export async function readH2Credential(role, manifest, proof, stage, approve,
    { verifyBoundary = verifyH2NodeBoundary, readCredential = readFile } = {}) {
  const { lab, secret } = await readH2Launch(role, manifest, proof);
  verifyBoundary(lab.root, role, stage, proof.manifestSha256);
  if (!(await lstat(secret)).isFile() || await realpath(secret) !== secret) throw Error('D338_CREDENTIAL_PATH_REJECTED');
  const ack = await approve({ preCredential: true, role, pipeId: proof.pipeId });
  if (ack?.admitCredential !== true || ack.role !== role || ack.pipeId !== proof.pipeId)
    throw Error('D338_CREDENTIAL_ACK_REJECTED');
  if ((await readH2Launch(role, manifest, proof)).secret !== secret)
    throw Error('D338_SUBJECT_REJECTED');
  const password = (await readCredential(secret, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(password)) throw Error('D338_CREDENTIAL_FORMAT_REJECTED');
  return { lab, password };
}

export function verifyH2NodeBoundary(root,role,stage,manifestSha256) {
  const bin=join(root,'bin');
  const proof=join(root,'state',role,'descendant-'+stage+'-'+String(process.pid)+'.json');
  try {
    if (process.platform !== 'win32' || process.execPath.toLowerCase() !== join(bin, 'node.exe').toLowerCase())
      throw Error('Unexpected Node identity');
    const result=execFileSync(join(bin,'pwsh','pwsh.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',join(bin,'Verify-ProcessAcl.ps1'),
      '-ProcessId',String(process.pid),'-Role',role,'-ManifestSha256',manifestSha256],
    {windowsHide:true,encoding:'utf8',timeout:20000});
    if(result.trim()!=='D337_DESCENDANT_DACL_OK')throw Error('Unexpected verification reply');
    writeFileSync(proof,JSON.stringify({role,stage,result:'PASS',beforeSecret:true}));
  } catch(error) {
    const detail=String(error.stdout??'').trim();
    writeFileSync(proof,JSON.stringify({role,stage,result:'FAIL',diagnostic:/^D337_DESCENDANT_[A-Z_]+[;= \w-]*$/.test(detail)?detail:'D337_DESCENDANT_PROBE_FAILED'}));
    throw Error('D337_DESCENDANT_PROBE_FAILED');
  }
}
