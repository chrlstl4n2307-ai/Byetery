# RUN1 capture fix — Council review / 2026-11-07

**RUN1_CAPTURE_FIX_READY_FOR_COUNCIL_REVIEW**

This is auxiliary observation tooling only. RUN1 remains stopped; TX2 is **not authorized**. No acceptance criterion changes. D1 12/12, D2 6/6, D3 0/5, total 18/23. The local code checkpoint is for review and is not a deployment, ratification or execution authority.

## Immutable incident

- Business execution: `c6ba2e837ed0f7b81373655b8106b58ecb86a8cd`.
- Business fingerprint: `e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539` — unchanged.
- Battery: `BYE-D3-R1-20261106-9470F35DF6B1`.
- Operation: `2201faa3-980a-4250-8578-ec024272a022`.
- TX1: `fb159fc9e1646f257414f30034220876f14033ce7b92109102cc9ca530da68c1` — SUCCESS, ledger 5599273.
- State: REGISTERED / NOT_ELIGIBLE. No request, TX2–TX5 or reward.
- Stopped bundle: `a926783d15bb509410ba00f8466ffc281e4104ace43d65bfed9e35e6695c83eb`; all **19 existing files** retain their original hashes; verifier PASS before and after.

**ROOT_CAUSE_NOT_PROVEN.** Later equal receipts and the new current discrepancy do not establish the original missing inputs. No historical evidence was normalized, overwritten or regenerated. New diagnostics are separate, ignored local files. The original ratified evidence-tool subtree remains unchanged.

## Exact old path / boundary (documented before changes)

Task-local archived launcher: `.tools/d3-run1-live-2026-11-06/execution/.tools/run1-live/launch.mjs`, line **118**, SHA-256 `e4b4e73a7c3403a757ddd897a360bbcda52c481a1593548519a50893243fd17a`.

SQL input was `w.confirmation` from an exact deployment/operation/battery SELECT joining logical work and persisted envelope. After terminal-state checks it fetched RPC `getTransaction` for the original hash, checked SUCCESS/hash/ledger, then executed:

```javascript
ensure(tx.resultXdr === w.confirmation.resultXdr &&
       tx.resultMetaXdr === w.confirmation.resultMetaXdr,
       'DurableReceiptMismatch');
```

Both comparisons were textual base64 equality. Neither raw pair was persisted at this point. Decoded checks and persistence came later. It failed after frozen registration confirmation but before local capture completion, explaining local counter 0 versus one real confirmed transaction. This identifies the lost-diagnostics/code-order defect, **not the original data discrepancy's cause**. Delayed projection is tested as a synthetic hypothesis only.

## Correction and limits

New, separate subtree: `tools/d3-receipt-capture/`. The old incident launcher and frozen runtime are untouched. Future reviewed callers must explicitly use this library; no lifecycle continuation or live adapter installation is performed here.

Order: SQL read → exact raw UTF-8 save/fsync → source observation → RPC read → exact raw UTF-8 save/fsync → source observation → hashes → validated XDR decoding → canonical comparison-input save/fsync → comparison/decision. Each indexed pair retains identity, source, timestamps, ledger/status, original strings, decoded representations/hashes and durable write order. An invalid or mismatching pair remains on disk before STOP. SQL raw is its fixed SQL JSON projection, not PostgreSQL wire data; RPC raw is the received JSON-RPC HTTP text.

Three pairs maximum; at most six source reads; 20-second private monotonic convergence budget; 3-second read timeout; 200ms interval. The caller cannot supply time/attempt/reset knobs or arbitrary callbacks. Same expected operation/hash every time. No PASS after deadline. Final required fsync may take longer if the OS stalls, but cannot authorize more reads or a late PASS. Read-only timeout rollback may finish asynchronously; no business action is attached.

Terminal final SQL/RPC identity and both `TransactionResult`/`TransactionMeta` bytes must match after valid canonical decode/encode. Whitespace-only base64 differences become `ENCODING_REPRESENTATION_DIFFERENCE`; canonical-byte differences do not. No diagnostic-event filtering or arbitrary base64 repair is performed. Nonterminal SQL remains `PROJECTION_NOT_TERMINAL`. Wrong identity/malformed XDR stop after preserving the pair. Success `DURABLE_RECEIPT_CONVERGED` means receipt consistency only, not approval or business success for a FAILED receipt.

`priorStoppedBundleSha256` is recorded in this auxiliary diagnostic schema. No continuation RUN bundle was created. The fixed SQL adapter executes only BEGIN READ ONLY, an exact-identity parameterized SELECT, and ROLLBACK. RPC is only Testnet getTransaction with redirects denied. No full SDK root, builder, signer, server, worker or child process is reachable through this capture code. AST/SQL/import audit and dynamic source tests report **CAPTURE_TOOLING_NETWORK_MUTATION_PATHS = 0**. This is scoped to the reviewed module graph and trusted existing pool/Node/OS; it is not a malicious-runtime isolation guarantee.

## New same-TX1 read-only recapture — not converged

**DURABLE_RECEIPT_MISMATCH_PRESERVED** — 3 pairs / 6 source reads / 8020ms. The first SQL read timed out and its error observation was preserved; that is not proof of projection lag. Attempts 2 and 3 were terminal but had different decoded resultMetaXdr bytes. The normal resultXdr matched.

- SQL meta bytes SHA-256: `4c2267f012556b11d3f222da6a39d9ee77e9b91a578a2cfb44f7a066adb60667`.
- RPC meta bytes SHA-256: `a4214427ec37de1a99caa8ed004cc2b922ed7814a49529a071d35c1f64dc4d24`.
- The current canonical snapshots differ at `/v4/diagnosticEvents/17/event/body/v0/data/u64/xdrInteger` (SQL 413596, RPC 412826). This records where these **new observations** differ. It does not prove why the original comparison failed or authorize ignoring that field.
- Diagnostic inventory SHA-256: `02d3d5c96253d327ae418f270d7f0ac81fdf424293b91e2d13bb8fe5006d2fb2`.
- Independent recapture verified the same hash/contract/method/battery, one transaction operation, SUCCESS, ledger 5599273 using RPC/Horizon/header reads. No simulation or transaction was executed.

The correction therefore preserved the discrepancy and stopped as designed; it did **not** force a green result. The new public metadata variant is a deterministic offline fixture proving it stays a mismatch. Council must distinguish capture-code readiness from transaction-evidence convergence.

## TTL — read-only, not execution permission

Observed 2026-11-07T03:31:42.655Z; current/observation ledger **5599731**; last modified **5599273**; liveUntil **5720232**; remaining **120501 ledgers**, approximately **6.97344 days** at observed **5 seconds/ledger**. State remains REGISTERED / NOT_ELIGIBLE.

**BATTERY_TTL_MARGIN_FOR_RESUME = PASS** (>2 days at observation). The exact key/value XDR, ledger/time and cadence samples are preserved locally. This estimate is time-sensitive and must be re-read under any separate future authorization. No TTL extension or restoration was performed. **TX2_AUTHORIZED = NO.**

## Tests and artifacts

**125 passed, 0 failures, 0 skips**: **34** new capture tests plus **91** relevant existing evidence tests. All 18 required cases are covered, including exact/representation matches, stale/missing receipt convergence, preserved final mismatches, wrong IDs, malformed XDR, durable ordering, fixed limits, exact attempt counts, source capabilities and `DurableReceiptMismatch regression — delayed SQL convergence`. That regression is explicitly synthetic and not evidence of the real incident cause.

The original verifier's stricter crosscheck semantics were not weakened. Unrelated business suites that may generate test signatures were not run under this task's prohibition; no product/runtime code changed. Test logs, raw observations and before/after integrity inventories are kept under ignored `.tools/d3-receipt-capture-fix-2026-11-07/`, not staged wholesale.

See [auxiliary README](../../../tools/d3-receipt-capture/README.md) and [machine-readable report](RUN1-CAPTURE-FIX-2026-11-07.json) for parameters, source provenance, limits and per-file hashes. Commit SHA/root tree/new subtree are recorded after the one local commit in the local checkpoint receipt; no self-referential hash is embedded here.

## Safety / authorization

```text
STOPPED_BUNDLE_IMMUTABLE = YES
ROOT_CAUSE_PROVEN = NO
RAW_SQL_PERSISTED_BEFORE_COMPARE = YES
RAW_RPC_PERSISTED_BEFORE_COMPARE = YES
CANONICAL_XDR_COMPARE = YES
BOUNDED_READONLY_CONVERGENCE = YES
REBROADCAST_PATH = NONE
REPLACEMENT_PATH = NONE
READY_FOR_COUNCIL_REVIEW = YES
TX2_AUTHORIZED = NO
NEW_BUSINESS_TX = 0
SIGNATURES = 0
BROADCASTS = 0
LIVE_SIMULATIONS = 0
REMOTE_WRITES = 0
TTL_MUTATIONS = 0
RESTORE = 0
```

Business/source/contract/WASM unchanged. No Auth, role, schema/RLS, migration, actor, dependency, hosted deployment, maintenance-account or custody/accounting changes. Existing historical/untracked reports remain outside this commit. No push, merge or tag. **STOP; no RUN1 continuation, TX2, RUN2 or RUN3.**

Official references consulted first through Stellar Raven: [getTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction), [getLedgerEntries](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries). Local locked official XDR serializers remain authoritative for binary decoding.
