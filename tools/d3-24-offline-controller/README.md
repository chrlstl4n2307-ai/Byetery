# D3-24 offline controller validation

SECURITY_STATUS=HOLD
PUBLICATION_AUTHORITY=NO
EXTERNAL_MANIFEST_APPROVED=NO
PRE_LIVE_AUTHORITY=NO
LIVE_AUTHORITY=NO
CUSTODY_DESIGN=OPTION_A_PROVISIONAL
CUSTODY_RISK_ACCEPTED_FOR_LIVE=NO

## Scope

The isolated worktree is based on integration `bc9dc8bff9bbc34da37abfb51f59d1d58f165068`. It imports operator `d85e54e00e98c8d8bc6294c883708a701ce55440` and uses capture identity `496f891463c4476fe6f9e267232e072b754d02fb`. The plan hash is `0435d8436d13881ebbdf31e729cf36a80e538bc149300219353f68817b37d72d`. The patch consists of new files in this directory.

## Historical journal tests

Both tests were introduced in composition `ae50b48399aefdc68339ac55d3f214adc77349a4`, which selects operator `c50e4eb1f7f538a231c5ecfc31d19283998dc234`. Run the existing tests from that checkout:

```powershell
node --experimental-strip-types --test tools/d3-run1-launcher/confirmed-journal.test.mjs
```

| Case | Expected contract in the historical checkout | Result |
| --- | --- | --- |
| Five isolated confirmations and next preflight | `BYE-D324-OFFLINE-R1` goes through five operations and preserves each operation ID and hash. | PASS |
| Interruption after confirmation | The process exits at the fixture interruption. The journal, budget and markers survive, and a restarted attempt cannot submit again. | PASS |

The current composition selects operator `d85e54e`. It reserves `BYE-D3-R1-20261111-DCDE088CA870` for D3-24-RUN1. Running the old fixture against that operator correctly returns `D324OperatorScopeRejected` before the first session, lock or operation. The new suite checks both a foreign battery in D3-24 and use of the reserved battery under a different task.

## Execution and evidence

Run the local driver from the isolated composition checkout with the existing Node and PowerShell binaries. It verifies their published hashes, checks that the published PowerShell launcher and Node entry reject execution without ratification, then starts the test-only controller. Each case materializes the exact published operator in a new Git directory under `.test-output`. The operator uses its own factory, journal, budget, lock, polling, and session handoff. The fixture HTTP server listens on IPv4 loopback and requires an ephemeral capability. Auth, SQL state, signer callbacks and transport receipts are synthetic. The fixture preflight supplies synthetic chain observations and the server verifies SQL quiescence independently.

```powershell
node --experimental-strip-types tools/d3-24-offline-controller/run-offline.mjs
```

The nominal run binds four sessions, allows one synthetic admission, completes five operations and verifies each journal prefix and capture inventory. Every capture is `OFFLINE_SYNTHETIC` with `chainVerified=false`. The run closes four sessions, clears active SQL leases and releases the operator lock. The driver removes temporary checkouts and retains their synthetic evidence. Crash recovery verifies the original receipt in a fresh process. When a response is uncertain, the worker re-entry uses the persisted identity, and the send and signature counters stay at one. Recovery without the fixture capability is rejected.

The final signing boundary uses the actual persisted-context guard. The revocation test reaches that boundary with zero signatures and zero sends. The published signer hash was previously verified from the existing binary. Test execution uses an in-memory fixture signer and keys created for the fixture.

## Local verification

Rust 1.96.0 for Windows GNU is installed in the sibling B24secure checkout. The worktree can reuse the ignored toolchain, registry, and caches. The host linker for cross-compilation needed the installed self-contained GNU libraries as an explicit native search path. Cargo was run offline. Native tests, tests using the frozen WASM, formatting and Clippy passed. The WASM rebuild with the host linker override produced SHA-256 `897225e3ed5176f6f640ddf891560b57095bce65102f3b3d231fd41413667173`. The integrated gate expects `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`. The frozen local artifact was restored from a hash-verified copy. Reproducing its bytes is required for a passing `npm run verify`.

Backend verification uses PostgreSQL 17.6 bound to 127.0.0.1. The fixture supports the existing D3-24 concurrency checks and the full backend suite with its restricted review roles. The existing dependencies are resolved from ignored local directories with matching lockfiles.

```powershell
pwsh -NoProfile -File tools/d3-24-offline-controller/pg-fixture.ps1 -Bin '<existing portable PostgreSQL 17.6 bin>' -Backend
```

The remaining reproducibility check concerns the frozen contract build. The Council can review the isolated controller and its synthetic evidence with that gate open. Operational ratification, external manifest approval and real custody require separate decisions.

## Council checkpoint

| Verification | Result |
| --- | --- |
| Historical journal | 2/2 in the original composition. |
| Controller and negative scenarios | 16 distinct cases passed across runs. The final nominal and session replacement cases were repeated after the launcher pin and cleanup changes. |
| Recovery | Confirmed crash and uncertain send both recovered the original identity. An unauthorized read was rejected and an uncertain worker re-entry kept the send and signature counters at one. |
| Full backend with local PostgreSQL | 699/700, zero skips. The remaining browser asset test passed separately after linking the matching local Freighter dependency. A further full rerun was stopped when disk space reached zero. |
| Contract and tools | Formatting, 21 native tests, 22 tests with the frozen WASM, Clippy, four Python tests and the local mock demo passed. The final root run stopped at the native rebuild with Windows error 112. The separate WASM rebuild with the host override produced a different hash, leaving byte reproducibility open. |
| Patch inspection | Ten untracked files passed whitespace, applicable syntax and scoped secret-pattern checks. |

The final nominal inventory is `.test-output/controller-maHcvZ/OFFLINE-export.json`.
SHA-256: `4aaf34e18da0849a6cf9d501f731fd49b45b0c117f5373389332cbbb9ca46ac1`.

## Transaction budget

HISTORICAL_CONFIRMED=5
ORDINARY_LIMIT=19
RUN1_MAX=5
TX20_AUTHORIZED=NO

There are 14 ordinary transactions available. Three new runs of five operations require 15. The offline tests consume zero transactions.
