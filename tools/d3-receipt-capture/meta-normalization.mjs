import {createHash} from 'node:crypto';
import {X} from '../d3-evidence-capture/xdr-reader.mjs';

// The exact TX1 diagnostic shape. No caller, environment or CLI configuration.
export const NORMALIZED_DIAGNOSTIC_TOPICS = Object.freeze(['core_metrics', 'invoke_time_nsecs']);
export const NORMALIZED_DIAGNOSTIC_METRIC = NORMALIZED_DIAGNOSTIC_TOPICS.join('/');

function matchesTopics(topics) {
  return topics.length === NORMALIZED_DIAGNOSTIC_TOPICS.length &&
    topics.every((topic, i) => topic.type === X.ScValType.scvSymbol.value &&
      Buffer.from(topic.sym.bytes).equals(Buffer.from(NORMALIZED_DIAGNOSTIC_TOPICS[i], 'ascii')));
}

/** Takes already validated canonical raw XDR and decodes a fresh comparison copy. */
export function normalizeTransactionMeta(rawBytes) {
  const decoded = X.TransactionMeta.fromXDR(rawBytes).toXdrObject();
  const matches = (decoded.v4?.diagnosticEvents ?? []).filter(({event}) =>
    event.body.v === 0 && matchesTopics(event.body.v0.topics));
  if (matches.length > 1) throw Error('AMBIGUOUS_DIAGNOSTIC_METRIC');
  const metric = matches[0];
  if (metric) {
    const {event} = metric;
    if (event.type !== X.ContractEventType.diagnostic.value || event.contractId !== null ||
        event.ext.v !== 0 || metric.inSuccessfulContractCall !== true ||
        event.body.v0.data.type !== X.ScValType.scvU64.value) {
      throw Error('UNPROVEN_DIAGNOSTIC_METRIC_SHAPE');
    }
    event.body.v0.data.u64 = 0n;
  }
  const normalizedBytes = metric ? Buffer.from(X.TransactionMeta.fromXdrObject(decoded).toXDR()) : Buffer.from(rawBytes);
  return {
    normalizedBytes,
    normalizedMetaSha256: createHash('sha256').update(normalizedBytes).digest('hex'),
    normalizationApplied: metric ? NORMALIZED_DIAGNOSTIC_METRIC : null,
  };
}
