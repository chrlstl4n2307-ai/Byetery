import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewD324Composition } from './composition.mjs';
import { hex, RUN1 } from './identity.mjs';

export async function reviewEntry(argv) {
  const prefix = ['--review', '--task-id', RUN1.taskId, '--expected-sha', RUN1.businessSha,
    '--plan-hash', RUN1.planHash, '--battery', RUN1.batteryId, '--operator-root'];
  if (argv.length !== prefix.length + 3 || !prefix.every((item, index) => argv[index] === item) ||
    argv.at(-2) !== '--manifest-sha256' || !hex.test(argv.at(-1))) throw Error('D324_REVIEW_ARGS_REJECTED');
  const result = await reviewD324Composition({ operatorRoot: argv[prefix.length], manifestSha256: argv.at(-1) });
  return result.descriptor;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(JSON.stringify(await reviewEntry(process.argv.slice(2))) + '\n');
  } catch (error) {
    const code = /^D324_[A-Z_]+$/.test(error.message) ? error.message : 'D324_COMPOSITION_REVIEW_REJECTED';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  }
}
