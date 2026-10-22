# BYETERY BYE-W1-006 — D1.5 LIVE IDEMPOTENCY CLOSURE REPORT

**PASS technical. D1:12/12 READY FOR VALIDATION; official D1 acceptance0/12, D20/6, D30/5. STOP.**

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. Started 2026-10-22T03:02:35.573Z; finished 2026-10-22T03:04:25.232Z UTC. Starting HEAD `da9bfa972c14c51f92d9c0278b78ee3dddfc2164`; tested implementation `aa4f0af382d1b4da6a88403149efd76f791594b2`; branch `instaward/d1-testnet-integration`. The enclosing documentation commit is the evidence checkpoint; it cannot contain its own hash. No production runtime changed.

## Fixture and separately approved application principal

Battery **BYE-D1-IDEMP-F6C52ED496D5C6F41B** is **D1.5 LIVE TESTNET IDEMPOTENCY FIXTURE ONLY**. D3 eligible **NO**; not physical recycling or environmental evidence. Final REGISTERED / NOT_ELIGIBLE, no return, collector, recycler or reward. The successful historical lifecycle remains RECYCLED / CONFIRMED / SENT and is unchanged.

After preflight found no legitimate active app ADMIN, execution stopped. Owner explicitly approved creating only `BYETERY-INSTAWARD-D1-IDEMP-ADMIN`, Auth `4349b984-87ed-4a03-84dd-98703a470290`, ACTIVE business principal `3dcdb0ba-2604-4f61-bfa4-5466c5e65cfb`, ADMIN + ordinary USER only deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`. SQL readback confirms exactly these enabled memberships, actor_address NULL. Auth fixture metadata only selects the expected test identity; actual authorization comes from validated Auth session + SQL memberships. The historical principal stays DISABLED/Auth NULL/memberships disabled. No set_role, on-chain role change, schema, RLS, migration or IdentityImmutable change.

Safe public idempotency key **4a53c61d-6aeb-47fc-bbd7-67fedf62a4b5**, one CSPRNG UUID. Same authenticated principal/deployment/`POST /api/batteries`/key for exactly A, B and C. Credentials, session tokens, signatures, signed envelopes and private keys are excluded.

## Request A — original real registration

API initially returned **202**, preserving the original hash while pending; original-hash reconciliation then confirmed **SUCCESS**. No second request/key/identity/broadcast was used to resolve A. Logical operation `53db4b43-7654-479a-b4aa-00d6d47ad171`; transaction [`c1e2db75ed536307c02a84315c343c2615984283adb155709cee98045ee0352b`](https://stellar.expert/explorer/testnet/tx/c1e2db75ed536307c02a84315c343c2615984283adb155709cee98045ee0352b); ledger **5322924**; actual fee **382529 stroops**.

Before: SQL battery/operation/identity/dispatch/evidence/return/reward counts0; independent chain registration absent. After: operation1, signed identity1, dispatch1, confirmed registration effect1, evidence revision1. Exact canonical registration manifest bytes and SHA verified from committed evidence before helper authorization. Commitment `3df6932e53d69e18c8bf27b26349d2592d71f0c653f319a9bd1b9fcf2e06f909`. Independent RPC receipt SUCCESS and get_battery agree with SQL REGISTERED / NOT_ELIGIBLE.

Existing API → Coordinator → durable operation → simulation → two-phase Secure Store → SDK hash validation → identity COMMIT/readback → dispatch intent → final source check → one send → original-hash reconciliation → projection. No CLI lifecycle shortcut, replacement, second key or direct SQL projection. Helper authorizes only the allowlisted register_battery command, exact fixture/hash and existing ADMIN source. Authorize1 + envelope1 produce ONE identity, not two transactions. Fee cap50M preserved; helper never sends. Simulation and pre-sign fee/auth/resource facts are in machine results.

## Request B — identical real API replay

HTTP **201**, same normalized body/key/principal. Same logical operation `53db4b43-7654-479a-b4aa-00d6d47ad171` and tx `c1e2db75ed536307c02a84315c343c2615984283adb155709cee98045ee0352b`. SQL/cache/chain snapshot afterA equals afterB except observation ledgers. Added operation0, identity0, processing0, signing0, dispatch0, broadcast0, chain effect0. Original cached response returns before processor invocation; capability guards would fail a replay attempt before invoking helper or send.

## Request C — same key, one changed safe business parameter

Only `metadata.caseLabel`: `ORIGINAL` → `CONFLICT_PROBE`. Still syntactically valid; no credential, deployment, endpoint, battery or key change. Original canonical input SHA **52c985a7a20e09f42d85f393edb5408365d7a113260b5efa831705e7f8099f33**; changed SHA **b0fd0ece9b7620b90979d7b7f545abd794c6152f810266b389fb2f88e8863eee**. HTTP **409 IdempotencyConflict**. Added operation0, identity0, processing0, signing0, dispatch0, broadcast0, chain effect0. Original cache/input hash unchanged; final SQL/chain snapshot equals afterA.

## Source sequence and independent state accounting

Exact source `GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F`. External/manual use **UNKNOWN; treated as shared**, not protected by the application lease. Dedicated application source remains preferred for a future reviewed change. No source replacement here.

| Observation | Source sequence | Native balance (stroops) | Ledger |
| --- | --- | --- | --- |
| BeforeA | 20970216477425670 | 99952804244 | 5322913 |
| AfterA | 20970216477425671 | 99952421715 | 5322931 |
| AfterB | 20970216477425671 | 99952421715 | 5322933 |
| AfterC | 20970216477425671 | 99952421715 | 5322934 |

Sequence advanced exactly1 for A,0 for B/C; native balance delta equals actual fee. Final source check recorded immediately before dispatch; a mismatch would retain a reviewed hold and prohibit broadcast/reprepare. Identity hash/bytes reloaded from committed storage and matched before the sole send. Uncertainty is reconciled by original hash only. Independent post-replay get_battery remains REGISTERED with exact registrationHash, null request/collector/recycler/evidence lifecycle fields, NOT_ELIGIBLE reward. SQL: one battery/registration evidence/operation/identity/dispatch, zero returns/reward_attempts. Historical user, battery, recipient and balances10/80 compare equal before/after.

A further fresh-process, read-only RPC verification (no signer, send denied) at ledger **5322956** independently confirms the original SUCCESS5322924, exact REGISTERED battery/commitment and source sequence/balance unchanged afterC. An independent Supabase MCP SELECT confirms operations1/identities1/dispatches1/returns0/rewards0 and REGISTERED/NOT_ELIGIBLE with null lifecycle actors/request. Safe results included in machine evidence.

## Regression and reproducibility

Focused first: `node --experimental-strip-types --test backend/tests/d1-registration-idempotency.test.ts` **2/2**. Actual local HTTP/Coordinator/Repository cache behavior and bounded operator capability denial; no local test claim of Soroban execution. The initial sandbox denied loopback EACCES; the unchanged test passed outside isolation. No protection disabled or assertion weakened.

`npm run verify`: Rust20 native + same20 with wasm-tests, WASM integration1, release/fmt/Clippy; backend148 including unchanged Foundation50 and D1.7 controlled3, SEP53_V2/PostgreSQL recovery/restart; Python4; MOCK demo SENT10. MOCK does not execute Soroban. The release command reported311m wall time while host/process output was delayed; the delay cause was not diagnosed. No compiler error was suppressed.

HTTP DEV45 serial, own namespaced MOCK fixtures only; safe cleanup and immutable rows retained. SQL parity82 with rollback/0 remaining parity fixtures. Frontend33, TypeScript/lint/build (maxWorkers1). Helper native22 + offline18/fmt/Clippy. Offline signatures use unusable sequence1/expired auth100, no RPC/send. All commands and source hashes in results. The bounded live operator is `node --experimental-strip-types backend/validation/registration-idempotency.ts --execute`; it requires the exact verified implementation HEAD, approved fixture principal and exclusive local journal. It is not a general-purpose registration CLI and must not be rerun/reset to create another fixture. No dependencies installed or global configuration changed. Raven stellarDocs was consulted first; its timeout guidance is consistent with Byetery original-hash reconciliation and stricter no-replacement policy ([official reference](https://developers.stellar.org/docs/tools/cli/agent-cli/quickstart#step-7-verify-what-your-agent-did)). Supabase changelog was reviewed; the [/v1/oauth/token status change](https://supabase.com/changelog/45468-breaking-change-oauth-token-endpoint-will-return-http-200-instead-of-201) does not change the existing Auth admin/generate_link/verify path, whose helper accepts response.ok. No architecture incompatibility identified.

WASM SHA **c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6**. Frozen sources/Cargo.lock/checkpoints/tags intact. Helper binary SHA85f980b2e0dfd3bd2b098daa78c0e743cc07fb5baf18da59aa8fd83dfb9843cb. Protected tools/sync_obsidian.py unchanged/untracked/uncommitted. Secret audit and git diff --check must pass before publishing; publication/readback results reported separately after push.

## D1 decision and publication

D1.5 **READY FOR VALIDATION**, all other eleven D1 criteria remain READY. Official acceptance **0/12**, not PASS; D2/D3 remain0/6,0/5. Historical005 PARTIAL and004 assessment are preserved below the current matrix. New files: bounded validation operator +2 focused tests, this report/results/trace; matrix prefixed, no production source edit.

Publication closure follows this documentation checkpoint: update the six existing Notion structures and [supporting006 task](https://app.notion.com/p/401a46fdfb18811bbf6ddc16f6116d60), move only D1.5 to READY (never PASS), synchronize the existing Obsidian vault using the unchanged protected utility, push this branch and verify public bytes. Final commit/Notion/vault/push readbacks are reported in the final owner-facing closure; this document does not fabricate its own commit hash. No private signing material is mirrored.

**Next task proposal: D1 OWNER ACCEPTANCE REVIEW. Not started. No D2/D3, new reward, lifecycle action beyond registration, role change on chain, redeploy or Mainnet. STOP.**

[Machine results](BYE-W1-006-results.json) · [Idempotency trace](D1-IDEMPOTENCY-TRACE.json) · [Current D1 matrix](D1-ACCEPTANCE-MATRIX.md).
