import disclosure from '../../docs/instaward/d2/evidence/d2-006/historical-recycling.json' with { type: 'json' };
import historical from '../../docs/instaward/d2/D2-003-TIMELINE.json' with { type: 'json' };
import { evidenceV1Disclosure } from './evidence-verifier.ts';
import { HorizonEvidenceReader, verifyEvidenceV1Provenance } from './evidence-provenance.ts';
import type { HistoryRow } from './history/model.ts';

// Acceptance harness for this one historical record. Two fixed official Testnet GETs.
// No environment/credentials, SQL connection, signing, simulation or submission.
let result: object = { verification: 'UNVERIFIED', reason: 'HISTORICAL_REFERENCE_MISMATCH' };
process.exitCode = 1;
try {
  const input = evidenceV1Disclosure(disclosure);
  const entry = historical.history.entries.find(e => e.transactionHash === disclosure.transactionHash);
  if (input && entry && process.argv.length === 2 && entry.kind === 'RECYCLED'
    && historical.history.deploymentId === disclosure.deploymentId
    && historical.history.contractAddress === input.contractAddress
    && historical.history.batteryId === input.batteryId && entry.ledger === disclosure.ledger) {
    const row: HistoryRow = { id: entry.operationId, kind: 'RECYCLED', state: entry.persistedState,
      created_at: entry.recordedAt, transaction_hash: entry.transactionHash,
      identity_network: input.networkId, identity_contract: input.contractAddress,
      confirmation_ledger: String(entry.ledger) };
    const checked = await verifyEvidenceV1Provenance({ ...input,
      deploymentId: disclosure.deploymentId, payloadHash: disclosure.payloadHash }, row, new HorizonEvidenceReader());
    result = { ...checked, source: 'STELLAR_TESTNET_HORIZON', checkedAt: new Date().toISOString(),
      network: 'TESTNET', networkId: input.networkId, deploymentId: disclosure.deploymentId,
      contract: input.contractAddress, batteryId: input.batteryId, method: disclosure.method,
      payloadHash: disclosure.payloadHash,
      persistedReference: 'docs/instaward/d2/D2-003-TIMELINE.json (historical SQL observation; no fresh SQL read)',
      commitmentBasis: 'Exact confirmed invocation Evidence XDR; reconstructed with frozen V1 encoder, not a new event read',
      newTransactions: 0, newOperationalSignatures: 0, newBroadcasts: 0 };
    if (checked.verification === 'CONFIRMED' && checked.ledger === disclosure.ledger) process.exitCode = 0;
  }
} catch { result = { verification: 'UNVERIFIED', reason: 'HISTORICAL_PROVENANCE_UNAVAILABLE' }; }
console.log(JSON.stringify(result, null, 2));
