import type { Address, Hash32 } from './domain.ts';

export interface WalletChallenge {
  id: string; userId: string; networkId: Hash32; address: Address;
  domain: string; nonce: string; message: Uint8Array; expiresAt: Date;
}
export type WalletVerification =
  | { verified: true; address: Address; networkId: Hash32; challengeId: string }
  | { verified: false; reason: 'INVALID_PROOF' | 'EXPIRED' | 'CONTEXT_MISMATCH' };
/** Cryptographic proof only. Caller must authenticate, atomically consume the challenge,
 * and persist the verified link. No wallet vendor or signing protocol is prescribed. */
export interface WalletVerifier {
  verify(challenge: WalletChallenge, proof: Uint8Array, now: Date): Promise<WalletVerification>;
}
