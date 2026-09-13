import { createHash } from 'node:crypto';
import { Address as StellarAddress, xdr } from '@stellar/stellar-sdk';
import { hash32, nonzeroHash, type Deployment, type Evidence } from './domain.ts';

/** Soroban contracttype struct = ScMap with lexicographically ordered symbol keys. */
export function evidenceCommitment(config: Deployment, evidence: Evidence): string {
  const symbol = (s: string) => xdr.ScVal.scvSymbol(s);
  const bytes = (s: string) => xdr.ScVal.scvBytes(Buffer.from(hash32(s), 'hex'));
  nonzeroHash(evidence.payloadHash);
  const fields: [string, xdr.ScVal][] = [
    ['battery_id', xdr.ScVal.scvString(evidence.batteryId)],
    ['kind', xdr.ScVal.scvVec([symbol(evidence.kind === 'COLLECTION' ? 'Collection' : 'Recycling')])],
    ['payload_hash', bytes(evidence.payloadHash)], ['request_id', bytes(evidence.requestId)],
    ['version', xdr.ScVal.scvU32(evidence.version)],
  ];
  const encoded = xdr.ScVal.scvVec([
    xdr.ScVal.scvString('BYETERY_EVIDENCE_V1'), bytes(config.networkId),
    StellarAddress.fromString(config.contractAddress).toScVal(),
    xdr.ScVal.scvMap(fields.map(([key, val]) => new xdr.ScMapEntry({ key: symbol(key), val }))),
  ]).toXDR();
  return createHash('sha256').update(encoded).digest('hex');
}
