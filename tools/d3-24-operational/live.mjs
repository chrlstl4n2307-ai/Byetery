import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { D324_ARGV } from './policy.mjs';

// Review composition. A later ratified patch must add the actual operational
// composition pin and entry wiring. No environment setting or flag enables it.
export function liveEntry(argv) {
  if (argv.length !== D324_ARGV.length || !D324_ARGV.every((value, index) => argv[index] === value))
    return 'EXACT_ARGV_REQUIRED';
  return 'D324_OPERATIONAL_RATIFICATION_REQUIRED';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(liveEntry(process.argv.slice(2)) + '\n');
  process.exitCode = 1;
}
