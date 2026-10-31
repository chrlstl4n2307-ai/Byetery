// Test/build instrumentation only. All non-loopback JS network attempts abort.
import net from 'node:net';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import {appendFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const local = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host ?? 'localhost').toLowerCase());
function reject(kind, host) {
 const e = Object.assign(new Error('B44_PREP_REMOTE_NETWORK_BLOCKED'), {code: 'B44_OFFLINE'});
 if (process.env.B44_PREP_NETWORK_LOG) appendFileSync(process.env.B44_PREP_NETWORK_LOG, JSON.stringify({kind, host: String(host).slice(0, 160), blocked: true})+'\n');
 throw e;
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
 let opts = args[0];
 if (Array.isArray(opts)) opts = opts[0];
 if (opts && typeof opts === 'object') { if (!opts.path && !local(opts.host)) reject('socket', opts.host); }
 else if (typeof opts === 'number' && typeof args[1] === 'string' && !local(args[1])) reject('socket', args[1]);
 return connect.apply(this, args);
};
for (const api of [dns, dns.promises]) for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveSrv', 'resolveTxt', 'reverse']) {
 if (typeof api[name] !== 'function') continue;
 const original = api[name];
 api[name] = function(host, ...args) { if (!local(host)) reject('dns', host); return original.call(this, host, ...args); };
}
for (const api of [http, https]) for (const name of ['request', 'get']) {
 const original = api[name];
 api[name] = function(target, ...args) {
  const host = typeof target === 'string' || target instanceof URL ? new URL(target).hostname : target?.hostname ?? target?.host;
  if (!local(host)) reject('http', host);
  return original.call(this, target, ...args);
 };
}
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (target, init) => {
 const url = typeof target === 'string' || target instanceof URL ? new URL(target) : new URL(target.url);
 if (!local(url.hostname)) reject('fetch', url.hostname);
 return fetchOriginal(target, init);
};
syncBuiltinESMExports();
