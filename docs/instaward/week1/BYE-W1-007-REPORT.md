# BYETERY BYE-W1-007 — D1.2 AUTHORIZATION EVIDENCE CLOSURE REPORT

**PASS technical. Current Stage 1 recommendations: 12 ACCEPT / 0 HOLD. Official D1 PASS remains 0/12. OWNER DECISION REQUIRED.**

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. Review/evidence date: 2026-10-22. Starting HEAD `0778ab75000ee1822465045f916eb3a4a0def3dc`; tested implementation `686b792ec813ad13655a6ac7d2e1d7df38d592ac`; branch `instaward/d1-testnet-integration`. The enclosing documentation commit is the evidence checkpoint. No Stage 2, D2 or D3 execution.

## Frozen requirement and trust boundary

Unchanged [D1.2](../ACCEPTANCE-CRITERIA.md): “Attempt each restricted operation with an incorrect actor; test collection missing either required authorization.” Expected: “All unauthorized attempts rejected; SERVICE + COLLECTOR succeeds.” Required evidence: “Negative-test report; positive collection hash and auth detail.”

Direct source inspection confirms `open_return` first executes `config(&e).service.require_auth()`. It uses the service trust boundary, not a caller role lookup. The original Stage 1 HOLD was correct at the time: absent auth and recipient tampering did not prove this explicit wrong-actor case. Existing evidence is not relabeled.

## Explicit wrong-actor proof

New test: [`open_return_rejects_wrong_actor_and_accepts_service_with_identical_arguments`](../../../contracts/byetery-contract/tests/open_return_auth.rs). It runs in a fresh isolated SDK Env, first against native frozen implementation and then against the actual frozen release WASM under `wasm-tests`. These are deterministic fixtures, not transactions, accounts or business records on Testnet.

| Field | Observed/asserted |
| --- | --- |
| Config.service | `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4` |
| Wrong actor | `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOLZM` |
| Different | YES; explicit `assert_ne!` |
| Battery | `BYE-W1-007-AUTH`, registered with explicit ADMIN auth |
| Request | `0707070707070707070707070707070707070707070707070707070707070707`, unused in this fresh Env |
| Recipient | `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M`, distinct from contract |
| Authorized actor for negative | WRONG ACTOR ONLY, exact method and arguments |
| Return | `Err(Ok(Error(Context, InvalidAction)))` |
| Before / after rejection | REGISTERED / NOT_ELIGIBLE / request_id=None |
| Attempted request after rejection | None |
| Lifecycle/reward effect | NONE; full battery equality, both token balances unchanged |
| Successful return events | 0 after rejection |

The test does not omit all auth, tamper with arguments, substitute recipient/request, use an invalid state or grant SERVICE to the wrong actor. The exact same argument vector is reused for the positive control.

The pinned host reports underlying `Auth/InvalidAction` when no authorization tracker matches `Config.service`. Its `try_call` intentionally narrows non-contract host errors to `Context/InvalidAction`, the exact stable exposed error asserted here. This is **not RoleNotGranted**. Rejection at the first auth boundary, together with success using identical valid arguments and only the legitimate actor changed, isolates actor identity.

## Positive SERVICE control

Only Config.service authorizes the same method/contract/arguments. Result: `Ok(Ok(request_id))`; battery RETURNED, request OPEN with the exact battery/recipient, reward still NOT_ELIGIBLE. The exact successful authorization tree contains SERVICE only; exactly one `ReturnOpened` event is asserted. Both token balances remain unchanged. No collection/recycling/payment is invoked in this fixture.

## Regression and intermediate failure

Focused existing authorization test: **1/1 PASS**. Focused new integration test: **1/1 PASS**. Final `npm run verify`: **PASS**, including:

- Original native Rust tests: **20/20**; new native integration: **1/1**.
- Original tests against release WASM: **20/20**; new integration against WASM: **1/1**; constructor WASM integration: **1/1**.
- Release `wasm32v1-none`, `cargo fmt --all --check`, and `cargo clippy --locked --all-targets --features wasm-tests -- -D warnings`: **PASS**.
- Backend **148/148**, TypeScript **PASS**, including original Foundation 50 unchanged.
- Python **4/4**; existing MOCK demo reaches **SENT / 10 GREEN-TEST**, without executing Soroban.

An initial implementation placed the new test in frozen `src/test.rs`. The first root run correctly failed its byte-hash guard; two HTTP tests also failed with sandbox loopback `EACCES`. This failure is retained in machine evidence. The final implementation relocates only the new test to an independent integration file; every original frozen source/test and the checkpoint guard remain byte-identical. Unchanged root verification then passed outside isolation, permitting localhost requests. No Windows protection, assertion, dependency or functional rule changed. No standalone signing suite, remote HTTP/SQL suite or live operator was run.

Root wrapper expands to `cargo-local.ps1 -CargoArguments @('fmt','--all','--check')`, `@('test','--locked')`, `@('rustc','--locked','--release','--target','wasm32v1-none','--crate-type','cdylib')`, `@('test','--locked','--features','wasm-tests')`, and `@('clippy','--locked','--all-targets','--features','wasm-tests','--','-D','warnings')`, followed by backend verify, Python and MOCK demo. Focused new command: `cargo-local.ps1 -CargoArguments @('test','--locked','--test','open_return_auth','open_return_rejects_wrong_actor_and_accepts_service_with_identical_arguments','--','--exact','--nocapture')`; existing focused command uses `--lib test::user_actions_require_service_and_auth_is_bound_to_arguments -- --exact --nocapture`.

Frozen release SHA-256: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6` — **UNCHANGED**. Production Rust, original tests, Cargo.toml/Cargo.lock and checkpoint test hashes match the starting commit. Automatically generated snapshots and local logs stay ignored per repository policy; sanitized focused stdout, source hashes, result counts and log digests are in [machine evidence](BYE-W1-007-results.json).

## Review addendum and publication boundary

The dated addendum in [owner review](D1-OWNER-ACCEPTANCE-REVIEW.md) preserves its original HOLD and updates only the current recommendation. The machine packet retains the original review and exposes `currentStage1Review` explicitly. New evidence fills the sole missing wrong-actor open_return case; the same frozen D1.2 criterion and prior positive/negative evidence now support **ACCEPT**. This is a recommendation, not owner/organizer acceptance.

Recommended: **12/12 ACCEPT, 0/12 HOLD**. Official: **D1 0/12, D2 0/6, D3 0/5**. Matrix remains **12/12 READY FOR VALIDATION**. No Notion/matrix/PASS mutation or Obsidian synchronization. Stage 2 awaits Christian's explicit decision.

New live transactions/signing/broadcasts: **0**. No Secure Store access, Testnet fixture, deployment, on-chain role, Mainnet, schema/RLS, production behavior, WASM or tag change. Existing deterministic backend cryptography is part of the required root regression; no application signing identity is used. `tools/sync_obsidian.py` remains untouched, untracked and uncommitted (SHA-256 `48404b9431a9d955fc4af0b2eeaf9a59bb2fb0e9457eed73b4f2f66132a5e2da`).

Stellar Raven was consulted first. [Official authorization testing](https://developers.stellar.org/docs/build/guides/auth/contract-authorization#test) supports checking exact actor/invocation through Env auth records. Its blanket-auth example is not used for the protected calls: Byetery supplies specific single-actor auth. Pinned local SDK/host source establishes the precise narrowed error; no architecture incompatibility was found.

Secret audit and `git diff --check` are verified before publication; final commit/push are reported separately rather than fabricated in a self-referential manifest. Historical 003 BLOCKED, 003B PARTIAL, 003C technical PASS, 004 technical PASS with then-existing gaps, 005 PARTIAL and 006 technical PASS remain unchanged.

**NEXT PROPOSED ACTION: OWNER DECISION — APPROVE ALL 12 D1 ACCEPT RECOMMENDATIONS. Stage 2 is not executed. STOP.**
