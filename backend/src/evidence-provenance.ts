import { Address, Networks, Transaction, xdr } from '@stellar/stellar-sdk';
import { evidenceCommitment } from './evidence.ts';
import { EVIDENCE_V1_DOMAIN, type EvidenceV1Context } from './evidence-verifier.ts';
import { ACTORS, CONTRACT, evidenceValue } from './testnet/abi.ts';
import { NETWORK_ID } from './testnet/identity.ts';
import { HISTORY_DEPLOYMENT_ID, type HistoryRow } from './history/model.ts';
import { verifyHistoryRow, type HistoryChainReader, type HistoryReceipt } from './history/verify.ts';

export interface EvidenceProvenanceInput extends EvidenceV1Context {
  deploymentId: string;
  payloadHash: string;
  expectedCommitment: string;
}
export interface EvidenceProvenanceResult {
  verification: 'CONFIRMED' | 'UNVERIFIED';
  reason: string | null;
  transactionHash: string | null;
  ledger: number | null;
  commitment: string | null;
}
/** Separate chain provenance check. Takes the recorded payload hash, never disclosed bytes. */
export async function verifyEvidenceV1Provenance(
  input: EvidenceProvenanceInput, row: HistoryRow, chain: HistoryChainReader,
): Promise<EvidenceProvenanceResult> {
  const unverified = (reason: string): EvidenceProvenanceResult => ({
    verification: 'UNVERIFIED', reason, transactionHash: row.transaction_hash, ledger: null, commitment: null,
  });
  try {
    const collection = input.kind === 'COLLECTION';
    if (input.deploymentId !== HISTORY_DEPLOYMENT_ID || input.networkId !== NETWORK_ID
      || input.contractAddress !== CONTRACT || input.domain !== EVIDENCE_V1_DOMAIN || input.version !== 1
      || !['COLLECTION', 'RECYCLING'].includes(input.kind)
      || !/^[A-Z0-9-]{1,32}$/.test(input.batteryId) || !/^[0-9a-f]{64}$/.test(input.requestId)
      || !/^[0-9a-f]{64}$/.test(input.payloadHash) || !/^[0-9a-f]{64}$/.test(input.expectedCommitment)
      || row.kind !== (collection ? 'COLLECTED' : 'RECYCLED')) return unverified('EVIDENCE_CONTEXT_MISMATCH');
    const network = await chain.network();
    if (network.passphrase !== Networks.TESTNET) return unverified('NETWORK_UNVERIFIED');
    if (!row.transaction_hash || !/^[0-9a-f]{64}$/.test(row.transaction_hash)) return unverified('MISSING_TRANSACTION_HASH');
    const receipt = await chain.transaction(row.transaction_hash);
    // Reuse D2.4 checks: network-bound envelope hash, method, contract, battery, result XDR,
    // ledger/timestamp and persisted CONFIRMED observation. Only one provider tx read.
    const entry = await verifyHistoryRow(row, input.batteryId, input.contractAddress,
      { network: async () => network, transaction: async () => receipt }, true);
    if (entry.verification !== 'CONFIRMED') return unverified(entry.reason ?? 'HISTORY_UNVERIFIED');
    const tx = new Transaction(receipt.envelopeXdr!, Networks.TESTNET);
    const envelope = tx.toEnvelope();
    if (envelope.type !== 'envelopeTypeTx') return unverified('EVIDENCE_INVOCATION_MISMATCH');
    const body = envelope.v1.tx.operations[0].body;
    if (body.type !== 'invokeHostFunction' || body.invokeHostFunctionOp.hostFunction.type !== 'hostFunctionTypeInvokeContract')
      return unverified('EVIDENCE_INVOCATION_MISMATCH');
    const call = body.invokeHostFunctionOp.hostFunction.invokeContract;
    const ev = { version: 1, batteryId: input.batteryId, requestId: input.requestId,
      kind: input.kind, payloadHash: input.payloadHash };
    // Exact XDR, including all Evidence fields, request and authorized actor context.
    if (call.args.length !== 4
      || call.args[1].toXDR('base64') !== xdr.ScVal.scvBytes(Buffer.from(input.requestId, 'hex')).toXDR('base64')
      || call.args[2].toXDR('base64') !== new Address(collection ? ACTORS.collector : ACTORS.recycler).toScVal().toXDR('base64')
      || call.args[3].toXDR('base64') !== evidenceValue(ev).toXDR('base64')
      || evidenceCommitment(input, ev) !== input.expectedCommitment) return unverified('EVIDENCE_INVOCATION_MISMATCH');
    return { verification: 'CONFIRMED', reason: null, transactionHash: entry.transactionHash,
      ledger: entry.ledger, commitment: input.expectedCommitment };
  } catch { return unverified('CHAIN_READ_OR_EVIDENCE_UNAVAILABLE'); }
}

/** Read-only official Horizon Testnet adapter for transactions outside RPC retention.
 * Envelopes/results remain transient inside verification, never in the public result.
 */
export class HorizonEvidenceReader implements HistoryChainReader {
  readonly transport: typeof fetch;
  constructor(transport: typeof fetch = fetch) { this.transport = transport; }
  private async get(path: string): Promise<Record<string, unknown> | null> {
    const response = await this.transport(`https://horizon-testnet.stellar.org${path}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(7000),
    });
    if (response.status === 404 && path.startsWith('/transactions/')) return null;
    if (!response.ok || !response.body) throw Error('EvidenceReadUnavailable');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) throw Error('EvidenceReadUnavailable');
      chunks.push(chunk);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('EvidenceReadUnavailable');
    return body as Record<string, unknown>;
  }
  async network() {
    const body = await this.get('/');
    if (typeof body?.network_passphrase !== 'string') throw Error('EvidenceReadUnavailable');
    return { passphrase: body.network_passphrase };
  }
  async transaction(hash: string): Promise<HistoryReceipt> {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw Error('InvalidHistoryHash');
    const body = await this.get(`/transactions/${hash}`);
    if (!body) return { status: 'NOT_FOUND' };
    if (typeof body.successful !== 'boolean' || typeof body.hash !== 'string'
      || !Number.isSafeInteger(body.ledger) || typeof body.created_at !== 'string'
      || !Number.isFinite(Date.parse(body.created_at))
      || typeof body.envelope_xdr !== 'string' || typeof body.result_xdr !== 'string') throw Error('EvidenceReadUnavailable');
    return { status: body.successful ? 'SUCCESS' : 'FAILED', txHash: body.hash,
      ledger: body.ledger as number, createdAt: String(Date.parse(body.created_at) / 1000),
      envelopeXdr: body.envelope_xdr, resultXdr: body.result_xdr };
  }
}
