# BYETERY BYE-W1-004 — Recycling + Reward + D1 Completion Report

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT · 2026-10-21. **BYE-W1-004 technical PASS.** Five real application/API operation kinds confirmed. **D1 technical state INCOMPLETE: 10 criteria READY FOR VALIDATION, 2 SUPPORTED. Official acceptance remains0/12, D20/6, D30/5.** No D2/D3 started.

Starting HEAD `1779a45251d818afaa5ab8fe2a297d1abc04f2ea`. Tested implementation `5e4766e0dc175e61ff78e4b951b4b2fa28864bd8`. Branch `instaward/d1-testnet-integration`. This document and its companion JSON are a separate evidence checkpoint; resolve that commit with `git log -1 --format=%H -- docs/instaward/week1/BYE-W1-004-REPORT.md`.

## Scope and verified initial state

Same battery `BYE-W1-002-64257020134D4A0F`, same request `5d48643a8915413ed889dd6aa3f8304d10a8c251e384f528ab5461d6e4c8d78c`, same immutable recipient `GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS`. Initial independent RPC/SQL: **COLLECTED / CONFIRMED / NOT_ELIGIBLE**. After recycling **RECYCLED / CONFIRMED / PENDING**; after atomic payment **RECYCLED / CONFIRMED / SENT**.

Deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`; contract `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`; SAC `CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G`; Testnet only. Local/deployed WASM `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6` matched. Contract sources, Cargo.lock, migrations/RLS, helper and50M fee cap unchanged. No redeploy or role transaction.

Raven official Stellar documentation was consulted for authorization, simulation, network-bound hashing and asset acceptance; existing architecture/invariants preserved. Historical003BLOCKED/003APASS/003BPARTIAL/003CtechnicalPASS remain unchanged.

## Prerequisites and owner actions

Recycler `GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2` had on-chain Recycler role TRUE. Missing application principal caused a stop. Owner separately authorized dedicated fixture **BYETERY-INSTAWARD-RECYCLER-1**, Auth ACTIVE and deployment RECYCLER membership, plus normal USER base only; independently checked in Supabase. No ADMIN/COLLECTOR assignment or on-chain role change.

USER-1 initially lacked trustline; execution stopped before reward. Owner added exact GREENTEST/issuer in Freighter. Independent account/trustline RPC plus Horizon confirmed change_trust `8bacfbb284ad3ce0f6fdb68e6f6a2bcd2b80bdc2056df424033f7d9593efb344` at5315668, post-read5315749. Authorized flags1, limit9223372036854775807 base units. This owner transaction is separate from the two004 business broadcasts. Recipient was never changed.

## Real API execution

API → Coordinator → TestnetStellarService → durable transport → approved two-phase Secure Store helper. These are real Testnet transactions, distinct from the retained MOCK demo. Helper has no RPC/broadcast and exports no keys.

| Field | confirm_recycling | pay_reward |
| --- | --- | --- |
| API route | POST /api/returns/5d48643a8915413ed889dd6aa3f8304d10a8c251e384f528ab5461d6e4c8d78c/recycling | POST /api/batteries/BYE-W1-002-64257020134D4A0F/reward |
| Logical operation | `3ddd9ac8-cfdd-4129-8a4a-8c8f9015145c` | `f90927f6-2a66-4bb9-ae3b-5b0565d1fb7c` |
| Source | `GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2` | `GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX` |
| Prepared sequence | 20970233657294850 | 20970220772392966 |
| Simulation ledger | 5315868 | 5315908 |
| Resource + classic = total fee (stroops) |60222+10000=70222 |15049+10000=25049 |
| Restore preamble | None | None |
| Auth | Recycler source credential,4 args | SERVICE source credential,1 arg |
| Persisted UTC | 2026-10-21T17:15:48.785Z | 2026-10-21T17:19:02.604Z |
| Dispatch intent UTC | 2026-10-21T17:15:52.112Z | 2026-10-21T17:19:17.460Z |
| Final sequence check ledger | 5315873 | 5315914 |
| Final current sequence | 20970233657294849 | 20970220772392965 |
| Transaction | [9b1042a5b8f31509149f0b0d1effc7329132f1bfea4a3e7a8505df589ad024fb](https://stellar.expert/explorer/testnet/tx/9b1042a5b8f31509149f0b0d1effc7329132f1bfea4a3e7a8505df589ad024fb) | [d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02](https://stellar.expert/explorer/testnet/tx/d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02) |
| Confirmation ledger | 5315874 | 5315915 |
| Actual charged fee (stroops) | 49047 | 10057 |
| Result | SUCCESS; RECYCLED/PENDING | SUCCESS; RECYCLED/SENT |
| Identities / broadcasts |1/1 |1/1 |

Exact committed identity was read back before send; final authoritative source sequence was one below prepared sequence. Two helper phases ran once each, SDK hash/body verified. Source usage by external/manual workflows remains unconfirmed; the application lease cannot fence external activity. No drift occurred.

Both auth roots had no unexpected children. Source-account credentials need no independent address-auth signature/expiration; recorded preflight windows5315928/5315968 are metadata, not falsely claimed address signature expiry. Transaction timebounds min0/max1792603107 and0/1792603307. Simulation resources/footprint and ordered argument checks are in JSON/operator. Envelope/signature bytes stay private.

## Evidence and negative authorization

Fresh immutable RECYCLING V1 revision1. Payload SHA256 `50250c13774ca250b35bd4f6dbdf315a2963c17591f28471bea334f95cc13e6c`; canonical commitment `b7622dcdbeb6598fe95f7c15f153b315a4b9329bc99c3829ceabd1bd10b75451`. Exact UTF-8 manifest is disclosed in results; recomputed payload hash matches. Existing canonical XDR implementation reused, full manifest off-chain. Contract stores commitment only. Synthetic Testnet evidence is **not** proof of physical recycling, custody, material recovery, environmental benefit or compliance.

Before signing: missing Recycler and wrong Recycler deterministic guards rejected actual simulation auth variants; unsigned RPC no-role recipient probe rejected with exact RoleNotGranted#9; wrong app USER-1 receivedHTTP403 without creating work. Invalid broadcasts0; battery remained COLLECTED. Collection SERVICE+COLLECTOR proof belongs to003C. Negative fixtures do not claim deliberately invalid live signed submissions.

## Atomic reward and independent verification

Before preparation, independently confirmed RECYCLED/PENDING, correct immutable USER-1, exact100000000 base-unit reward, authorized trustline/capacity and contract900000000 balance. Pre-reward fresh asset read5315902; source and fees checked again before send.

Recipient **0→100000000 (+10 GREENTEST)**. Contract **900000000→800000000 (90→80)**. transfer and paid events plus contract return report exact token/amount/recipient, reward SENT. No mark_reward_sent. SQL last attempt SUCCEEDED #1; chainSUCCESS preceded projection.

Independent recycling RPC read5315886/87 and Supabase17:16:33UTC agree. Independent reward RPC observed2026-10-21T17:20:44.746Z, battery ledger5315931, recipient100000000/contract800000000; Supabase17:20:31UTC agrees: RECYCLED/SENT, requestCONFIRMED, exact snapshot recipient, originalhash/ledger, identity1/dispatch1. These read-only probes signed/sent0. A fresh closure read at20:09:15UTC (ledger5317953) again confirmed RECYCLED/SENT, recipient100000000 and contract800000000; fresh SQL20:07:15UTC agreed. The initial isolated-network RPC attempt returned RpcUnavailable_getNetwork; the same read-only script passed with network access, without changing protections or submitting anything.

Both same-key API replays returned200 and the original operation, with unchanged request/operation/identity/dispatch counts. Final counts for this lifecycle:1request,5operations,5identities,5dispatches. Additional reward0, identities0, broadcasts0. Contract and recipient balances remained unchanged after reward replay. No further live action is needed or permitted by this report.

## D1 evidence review

[All12 criteria with evidence, commit and owner decision](D1-ACCEPTANCE-MATRIX.md). [Five-method trace](BYE-W1-004-traceability.json). All five methods CONFIRMED; each identity persisted before its dispatch intent.

**10 READY FOR VALIDATION / 2 SUPPORTED / 0 NOT YET SATISFIED / 0 BLOCKED; official PASS0.** D1.5 lacks an explicit live registration replay transcript (HTTP/MOCK replay/conflict coverage passes). D1.7 retains safe reviewed-resolution boundaries rather than claiming a fully demonstrated reviewed READY first-dispatch restart. No forbidden new registration/extra lifecycle was performed to fill these gaps. Overall D1 remains incomplete pending owner gap review or separately scoped follow-up; successful004 business operations are unaffected.

## Regression at tested implementation commit

| Suite | Result |
| --- | --- |
| Rust native / wasm-tests feature repeat / WASM integration |20/20 + same20/20 +1/1 |
| WASM release wasm32v1-none / rustfmt / Clippy -D warnings | PASS; frozen SHA unchanged |
| Backend / Foundation subset |143/143; original50 preserved |
| Focused transport/auth/recovery (overlapping subset) |39/39 |
| HTTP Supabase DEV, isolated test fixtures, serial |45/45 |
| SQL parity / rollback |82/82; rollback, no retained parity fixtures |
| Frontend / types / lint / production build |33/33; PASS |
| Helper native / Secure Store offline |22/22 +18/18; fmt/ClippyPASS |
| SEP53_V2 / PostgreSQL recovery |PASS within backend and HTTP coverage |
| Python / MOCK demo |4/4; RECYCLED/SENT10 |

Commands used:

```powershell
npm run verify
node --experimental-strip-types --test --test-concurrency=1 backend/tests/testnet-worker.test.ts backend/tests/testnet-real-boundaries.test.ts backend/tests/postgres-recovery.test.ts backend/tests/sprint-recycling-reward.test.ts
node --experimental-strip-types --test --test-concurrency=1 backend/remote-tests/*.test.ts
node scripts/test-foundation-parity.mjs
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test -- --maxWorkers=1
npm --prefix frontend run build
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action test
node --experimental-strip-types --test backend/signing-tests/offline.test.ts
```

HTTP requires already-authorized Supabase DEV environment loaded privately; helper offline tests are explicitly opt-in by invoking the separate signing-tests suite, see helper test source/operator. Never publish .env or credentials. Root verify includes Rust/backend/Python/MOCK; The 82 SQL parity checks are a separate rollback-only command, not added to the backend count. MOCK demo never executes Soroban. No tool installed or global protection changed.

The focused command above is the 39-test subset. The separate on-disk restart test (`backend/tests/testnet-restart.test.ts`) passed within the full 143-test backend suite run by `npm run verify`.

Initial parallel frontend test workers timed out under severe memory pressure. Sequential rerun with existing maxWorkers1 passed unchanged assertions; types/lint/build also passed. No timeout enlargement, skipped assertion or security bypass. Full results captured privately before live execution at17:14:43UTC. No functional changes after that validation.

## Handoff and limits

Companion [machine results](BYE-W1-004-results.json) contains allowlisted receipts/events, balances and independent reads, no signing material. Contract, WASM, tags, cap, private-key non-export and protected untracked tools/sync_obsidian.py unchanged. No Mainnet, new token, new battery, extra lifecycle, migration or RLS change.

Notion existing six structures and Obsidian are updated at closure with this evidence and honest readiness. Publication/secret audit/diff check and final Git state are verified after the evidence commit and reported to the owner; they are not inferred from transaction success.

Technical asset only, no monetary/production tokenomics/environmental-value claim. Actors share one Windows host, so this does not demonstrate independent human custody. General frontend remainsDEV/MOCK. Testnet resets/TTL/RPC retention remain limitations. STOP after this report; do not startD2/D3 or repeat either transaction.
