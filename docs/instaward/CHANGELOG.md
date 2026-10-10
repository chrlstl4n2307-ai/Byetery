<!-- BYETERY-INSTAWARD-DOCUMENTATION -->
# Byetery — Changelog

PRE-SPRINT BASELINE · Inicio oficial del sprint no confirmado. No se asignan avances a Week 1–4 ni se afirma aprobación/pago del Instaward. La clasificación baseline es provisional hasta confirmar la fecha acordada.

Inspired by Keep a Changelog; no invented SemVer. DEV-LOG explains the work; this file summarizes resulting changes.

## [Pre-Sprint Baseline / 2026-09-12 / Consolidation checkpoint]

### Added

Consolidated monorepo, retained contract/checkpoint/WASM, added standard-library Python utilities and MOCK demo.

### Changed

Paths, scripts and repository packaging; no changed contract rules.

### Validated

Windows report: Rust 20 + repeated native 20 with wasm-tests + 1 constructor; Foundation 50; Python 4; fmt/Clippy/build/demo PASS.

### Fixed

Earlier Windows App Control error 4551 in consolidation report; final Windows report supersedes the blocked intermediate status.

### Security

Retain frozen rules and hash; user manually changed Smart App Control; assistant did not change protections.

### Known limitations

No Supabase remote or Testnet app at this point.

### Evidence

EV-001; [Commit](https://github.com/chrlstl4n2307-ai/Byetery/commit/767e8f45dd13a3bfb9b041ed2fd00a1b8d3381df)


## [Pre-Sprint Baseline / 2026-09-13 / HTTP backend checkpoint]

### Added

Implemented typed HTTP API with Supabase DEV sessions, roles, wallet nonce persistence, idempotency and durable mock coordinator.

### Changed

Application HTTP migration, private auxiliary tables and safe projections.

### Validated

HTTP 35/35 at this checkpoint; Foundation 50; SQL 82; Rust/WASM, Python and API MOCK demo documented PASS.

### Fixed

See report for integration corrections; no unsupported day-by-day detail reconstructed.

### Security

Validate sessions from server; keep browser base-deny and immutable recipient.

### Known limitations

No real Testnet adapter.

### Evidence

EV-002; [Commit](https://github.com/chrlstl4n2307-ai/Byetery/commit/90b7e23081107fcadec0e415da6476b62a4cd41e)


## [Pre-Sprint Baseline / 2026-09-13 / Frontend MVP checkpoint]

### Added

Created login/dashboard/battery/admin/collector/recycler views and QR lookup; added minimal authenticated reads.

### Changed

Next.js UI, typed proxy, HttpOnly session cookies and CSP.

### Validated

Frontend 33; HTTP 43; typecheck/lint/build; recorded Edge visual MOCK demo PASS.

### Fixed

Frontend TypeScript version adjusted for eslint compatibility according to report.

### Security

Frontend consumes API and does not choose blockchain authorizations.

### Known limitations

Freighter/camera real E2E not validated.

### Evidence

EV-003; [Commit](https://github.com/chrlstl4n2307-ai/Byetery/commit/f48759361d89e10bc433a2b6eab5051bf7fe57c2)


## [Pre-Sprint Baseline / 2026-09-13 / Visual polish checkpoint]

### Added

Account menu, Spanish labels, battery terminology and completed-cycle reward presentation.

### Changed

Presentation changes; no backend/database/contract changes.

### Validated

Frontend 33, build/typecheck/lint and whole verify recorded PASS; visual demo recorded.

### Fixed

No additional technical failure documented for this change.

### Security

Keep technical values/source visible and avoid false blockchain claims.

### Known limitations

No Testnet connection.

### Evidence

EV-004; [Commit](https://github.com/chrlstl4n2307-ai/Byetery/commit/0a572af29b6d4df6c16feb0329ecc225948824f6)


## [Pre-Sprint Baseline / 2026-09-26 / Historical Testnet validation checkpoint]

### Added

Deployed existing frozen WASM and SAC, configured original actors/funding, completed one direct CLI lifecycle and reward; validated HTTP DEV suite with isolated fixtures.

### Changed

Validation scripts, ABI, payloads, public JSON and report.

### Validated

Rust 20; WASM constructor 1; Foundation 50; HTTP 43; frontend 33; Python 4; SQL 82; fmt/Clippy/build/demo PASS in report.

### Fixed

Windows native cross-build linker setup, CLI extra signer configuration and an HTTP observer error were corrected; HTTP successful run 43/43.

### Security

Use isolated branch; preserve source hash, double auth and atomic pre-funded payment; no TestnetStellarService yet.

### Known limitations

No application Testnet E2E; no graphic Freighter proof; archival remains local robustness test.

### Evidence

EV-005/006/007/008; [Commit](https://github.com/chrlstl4n2307-ai/Byetery/commit/252fff88d4c4abbb6986460c12f1766b1ddfb574)


## [Pre-Sprint Baseline / 2026-09-27 / Signing investigation notes]

### Added

Inspected service/coordinator and CLI v28 interfaces; documented limitations of tx sign for additional Soroban auth.

### Changed

Local investigation documents and isolated compile-only helper spike.

### Validated

No complete suite execution established for this date. Spike finishing dates must not be inferred from its creation.

### Fixed

Stock CLI has no auth-sign-and-return command separate from send; keys cannot be exported from Secure Store.

### Security

Investigate a restricted local signer using official library APIs.

### Known limitations

Local notes edited later; exact intra-day sequence/source commit unavailable.

### Evidence

EV-010; local review notes (uncommitted); No exact event commit


## [Pre-Sprint Baseline / 2026-10-06 / SOW V3.1 baseline clarification]

### Added

SOW V3.1 defines three deliverables, 23 criteria and baseline/sprint separation.

### Changed

Planning/documentation, not product implementation.

### Validated

No product suites newly executed for this SOW established.

### Fixed

Signing gate, baseline index, operator interest and review logistics remain unresolved.

### Security

Fund remaining integration/verification/demo only; no reimbursement of earlier development.

### Known limitations

Award/start not established; source SOW local/uncommitted.

### Evidence

EV-009; ACCEPTANCE-CRITERIA.md source checksum; No exact event commit


## [Pre-Sprint Baseline / 2026-10-09 / Partial signer work and user pause]

### Added

Fixed compatible transitive versions; implemented restricted helper and typed adapter, tests and security documentation. User explicitly authorized limited automated signing, then paused product work.

### Changed

New isolated Rust crate, process wrapper, input/output validation, signature verification and fake/process tests.

### Validated

Spike check PASS; baseline Foundation 50 PASS; TypeScript PASS; nine adapter tests PASS reported. Native tests and actual signatures did not complete. Pattern secret audit at 16:11: 234 files, 193 history blobs, 0 findings; not final audit for subsequent work.

### Fixed

Transitive strkey incompatibility; Windows linker and LLVM/GNU C++ runtime issues; low RAM and slow cold build.

### Security

Use official pinned APIs, fixed Testnet identities, no export, helper never submits; preserve caches and stop own processes on user pause.

### Known limitations

Current work uncommitted; native unit/actual crypto results pending; integration service absent.

### Evidence

EV-010/011/012; LOCAL-SECURE-STORE-SIGNER.md; BASELINE-MANIFEST.json; No exact event commit

## [Week 1] — INSTAWARD SPRINT

Planned; dates and work not assigned. No execution claimed.

## [Week 2] — INSTAWARD SPRINT

Planned; dates and work not assigned. No execution claimed.

## [Week 3] — INSTAWARD SPRINT

Planned; dates and work not assigned. No execution claimed.

## [Week 4] — INSTAWARD SPRINT

Planned; dates and work not assigned. No execution claimed.

## [Instaward Final Delivery]

NOT COMPLETED. Final source commit, accepted criteria, video and reviewer package pending.

## Formal freeze reference

**HISTORICAL BASELINE:** `252fff88d4c4abbb6986460c12f1766b1ddfb574` — prior direct-contract/Testnet validation.

**FROZEN PRE-SPRINT BASELINE:** annotated tag `pre-instaward-baseline-v1`, created by this freeze procedure. Its commit SHA is resolved from the tag after creation, not guessed or embedded circularly.

Canonical source/index: https://github.com/chrlstl4n2307-ai/Byetery/tree/pre-instaward-baseline-v1

Incomplete helper work is PARTIAL / RESEARCH-SPIKE / NOT VALIDATED. Wallet/QR WIP is archived separately with its base, patch and hashes and is not merged. See FREEZE-CLASSIFICATION.md and BASELINE-MANIFEST.json. This snapshot preserves pre-sprint work; no D1/D2/D3 implementation or new product validation occurred in this freeze. Official sprint start: UNCONFIRMED.
