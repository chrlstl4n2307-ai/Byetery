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
// Stop unless status === 'DURABLE_RECEIPT_CONVERGED'.
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

The existing official pure XDR serializers validate both base64 and a byte-exact
XDR decode/encode round trip. Only ASCII base64 whitespace differences are
accepted as representation differences. Missing padding, invalid alphabet/pad
bits and trailing/noncanonical XDR bytes fail closed. `TransactionResult` and
`TransactionMeta` bytes are compared **independently**. Equal bytes with different
text return `ENCODING_REPRESENTATION_DIFFERENCE`; differing bytes are never
silently normalized or stripped, including diagnostic events.

Both sources must be terminal with final result/meta, ledger and exact identity.
SQL also needs a terminal application/durable-state pair and its receipt hash.
`PROJECTED` is accepted only as confirmed SQL projection. SQL incomplete while
RPC terminal is `PROJECTION_NOT_TERMINAL`, never immediate business failure.
`FAILED` receipt agreement is not lifecycle success; returned chain result is
retained. A matching SUCCESS label must also agree with the decoded result tag.

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

Success: `DURABLE_RECEIPT_CONVERGED`, exact attempts/reads/elapsed and observation
hashes. Exhausted mismatch: `DURABLE_RECEIPT_MISMATCH_PRESERVED`, all indexed raw
and canonical inputs. Wrong identity or malformed XDR stops immediately after
preserving the pair. Persistence errors propagate without returning PASS.

`priorStoppedBundleSha256` is mandatory metadata with the existing incident hash
`a926783d15bb509410ba00f8466ffc281e4104ace43d65bfed9e35e6695c83eb`.
It is a reference only; that bundle is never opened for writing or regenerated.
No new business manifest/continuation run is generated.

## Audit and tests

From the repository root, using existing dependencies:

```text
node tools/d3-receipt-capture/audit.mjs
node --test --test-concurrency=1 tools/d3-receipt-capture/capture.test.mjs
node --test --test-concurrency=1 tools/d3-evidence-capture/tooling.test.mjs tools/d3-evidence-capture/owner-export.test.mjs tools/d3-evidence-capture/identity-preflight.test.mjs
```

The audit uses the already installed frontend TypeScript parser. No dependency
installation is required. It inspects production AST/imports, SQL and the small
pure-XDR helper graph, rejects signing/building/simulation/business imports and
mutation RPC/SQL, and reports `CAPTURE_TOOLING_NETWORK_MUTATION_PATHS = 0`.
Dynamic offline tests verify exact SQL statements and RPC method/scope. This
assumes a trusted Node/OS and existing pool, not an adversary replacing the
runtime or passing a malicious pool object.

Public XDR fixture values come from the preserved TX1 receipt. Delayed SQL and
other invalid/intermediate states are synthetic. The public metadata variant
comes from the new read-only recapture; it must not be reported as proof of the
original incident's cause. **ROOT_CAUSE_NOT_PROVEN** remains authoritative.

The existing ratified `tools/d3-evidence-capture` verifier, including its stricter
SQL/RPC crosscheck policy, is unchanged. This module supplies preserved receipt
observations; it does not replace the broader identity/signature/header/contract
verification or final owner-export comparison.
