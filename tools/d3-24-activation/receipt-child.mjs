import { captureD324Receipt } from '../d3-24-ratification/capture.mjs';
import { assertD324Scope } from '../d3-24-ratification/identity.mjs';
import { createReadOnlyReaders, SQL_RECEIPT_QUERY } from '../d3-receipt-capture/sources.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';

// Prepared observation-only port. The blocked LIVE entry never loads it.
if (typeof process.send !== 'function' || process.argv.length !== 2) {
  process.exitCode = 1;
} else {
  process.once('message', async message => {
    let next = 0;
    let pending;
    try {
      const scope = assertD324Scope(message?.scope);
      check(Object.keys(message).join(',') === 'scope', 'D324_RECEIPT_CHILD_INPUT_REJECTED');
      process.on('message', reply => {
        if (!pending) return;
        const { id, resolve, reject } = pending;
        pending = undefined;
        if (reply?.id === id && typeof reply.receipt === 'string') resolve({ rows: [{ receipt: reply.receipt }] });
        else reject(Error('D324_RECEIPT_SQL_UNAVAILABLE'));
      });
      const pool = { connect: async () => ({
        query(query) {
          if (query === 'BEGIN TRANSACTION READ ONLY' || query === 'ROLLBACK') return { rows: [] };
          check(query?.text === SQL_RECEIPT_QUERY && !pending && next < 3, 'D324_RECEIPT_CHILD_QUERY_REJECTED');
          return new Promise((resolve, reject) => {
            pending = { id: ++next, resolve, reject };
            process.send({ kind: 'READ_RECEIPT', id: next });
          });
        },
        release() {},
      }) };
      const result = await captureD324Receipt(scope, createReadOnlyReaders(pool));
      process.send({ directory: result.directory }, () => process.disconnect());
    } catch {
      process.exitCode = 1;
      process.disconnect();
    }
  });
}
