import { randomUUID } from 'node:crypto';
import { canonical, hash } from '../d3-evidence-capture/common.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';

const protocol = 'BYETERY_D324_SESSION_IPC_V1';
const roles = ['ADMIN', 'COLLECTOR', 'RECYCLER', 'USER'];
const scope = Object.freeze({ taskId: RUN1.taskId, operatorSha: RUN1.businessSha,
  planHash: RUN1.planHash, batteryId: RUN1.batteryId, recipient: RUN1.recipient });
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === keys.toSorted().join(',');
const clients = new WeakSet();
const check = (value, code = 'D324_IPC_REJECTED') => { if (!value) throw Error(code); };
const binding = receipt => hash(Buffer.from(canonical({ scope, id: receipt.id,
  identityDigest: receipt.identityDigest, effectiveNotAfter: receipt.effectiveNotAfter })));
const validHeaders = headers => exact(headers, roles) && roles.every(role =>
  typeof headers[role] === 'string' && headers[role].length < 12000 && /^Bearer [A-Za-z0-9_.-]+$/.test(headers[role]));
const inScope = receipt => receipt?.taskId === scope.taskId && receipt.operatorSha === scope.operatorSha &&
  receipt.planHash === scope.planHash && typeof receipt.identityDigest === 'string' && digest.test(receipt.identityDigest);
const safeCode = code => typeof code === 'string' &&
  /^(?:D324[A-Za-z0-9_]{1,80}|SQL_QUIESCENCE_REJECTED|InvalidSession)$/.test(code) ? code : 'D324_IPC_REJECTED';
export const isD324PrivateSessionClient = value => clients.has(value);
export const isD324SessionFrame = value => value?.protocol === protocol;

// Use only an inherited Node IPC channel. There is no network listener,
// endpoint, reconnect or credential serialization outside the IPC frames.
export function connectD324PrivateSessions(peer = process) {
  check(peer === process && peer.connected && typeof peer.send === 'function', 'D324_IPC_PARENT_REQUIRED');
  let pending, closed = false, expectedBinding;
  function stop() {
    if (closed) return;
    closed = true;
    expectedBinding = undefined;
    peer.off('message', receive);
    peer.off('disconnect', stop);
    pending?.finish(Error('D324_IPC_CLOSED'));
    if (peer.connected) peer.disconnect();
  }
  function receive(message) {
    if (!isD324SessionFrame(message)) return;
    if (!pending || message.id !== pending.id ||
        !exact(message, message.ok === true ? ['protocol','id','ok','value'] : ['protocol','id','ok','code'])) {
      stop();
      return;
    }
    if (message.ok === true) pending.finish(undefined, message.value);
    else pending.finish(Error(safeCode(message.code)));
  }
  peer.on('message', receive);
  peer.once('disconnect', stop);
  function call(kind, args) {
    check(!closed && peer.connected && !pending, 'D324_IPC_UNAVAILABLE');
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(stop, 30_000);
      pending = { id, finish(error, value) {
        clearTimeout(timer);
        pending = undefined;
        if (error) reject(error); else resolve(value);
      } };
      try {
        peer.send({ protocol, id, kind, args }, error => { if (error) stop(); });
      } catch { stop(); }
    });
  }
  const client = Object.freeze({
    async prepare(headers) {
      const { receipt, scopeDigest } = await call('prepare', { headers });
      check(inScope(receipt) && uuid.test(receipt.id) && receipt.businessAuthority === false &&
        Number.isSafeInteger(receipt.effectiveNotAfter) && scopeDigest === binding(receipt));
      expectedBinding = scopeDigest;
      return receipt;
    },
    admitRevalidated: (id, headers, input) => call('admit', { id, headers, scopeDigest: expectedBinding, input }),
    checkAdmission: ack => call('check', { ack, scopeDigest: expectedBinding }),
    async discard(id) {
      try { await call('discard', { id }); }
      finally { expectedBinding = undefined; }
    },
    close: stop,
  });
  clients.add(client);
  return client;
}

// The server receives its existing authority and readiness from its host.
// Only the host maps the fixture sentinel to synthetic admission input.
export function serveD324PrivateSessions(control, admissionInput) {
  const peer = process;
  check(peer.connected && typeof peer.send === 'function', 'D324_IPC_PARENT_REQUIRED');
  let receipt, ack, consumed = false, busy = false, closed = false;
  function close() {
    if (closed) return;
    closed = true;
    receipt = ack = undefined;
    peer.off('message', receive);
    peer.off('disconnect', close);
    control.close();
  }
  async function dispatch(kind, args) {
    switch (kind) {
      case 'prepare': {
        check(!receipt && !consumed && exact(args, ['headers']) && validHeaders(args.headers));
        const prepared = await control.prepare(args.headers);
        check(!closed && inScope(prepared) && prepared.businessAuthority === false);
        receipt = prepared;
        return { receipt, scopeDigest: binding(receipt) };
      }
      case 'admit': {
        check(receipt && !consumed && exact(args, ['id','headers','scopeDigest','input']) &&
          args.id === receipt.id && args.scopeDigest === binding(receipt), 'D324_SESSION_HANDLE_REJECTED');
        consumed = true;
        check(validHeaders(args.headers), 'D324SessionScopeRejected');
        const id = receipt.id;
        const input = await admissionInput(args.input, args.headers);
        check(!closed, 'D324_IPC_CLOSED');
        ack = await control.admitRevalidated(id, args.headers, input);
        check(!closed && inScope(ack) && ack.identityDigest === receipt.identityDigest);
        return ack;
      }
      case 'check':
        check(ack && receipt && exact(args, ['ack','scopeDigest']) && args.scopeDigest === binding(receipt) &&
          canonical(args.ack) === canonical(ack), 'D324_ADMISSION_IDENTITY_REJECTED');
        await control.checkAdmission(ack);
        return null;
      case 'discard':
        check(receipt && exact(args, ['id']) && args.id === receipt.id, 'D324_SESSION_HANDLE_REJECTED');
        control.discard(receipt.id);
        consumed = true;
        receipt = ack = undefined;
        return null;
      default:
        throw Error('D324_IPC_REJECTED');
    }
  }
  async function receive(message) {
    if (!isD324SessionFrame(message)) return;
    if (busy || !exact(message, ['protocol','id','kind','args']) || !uuid.test(message.id)) {
      close();
      return;
    }
    busy = true;
    let response;
    try {
      response = { ok: true, value: await dispatch(message.kind, message.args) };
    } catch (error) {
      const code = error?.code ?? error?.message;
      response = { ok: false, code: safeCode(code) };
    }
    busy = false;
    if (!closed && peer.connected) {
      try { peer.send({ protocol, id: message.id, ...response }, error => { if (error) close(); }); }
      catch { close(); }
    }
  }
  peer.on('message', receive);
  peer.once('disconnect', close);
  return close;
}
