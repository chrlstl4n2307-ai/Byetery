import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertLocalRuntime } from '../../backend/src/d3/operator-guard.ts';
import { D324_ARGV } from './policy.mjs';

const bootstrap = fileURLToPath(new URL('./entry-bootstrap.mjs', import.meta.url));
const matchLive = argv => argv.length === D324_ARGV.length && D324_ARGV.every((value, i) => value === argv[i]);

// A direct import or invocation cannot select the runtime.
export function liveEntry(argv) {
  return matchLive(argv) ? 'D324_OPERATIONAL_RATIFICATION_REQUIRED' : 'EXACT_ARGV_REQUIRED';
}

export async function runD324Entry(argv) {
  const offline = argv.length === 2 && argv[0] === '--offline-wrapper-check';
  if (process.execArgv.length !== 0 || resolve(process.argv[1] ?? '') !== bootstrap || process.argv.slice(2).join('\0') !== argv.join('\0'))
    return liveEntry(argv);
  if (!offline && !matchLive(argv)) return 'EXACT_ARGV_REQUIRED';
  let root;
  try {
    assertLocalRuntime();
    root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
  } catch { return 'D324_OPERATIONAL_RATIFICATION_REQUIRED'; }
  if (offline) {
    try { return await (await import('./offline-wrapper.mjs')).verifyD324OfflineWrapper(root, argv[1]); }
    catch { return 'D324_OFFLINE_WRAPPER_REJECTED'; }
  }
  let authorization;
  try { authorization = await (await import('./owner-authorization.mjs')).loadD324OwnerAuthorization(root); }
  catch { return 'D324_OPERATIONAL_RATIFICATION_REQUIRED'; }
  try { return await (await import('./final-runtime.mjs')).executeD324ApprovedRun(root, authorization); }
  catch { return 'D324_PRE_ADMISSION_REJECTED'; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(liveEntry(process.argv.slice(2)) + '\n');
  process.exitCode = 1;
}
