# Byetery — Development Log

PRE-SPRINT BASELINE

Inicio oficial del sprint no confirmado. No se asignan avances a Week 1–4 ni se afirma aprobación/pago del Instaward. La clasificación baseline es provisional hasta confirmar la fecha acordada.

Historical detail not reconstructed from available evidence is left unspecified. Migration filenames, file timestamps and commit times do not prove exact work duration. No report below claims a new sprint week.

---

# 2026-09-12 — Consolidation checkpoint

## Date

2026-09-12

## Reporting period

PRE-SPRINT BASELINE — Historical reconstruction / not assigned a funded sprint week.

## Starting state

Validated components existed in separate folders.

## Work performed

Consolidated monorepo, retained contract/checkpoint/WASM, added standard-library Python utilities and MOCK demo.

## Technical changes

Paths, scripts and repository packaging; no changed contract rules.

## Stellar-related changes

Frozen Rust/WASM preserved; no network deployment in this checkpoint.

## Tests executed

Windows report: Rust 20 + repeated native 20 with wasm-tests + 1 constructor; Foundation 50; Python 4; fmt/Clippy/build/demo PASS.

## Results

Checkpoint committed; not sprint completion.

## Problems encountered

Earlier Windows App Control error 4551 in consolidation report; final Windows report supersedes the blocked intermediate status.

## Decisions made

Retain frozen rules and hash; user manually changed Smart App Control; assistant did not change protections.

## Evidence

EV-001

## Deliverable impact

D1: reusable contract/foundation. D2: frontend still reserved. D3: MOCK baseline only.

## Known limitations

No Supabase remote or Testnet app at this point.

## Next step

API/authentication integration.

## Repository state

Branch: historical checkpoint branches; source report referenced above.

Commit: [767e8f45dd13a3bfb9b041ed2fd00a1b8d3381df](https://github.com/chrlstl4n2307-ai/Byetery/commit/767e8f45dd13a3bfb9b041ed2fd00a1b8d3381df).

Git status: historical validation report when recorded; current dirty inventory is in BASELINE-MANIFEST.json. Do not infer historical clean status from today.

---

# 2026-09-13 — HTTP backend checkpoint

## Date

2026-09-13

## Reporting period

PRE-SPRINT BASELINE — Historical reconstruction / not assigned a funded sprint week.

## Starting state

Consolidated Foundation and mock harness.

## Work performed

Implemented typed HTTP API with Supabase DEV sessions, roles, wallet nonce persistence, idempotency and durable mock coordinator.

## Technical changes

Application HTTP migration, private auxiliary tables and safe projections.

## Stellar-related changes

All application operations used MockStellarService, no Soroban execution.

## Tests executed

HTTP 35/35 at this checkpoint; Foundation 50; SQL 82; Rust/WASM, Python and API MOCK demo documented PASS.

## Results

API checkpoint published.

## Problems encountered

See report for integration corrections; no unsupported day-by-day detail reconstructed.

## Decisions made

Validate sessions from server; keep browser base-deny and immutable recipient.

## Evidence

EV-002

## Deliverable impact

D1: off-chain coordinator baseline. D2: API foundation. D3: API MOCK cycle.

## Known limitations

No real Testnet adapter.

## Next step

Connected frontend MVP.

## Repository state

Branch: historical checkpoint branches; source report referenced above.

Commit: [90b7e23081107fcadec0e415da6476b62a4cd41e](https://github.com/chrlstl4n2307-ai/Byetery/commit/90b7e23081107fcadec0e415da6476b62a4cd41e).

Git status: historical validation report when recorded; current dirty inventory is in BASELINE-MANIFEST.json. Do not infer historical clean status from today.

---

# 2026-09-13 — Frontend MVP checkpoint

## Date

2026-09-13

## Reporting period

PRE-SPRINT BASELINE — Historical reconstruction / not assigned a funded sprint week.

## Starting state

HTTP API available in DEV/MOCK.

## Work performed

Created login/dashboard/battery/admin/collector/recycler views and QR lookup; added minimal authenticated reads.

## Technical changes

Next.js UI, typed proxy, HttpOnly session cookies and CSP.

## Stellar-related changes

Web stayed MOCK; no contract/RLS changes for frontend.

## Tests executed

Frontend 33; HTTP 43; typecheck/lint/build; recorded Edge visual MOCK demo PASS.

## Results

Connected web MVP in MOCK.

## Problems encountered

Frontend TypeScript version adjusted for eslint compatibility according to report.

## Decisions made

Frontend consumes API and does not choose blockchain authorizations.

## Evidence

EV-003

## Deliverable impact

D1: API reused. D2: four-role web baseline. D3: MOCK visual cycle only.

## Known limitations

Freighter/camera real E2E not validated.

## Next step

Presentation polish and later integration.

## Repository state

Branch: historical checkpoint branches; source report referenced above.

Commit: [f48759361d89e10bc433a2b6eab5051bf7fe57c2](https://github.com/chrlstl4n2307-ai/Byetery/commit/f48759361d89e10bc433a2b6eab5051bf7fe57c2).

Git status: historical validation report when recorded; current dirty inventory is in BASELINE-MANIFEST.json. Do not infer historical clean status from today.

---

# 2026-09-13 — Visual polish checkpoint

## Date

2026-09-13

## Reporting period

PRE-SPRINT BASELINE — Historical reconstruction / not assigned a funded sprint week.

## Starting state

Frontend MVP completed in MOCK.

## Work performed

Account menu, Spanish labels, battery terminology and completed-cycle reward presentation.

## Technical changes

Presentation changes; no backend/database/contract changes.

## Stellar-related changes

Clarified MOCK does not execute Soroban.

## Tests executed

Frontend 33, build/typecheck/lint and whole verify recorded PASS; visual demo recorded.

## Results

Public baseline ancestor; repository was private then, public access was observed later.

## Problems encountered

No additional technical failure documented for this change.

## Decisions made

Keep technical values/source visible and avoid false blockchain claims.

## Evidence

EV-004

## Deliverable impact

D1: unchanged. D2: presentation baseline. D3: MOCK demonstration clarity.

## Known limitations

No Testnet connection.

## Next step

Direct contract validation.

## Repository state

Branch: historical checkpoint branches; source report referenced above.

Commit: [0a572af29b6d4df6c16feb0329ecc225948824f6](https://github.com/chrlstl4n2307-ai/Byetery/commit/0a572af29b6d4df6c16feb0329ecc225948824f6).

Git status: historical validation report when recorded; current dirty inventory is in BASELINE-MANIFEST.json. Do not infer historical clean status from today.

---

# 2026-09-26 — Historical Testnet validation checkpoint

## Date

2026-09-26

## Reporting period

PRE-SPRINT BASELINE — Historical reconstruction / not assigned a funded sprint week.

## Starting state

Clean isolated worktree from 0a572af; web remained MOCK.

## Work performed

Deployed existing frozen WASM and SAC, configured original actors/funding, completed one direct CLI lifecycle and reward; validated HTTP DEV suite with isolated fixtures.

## Technical changes

Validation scripts, ABI, payloads, public JSON and report.

## Stellar-related changes

12 confirmed setup/lifecycle transactions; reward 10 GREENTEST; 11 negative simulations/authorization checks.

## Tests executed

Rust 20; WASM constructor 1; Foundation 50; HTTP 43; frontend 33; Python 4; SQL 82; fmt/Clippy/build/demo PASS in report.

## Results

Commit 252fff8 pushed; historical contract proof, not app Testnet.

## Problems encountered

Windows native cross-build linker setup, CLI extra signer configuration and an HTTP observer error were corrected; HTTP successful run 43/43.

## Decisions made

Use isolated branch; preserve source hash, double auth and atomic pre-funded payment; no TestnetStellarService yet.

## Evidence

EV-005/006/007/008

## Deliverable impact

D1: protocol baseline reduces risk but no API Testnet PASS. D2: MOCK retained. D3: one historical contract-only run.

## Known limitations

No application Testnet E2E; no graphic Freighter proof; archival remains local robustness test.

## Next step

Application signing/integration.

## Repository state

Branch: historical checkpoint branches; source report referenced above.

Commit: [252fff88d4c4abbb6986460c12f1766b1ddfb574](https://github.com/chrlstl4n2307-ai/Byetery/commit/252fff88d4c4abbb6986460c12f1766b1ddfb574).

Git status: historical validation report when recorded; current dirty inventory is in BASELINE-MANIFEST.json. Do not infer historical clean status from today.

---

# 2026-09-27 — Signing investigation notes

## Date

2026-09-27

## Reporting period

PRE-SPRINT BASELINE — Historical reconstruction / not assigned a funded sprint week.

## Starting state

Contract checkpoint validated; integration branch requested.

## Work performed

Inspected service/coordinator and CLI v28 interfaces; documented limitations of tx sign for additional Soroban auth.

## Technical changes

Local investigation documents and isolated compile-only helper spike.

## Stellar-related changes

No signing result or new transaction established.

## Tests executed

No complete suite execution established for this date. Spike finishing dates must not be inferred from its creation.

## Results

Secure Store retained; secret-export proposal withdrawn in follow-up.

## Problems encountered

Stock CLI has no auth-sign-and-return command separate from send; keys cannot be exported from Secure Store.

## Decisions made

Investigate a restricted local signer using official library APIs.

## Evidence

EV-010; local review notes (uncommitted)

## Deliverable impact

D1: signing dependency identified. D2/D3: still blocked on real adapter.

## Known limitations

Local notes edited later; exact intra-day sequence/source commit unavailable.

## Next step

Validate compile/fixed identities and signature path.

## Repository state

Branch: historical checkpoint branches; source report referenced above.

Commit: No exact event commit; WIP/base 252fff88d4c4abbb6986460c12f1766b1ddfb574.

Git status: historical validation report when recorded; current dirty inventory is in BASELINE-MANIFEST.json. Do not infer historical clean status from today.

---

# 2026-10-06 — SOW V3.1 baseline clarification

## Date

2026-10-06

## Reporting period

PRE-SPRINT BASELINE — Historical reconstruction / not assigned a funded sprint week.

## Starting state

Historical contract proof; application signing/integration incomplete.

## Work performed

SOW V3.1 defines three deliverables, 23 criteria and baseline/sprint separation.

## Technical changes

Planning/documentation, not product implementation.

## Stellar-related changes

Existing contract/SAC retained in scope; no new live execution claimed by SOW.

## Tests executed

No product suites newly executed for this SOW established.

## Results

Draft not ready for resubmission; public repository checks recorded in SOW.

## Problems encountered

Signing gate, baseline index, operator interest and review logistics remain unresolved.

## Decisions made

Fund remaining integration/verification/demo only; no reimbursement of earlier development.

## Evidence

EV-009; ACCEPTANCE-CRITERIA.md source checksum

## Deliverable impact

D1 USD 2000; D2 USD 1600; D3 USD 1300; no acceptance PASS.

## Known limitations

Award/start not established; source SOW local/uncommitted.

## Next step

Close readiness gates and establish documentation baseline.

## Repository state

Branch: historical checkpoint branches; source report referenced above.

Commit: No exact event commit; WIP/base 252fff88d4c4abbb6986460c12f1766b1ddfb574.

Git status: historical validation report when recorded; current dirty inventory is in BASELINE-MANIFEST.json. Do not infer historical clean status from today.

---

# 2026-10-09 — Partial signer work and user pause

## Date

2026-10-09

## Reporting period

PRE-SPRINT BASELINE — Historical reconstruction / not assigned a funded sprint week.

## Starting state

Compile-only spike and uncommitted investigations.

## Work performed

Fixed compatible transitive versions; implemented restricted helper and typed adapter, tests and security documentation. User explicitly authorized limited automated signing, then paused product work.

## Technical changes

New isolated Rust crate, process wrapper, input/output validation, signature verification and fake/process tests.

## Stellar-related changes

Four public identities matched; readonly Testnet instance/account check recorded; no new signing E2E or transaction.

## Tests executed

Spike check PASS; baseline Foundation 50 PASS; TypeScript PASS; nine adapter tests PASS reported. Native tests and actual signatures did not complete. Pattern secret audit at 16:11: 234 files, 193 history blobs, 0 findings; not final audit for subsequent work.

## Results

Product PAUSED. C++ runtime linking/recompilation incomplete at pause; no commit/push of integration.

## Problems encountered

Transitive strkey incompatibility; Windows linker and LLVM/GNU C++ runtime issues; low RAM and slow cold build.

## Decisions made

Use official pinned APIs, fixed Testnet identities, no export, helper never submits; preserve caches and stop own processes on user pause.

## Evidence

EV-010/011/012; LOCAL-SECURE-STORE-SIGNER.md; BASELINE-MANIFEST.json

## Deliverable impact

D1: partial signer foundation, not complete. D2/D3: no real app E2E.

## Known limitations

Current work uncommitted; native unit/actual crypto results pending; integration service absent.

## Next step

Only on user resume: finish helper build/offline validation before application work.

## Repository state

Branch: historical checkpoint branches; source report referenced above.

Commit: No exact event commit; WIP/base 252fff88d4c4abbb6986460c12f1766b1ddfb574.

Git status: historical validation report when recorded; current dirty inventory is in BASELINE-MANIFEST.json. Do not infer historical clean status from today.

---

# Day 0 — Pre-Sprint Baseline

## Date

2026-10-09

## Reporting period

Day 0 / PRE-SPRINT BASELINE

## Starting state

Published checkpoint 252fff88d4c4abbb6986460c12f1766b1ddfb574 plus inventoried uncommitted work; product paused.

## Work performed

Prepared documentation, exact acceptance tracker, history, transactions, baseline and Notion import/export. No product development resumed.

## Technical changes

Documentation only; no contract/backend/schema/deployment change in this task.

## Stellar-related changes

Archived existing public historical references; no new Stellar operation.

## Tests executed

No product suites rerun for documentation. Structural/link/secret checks of the package recorded at closure.

## Results

Baseline report and documentation/export prepared; 0/23 new sprint criteria PASS.

## Problems encountered

Notion plugin installed but no callable tools; official sprint date unconfirmed.

## Decisions made

Use local Markdown/CSV fallback; keep source evidence and baseline/sprint classification explicit.

## Evidence

EVIDENCE-INDEX.md; BASELINE-MANIFEST.json; public checkpoint/transaction links.

## Deliverable impact

D1/D2/D3: traceability infrastructure prepared; no technical acceptance completion claimed.

## Known limitations

Remote publication and official dates pending; helper native/signing validation paused.

## Next step

Confirm sprint start and import/reconnect Notion. Resume product only on user instruction.

## Repository state

Branch: codex/testnet-app-integration; HEAD: 252fff88d4c4abbb6986460c12f1766b1ddfb574; Git status: dirty pre-existing WIP plus new documentation. No new code commit/tag/push in this task.

# INSTAWARD SPRINT — Week 1–4

Planned only; no entries or results assigned until the official start date is confirmed.

## Formal freeze reference

**HISTORICAL BASELINE:** `252fff88d4c4abbb6986460c12f1766b1ddfb574` — prior direct-contract/Testnet validation.

**FROZEN PRE-SPRINT BASELINE:** annotated tag `pre-instaward-baseline-v1`, created by this freeze procedure. Its commit SHA is resolved from the tag after creation, not guessed or embedded circularly.

Canonical source/index: https://github.com/chrlstl4n2307-ai/Byetery/tree/pre-instaward-baseline-v1

Incomplete helper work is PARTIAL / RESEARCH-SPIKE / NOT VALIDATED. Wallet/QR WIP is archived separately with its base, patch and hashes and is not merged. See FREEZE-CLASSIFICATION.md and BASELINE-MANIFEST.json. This snapshot preserves pre-sprint work; no D1/D2/D3 implementation or new product validation occurred in this freeze. Official sprint start: UNCONFIRMED.
