import { win32 } from 'node:path';
import { SIGNER } from './pins.mjs';

export const D324_INTEGRATION_BASE = 'f1b4309b1d14260a8302d828dab5dd2fcdf0aa8b';
export const D324_H2_BUNDLE_SHA256 = '1a584ade33a14379dc202c920614776132cdc1c0a3d2c47a78f54e260f1f1d01';
export const D324_H2_BUNDLE_PATH = 'tools/d3-24-operational/h2/pins.json';

const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('\0') === names.toSorted().join('\0');
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const aclFields = ['releaseOwnerSidSha256', 'operatingSidSha256', 'fileDaclSha256', 'rootDaclSha256', 'binDaclSha256'];

/** Checks the signed document's review fields. Effective filesystem rights
 * require separate evidence from the provisioned Windows identities. */
export function inspectD324IntegrationBindings(value) {
  const signer = value?.signer;
  const path = signer?.path;
  if (!exact(value, ['h2BundleSha256', 'signer']) || value.h2BundleSha256 !== D324_H2_BUNDLE_SHA256 ||
      !exact(signer, ['path', 'sha256', 'bytes', 'architecture', 'protocol', 'custody', ...aclFields]) ||
      signer.sha256 !== SIGNER.binarySha256 || signer.bytes !== SIGNER.bytes ||
      signer.architecture !== 'WINDOWS_X64' || signer.protocol !== 'V3' || signer.custody !== 'OPTION_A_REVIEW_ONLY' ||
      !aclFields.every(key => hex64(signer[key])) || signer.releaseOwnerSidSha256 === signer.operatingSidSha256 ||
      typeof path !== 'string' || !/^[A-Za-z]:\\/.test(path) || /[\x00-\x1f<>:"/|?*]/.test(path.slice(2)) ||
      win32.normalize(path) !== path || win32.basename(path) !== 'byetery-secure-store-signer.exe') {
    throw Error('D324_V3_RUNTIME_BINDINGS_REJECTED');
  }
  return Object.freeze({ h2BundleSha256: value.h2BundleSha256, signer: Object.freeze({ ...signer }) });
}
