import { readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureDurableReceipt } from '../../tools/d3-receipt-capture/capture.mjs';
import { createReplayReaders } from '../../tools/d3-receipt-capture/sources.mjs';

const scenarios = ['match', 'variant', 'pending', 'not-found', 'mismatch', 'unavailable'];
const [mode, scenario, output, scopeJson] = process.argv.slice(2);
if (process.argv.length !== 6 || mode !== '--offline-replay' || !scenarios.includes(scenario)) {
  process.exit(2);
}

try {
  const scope = JSON.parse(scopeJson);
  const offlineRoot = fileURLToPath(new URL('../../.tools/d3-run1-launcher-replay', import.meta.url));
  const runDirectory = dirname(output);
  const runName = basename(runDirectory);
  if (!/^replay-[a-zA-Z0-9]+$/.test(runName) || await realpath(runDirectory) !== join(offlineRoot, runName) ||
      !/^(register_battery|open_return|confirm_collection|confirm_recycling|pay_reward)-[12]$/.test(basename(output)) ||
      !basename(output).startsWith(scope.method + '-')) process.exit(2);
  if (scenario === 'unavailable') process.exit(42);
  const fixture = JSON.parse(await readFile(new URL('../../tools/d3-receipt-capture/fixtures/tx1-public-values.json', import.meta.url)));
  const variant = JSON.parse(await readFile(new URL('../../tools/d3-receipt-capture/fixtures/tx1-public-meta-variant.json', import.meta.url)));
  const rpc = { ...scope, status: 'SUCCESS', resultXdr: fixture.resultXdr, resultMetaXdr: fixture.resultMetaXdr };
  const sql = { ...rpc, receiptTransactionHash: scope.transactionHash, applicationState: 'CONFIRMED', durableState: 'PROJECTED' };
  if (scenario === 'pending') sql.status = 'PENDING';
  if (scenario === 'not-found') Object.assign(rpc, { status: 'NOT_FOUND', resultXdr: null, resultMetaXdr: null });
  if (scenario === 'mismatch') sql.transactionHash = 'f'.repeat(64);
  if (scenario === 'variant') rpc.resultMetaXdr = variant.resultMetaXdr;
  await captureDurableReceipt({
    expected: scope,
    outputDirectory: output,
    readers: createReplayReaders([sql], [rpc]),
  });
  process.stdout.write(JSON.stringify({ mode: 'OFFLINE_SYNTHETIC', pid: process.pid }));
} catch {
  process.exitCode = 1;
}