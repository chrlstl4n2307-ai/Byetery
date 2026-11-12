import { assertD324Scope } from '../d3-24-ratification/identity.mjs';
import { captureD324Receipt } from '../d3-24-ratification/capture.mjs';
import { createReplayReaders } from '../d3-receipt-capture/sources.mjs';

// A fixed synthetic child. The only receipt sources are IPC fixture frames.
// No database pool, arbitrary imports, environment config or network reader.
if (typeof process.send !== 'function' || process.argv.length !== 2) {
  process.exitCode = 1;
} else {
  process.once('message', async message => {
    try {
      const scope = assertD324Scope(message?.scope);
      const { sql, rpc } = message;
      if (!sql || !rpc || JSON.stringify(message).length > 2_097_152) throw Error('D324_SYNTHETIC_CAPTURE_INPUT_REJECTED');
      const result = await captureD324Receipt(scope, createReplayReaders([sql], [rpc]));
      process.send({ directory: result.directory }, () => process.disconnect());
    } catch {
      process.exitCode = 1;
      process.disconnect();
    }
  });
}
