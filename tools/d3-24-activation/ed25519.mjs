import { createPublicKey, verify } from 'node:crypto';
import { hash } from '../d3-evidence-capture/common.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';

export function verifyDetachedEd25519(bytes, signature, publicKey, fingerprint) {
  check(typeof publicKey === 'string' && /^[A-Za-z0-9_-]{59}$/.test(publicKey), 'OWNER_GRANT_PUBLIC_KEY_REJECTED');
  const der = Buffer.from(publicKey, 'base64url');
  check(der.length === 44 && der.toString('base64url') === publicKey && hash(der) === fingerprint,
    'OWNER_GRANT_PUBLIC_KEY_REJECTED');
  const key = createPublicKey({ key: der, type: 'spki', format: 'der' });
  check(key.asymmetricKeyType === 'ed25519', 'OWNER_GRANT_PUBLIC_KEY_REJECTED');
  check(typeof signature === 'string' && /^[A-Za-z0-9_-]{86}$/.test(signature), 'OWNER_GRANT_SIGNATURE_REJECTED');
  const raw = Buffer.from(signature, 'base64url');
  check(raw.length === 64 && raw.toString('base64url') === signature && verify(null, bytes, key, raw),
    'OWNER_GRANT_SIGNATURE_REJECTED');
}
