# BYETERY — BYE-W1-003C PostgreSQL Recovery + Collection Report

**Overall: PASS (technical task); official acceptance remains unchanged.**
OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. Investigation began2026-10-20;
reviewed live recovery completed2026-10-21, America/Santiago, after a usage-limit pause.

BYE-W1-003B discovered the production robustness issue; BYE-W1-003C fixed and recovered it.
[Historical003B report](BYE-W1-003B-REPORT.md) remains **PARTIAL** and unchanged.
[Recovery design](BYE-W1-003C-RECOVERY.md) explains the exact code/event path;
[machine evidence](BYE-W1-003C-results.json) contains sanitized measurements.

## Git boundary and original operation

- Starting HEAD: `65478adb8d251b8bbee26be31b02d3c4f523b8ce`.
- Tested implementation: `fbeb66d86e59429023a7e23d4edaec3797b7f134`.
- Branch: `instaward/d1-testnet-integration`.
- Evidence/ending commit: the commit containing this report/results; use
  `git log -1 --format=%H -- docs/instaward/week1/BYE-W1-003C-results.json`.
  Exact final HEAD and remote push/readback are returned in the final execution report;
  no self-referential commit hash is fabricated inside its own artifact.
- Original operation: `4fa3fbac-84e4-4845-8abd-fbdff757cbb4`. **New logical collection operation: NO.**
- Battery: `BYE-W1-002-64257020134D4A0F`.
- Request: `5d48643a8915413ed889dd6aa3f8304d10a8c251e384f528ab5461d6e4c8d78c`.
- Collector: `GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V`; existing BYETERY-INSTAWARD-COLLECTOR-1 principal.
- Recipient: `GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS`; original verified USER-1 wallet.

No unrelated changes, contract changes, tag movement or main merge. Protected untracked
`tools/sync_obsidian.py` stays untouched/uncommitted, SHA256
48404b9431a9d955fc4af0b2eeaf9a59bb2fb0e9457eed73b4f2f66132a5e2da.

## Forensics and narrow root cause

Authoritative SQL read before code edits at2026-10-20T18:54:01.784610Z found
QUEUED/PREPARING, **0signed identities,0envelopes, absent hash,0dispatches**.
Operation created18:36:01.914038Z; transport created18:36:07.580997Z. No updated_at
column exists; timestamps from observations are preserved instead. Lease generation3
expired18:39:09.566019Z. One positive simulation observation at18:36:26.527734Z:
ledger5299559, resource992362/total1002362stroops, source sequence20970220772392964.
Battery RETURNED/NOT_ELIGIBLE, request OPEN, no collector/collection hash.

Classification: **UNSIGNED_PREPARATION_INTERRUPTED**, not a submitted ambiguous transaction.
The proven crash defect is pg8.23.0 emitting an independent checked-out Client error event
without a lifetime listener; query Promise catch/rollback cannot catch EventEmitter errors.
The pool removes its idle error listener on checkout; repository background handling was
also missing. The exact socket termination trigger remains **UNPROVEN**. No evidence
establishes Supavisor timeout, concurrent tests, network outage or client reuse as cause.

## Bounded recovery fix and fault injection

Lifetime pool/client listeners and connection epochs invalidate a preparation on connection
loss, even if a later query reconnects. Broken clients are destroyed; uncertain COMMIT never
becomes success. Checks run after async SQL/network gates immediately before both helper
phases and before dispatch. No automatic DB retry, signing or sending after reconnect.

Deterministic collection PREPARING injection proves unchanged original operation/evidence,
RETURNED/OPEN and0helper calls/signatures/identities/envelopes/hashes/dispatches/sends.
Reconnect reads work, normal worker resume is rejected. Explicit reviewed same-context
resume then creates exactly1identity and effect; duplicate adds none. A separate lost-COMMIT
acknowledgement test leaves a stored identity but0sends; reconnect cannot auto-dispatch it.
SIGNED_IDENTITY_EXISTS and SUBMITTED_OR_UNKNOWN cannot enter unsigned recovery.

The original HTTP endpoint/body/idempotency context resolved the existing operation.
The server-only recovery decision was not supplied by a client parameter. Existing
Coordinator → TestnetStellarService → durable worker/transport → approved helper path was
reused. No new evidence, role, database schema, migration, RLS policy or dependency.

## Fresh collection preflight and negative authorization

Fresh gates checked Testnet passphrase/network, contract/WASM/TTL, RETURNED/OPEN,
verified recipient, active collector app principal and COLLECTOR deployment membership,
collector on-chain role, immutable command/context/ABI arguments and339original bytes.

- Manifest/payload SHA256: `ef61932cb180ffbafac39eddffaed46dccb6e42366c7999913116d9eb8f73766`.
- Canonical BYETERY_EVIDENCE_V1 commitment: `3bca64581d5aced4a8582f85fe5755b07104e1b7d7cf6201cde90c6ffce5b5ef`.
- Revision1, manifest hash matched **YES**, commitment matched **YES**, evidence reused **YES**.
- Simulation ledger **5314088**; resource **1042263**, classic **10000**, total **1052263stroops**.
- Below unchanged **50000000** cap: **YES**. Restore preamble **NONE**.
- Resources:1831308instructions,144disk-read bytes,916write bytes; footprint4read-only/3read-write.
- Auth: distinct **SERVICE PRESENT + COLLECTOR PRESENT**, exact root/contract/method/4arguments,
  no child invocations. SERVICE uses source-account credentials, COLLECTOR address credentials.
- Auth expiration5314148; tx timebounds0–1792594207; prepared ledger5314088.

| Negative check before signing | Result and evidence type |
| --- | --- |
| Missing SERVICE | PASS; deterministic guard on actual fresh simulation auth structure |
| Missing COLLECTOR | PASS; deterministic guard on actual fresh simulation auth structure |
| Wrong collector | PASS; deterministic actor/invocation guard |
| No-role collector | PASS; unsigned live RPC, exact frozen contract RoleNotGranted #9 |

**Invalid broadcasts0**, chain unchanged after probes. RPC/resource errors cannot satisfy
the no-role check. Three guard negatives are not falsely described as submitted invalid
transactions or separate live-chain authorization executions.

## Signing, durability, source safety and confirmed transaction

Two-phase Secure Store helper **PASS**: one authorization phase, then one source-envelope
phase after SDK network-bound hash. Existing allowlists/cap/no-export/no-helper-submit
preserved. Body/hash verification PASS; no signing material in public artifacts.

One immutable signed identity COMMIT/readback at **2026-10-21T14:47:36.823Z**, before
dispatch intent **14:47:40.492Z**. Persist-before-send **PASS**. Final authoritative source
check ledger **5314095**, SERVICE sequence **20970220772392964**, balance **99999515769stroops**;
prepared envelope sequence **20970220772392965**. Exact comparison PASS; persisted bytes
were sent once. External/manual source use **UNCONFIRMED**; SQL leases cannot fence it.

- Broadcasts: **1**. Signed identities for original collection: **1**.
- Transaction: `e105a8dc4072bc601c65d53cf694ca834aa5ff7e4b6457ecb9cb4c980b0f6d22`.
- Result: **SUCCESS**, confirmation ledger **5314096**.
- Actual charged fee: **69447stroops (0.0069447XLM Testnet)**.
- Quoted fee is a preparation budget; actual fee above is the confirmed charged amount.
- Event: `collected`, original battery/request, collector and collection commitment match.
- Soroban return: `Collected`.

Initial HTTP202 truthfully showed SUBMITTED_OR_UNKNOWN, battery still RETURNED and reward
NOT_ELIGIBLE. Reconciliation used the original hash only; no replacement or second send.
Only verified SUCCESS projected the result.

## Independent post-state and idempotency

Separate Supabase MCP read **2026-10-21T14:48:25.217053Z** and independent read-only RPC
receipt/state read **14:49:27.297Z**, ledger **5314115**, agree:

- Battery **COLLECTED**, request **CONFIRMED**, reward **NOT_ELIGIBLE**.
- Collector matched **YES**, commitment matched **YES**, recipient unchanged **YES**.
- SQL projection matched **YES**; association confirmation14:48:06.484Z.
- One original collection operation, one identity/dispatch and one evidence revision.
- Source post-sequence20970220772392965; balance99999446322. Advance exactly1;
  balance decrease69447 equals charged fee.

Duplicate API replay **PASS** (HTTP200): before/after request1,operations3,identities3,
dispatches3 unchanged. Additional identities **0**, additional broadcasts **0**. This uses
the original idempotency context and does not submit another contract transaction.

## Regression and limitations

| Verification | Result |
| --- | --- |
| Rust native |20/20 PASS; same20 repeated with wasm-tests |
| WASM |1/1 PASS; release wasm32v1-none, rustfmt, Clippy -Dwarnings PASS |
| Frozen WASM SHA256 |c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6 unchanged |
| Backend / TypeScript |138/138 PASS, original Foundation50 intact |
| Focused recovery/worker/transport/operator |28/28 PASS, overlaps backend138 |
| HTTP Supabase DEV |45/45 PASS, serial files, fixture-only cleanup |
| SQL parity |82/82 PASS, local PGlite, ROLLBACK,0remaining fixtures |
| Helper |22/22 native +18/18 actual Secure Store offline tests PASS |
| Frontend |33/33, typecheck/lint/build PASS; no product frontend changes |
| Python |4/4 PASS |
| Existing MOCK demo |RECYCLED + rewardSENT10GREEN-TEST PASS; does not execute Soroban |
| Audit/diff |Implementation audit401files/392historicalblobs/14staged/0findings; diff --check PASS |

HTTP/SQL/helper completed Oct20. Final root/backend138 and frontend validation completed
Oct21. First frontend sandbox run timed out starting workers; second failed temporary-file
ENOENT. The unchanged full suite passed outside isolation. No protection, assertion,
credential policy, schema, RLS or fee cap was weakened. No private material is published.
Local MOCK cycles/offline tests are not additional Testnet business operations.

The dataset is explicitly synthetic; a commitment proves byte/context integrity and actor
attestation, not physical battery receipt, treatment, environmental benefit or independent
human custody. Four existing identities remain in one OS custody environment.

## D1 impact, history and external closure

Real confirmed API kinds **3/5**: register_battery, open_return, confirm_collection.

| Criterion | Current supporting assessment |
| --- | --- |
| D1.1 |SUPPORTED3/5; full criterion incomplete |
| D1.2 |Collection subset READY FOR VALIDATION; all-method authorization criterion incomplete |
| D1.3 |SUPPORTED / strengthened by truthful UNKNOWN and original-hash confirmation |
| D1.4 |SUPPORTED / strengthened by durable correlation and sanitized evidence |
| D1.5 |Collection replay subset READY FOR VALIDATION; broader criterion remains reviewed |
| D1.7 |SUPPORTED / strengthened; unsigned live recovery is not every signed-before-send scenario |

Official acceptance: **D1 0/12, D2 0/6, D3 0/5; NO automatic PASS**. Historical003BLOCKED,
003APASS and003BPARTIAL preserved. Existing Notion Project Plan/Development Log/Changelog/
Tests & Evidence/Stellar Transactions/Decisions & Risks updated and read back; supporting
[BYE-W1-003C task](https://app.notion.com/p/400a46fdfb1881f88921e79df756b331) is READY FOR VALIDATION.
Six affected criteria are IN PROGRESS, never PASS; exact23criteria/0PASS read back.
Notion's immutable evidence link and Obsidian's final evidence-commit mirror/context are
refreshed after this report commit. Their observed final sync/push result is returned
separately, avoiding a self-referential commit hash inside the artifact.

**STOP.** No recycling, reward, new return/battery/collection, Mainnet, contract/deployment/
role change or main merge. Next proposed **BYE-W1-004 — Recycling + Reward + D1 completion
testing** is **NOT STARTED**; requires its own task authorization.
