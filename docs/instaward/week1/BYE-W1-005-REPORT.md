# BYETERY BYE-W1-005 — D1 Gap Closure Report

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT · 2026-10-21. **PARTIAL: D1.7 READY FOR VALIDATION; D1.5 BLOCKED by retired historical principal. D1 remains INCOMPLETE,11/12 READY,1 BLOCKED. Official acceptance0/12, D20/6, D30/5.** No D2/D3 or owner acceptance review started.

Starting HEAD91e00286669fd504946db521a86fc78352c60967; tested implementation `59ed3540fcf7672507f48215b1bd916a8bc083c3`; branch instaward/d1-testnet-integration. The final documentation commit is resolved after creation, not guessed. Historical002/003/003A/003B/003C/004 results preserved. Sprint-start and pre-sprint tags unchanged. Protected tools/sync_obsidian.py remains unchanged/untracked/uncommitted.

## Inventory before any API replay

Inspected30 relevant evidence/source/test files before any historical replay:002*,003B*,003C*,004*, original acceptance criteria, current matrix/trace, coordinator/HTTP/idempotency, worker/store/service/identity, restart/database recovery/HTTP tests. Local ignored inventory records file SHA-256. Production code was not changed. Existing reviewed `retrySameHash` was sufficient for the controlled recovery; no new feature/recovery API was introduced.

Raven stellarDocs consulted first. Official documentation says a timed-out write may still land and recommends original-hash/state/sequence verification; Byetery retains its stricter no-automatic-replacement invariant. [Official reference](https://developers.stellar.org/docs/tools/cli/agent-cli/quickstart#step-7-verify-what-your-agent-did). Supabase access in005 is read-only context/state inspection plus the existing isolated HTTPDEV regression; no configuration/schema/RLS change.

## D1.5 — original context recovered, real replay stopped

Original logical operation **6868cdd0-f4e5-483b-aa80-18e26026dd5a**, key **96279fd5-7f6f-4e09-81da-8a8e8c37abaf**, historical tx **ec0f231a61f2c0fa8b1092adae475f6da0f649a2085ee4783fe825ff65b01a27**, ledger **5281390**, PROJECTED/CONFIRMED. One registration identity and one historical dispatch. Commitment **8621077f0c87fdccf7bf798954fb1dab133fff790f43344a10ab33e7818b7665**. Current lifecycle RECYCLED/SENT,5 historical operations.

Authoritative SQL recovered immutable registration manifest, exact normalized request body, original user-scoped cache key/hash, cached201 response and original operation/hash. Recomputed SHA-256 of stored UTF-8 bytes, canonical input hash and command hash all match SQL. Original body and safe correlation are in results. Cache response REGISTERED/NOT_ELIGIBLE is historical operation output, not current battery state.

**BLOCKER:** business principal `dec4c6af-93b6-4e55-80ee-927c17d75217` is DISABLED, auth_user_id NULL, Auth account absent, ADMIN/USER memberships disabled. The original002 operator's finally cleanup explicitly disables this fixture and deletes its Auth account; current facts are consistent with that cleanup. No retained audit is invented to claim its exact deletion time.

The actual API validates a live Supabase Auth session and Repository.principal checks its SQL session and ACTIVE business user before looking up `(deployment_id,user_id,key)`. Another account cannot borrow this cache context. The frozen Foundation user-progress trigger rejects every changed non-null Auth binding with **IdentityImmutable**, including NULL→newAuth. Re-enabling a flag or creating another account would not safely restore the original authenticated context.

Therefore identical real API replay **NOT RUN**; changed-parameter same-key request **NOT RUN**. No login impersonation, new account, role, copied cache, reassigned operation, trigger bypass or schema change. Actual replay assertions are **NOT RUN**, not falsely PASS. Local regression explicitly rejects retired-user session use, different-user cache borrowing and Auth rebind, processor calls0.

Read-only SQL/chain snapshots confirm original hash/identity/dispatch and completed state unchanged. Live new operations/identities/signing/dispatch/broadcast/payment **0**. This no-change observation does not substitute for the missing real API transcript.

Next owner decision requires a separately scoped recovery/evidence review. A consistent pre-cleanup Auth+SQL backup in an isolated recovery environment might preserve the original immutable mapping, but its existence and acceptance sufficiency are **UNPROVEN**. No permission to restore accounts/roles, weaken IdentityImmutable, or create another registration is inferred from005. No automatic compensating Testnet lifecycle is proposed or executed.

## D1.7 — exact controlled before-submit recovery

Evidence mode **CONTROLLED_INTEGRATION_NOT_LIVE_TESTNET**. Two cases: ordinary response and deliberately lost response after the controlled effect. Test source `backend/tests/d1-before-submit.test.ts`.

Actual Coordinator queues one logical operation and its idempotency context; real Repository, full migrations/constraints, TransportStore, DurableTransactionWorker, and TestnetStellarService processing/projection are used. Only external transport/authority are controlled: fixture source key queued explicitly, independent on-disk ledger, SDK Testnet network-bound transaction hash/signature. Real RPC and Secure Store callbacks hard-denied; zero calls. Production source allowlists/simulation/helper are not exercised or changed. Authority supports this one registration fixture only; it does **not** execute Soroban.

The deterministic interruption is inside a test-only wrapper around actual store.persist: SQL COMMIT returns, exact identity readback succeeds, READY/dispatch0 and authority effects0 are captured, then it throws before dispatch intent. No production fault hook. Both application and controlled-authority PGlite databases close and reopen; repository/pool/service/worker/transport reconstructed. Restart key is public-only; prepare/sign assertions reject reuse.

Normal processing remains denied with SignedIdentityRequiresReviewedDispatch. Empty review and wrong hash reject without dispatch. Explicit existing worker.retrySameHash is invoked by same logical operation ID and exact stored hash. It first observes NOT_FOUND, conservatively records SUBMITTED_OR_UNKNOWN, then persists reviewed dispatch intent and performs **attempt1**, followed by same-hash reconciliation and actual SQL projection. Existing observation flag reviewedSameHashRetry=true is disclosed, not renamed as an ordinary automatic resume. The database count0→1 establishes this is the first dispatch, not a prior broadcast.

Both cases: operation1, signed identity1, prepare1, sign1, dispatch before0, effect before0, first dispatch after review1, final controlled effect1. Same identity PK (=operation_id), envelope SHA-256 and network-bound hash before/reopen/final. Final independent authority read REGISTERED equals actual SQL projection. Repeated cache request adds0; changed parameter conflicts; further reviewed retry is terminally rejected. Lost-response variant also projects once from original hash, no replacement.

| Case | Operation | Identity hash | Before / final effects | Dispatches |
| --- | --- | --- | --- | --- |
| Ordinary response | b2d7868a-f849-489f-9e8e-bb7b53c2d9eb | 69ebb1f488677984edc6652e4759f3b5f11ba122dd5d8ee34bf7cb4cfb3462ca |0 /1 |0→1 |
| Lost response | 8ba73bf7-7612-42e7-983b-ee0013ad01c2 | c8970e39f72d1e71020c65f0df9ea0d71568f31ec7b8551c97530477afd4097d |0 /1 |0→1 |

The [controlled trace](D1-GAP-CLOSURE-TRACE.json) records both actual execution traces, durable before/after/reopen labels, source/sequence/network/contract, hash, intent and result. It omits signed envelope/signature bytes. Controlled Testnet-compatible state reads satisfy the explicitly permitted equivalent in005; this is not a live Testnet fault injection, a live contract run or an OS process-kill claim.

## Live lifecycle remains unchanged

Read-only chain before ledger **5318371**, after **5318453**: battery RECYCLED, request CONFIRMED, reward SENT; original recipient USER-1 unchanged. USER-1 **100000000→100000000**, contract **800000000→800000000**. Original paid tx d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02 remains SUCCESS5315915. No business operation repeated; signatures/broadcasts0 in live reads.

## Verification

Focused005 **3/3**. Root verification **PASS**, backend **146/146**, original Foundation50 intact; native Rust20 + same20 with wasm-tests, WASM1, release wasm32v1-none/fmt/Clippy PASS, Python4 and MOCKdemoSENT10. Existing restart/SEP53_V2/PostgreSQL recovery all pass within backend; MOCK does not execute Soroban.

Additional regression: HTTP SupabaseDEV **45/45** with own namespaced MOCK fixtures; SQL parity **82/82**, rollback0fixtures; frontend **33/33**, typecheck/lint/build PASS with maxWorkers1; helper native **22/22**, Secure Store offline **18/18**, fmt/Clippy PASS. No installed tools, global config or Windows protection changed. No production source or migration changed.

Reproduction (DEV settings remain private; HTTP command sets BYETERY_MODE=MOCK and uses the existing authorized DEV config):

```powershell
node --experimental-strip-types --test --test-concurrency=1 backend/tests/d1-before-submit.test.ts
npm run verify
node --experimental-strip-types --test --test-concurrency=1 backend/remote-tests/*.test.ts
node scripts/test-foundation-parity.mjs
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test -- --maxWorkers=1
npm --prefix frontend run build
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action test
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action fmt
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action clippy
node --experimental-strip-types --test backend/signing-tests/offline.test.ts
```

Helper offline suite is explicitly opt-in by that command; its fixture signatures cannot be used on current live Testnet. Never execute a historical live operator to reproduce this task.

## Readiness, invariants and handoff

[Current D1 matrix](D1-ACCEPTANCE-MATRIX.md): **11 READY /0 SUPPORTED /0 NOT YET SATISFIED /1 BLOCKED**, D1.5 only blocked. Official PASS **0/12**; D2 **0/6**, D3 **0/5**. Owner validation decision PENDING. Historical00410/2 assessment remains labeled historical below current005.

Frozen WASM **c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6**. Contract/helper/runtime/schema/RLS/tags unchanged, no new live battery/lifecycle/reward/asset/role/deployment or Mainnet. Only isolated local test fixtures and separately namespaced HTTP MOCK fixtures were created; those are not live Testnet effects. Credentials/private keys/JWT/signatures/envelopes are excluded from public evidence and vault.

Notion existing Project Plan/Development Log/Changelog/Tests & Evidence/Decisions & Risks and Obsidian are synchronized at closure. Secret audit/diff check/branch push and public verification are completed after the evidence commit and reported separately, not inferred from test success. Main is not merged. tools/sync_obsidian.py stays protected/untracked.

**BYE-W1-005 PARTIAL. D1 INCOMPLETE.** Resolve retired-principal evidence/recovery scope before D1 acceptance; do not approve D1 automatically. STOP. No D2/D3 or owner acceptance review initiated.
