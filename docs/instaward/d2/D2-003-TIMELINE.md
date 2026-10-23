# D2-003 — Confirmed Testnet history / timeline

> Current decision — 2026-10-22: **D2.4 History = PASS — OWNER ACCEPTED** at reviewed checkpoint `58adca0d52e076b35464f85dae924ab14707e162`. See [owner decision](D2-OWNER-ACCEPTANCE.md). The original technical report and its pre-acceptance counts below are preserved as historical evidence. Current project count: D1 12/12, D2 1/6, D3 0/5, total 13/23. No other D2 criterion is accepted.

2026-10-22 (America/Santiago) · OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.

Branch: `instaward/d2-web-mvp`. Starting task checkpoint: `f9d9fc23488cb9f327959b1bc096db49473e10e6`. Frozen comparison remains `450c21b`; D2 work also compares against `3c7d373ec893a2e66101c4bcfbee354b3a53e434`. D1 branch, evidence, contract and WASM remain frozen.

**Classification: IMPLEMENTED / TESTED / EVIDENCE READY (local implementation + independent Testnet reads).** D2.4 History has not been owner-accepted; no D2 criterion is automatically PASS.

## Owner priority change

Vercel/data-reader/Auth-revocation investigation is **DEFERRED — D2.6 INFRASTRUCTURE**. Existing architecture reports are retained as historical research. No reader role, grants/RLS migration, Auth experiment, Preview credential or Vercel deployment was created or resumed. The earlier CLI-generated empty draft remains ignored under `.tools`, outside the active migration directory and outside Git. It is not an application migration or an applied change.

## Implementation and source of truth

The battery page adds an actual operation history below the three existing current-state lanes. It does not turn the old current-state stepper into fabricated history and does not replace the cycle/attestation, pending Stellar transaction or reward summaries.

New authenticated local API route: **GET /api/batteries/:batteryId/history**. The frontend BFF allows only that additional GET pattern and retains source checks and TESTNET POST denial. POST history is not a route. Existing lifecycle endpoints, coordinator, signer and schema are unchanged.

The server validates the token through the existing Supabase Auth handler, then uses a short **READ ONLY** SQL transaction to check the live session, an existing ACTIVE application user and enabled membership. It never calls `Repository.principal`, provisions users or grants membership. The deployment is server-fixed, not request-selectable. Missing/revoked users, sessions or memberships fail closed. Unknown or other-deployment batteries return 404. Source/mode/deployment/config mismatches are rejected before a history is returned.

The SQL projection reads persisted `stellar_operations` and joins the corresponding durable transport identity/confirmation by deployment and operation ID. The existing `command` column is a scalar enum, not its parameter payload. A fixed SQL CASE returns a lifecycle label only. The response contains no raw command, parameters, evidence bytes, addresses, recipients, signed envelopes, XDR, signatures, session IDs, Auth UUIDs or database diagnostics. No grant or column permission change is involved in this local API.

Kinds: REGISTERED, RETURNED, COLLECTED, RECYCLED, REWARD, plus cancellation when actually persisted. Reward is a separate category. These entries describe verified lifecycle invocations, not an invented exhaustive stream of contract-emitted events.

## Independent Testnet verification

The read-only RPC helper can issue only **getNetwork** and **getTransaction** to the fixed official Testnet endpoint. It exposes no simulation/preparation/sign/send/worker methods. No operational signer was initialized for this evidence read.

For a CONFIRMED entry the verifier requires:

1. Persisted immutable identity network and contract match the fixed deployment.
2. Provider network passphrase is exactly Stellar Testnet.
3. Requested hash equals the returned hash and the SDK hash recomputed from the public envelope with the Testnet network passphrase.
4. Exactly one contract invocation targets the expected contract, method and Battery ID.
5. RPC SUCCESS agrees with decoded XDR `txSuccess`.
6. Ledger/timestamp are present; any persisted confirmation ledger agrees.
7. SQL operation state is also CONFIRMED.

A missing hash, NOT_FOUND, provider outage, bounded verification timeout, wrong identity, wrong invocation, failed transaction or pending SQL state stays visible as **UNVERIFIED** with a bounded reason. Confirmed failure is identified as FAILED, never promoted to success. NOT_FOUND may mean provider retention, not proof that a transaction never existed. The budget is 12 seconds, with up to five read requests per batch and bounded response bytes; entries not checked within it remain UNVERIFIED.

Chronological order uses independently observed ledger close time when available, otherwise the explicitly labelled SQL creation time, with operation ID as a stable tie break. Both timestamps remain distinguishable. The response is bounded to the first 100 persisted operations and flags truncation; this historical fixture has five and is not truncated.

## Historical fixture and observed evidence

Fixture: `BYE-W1-002-64257020134D4A0F` (existing USER-1 lifecycle; USER2 was not used).

Deployment: `5c0cad2f-5f25-4216-8068-6cb9d2d26325`.

Network: `STELLAR TESTNET` / source `TESTNET`.

Contract: `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`.

RPC/SQL observation completed: `2026-10-23T00:41:50.733Z`.

| Entry | SQL state | Independent result | Ledger | Ledger time (UTC) | Testnet reference |
| --- | --- | --- | --- | --- | --- |
| REGISTERED | CONFIRMED | SUCCESS / CONFIRMED | 5281390 | 2026-10-19T17:22:17.000Z | [ec0f231a61f2c0fa8b1092adae475f6da0f649a2085ee4783fe825ff65b01a27](https://stellar.expert/explorer/testnet/tx/ec0f231a61f2c0fa8b1092adae475f6da0f649a2085ee4783fe825ff65b01a27) |
| RETURNED | CONFIRMED | SUCCESS / CONFIRMED | 5299532 | 2026-10-20T18:34:07.000Z | [4d7aa3b0e656692d0c8467ff08cc5e2edf6d8563290171bc06e2c39e9c0452e2](https://stellar.expert/explorer/testnet/tx/4d7aa3b0e656692d0c8467ff08cc5e2edf6d8563290171bc06e2c39e9c0452e2) |
| COLLECTED | CONFIRMED | SUCCESS / CONFIRMED | 5314096 | 2026-10-21T14:47:47.000Z | [e105a8dc4072bc601c65d53cf694ca834aa5ff7e4b6457ecb9cb4c980b0f6d22](https://stellar.expert/explorer/testnet/tx/e105a8dc4072bc601c65d53cf694ca834aa5ff7e4b6457ecb9cb4c980b0f6d22) |
| RECYCLED | CONFIRMED | SUCCESS / CONFIRMED | 5315874 | 2026-10-21T17:15:57.000Z | [9b1042a5b8f31509149f0b0d1effc7329132f1bfea4a3e7a8505df589ad024fb](https://stellar.expert/explorer/testnet/tx/9b1042a5b8f31509149f0b0d1effc7329132f1bfea4a3e7a8505df589ad024fb) |
| REWARD | CONFIRMED | SUCCESS / CONFIRMED | 5315915 | 2026-10-21T17:19:22.000Z | [d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02](https://stellar.expert/explorer/testnet/tx/d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02) |

[Sanitized machine-readable evidence](D2-003-TIMELINE.json) includes operation IDs and both timestamps. All five historical entries were independently confirmed, without creating any new lifecycle or replaying a transaction.

## Reproduction

After reviewing existing local DEV SQL configuration, run from the repository root:

```
node --experimental-strip-types scripts/d2-history-evidence.mts
```

The script is deliberately fixed to this deployment/battery. It selects the existing USER-1 live SQL session/principal, uses verified TLS, and invokes the same history projection/verifier with read-only SQL. It writes sanitized evidence locally only. It does not start `server.ts`, reconciliation or Secure Store, and never signs or submits. Missing existing USER-1 session or unavailable configuration fails without creating a replacement.

This execution proves real SQL + independent RPC reads through the production history functions and existing SQL session/principal checks. It is **not a fresh authenticated browser/API login or a deployed integration**. HTTP authentication/authorization routing is tested locally with isolated Auth fixtures. No live Supabase Auth experiment or new Auth user/session was created.

## Validation matrix

| Requirement | Verification |
| --- | --- |
| Chronological order | Unit/UI tests; ledger versus SQL time and stable ordering |
| Confirmed transaction | SDK-decoded envelope/result tests plus five independent real RPC reads |
| Missing/unverifiable transaction | NOT_FOUND, outage, missing hash, network/hash/contract/battery/method/ledger/result mismatches, budget exhaustion |
| Lifecycle/reward separation | Unit/UI tests; history is separate from all three existing lanes |
| No MOCK in TESTNET | Mode/deployment rejection in local HTTP/SQL tests and frontend source validation |
| Unknown battery | Actual local HTTP route returns 404, also for MOCK-only battery |
| Empty history | No invented stages or success; no provider call |
| Correct reference | Exact immutable transaction hash; fixed Testnet explorer URL derived by UI |
| Authentication/authorization | Anonymous GET, revoked session, missing principal, disabled membership, wrong deployment, POST history rejection |
| No read-triggered mutation | Actual history SQL observed; zero INSERT/UPDATE/DELETE/DDL, no automatic provisioning |
| Backend targeted suite | 26/26 PASS |
| Frontend tests / typecheck / lint / build | 123/123 PASS (9 files); typecheck, lint and production build PASS |
| Root verification | PASS: backend 174/174, TypeScript, Rust native/WASM, release build, fmt/Clippy, Python 4/4 and MOCK demo SENT / 10 GREEN-TEST |
| Secret audit / diff check | PASS; 16-file scope audit, no credential findings; staged diff/secret audit required before commit; 17 client bundle artifacts and frontend env allowlist PASS |

A first frontend run completed 98 tests but could not start the worker for the existing UI file (timeout). The complete suite was rerun successfully; no test was skipped or disabled. The final contract-response guard was then checked in the final 123-test run. Production server dependency traces were inspected: no signer/Windows binary or backend runtime path is included.

New tests retain all existing suites. Evidence and public references contain no operational secret or signing material. No screenshot is presented as an authenticated live UI demonstration; controlled rendering tests cover the history and state-lane composition.

## Limits and safety

The timeline is a read-time snapshot, with its own checkedAt timestamp, not an event subscription. A page reload refreshes it. Explorer links are references, not substitute confirmation logic. RPC history retention is bounded; this implementation does not treat old missing receipts as failures or re-submit them. Vercel remains deferred to D2.6; a privileged local DB connection was not uploaded to any cloud deployment. Full public lifecycle operation, A2, D2-004, D2-005, D2-007 and D3 remain outside scope.

The first evidence-script run exposed a CommonJS/ESM import mismatch for `pg`, before any SQL/RPC work. The import was corrected; the subsequent successful run produced the five receipts above. No dependency or lockfile changed.

New Stellar transactions: **0**. New operational signatures: **0**. New broadcasts: **0**. New lifecycle/reward: **0**. Supabase schema/RLS/roles/credential changes: **0**. Contract/WASM changes: **0**. Main merge: **NO**. Tags changed: **NO**. The protected custody audit and sync utility remain untracked and outside commits.

Stellar Raven stellarDocs was consulted first for chain-data/XDR semantics; the pinned SDK and existing frozen ABI match the verified invocations. Relevant official references: [getTransaction and bounded retention](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction), [Horizon XDR structure](https://developers.stellar.org/docs/data/apis/horizon/api-reference/structure/xdr). No protocol incompatibility or contract change was found.

Project status: **D1 12/12 PASS (OWNER ACCEPTED); D2 0/6 formally accepted; D3 0/5; total 12/23**. No Stellar/SDF/Instawards acceptance or payment is asserted. STOP after D2-003.
