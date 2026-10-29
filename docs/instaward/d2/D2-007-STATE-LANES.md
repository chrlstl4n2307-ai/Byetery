# D2-007 — D2.3 state lanes acceptance evidence

Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. Date: 2026-10-28 (America/Santiago).
Starting public checkpoint: `66e1a859e862e5d781cf2021e8345e93b894c64d`, branch `instaward/d2-web-mvp`.
Technical recommendation only. D2.3 is not OWNER ACCEPTED by this report.
Implementation commit: `13a373db0dcfc4588851e4af0e13fa4edc99607b`.

## Scope

D2.3 only: actual battery-detail/profile SQL read models and rendering of independent lifecycle, transaction and reward lanes. The story is **battery page → authenticated local API fixture bridge → actual SQL read model → StateSummary/TransactionLane**. No new endpoint, transition, authority policy, GAP2/worker/lease, contract/ABI, signer, schema/RLS, dependency or hosted infrastructure change. D2-007 has no pre-existing report; earlier stop-scope mentions are preserved.

## Pre-fix characterization

Before production edits, an ephemeral database with all existing migrations and the existing HTTP/Coordinator/MockStellarService harness exercised the actual GET detail and profile paths. Their valid local fixtures reproduced the owner's suspected gap at the starting checkpoint.

| Case | Durable operation | Before detail/render | Before profile |
|---|---|---|---|
| A | SUBMITTED | PENDING, present | Present |
| B | UNKNOWN | UNCERTAIN, present | Present |
| C | CONFIRMED recycling | NO_PENDING_OPERATION; terminal absent | Terminal absent |
| D | UNKNOWN reward | UNCERTAIN, present | Present |
| E | REJECTED reward | NO_PENDING_OPERATION; terminal absent | Terminal absent |
| F | CONFIRMED reward | NO_PENDING_OPERATION; terminal absent | Terminal absent |
| G | REJECTED after COLLECTED | NO_PENDING_OPERATION; terminal absent | Terminal absent |
| Q | QUEUED | QUEUED, present | Present |
| N | No recorded operation | NO_PENDING_OPERATION; no fabricated success | No own request |

[Preserved pre-fix disclosure](evidence/d2-007/pre-fix-read-models.json). Backend characterization: 18 reported tests, 9 PASS / 9 FAIL (eight missing-terminal subchecks plus failed parent). Actual StateSummary renders from those read results: 9 tests, 5 PASS / 4 FAIL, exactly C/E/F/G. These are the intended red regressions, not claims of a live Testnet failure.

## Read-model behavior

`Repository.view()` and profile reads now return **latestTerminalOperation** separately from **pendingOperation**. Both queries remain authenticated/deployment/battery scoped and read-only. No new grant, state or database column is introduced. The terminal DTO contains only operation ID, scalar command enum, state and failureScope; never parameters/command payload, signer material, nonce, raw error diagnostics, envelope or credentials.

`pendingOperation` retains exactly the unresolved states QUEUED/AWAITING_AUTH/READY/SUBMITTED/UNKNOWN. `latestTerminalOperation` selects existing durable CONFIRMED/REJECTED records. Selection orders by `created_at DESC, id DESC`; presentation always prefers unresolved work even when a terminal is newer. No chronology is inferred from state names. CANCELLED_LOCAL is not manufactured into a confirmed/failed Stellar result.

The existing processors establish application CONFIRMED only after confirmed projection; this patch reads that durable state without recreating projection or consulting lifecycle/reward to infer transaction success. For rejection provenance, **failureScope=CHAIN** requires the matching durable `testnet_work` state CONFIRMED_FAILED with non-null confirmation. An error code alone is insufficient. All other durable REJECTED operations are explicitly application rejections, not evidence of a confirmed Stellar failure. HTTP validation errors with no operation row create no displayed transaction.

The frontend selector is **display only**: `pendingOperation ?? latestTerminalOperation ?? null`. Existing mutation blocking, polling and retry logic still depend solely on unresolved pendingOperation. Confirmed/rejected terminals do not permanently disable a legitimate next action. Optional DTO typing retains compatibility with older responses without the new field.

## Three-lane model

| Scenario | Lifecycle | Transaction | Reward | False success? |
|---|---|---|---|---|
| A — submitted recycling | COLLECTED | PENDING | NOT_ELIGIBLE | No |
| B — unknown recycling | COLLECTED | UNCERTAIN | NOT_ELIGIBLE | No |
| C — recycling confirmed, unpaid | RECYCLED | CONFIRMED | PENDING | No |
| D — unknown reward operation | RECYCLED | UNCERTAIN | PENDING; attempt UNKNOWN | No |
| E — rejected reward attempt | RECYCLED | FAILED; application rejection | PENDING; attempt FAILED | No |
| F — confirmed reward projection | RECYCLED | CONFIRMED pay_reward | SENT | No |
| G — rejection after confirmation | COLLECTED | FAILED; application rejection | NOT_ELIGIBLE | No |
| H — unrecognized raw state | COLLECTED | UNCERTAIN | NOT_ELIGIBLE | No |
| Q — queued work | COLLECTED | QUEUED | NOT_ELIGIBLE | No |
| N — no available operation | REGISTERED | NO_PENDING_OPERATION | NOT_ELIGIBLE | No |
| Confirmed pay_reward without SENT projection (UI boundary test) | RECYCLED | CONFIRMED | PENDING | No |
| Durable chain-failure branch (offline LOCAL_FAKE transport) | RECYCLED | FAILED; chain-result classification | PENDING; attempt FAILED | No |

A–G/Q/N are actual isolated HTTP/SQL/MOCK reads, [disclosed here](evidence/d2-007/state-read-models.json). H is a deliberately unrecognized frontend boundary value: the SQL enum is not weakened to allow it. The inconsistent confirmed-pay_reward/PENDING-reward boundary test intentionally proves no reward inference; it is not asserted to be a valid atomic production projection. The chain-failure branch uses the existing offline fake worker, not a live Stellar failure. Operation UUIDs in public local disclosures are replaced with explicit display aliases; actual ID selection is asserted against SQL separately.

## Pending

QUEUED remains **En cola**. AWAITING_AUTH/READY/SUBMITTED/PENDING render **Pendiente** and explicitly state that preparation/submission does not confirm the result. Confirmed lifecycle and reward values stay independent. Pending work retains existing action blocking; a terminal does not.

## Uncertain

UNKNOWN/UNCERTAIN and unrecognized raw values render **Resultado incierto — UNCERTAIN**. The UI says uncertainty is neither confirmed success nor confirmed failure. A newer confirmed terminal cannot hide unresolved UNKNOWN. Existing SENT is not erased by uncertainty of another operation.

## Confirmed

CONFIRMED comes from an existing durable operation record, including the unchanged Coordinator projection path and durable Testnet projection path. The absence of pending work is not confirmation. RECYCLED with PENDING reward shows no sent label, amount or completed cycle. A confirmed transaction DTO alone cannot replace the confirmed reward projection.

## Failed

REJECTED/FAILED render **Fallida — FAILED**, with explicit scope. Application rejection is qualified as **not** a confirmed Stellar failure. Only a corresponding durable failed transport result earns chain-failure wording. An AuthorizationRevoked operation remains an application rejection. Validation before operation creation invents no blockchain failure. A failed reward attempt leaves RECYCLED/PENDING intact; no SENT or success amount is inferred.

## Historical Testnet confirmed control

[Archived control](evidence/d2-007/historical-control.json) reuses the already accepted [D2.4 history evidence](D2-003-TIMELINE.json), without new RPC, Horizon, SQL or contract calls. Classification: **HISTORICAL TESTNET CONFIRMED — archived accepted evidence replay, not a fresh read**.

Battery `BYE-W1-002-64257020134D4A0F`; deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`; contract `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`.

Confirmed `pay_reward`: [d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02](https://stellar.expert/explorer/testnet/tx/d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02), ledger **5315915**, 2026-10-21T17:19:22Z, archived SUCCESS/CONFIRMED. It is a positive rendering control only; it is not altered to manufacture pending/unknown/failed history. D2.4 acceptance is unchanged.

Raven was consulted first for Stellar semantics. Its official [RPC submission guide](https://developers.stellar.org/docs/build/guides/transactions/submit-transaction-wait-js) distinguishes RPC outcomes and explicitly labels its fail-hard example rudimentary. No example was used to replace Byetery's durable UNKNOWN/reconciliation rules. The patch changes no Stellar protocol behavior.

## Browser/UI evidence

**8/8 browser tests PASS**, seven real production-build page captures in Chromium 156.0.8078.4.

| Case | Screenshot | Classification |
|---|---|---|
| A | [01-pending.png](evidence/d2-007/01-pending.png) | LOCAL FIXTURE STATE — HTTP/SQL/MOCK |
| B | [02-uncertain.png](evidence/d2-007/02-uncertain.png) | LOCAL FIXTURE STATE — HTTP/SQL/MOCK |
| C | [03-confirmed-reward-pending.png](evidence/d2-007/03-confirmed-reward-pending.png) | LOCAL FIXTURE STATE — HTTP/SQL/MOCK |
| E | [04-failed-reward-pending.png](evidence/d2-007/04-failed-reward-pending.png) | LOCAL FIXTURE STATE — HTTP/SQL/MOCK |
| F | [05-confirmed-reward-sent.png](evidence/d2-007/05-confirmed-reward-sent.png) | LOCAL FIXTURE STATE — HTTP/SQL/MOCK |
| N | [06-no-operation.png](evidence/d2-007/06-no-operation.png) | LOCAL FIXTURE STATE — HTTP/SQL/MOCK |
| HISTORICAL | [07-historical-testnet-confirmed.png](evidence/d2-007/07-historical-testnet-confirmed.png) | Archived accepted Testnet evidence replay |

Screenshot hashes and measured lane values are in [machine-readable results](D2-007-STATE-LANES-RESULTS.json). All seven raw captures were visually inspected; no image editing or redaction was needed.

The harness reuses the existing installed Playwright/Chromium, local migrated SQL fixtures and real Next pages/API read implementation. A fixture Auth bridge substitutes local session/API routing: **this is not a real Supabase login, frontend BFF-cookie proof, hosted evaluator path or live Testnet lifecycle**. The existing BFF forwards the new read field without a field whitelist removing it; existing proxy tests remain in the complete frontend suite. No session cookie or user credential is generated for this evidence.

Visible screenshot annotations outside StateSummary identify local fixtures or the archived historical control; they never alter lane contents/results. The real component renders the lane values. External browser connections are blocked, and screenshots contain no emails, Auth UUIDs or credentials. Read-only fixture visits must leave the business snapshot unchanged.

## No-false-success assertions

Assertions use the exact scoped transaction label, avoiding substring confusion between PENDING and NO_PENDING_OPERATION. Current lifecycle is checked through `aria-current="step"`, not future steps visible in the timeline. UNKNOWN/FAILED/QUEUED/NO_PENDING_OPERATION cannot render transaction **Confirmada**. PENDING reward cannot show **Recompensa enviada**, SENT, an amount or **Ciclo completado**. Completion still requires RECYCLED **and** confirmed SENT.

The UI retains the authorized-lifecycle-attestation disclaimer. RECYCLED does not certify physical recycling or environmental compliance. **10 GREENTEST** appears for confirmed SENT in the historical control and is explicitly a Testnet demonstration asset with no monetary value. MOCK fixtures retain their simulated GREEN-TEST label.

## Limitations

Local intermediary/negative states are isolated fixtures, not evidence that those outcomes were broadcast on Testnet. The historical positive control is the prior accepted observation, not a current chain freshness claim. The terminal display is an application read projection, not an independent receipt verifier; D2.4 history retains its separate verification role. No private evidence payload is read for display. No review-access deployment or D2.6 work is implied.

## Test results

| Check | Result |
|---|---|
| Focused actual read-model tests | 23/23 PASS |
| State-lanes/frontend acceptance tests | 39/39 PASS (20 original + 19 new) |
| Browser | 8/8 PASS, seven captures |
| Complete backend | 312 total: 310 PASS, 0 FAIL, 2 optional PostgreSQL skips |
| Complete frontend | 164/164 PASS; same 164/164 serial clean-shutdown rerun |
| Backend/frontend TypeScript | PASS / PASS |
| Frontend lint / production build | PASS / PASS |
| Rust native | 20 unit + 1 wrong-actor PASS |
| Rust wasm-tests feature | 20 unit + 1 wrong-actor + 1 WASM constructor PASS |
| wasm32v1-none release / rustfmt / Clippy | PASS / PASS / PASS |
| Python | 4/4 PASS |
| Existing MOCK demo | Full lifecycle, SENT, simulated 10 GREEN-TEST PASS |

The two optional GAP2B PostgreSQL races are not required here: no authority/revocation code changed. Existing tests and prior race evidence remain intact. The default full frontend verify command exited successfully including its production build; parallel worker-shutdown warnings were followed by a clean complete serial rerun without reducing coverage. The first development-server rendering gate timed out; the local production build then passed every browser case, with no package/global configuration change.

Rebuilt WASM: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6` — MATCH. Secret/PII review and whitespace checks are completed before publication.

Reproduction:

```powershell
node --experimental-strip-types --test backend/tests/d2-state-lanes.test.ts
npm --prefix frontend test -- tests/state-lanes.test.tsx tests/d2-state-lanes-acceptance.test.tsx
npm --prefix frontend run build
node --experimental-strip-types --test frontend/browser-tests/d2-state-lanes.test.mjs
npm run verify
npm --prefix frontend run verify
# Optional serial execution of the same complete frontend suite
npm --prefix frontend test -- --maxWorkers=1
```

## D2.3 assessment

**D2.3 ACCEPTANCE CANDIDATE: ACCEPT.** Pending, uncertain, confirmed and failed display are demonstrated. All three lanes remain independent. No tested pending/uncertain/failed case produces false success. This is a technical recommendation only, requiring explicit owner acceptance.

Official owner acceptance stays **D1 12/12; D2 4/6 (D2.1, D2.2, D2.4, D2.5); D3 0/5; TOTAL 16/23**. D2.3 remains pending explicit owner acceptance; D2.6 remains pending and is not started. No Stellar/SDF/Instawards acceptance or payment is asserted.

New Testnet transactions, operational signatures, broadcasts and USER2 use: **0**. No remote Supabase, roles, contract/WASM/ABI, signer, schema/RLS or GAP2 change. Protected custody/sync files remain untouched and untracked. No main merge or tag change. **STOP after D2.3 evidence.**
