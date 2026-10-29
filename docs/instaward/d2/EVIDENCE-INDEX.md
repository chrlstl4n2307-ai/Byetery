# D2 evidence index

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT · started 2026-10-22 by explicit owner authorization.

Branch: `instaward/d2-web-mvp`. Start: `3c7d373ec893a2e66101c4bcfbee354b3a53e434`. Frozen pre-sprint comparison: `450c21b`; D2-only changes also compared with the start. D1 branch and historical evidence are preserved.

## Current authoritative owner checkpoint — D2.3 accepted, 2026-10-28

By Christian's explicit [D2.3 owner-acceptance decision](D2-OWNER-ACCEPTANCE.md#d23-owner-acceptance--2026-10-28), **D2.3 — State display = PASS — OWNER ACCEPTED**. Reviewed implementation/evidence: `70e290728b3a60b4506cecd1285749068d296f74`. Basis: [D2-007 report](D2-007-STATE-LANES.md) and [results](D2-007-STATE-LANES-RESULTS.json). [Current machine-readable acceptance](D2-OWNER-ACCEPTANCE.json).

**Current authoritative internal status: D1 12/12 PASS; D2 5/6 PASS; D3 0/5; TOTAL 17/23.** Accepted D2: **D2.1, D2.2, D2.3, D2.4, D2.5**. Only **D2.6 — Review access** remains pending. The four prior D2 acceptances retain their original decisions and dates.

This is internal Byetery owner acceptance only, not Stellar/SDF/Instawards acceptance, approval, certification or payment. Documentation only; implementation and Testnet state are unchanged. New transactions, operational signatures and broadcasts: **0**. No USER2, main merge or tag change. **STOP: do not begin D2.6 automatically.**

## D2.6 local hosted package — D2-008B2, no acceptance change

Owner-authorized [DIRECT_REVIEW local package](D2-008B2-DIRECT-REVIEW-LOCAL.md), [sanitized results](D2-008B2-DIRECT-REVIEW-LOCAL-RESULTS.json): **DIRECT_REVIEW HOSTED PACKAGE LOCALLY READY**. Separate frontend server-only code, pure DTOs, exact review routes and EXECUTE-only local SQL reuse frozen B1 without backend/contract/signer changes. Auth is authoritative `getUser` before SQL with Strategy A; review access and individual battery scope are intersected with current principal/membership. History uses persisted facts plus bounded fixed-host read verification; CI uses recorded Horizon and explicitly synthetic RPC fixtures, not live liveness claims. Evidence V1 is authenticated fixed-input SSR; ADMIN's sole business write is a WAITING synthetic intent, with no adoption/processing route.

Final local verification: **343/343 backend**, including **31 B1**; **274/274 frontend** (110 B2, 164 retained); real PostgreSQL B2 **11/11**; Rust native **21**, WASM-feature **22**, release/fmt/Clippy, unchanged frozen WASM; Python **4/4**, MOCK demo, both Next builds, manifest/bundle/checksum-secret audits and whitespace PASS. DIRECT_REVIEW build contains exactly 15 review paths, zero server actions and zero Stellar code in 14 browser chunks. All 125 baseline protected-file hashes match; fixture DBs cleaned and local PostgreSQL stopped. Existing dependency advisories/deprecation and raw-URL normalization limits are documented, not silently waived.

**No D2.6 PASS: D1 12/12; D2 5/6; D3 0/5; TOTAL 17/23 unchanged.** Remote Supabase mutations, real Auth experiments, Vercel changes, live Testnet calls in tests, operational signatures, transactions and broadcasts: **0**. No USER2/main merge/tag change. B2A, reviewed remote SQL/credentials, plan-verified Protection **before deploy**, hosted route/Auth/origin/root checks and live verification remain separate gates. **STOP; no B2A started.** Earlier B1/A checkpoint descriptions below remain historical.

## D2.6 local foundation — D2-008B1, no acceptance change

Owner-authorized [registration intents and explicit owner adoption](D2-008B1-REGISTRATION-INTENTS.md), [sanitized results](D2-008B1-REGISTRATION-INTENTS-RESULTS.json): **LOCAL FOUNDATION READY**. Council Candidate B keeps WAITING exclusively in a separate private intent; Foundation is created atomically only on local owner adoption, preserving the reserved UUID. This supersedes D2-008A's proposed waiting representation without changing that historical report. Restricted functions and real PostgreSQL locks/RLS are tested locally; GAP2 is reused unchanged. Complete backend **343/343**, B1 **31/31**, GAP1/role/state focused **64/64**, real PG GAP2B **2/2**, Rust/native/WASM/release/fmt/Clippy, frozen hash, Python **4/4** and MOCK demo PASS. No remote SQL/Auth/Vercel/chain mutations or operational signing/broadcast.

**D2.6 remains pending / NOT OWNER ACCEPTED. D1 12/12; D2 5/6; D3 0/5; TOTAL 17/23 unchanged.** SQL is a separate local audit/apply artifact, not applied remotely. Hosted Auth/session/DIRECT_REVIEW, Preview, live verification and the separately authorized assisted registration remain future gates. STOP after B1 publication; do not start B2.

## D2.6 planning — D2-008A, no acceptance change

Owner-authorized [review-access final preflight](D2-008A-REVIEW-ACCESS-PREFLIGHT.md), [sanitized machine-readable plan](D2-008A-REVIEW-ACCESS-PREFLIGHT.json): **DESIGN ONLY / NOT DEPLOYED**. Current Vercel/Supabase metadata were refreshed read-only. Recommended architecture B uses a restricted Next/Vercel review adapter and human-assisted local ADMIN signing; the least-privilege DB boundary and first-dispatch owner-adoption gate are proposed, not implemented. No hosted signers are required by the minimal D2.6 review plan.

**D2.6 remains HOLD / NOT OWNER ACCEPTED. D1 12/12; D2 5/6; D3 0/5; TOTAL 17/23 unchanged.** No cloud/Auth/grant/RLS mutation, deployment, chain call, new Testnet transaction, operational signature or broadcast. Exact future implementation/cloud/assisted-registration scopes require new explicit owner authorization. Historical readiness reports and all acceptance sections remain unchanged. STOP after documentation publication.

## Earlier checkpoint retained — D2 4/6

The following earlier acceptance section and all subsequent task snapshots retain their original wording/counts as history. The D2.3 decision above is authoritative for current status.

## Current owner acceptance — 2026-10-28

By Christian's explicit [owner-acceptance checkpoint](D2-OWNER-ACCEPTANCE.md#d2-owner-acceptance--2026-10-28), **D2.1 — Roles / permissions**, **D2.2 — QR lookup / QR grants no authority**, and **D2.5 — Evidence V1 integrity verification** are now **PASS — OWNER ACCEPTED**. **D2.4 — History** retains its prior acceptance of 2026-10-22. [Machine-readable acceptance](D2-OWNER-ACCEPTANCE.json).

**Current official internal status: D1 12/12 PASS; D2 4/6 PASS; D3 0/5; TOTAL 16/23.** Accepted D2: **D2.1, D2.2, D2.4, D2.5**. Pending: **D2.3, D2.6**. This is Byetery owner acceptance, not Stellar/SDF/Instawards approval or payment.

This checkpoint records acceptance decisions only. No implementation or infrastructure changes, live Testnet lifecycle, operational signature or broadcast. D2.3 and D2.6 are not started. Prior reports retain the technical results, caveats and acceptance counts applicable when each was created; the dated decision above is authoritative for current status.

## Task evidence — historical checkpoint results preserved

| Task | Artifact | Technical result | Limits / publication |
| --- | --- | --- | --- |
| D2-001 | [Implementation and tests](D2-001-REPORT.md) | IMPLEMENTED / TESTED locally | Commit `6e5ee6adbf573cb2d792242bd275644b2be2ed36` was published via checkpoint f9d9fc2; deployed authenticated read remains deferred |
| D2-001 | [Existing SQL read-model observation](D2-001-READ-MODEL.json) | TESTNET / RECYCLED / SENT in read-only SQL | Projection, not a new chain read or transaction; not a browser/Auth end-to-end proof |
| D2-002 | [Three separate state lanes and tests](D2-002-REPORT.md) | IMPLEMENTED / TESTED locally; 102/102 frontend tests | Commit `41fbd44473edf36ac04c9c8629393198baf87fb4` was published via checkpoint f9d9fc2; no inferred receipt or success from pending/unknown |
| D2-003 | [Timeline implementation and verification](D2-003-TIMELINE.md), [sanitized receipts](D2-003-TIMELINE.json) | IMPLEMENTED / TESTED / EVIDENCE READY | Historical D1 fixture, five independent SUCCESS reads; frontend 123/123, backend 174/174; no new Stellar transaction or D2 acceptance |
| D2-004 | [Role/permission matrix, historical findings and GAP1/GAP2A/GAP2B fixes](D2-004-PERMISSION-MATRIX.md), [historical sanitized SQL/chain reads](D2-004-ROLE-READS.json) | IMPLEMENTED / GAP 1+2 CLOSED | Authority serialized through first durable dispatch intent; prior 2/2 PostgreSQL races and joint expiry/absence proof retained. D2-005 evidence now completed below; no automatic owner acceptance |
| D2-005 | [Role + QR adversarial report](D2-005-ROLE-QR-ADVERSARIAL.md), [sanitized results and screenshot hashes](D2-005-ROLE-QR-RESULTS.json) | TESTED / EVIDENCE READY; D2.1 ACCEPT candidate, D2.2 ACCEPT candidate | Real Next/Chromium/API/SQL/MOCK fixture flow; backend focused 29/29 and 54 zero-business-effect rejection checks; frontend focused 22/22; browser 6/6; complete backend 236 PASS + 2 optional PG skips, frontend 145/145, TypeScript/lint/build, Rust/WASM/fmt/Clippy, Python 4/4 PASS. One minimal early-eligibility fix, separate commit; no new live Stellar/Auth/remote SQL or owner acceptance |
| D2-006 | [Evidence V1 integrity verifier and limits](D2-006-EVIDENCE-V1.md), [machine-readable results](D2-006-EVIDENCE-V1-RESULTS.json), [exact disclosed historical bytes](evidence/d2-006/historical-recycling.json) | IMPLEMENTED / TESTED / EVIDENCE READY; D2.5 ACCEPT candidate | Original D1 RECYCLING manifest, 398 bytes; intact VERIFIED, one-byte mutation NOT_VERIFIED against unchanged commitment; separate official Horizon Testnet SUCCESS/invocation provenance. Pure offline verifier, unchanged frozen encoder, no new transaction/signature/broadcast or owner acceptance |
| D2-007 / D2.3 | [State-lanes report](D2-007-STATE-LANES.md), [results and screenshot hashes](D2-007-STATE-LANES-RESULTS.json) | IMPLEMENTED / TESTED / EVIDENCE READY; **D2.3 ACCEPT candidate** | Pre-fix actual detail/profile terminal gap reproduced; separate latestTerminalOperation, unchanged unresolved gating, rejection provenance; backend focused 23/23, frontend focused 39/39, seven real Chromium captures (8/8 tests), backend 310 PASS + 2 optional PG skips, frontend 164/164; no new live Stellar action or owner acceptance |
| D2.3 owner acceptance — 2026-10-28 | [Current authoritative decision](D2-OWNER-ACCEPTANCE.md#d23-owner-acceptance--2026-10-28), [acceptance JSON with prior snapshot](D2-OWNER-ACCEPTANCE.json) | **D2 5/6 PASS — OWNER ACCEPTED** | Newly accepts D2.3 from reviewed checkpoint 70e2907; D2.1/D2.2/D2.4/D2.5 retained; D2.6 pending. Documentation only; total 17/23; no implementation or Testnet action |
| Owner acceptance — 2026-10-28 | [Dated decision and all six D2 criteria](D2-OWNER-ACCEPTANCE.md#d2-owner-acceptance--2026-10-28), [current acceptance JSON](D2-OWNER-ACCEPTANCE.json) | **D2 4/6 PASS — OWNER ACCEPTED** | Newly accepts D2.1/D2.2 from D2-005 and D2.5 from D2-006; retains D2.4; D2.3/D2.6 pending. Documentation only; official total 16/23; no main merge/tags |
| Preview | [Architecture/readiness assessment](D2-VERCEL-READINESS.md) | DEFERRED — D2.6 INFRASTRUCTURE | Prior access blocker retained as research; no deployment attempted |
| D2-VERCEL-001 | [Read-only API architecture gate](D2-VERCEL-READONLY.md) | DEFERRED — D2.6 INFRASTRUCTURE | Preserved architectural research; no reader role, grants/RLS migration, Auth experiment or Preview credentials resumed |

## Historical decisions and task notes — superseded counts preserved

The snapshots below predate the 2026-10-28 owner-acceptance checkpoint. Their earlier counts and candidate wording are historical, not the current acceptance state.

No criterion automatically becomes PASS. By explicit [OWNER ACCEPTANCE — 2026-10-22](D2-OWNER-ACCEPTANCE.md), **D2.4 — History = PASS — OWNER ACCEPTED**. Current owner acceptance: **D1 12/12; D2 1/6; D3 0/5; total 13/23**. D2.1/D2.2/D2.3/D2.5/D2.6 are not accepted. No organizer approval/payment asserted. A local test PASS is not owner acceptance or proof of a hosted integration.

Secret material, local environment files, custody audit, signing payloads and `tools/sync_obsidian.py` do not belong in this evidence package. No new lifecycle, reward, signature or broadcast is evidence for this task.

Owner priority change (2026-10-22): core D2 resumed for D2-003 only. Data-access/Auth/Preview investigation is deferred to D2.6. Historical research remains available; it does not authorize infrastructure changes.

Subsequent owner decision (2026-10-22): D2.4 accepted and D2-004 read/verify authorized. D2-004 stopped on the documented fail-closed gaps. D2-005 has not started; no permission fix, role change or new Testnet transaction was performed.

Historical owner decision after Council review: GAP1 fix only, policy B (continuous until broadcast), D1 DO NOT REOPEN. At that checkpoint application-request USER checks were implemented and GAP2 transport/signing enforcement remained pending. No new real transaction/signature/broadcast, remote Supabase change, Vercel work or D2-005 was authorized/performed for that fix.

Owner authorization **2026-10-28 — RESUME FORMAL D2 / GAP 2A**: demo work was preserved separately on local `demo/local-testnet-ui` at `b4d873851699a7f0f6ec0779eacc802a1ec44ee1`, including demo-code parent `46a1086019bbfa95efb8767cc9b2441842ea838a`. Formal implementation resumed from public `d5e53dd589a5cb8b5dd891b78d2fed901fe2361d`. Demo code/evidence are excluded from the formal patch and push.

The [GAP 2A — QUEUED AUTHORITY REVALIDATION section](D2-004-PERMISSION-MATRIX.md#gap-2a--queued-authority-revalidation) documents the red ADMIN regression, single command-to-authority policy, exact original SQL principal, enabled current membership, actor bindings and reward authority pinned to the immutable original request. All seven valid authority paths have positive controls and revocation regressions; collector/recycler actor mismatches fail closed. Authorization failures use `AuthorizationRevoked` (HTTP 403), before preparation/signing, with the existing explicit unsigned recovery boundary retained.

Historical GAP2A verification was offline: disposable migrated PGlite and RPC/signer tripwires. Zero new real Stellar transactions, operational signatures, broadcasts or remote Supabase access. No schema/RLS, contract/WASM source, signer, D1, USER2, Vercel, GAP2B or D2-005 change occurred at that checkpoint. Official internal acceptance remained **D1 12/12; D2 1/6; D3 0/5; total 13/23**. Policy B was not fully closed while GAP2B remained pending.

Owner authorization **2026-10-28 — GAP 2B / CONTINUOUS AUTHORITY UNTIL FIRST BROADCAST**: implemented from `615ea9b87544e80b07fb9469b1a81f295f76bdbf`. [Current GAP2B evidence](D2-004-PERMISSION-MATRIX.md#gap-2b--continuous-authority-until-first-dispatch) records current-membership FOR SHARE inside the first dispatch-intent SQL transaction, shared original-principal authority policy, both existing internal revocation paths, atomic signed-READY holds, zero new state/migration, strict expiry/NOT_FOUND/non-application conjunction, retained source exclusion and unchanged post-boundary same-hash reconciliation.

**SIGNER LEDGER PATH = PASS.** Fixed Testnet RPC supplies currentLedger; authorization expiration remains server-derived and bounded. No signer/window changes. The threat model explicitly excludes externally stolen signed XDR/auth-entry submission. Portable PostgreSQL was separately owner-authorized for loopback fixtures only, and both race winners were demonstrated with real row-lock waits. Final complete validation: **209/209 backend with zero skips**, **123/123 frontend**, TypeScript, Rust native/WASM/release/fmt/Clippy, **4/4 Python**, MOCK demo, secrets and whitespace PASS. Historical blocked, GAP1 and GAP2A evidence is preserved and clearly marked superseded where its status is old.

Historical GAP2B closing status: **D2-004 = IMPLEMENTED / GAP 1+2 CLOSED / D2-005 REQUIRED**. At that checkpoint D2-005 had not started and D2.1 was not automatically PASS. **D1 12/12; D2 1/6; D3 0/5; total 13/23** remained unchanged. Live Stellar transactions/signatures/broadcasts: **0**. No remote Supabase, contract/WASM source, Rust signer, schema/RLS, roles, USER2, Vercel, main/tag or D1-evidence change occurred.

Owner-authorized **D2-005 — 2026-10-28** is now complete for review. A pre-fix HTTP regression found ineligible collection/recycling could return 409 after persisting rejected work/evidence and preparing the mock; a four-line Coordinator state/current-request/association check now rejects before these effects. No authority locking/revocation code changed. The report distinguishes fixture Auth, actual local HTTP/SQL, the application mock and the independent frozen Rust suite. Four actual interfaces and the production QR target were exercised in Chromium with no external connections; QR-only/API attacks are rejected. **UI visibility receives zero authorization credit. RATE LIMIT: NOT REQUIRED BY D2.1/D2.2.** No rate-limit infrastructure was added.

Current **D2-004 = IMPLEMENTED / GAP 1+2 CLOSED**. Technical recommendations: **D2.1 ACCEPT / D2.2 ACCEPT**, awaiting Christian's explicit owner decision. Official counts remain **D1 12/12; D2 1/6 (D2.4 only); D3 0/5; total 13/23**. No D2.3 acceptance, D2-006, D2.6/Vercel, D3, merge or tag change is authorized/performed by D2-005. New Testnet transactions, operational signatures, broadcasts and remote Supabase connections/mutations: **0**.

Owner-authorized **D2-006 — 2026-10-28** is complete for technical review. The exact original synthetic D1 manifest and frozen Evidence V1 XDR encoding are preserved. The pure function/CLI compares byte integrity only; a separate read-only harness reuses D2.4 receipt verification and checks the exact request/actor/Evidence argument XDR. RPC NOT_FOUND outside retention was not treated as failure: official Horizon Testnet independently confirms the original successful recycling transaction and matching commitment. No raw envelope/signature material is disclosed. The decoded fixture contains no PII or secrets.

**D2.5 ACCEPT candidate**, pending explicit owner acceptance. Current official acceptance remains **D1 12/12; D2 1/6 (D2.4 only); D3 0/5; total 13/23**. D2.1/D2.2 remain ACCEPT candidates; D2.3 and D2.6 remain pending. D2-006 introduced no live Stellar transaction, operational signature, broadcast, remote Supabase access/mutation, contract/WASM source or ABI change, schema/RLS, role/signer change, USER2 use, main merge or tag move. Integrity verification does not prove a physical event or truthfulness. STOP; no D2.3 acceptance or D2.6/Vercel work.

Owner-authorized **D2-007 / D2.3 — 2026-10-28** is complete for technical review. A real pre-fix read-model gap hid CONFIRMED/REJECTED as NO_PENDING_OPERATION in detail/profile and rendered UI. The minimal read-only correction preserves unresolved pendingOperation and adds a separate latestTerminalOperation for display. Actual failed transport provenance is distinguished from application rejection; no error code alone manufactures chain failure. Priority, deterministic ties, existing action controls and all three independent lanes are tested. Local fixtures and the replay of previously accepted historical Testnet evidence are explicitly labeled.

**D2.3 ACCEPT candidate, not OWNER ACCEPTED. Official counts remain D1 12/12; D2 4/6 (D2.1/D2.2/D2.4/D2.5); D3 0/5; TOTAL 16/23.** D2.6 remains pending and is not started. New Testnet transactions, operational signatures, broadcasts, live chain/remote SQL reads, USER2 use, contract/WASM/ABI, schema/RLS, signer/role and authorization/worker/lease changes: **0**. Protected files and all prior owner acceptance decisions are unchanged. No main merge or tag change. STOP after D2.3 evidence.
