import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpath } from 'node:fs/promises';

import { captureDurableReceipt } from '../d3-receipt-capture/capture.mjs';
import { createReadOnlyReaders, SQL_RECEIPT_QUERY } from '../d3-receipt-capture/sources.mjs';
import { RUN1, requireThat } from './boundaries.mjs';

const root = fileURLToPath(new URL('../../.tools/d3-run1-f1-capture', import.meta.url));
const [directory, attempt, text] = process.argv.slice(2);
let next = 0;
let pending;
process.on('message', message => {
  if (!pending || message?.id !== pending.id) return;
  const { resolve, reject } = pending;
  pending = undefined;
  if (typeof message.receipt === 'string') resolve({ rows: [{ receipt: message.receipt }] });
  else reject(new Error('CAPTURE_SQL_READ_UNAVAILABLE'));
});

try {
  requireThat(typeof process.send === 'function' && process.argv.length === 5 &&
    /^capture-[A-Za-z0-9]+$/.test(directory) && ['1', '2'].includes(attempt), 'CAPTURE_CHILD_INPUT_REJECTED');
  const scope = JSON.parse(text);
  requireThat(scope.batteryId === RUN1.batteryId && ['register_battery', 'open_return', 'confirm_collection',
    'confirm_recycling', 'pay_reward'].includes(scope.method), 'CAPTURE_CHILD_SCOPE_REJECTED');
  const parent = join(root, directory);
  requireThat(await realpath(parent) === parent, 'CAPTURE_CHILD_DIRECTORY_REJECTED');

  // This facade conveys one fixed query to the parent. The parent performs
  // the real read-only transaction through the ratified SQL reader.
  const pool = { connect: async () => ({
    query(query) {
      if (query === 'BEGIN TRANSACTION READ ONLY' || query === 'ROLLBACK') return { rows: [] };
      requireThat(query.text === SQL_RECEIPT_QUERY && !pending, 'CAPTURE_CHILD_SQL_REJECTED');
      return new Promise((resolve, reject) => {
        pending = { id: ++next, resolve, reject };
        process.send({ kind: 'READ_RECEIPT', id: next });
      });
    },
    release() {},
  }) };
  await captureDurableReceipt({ expected: scope, outputDirectory: join(parent, scope.method + '-' + attempt),
    readers: createReadOnlyReaders(pool) });
} catch {
  process.exitCode = 1;
} finally {
  if (process.connected) process.disconnect();
}