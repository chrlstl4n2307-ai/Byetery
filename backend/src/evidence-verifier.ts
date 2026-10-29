import { createHash, timingSafeEqual } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { evidenceCommitment } from './evidence.ts';

export const EVIDENCE_V1_DOMAIN = 'BYETERY_EVIDENCE_V1';
// Same disclosure limit as the existing application evidence input, not a new contract rule.
export const MAX_DISCLOSED_EVIDENCE_BYTES = 16384;
export interface EvidenceV1Context {
  version: number;
  domain: string;
  networkId: string;
  contractAddress: string;
  batteryId: string;
  requestId: string;
  kind: 'COLLECTION' | 'RECYCLING';
}
export interface EvidenceV1Input extends EvidenceV1Context {
  manifestBytes: Uint8Array;
  expectedCommitment: string;
}
export interface EvidenceV1Result {
  status: 'VERIFIED' | 'NOT_VERIFIED' | 'INVALID_INPUT';
  reason: 'COMMITMENT_MATCH' | 'COMMITMENT_MISMATCH' | 'DOMAIN_MISMATCH' | 'INVALID_INPUT';
  payloadHash: string | null;
  computedCommitment: string | null;
}
const hash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const invalid = (): EvidenceV1Result => ({
  status: 'INVALID_INPUT', reason: 'INVALID_INPUT', payloadHash: null, computedCommitment: null,
});
/** Pure integrity check. No JSON normalization, chain reads, truth or provenance assertion. */
export function verifyEvidenceV1(input: EvidenceV1Input): EvidenceV1Result {
  try {
    if (!input || !(input.manifestBytes instanceof Uint8Array)
      || input.manifestBytes.length === 0 || input.manifestBytes.length > MAX_DISCLOSED_EVIDENCE_BYTES
      || !hash(input.expectedCommitment) || !hash(input.networkId) || !hash(input.requestId)
      || input.version !== 1 || !['COLLECTION', 'RECYCLING'].includes(input.kind)
      || typeof input.contractAddress !== 'string' || !StrKey.isValidContract(input.contractAddress)
      || typeof input.batteryId !== 'string' || !/^[A-Z0-9-]{1,32}$/.test(input.batteryId)
      || typeof input.domain !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(input.domain)) return invalid();
    // V1 never hashes an alternative domain. A valid but different context is not V1.
    if (input.domain !== EVIDENCE_V1_DOMAIN) return {
      status: 'NOT_VERIFIED', reason: 'DOMAIN_MISMATCH', payloadHash: null, computedCommitment: null,
    };
    const payloadHash = createHash('sha256').update(input.manifestBytes).digest('hex');
    const computedCommitment = evidenceCommitment(input, {
      version: 1, batteryId: input.batteryId, requestId: input.requestId, kind: input.kind, payloadHash,
    });
    const matches = timingSafeEqual(Buffer.from(computedCommitment, 'hex'), Buffer.from(input.expectedCommitment, 'hex'));
    return { status: matches ? 'VERIFIED' : 'NOT_VERIFIED',
      reason: matches ? 'COMMITMENT_MATCH' : 'COMMITMENT_MISMATCH', payloadHash, computedCommitment };
  } catch { return invalid(); }
}

/** Decode the disclosure container only; manifest bytes are never parsed or reserialized. */
export function evidenceV1Disclosure(value: unknown): EvidenceV1Input | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.manifestBase64 !== 'string' || v.manifestBase64.length > Math.ceil(MAX_DISCLOSED_EVIDENCE_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.manifestBase64)
    || typeof v.evidenceVersion !== 'number' || typeof v.domain !== 'string'
    || typeof v.networkId !== 'string' || typeof v.contractAddress !== 'string'
    || typeof v.batteryId !== 'string' || typeof v.requestId !== 'string'
    || (v.evidenceKind !== 'COLLECTION' && v.evidenceKind !== 'RECYCLING')
    || typeof v.expectedCommitment !== 'string') return null;
  const manifestBytes = Buffer.from(v.manifestBase64, 'base64');
  if (manifestBytes.toString('base64') !== v.manifestBase64) return null;
  return { version: v.evidenceVersion, domain: v.domain, networkId: v.networkId,
    contractAddress: v.contractAddress, batteryId: v.batteryId, requestId: v.requestId,
    kind: v.evidenceKind, expectedCommitment: v.expectedCommitment, manifestBytes };
}
