# Durable receipt observation — auxiliary tooling

Observation-only replacement for the old task-local `DurableReceiptMismatch`
literal comparison. It does not start the API, operator, worker, signer or a
lifecycle. **No execution or continuation authority is returned.**

The archived launcher under `.tools/d3-run1-live-2026-11-06/…/launch.mjs` is
historical evidence and remains untouched. Its comparison happened before
preserving both raw inputs. The replacement is a separately reviewable library;
a future explicitly authorized caller must use it rather than that old literal
check. This task does not wire it into a running lifecycle or create a
continuation bundle.

## Boundary and usage

```javascript
import {captureDurableReceipt} from './capture.mjs';
import {createReadOnlyReaders} from './sources.mjs';

// Existing observer pool, configured separately; never pass credentials here.
const result = await captureDurableReceipt({
  expected: {operationId, transactionHash, batteryId, method, ledger},
  readers: createReadOnlyReaders(existingObserverPool),
  outputDirectory: freshDiagnosticDirectory,
});
// Stop unless status === 'DURABLE_RECEIPT_CONVERGED_NORMALIZED'.
// Even that result never authorizes the next business action.
```

Only closed expected-scope and reader-factory inputs are supported. No caller
callback, arbitrary SQL, endpoint, clock, attempt count, deadline, reset or retry
option exists. `createReplayReaders` is explicitly for offline synthetic tests
and local replay of previously captured observations. Reader objects are frozen
and branded. Output must be new, have an existing nonsymlink parent, and be outside
product directories; overwrite and the original stopped-bundle path are denied.

The supplied pool is assumed trusted. The adapter only executes `BEGIN
TRANSACTION READ ONLY`, its fixed parameterized SELECT and `ROLLBACK`; no driver,
credentials, configuration or environment are loaded by this module. SQL is
scoped by deployment + exact operation UUID + hash + battery, not deployment
alone. RPC is pinned to Testnet `getTransaction(hash)` with redirects refused.
The operation UUID attached to the RPC observation is an off-chain correlation
to that exact expected SQL operation: Stellar does not store the application UUID.

## Persistence and comparison order

For every pair: read SQL, save exact source UTF-8 bytes with exclusive creation,
`fsync`, save its observation; then read RPC, save the exact JSON-RPC UTF-8 bytes,
`fsync`, save its observation. Only afterwards decode both XDR values, save/fsync
the canonical decoded inputs and raw hashes, and compare. Each file has a durable
write index in the final canonical inventory. Original base64 text is never
rewritten. Both raw sources survive malformed XDR and identity-mismatch STOPs.

SQL raw means the exact text returned by the fixed public-field SQL JSON
projection, **not PostgreSQL wire bytes**. RPC raw means its received HTTP JSON
text. The projection excludes principals/Auth identities and credentials. The
observation and canonical-input files jointly preserve source, operation/hash,
ledger/status, timestamp, index, original text, decoded representation and hashes.

The existing official pure XDR serializers validate base64 and a byte-exact
XDR decode/encode round trip. ASCII base64 whitespace is preserved in the source
and may account for a representation difference. Missing padding, invalid
alphabet or pad bits, and trailing or noncanonical XDR bytes fail closed.
`TransactionResult` must match byte for byte after decoding. A terminal result
disagreement stops before any metadata normalization or further read.

After those checks, the tool makes a fresh comparison copy of each
`TransactionMeta`. In the observed v4 diagnostic vector, it matches exactly two
ordered XDR symbols, `core_metrics` and `invoke_time_nsecs`, by their bytes. The
event must be a successful Core diagnostic without a contract ID, with v0 body
and extension and a `u64` value. Its value is set to `0` in the comparison copy.
The event, its position, its topics, and every other field are retained.
Duplicate matches and exact topics with an unproven event shape stop. Other
metadata versions are compared byte for byte.

The comparison uses canonical binary XDR for the entire resulting metadata.
`*-normalized-meta.json` stores the comparison XDR and its
`normalizedMetaSha256` separately from each `rawMetaSha256`. The raw metadata
hash covers the unmodified XDR bytes, and the raw-source hash covers the full
SQL or RPC UTF-8 source. Original base64 and decoded raw metadata remain in the
source and canonical-input artifacts. The normalized artifact is saved after
the raw inputs and before the decision. Its hash is a comparison value.

Both sources must report `SUCCESS` with final result/meta, ledger and exact identity.
SQL also needs a terminal application/durable-state pair and its receipt hash.
`PROJECTED` is accepted only as confirmed SQL projection. SQL incomplete while
RPC terminal is `PROJECTION_NOT_TERMINAL`. A matching `FAILED` pair stops and
preserves the reported chain result. Each decoded result tag must be `txSuccess`.

## Fixed bounds and results

- Maximum **3 pairs**, at most **6 source reads**.
- Maximum convergence budget **20 seconds**, measured by a private monotonic
  clock. Per-read timeout **3 seconds**; interval **200 ms**.
- Every attempt uses the same frozen expected tuple; no caller reset/config.
- A late matching pair cannot produce PASS. No further read starts after budget.
- Required final filesystem persistence can finish after the budget if the OS
  delays I/O; the budget is not an OS scheduling/fsync latency guarantee.
- A timed-out SQL read can finish rollback/release in the background; it remains
  SELECT-only and cannot cause a business retry. RPC receives an AbortSignal.
- `readCount` records source reads actually initiated; `sourceObservationCount`
  includes a saved error observation if a source could not be started in time.

`DURABLE_RECEIPT_CONVERGED_NORMALIZED` records attempts, reads, elapsed time, raw
metadata equality, normalized equality, and per-source hashes. The reason
`APPROVED_DIAGNOSTIC_VARIANCE` indicates raw bytes differed and normalized bytes
matched. `DURABLE_RECEIPT_NORMALIZED_MISMATCH` stops immediately on any difference
that survives normalization or any ambiguous allowlisted event. Incomplete
observations can be reread within budget. Wrong identity, malformed XDR, or
exhausted reads return `DURABLE_RECEIPT_MISMATCH_PRESERVED`. Persistence errors
propagate without returning PASS.

`priorStoppedBundleSha256` is mandatory metadata with the existing incident hash
`a926783d15bb509410ba00f8466ffc281e4104ace43d65bfed9e35e6695c83eb`.
It is a reference only; that bundle is never opened for writing or regenerated.
No new business manifest/continuation run is generated.

## Audit and tests

From the repository root, using existing dependencies:

```text
node tools/d3-receipt-capture/audit.mjs
node --test --test-concurrency=1 tools/d3-receipt-capture/capture.test.mjs tools/d3-receipt-capture/meta-normalization.test.mjs
node --test --test-concurrency=1 tools/d3-evidence-capture/tooling.test.mjs tools/d3-evidence-capture/owner-export.test.mjs tools/d3-evidence-capture/identity-preflight.test.mjs
```

The audit uses the already installed frontend TypeScript parser. No dependency
installation is required. It inspects production AST/imports, SQL and the small
pure-XDR helper graph, rejects signing/building/simulation/business imports and
mutation RPC/SQL, and reports `CAPTURE_TOOLING_NETWORK_MUTATION_PATHS = 0`.
Dynamic offline tests verify exact SQL statements and RPC method/scope. This
assumes a trusted Node/OS and existing pool, not an adversary replacing the
runtime or passing a malicious pool object.

The two public TX1 fixtures are byte-exact XDR observations. The regression
test reproduces the difference in the Core invocation timer (`413596` versus
`412826` nanoseconds). Their normalized XDR is identical. Tests mutate the
neighboring metrics, ledger changes, Soroban return value, contract events and
diagnostic ordering to verify those differences still stop capture. Delayed
SQL and other invalid or intermediate cases are synthetic. The classified
variance concerns the preserved observations. The original comparison inputs
were not saved, and the original incident retains `ROOT_CAUSE_NOT_PROVEN`.

The existing ratified `tools/d3-evidence-capture` verifier, including its stricter
SQL/RPC crosscheck policy, is unchanged. This module supplies preserved receipt
observations; it does not replace the broader identity/signature/header/contract
verification or final owner-export comparison.

Stellar documents the [transaction RPC fields](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction),
the [role of diagnostic events](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/events),
and the [Core host invocation timer](https://github.com/stellar/stellar-core/blob/master/docs/metrics.md).
