import { fileURLToPath } from 'node:url';
import { verifyD324SessionPins } from '../d3-run1-launcher/session-pins.mjs';
import { liveEntry } from '../d3-24-operational/live.mjs';
import { D324_ARGV } from '../d3-24-operational/policy.mjs';

try {
  const head = process.argv[2];
  if (process.argv.length !== 3 || !/^[a-f0-9]{40}$/.test(head ?? '')) throw Error('SCOPE');
  await verifyD324SessionPins(process.env, { root: fileURLToPath(new URL('../../', import.meta.url)), head });
  if (liveEntry(D324_ARGV) !== 'D324_OPERATIONAL_RATIFICATION_REQUIRED') throw Error('GATE');
  process.stdout.write('D324_WRAPPER_FIXTURE_PINS_OK_LIVE_CLOSED\n');
} catch {
  process.stdout.write('D324_WRAPPER_FIXTURE_REJECTED\n');
  process.exitCode = 1;
}
