import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { D324_ARGV } from './policy.mjs';

// This composition is not operationally ratified. There is deliberately no
// import of owner authorization, credentials, admission or the LIVE controller.
export function liveEntry(argv) {
  return argv.length === D324_ARGV.length && argv.every((value, i) => value === D324_ARGV[i])
    ? 'D324_OPERATIONAL_RATIFICATION_REQUIRED' : 'EXACT_ARGV_REQUIRED';
}
export async function runD324Entry(argv) { return liveEntry(argv); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).join('\0') === '--composition-review') {
    const { reviewCompositionCandidate } = await import('../d3-24-composition/review.mjs');
    const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
    process.stdout.write(JSON.stringify(await reviewCompositionCandidate(root)) + '\n');
  } else {
    process.stdout.write(liveEntry(process.argv.slice(2)) + '\n');
    process.exitCode = 1;
  }
}
