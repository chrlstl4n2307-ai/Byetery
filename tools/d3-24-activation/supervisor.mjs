import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyD324CaptureInventory, verifyFreshD324Scopes } from '../d3-24-ratification/capture.mjs';
import { createReadOnlyReaders } from '../d3-receipt-capture/sources.mjs';
import { CAPTURE_CHILD_TIMEOUT_MS } from '../d3-run1-launcher/launcher.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';

const fixtureChild = fileURLToPath(new URL('./capture-child.mjs', import.meta.url));
const receiptChild = fileURLToPath(new URL('./receipt-child.mjs', import.meta.url));

async function supervise(childFile, message, classification, timeoutMs, readSql) {
  const [scope] = await verifyFreshD324Scopes([message.scope]);
  check(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= CAPTURE_CHILD_TIMEOUT_MS, 'D324_CAPTURE_TIMEOUT_REJECTED');
  check(Buffer.byteLength(JSON.stringify(message)) <= 2_097_152, 'D324_CAPTURE_INPUT_REJECTED');
  const child = fork(childFile, [], { env: {}, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
  const controller = new AbortController();
  let directory, invalid = false, expired = false, reads = 0, pending = false;
  const fail = () => { invalid = true; child.kill(); };
  const timer = setTimeout(() => { expired = true; controller.abort(); child.kill(); }, timeoutMs);
  child.on('message', async reply => {
    if (directory !== undefined || pending) { fail(); return; }
    if (Object.keys(reply ?? {}).join(',') === 'directory' && typeof reply.directory === 'string') {
      directory = reply.directory;
      return;
    }
    if (!readSql || reply?.kind !== 'READ_RECEIPT' || reply.id !== reads + 1 || reads >= 3) { fail(); return; }
    const id = ++reads;
    pending = true;
    let receipt;
    try {
      receipt = (await readSql(scope, AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]))).rawUtf8;
    } catch { /* Send the absence of the scoped read, never errors or configuration. */ }
    pending = false;
    if (child.connected) child.send({ id, receipt }, error => { if (error) fail(); });
  });
  try {
    const code = await new Promise(resolve => {
      child.once('error', () => resolve(null));
      child.once('close', resolve);
      child.send(message, error => { if (error) fail(); });
    });
    check(!expired, 'D324_CAPTURE_CHILD_TIMEOUT');
    check(code === 0 && !invalid && directory, 'D324_CAPTURE_CHILD_REJECTED');
    return { directory, proof: await verifyD324CaptureInventory(directory, scope, classification) };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export function captureSyntheticInChild(scope, sql, rpc, timeoutMs = CAPTURE_CHILD_TIMEOUT_MS) {
  return supervise(fixtureChild, { scope, sql, rpc }, 'OFFLINE_SYNTHETIC', timeoutMs);
}

// Read-only port for future ratification. No launcher currently calls it.
export function captureD324ReadOnlyInChild(pool, scope) {
  const { readSql } = createReadOnlyReaders(pool);
  return supervise(receiptChild, { scope }, 'LIVE_READONLY_SQL_AND_TESTNET_RPC', CAPTURE_CHILD_TIMEOUT_MS, readSql);
}
