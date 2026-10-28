# D2-004 â€” Role / permission matrix

Current status (2026-10-28): **D2-004 = IMPLEMENTED / GAP 1+2 CLOSED / D2-005 REQUIRED**. **GAP 1 FIXED / GAP 2A FIXED / GAP 2B FIXED.** See [GAP 2B](#gap-2b--continuous-authority-until-first-dispatch). D2.1 is not automatically PASS; D2-005 dynamic/adversarial acceptance evidence is still required and has not started. Official internal acceptance remains D1 12/12, D2 1/6, D3 0/5, total 13/23.

## HISTORICAL / SUPERSEDED â€” Initial blocked review and prior follow-ups

Historical owner-authorized follow-up: **PARTIAL â€” GAP 1 FIXED / GAP 2 PENDING**. See [GAP 1 â€” FIXED](#gap-1--fixed) below. The following original blocked review is retained as historical evidence at checkpoint `1d85f1a`.

Status: **BLOCKED â€” COUNCIL REVIEW RECOMMENDED**. Read-only observations and isolated characterization tests are complete; permission requirements are NOT fully verified. This is not D2.1 acceptance and is not `IMPLEMENTED / VERIFIED / EVIDENCE READY`.

Review checkpoint: `58adca0d52e076b35464f85dae924ab14707e162`, branch `instaward/d2-web-mvp`. Observations: 2026-10-22 America/Santiago (2026-10-23 UTC). D2-005 has not started.

## Authority and actors

Deployment: `5c0cad2f-5f25-4216-8068-6cb9d2d26325`, exclusively TESTNET.

Contract: `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`.

The frozen ABI has **no `get_role`**. Its existing getter is `has_role(address, ActorRole) -> bool`, where ActorRole is Collector or Recycler. ADMIN and SERVICE are configured identities, verified through `get_config`; USER is an application role. No ABI/contract change is needed for this naming clarification.

| Alias | Stellar public address | Expected actor role | Actual actor role | Observation |
| --- | --- | --- | --- | --- |
| ADMIN | GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F | NONE; Config.admin | NONE; Config.admin matches | PASS |
| SERVICE | GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX | NONE; Config.service | NONE; Config.service matches | PASS |
| COLLECTOR | GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V | COLLECTOR | COLLECTOR | PASS |
| RECYCLER | GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2 | RECYCLER | RECYCLER | PASS |
| USER1 | GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS | NONE | NONE | PASS |

Both actor-role booleans were read for each address, so NONE means both returned false, not a missing provider response. Config was read at ledger 5338859; role reads span ledgers 5338859â€“5338861. These are sequential read snapshots, not one atomic ledger snapshot. No USER2 was queried.

## Application memberships

Actual SQL was executed in `BEGIN READ ONLY` with connection-level `default_transaction_read_only=on`, then rolled back. Selected columns omit Auth UUIDs, application UUIDs, emails, sessions and credentials. Sanitized observations: [D2-004-ROLE-READS.json](D2-004-ROLE-READS.json). Aliases identify account function, not a public login name.

| Account alias | Principal | Memberships | Enabled | Mapping |
| --- | --- | --- | --- | --- |
| Active ADMIN test principal | ACTIVE | ADMIN, USER | Both true | ADMIN resolves through deployment config; membership actor_address is null by schema |
| Historical retired ADMIN principal | DISABLED | ADMIN, USER | Both false | Retained historical principal; no reactivation/rebinding |
| COLLECTOR | ACTIVE | COLLECTOR, USER | Both true | COLLECTOR address above |
| RECYCLER | ACTIVE | RECYCLER, USER | Both true | RECYCLER address above |
| USER1 | ACTIVE | USER | True | Identified through the existing D1 historical request; expected wallet above |

All rows belong to the exact deployment above. No current actor/config mismatch was observed. The retired ADMIN is expected historical state, not a newly discovered role mismatch. SERVICE is not an evaluator membership or a browser role.

## Permission matrix and enforcement

Roles are additive: operator accounts also have USER membership. Allowed actions below remain conditional on a validated session, ACTIVE principal, correct deployment, battery/request state, ownership and evidence. No live action was executed for this matrix.

| App role | Allowed actions / expected gate | Forbidden actions | API/server enforcement | Frozen contract enforcement |
| --- | --- | --- | --- | --- |
| USER | Authenticated battery read; own wallet/requests; open return using own verified wallet; cancel own uncollected request; request own eligible reward | Collection, recycling, registration, role changes | Session/principal; wallet ownership; request owner; privileged role queries. **Disabled USER gap below** | Service authorizes open/cancel/reward; USER is not an on-chain signer role. Contract deliberately trusts service for authenticated-user actions |
| ADMIN | Application registration; request eligible reward as admin | Collection/recycling without their separate memberships; browser/API role changes | `Repository.role(...,'ADMIN')`; reward owner-or-ADMIN; no set_role HTTP route. **Queued revocation gap below** | Config.admin auth for registration; does not imply Collector/Recycler. Contract set_role is admin-only, but unavailable through this API and not executed here |
| COLLECTOR | Collection with correct evidence and request | Recycling, registration, role changes without their separate memberships | Enabled deployment-scoped COLLECTOR membership supplies actor address | Actor auth + Collector role + Config.service auth; evidence and lifecycle checks |
| RECYCLER | Recycling with correct evidence and request | Collection, registration, role changes without their separate memberships | Enabled deployment-scoped RECYCLER membership supplies actor address | Actor auth + Recycler role; evidence and lifecycle checks |

SERVICE separately: operational Config.service identity for open_return, cancel_return, dual-auth collection and pay_reward. It cannot be selected as an application role. No signer was constructed or invoked during these observations.

UI affordances are not counted as authorization. Relevant actual paths: `backend/src/application/http.ts`, `coordinator.ts`, `repository.ts`; `backend/src/testnet/service.ts` and `transport.ts`; frozen `contracts/byetery-contract/src/lib.rs`. A chain-role mismatch is rejected by the contract's role check during simulation/execution; app membership alone cannot grant a chain role. Conversely, chain authorization cannot check an off-chain disabled membership and relies on the service boundary.

| Enforcement layer | Verification credit |
| --- | --- |
| UI | No security credit for hidden/disabled controls; no new browser permission acceptance claimed |
| API/server | Enabled privileged-role queries and ownership checks observed; disabled USER and queued revocation gaps reproduced below |
| Contract | Frozen configured identities, Collector/Recycler role checks and required authorization enforce contract privileges; they cannot enforce Supabase membership revocation |

## Stop conditions reached

### 1. Disabled USER is not a mutation gate

`Repository.principal` verifies the Auth session and ACTIVE principal, then inserts the default USER membership with `ON CONFLICT DO NOTHING`. It does not require an existing USER row to be enabled. `Coordinator.queue` checks ADMIN/COLLECTOR/RECYCLER for privileged routes, but not USER for return/cancel/user-reward paths.

An isolated PGlite fixture with a valid session, ACTIVE principal, existing verified wallet and **enabled=false USER membership** successfully persisted one open_return logical operation and reached an inert test processor (202). The disabled row stayed disabled. No chain preparation, signing or submission was performed. This contradicts the requested fail-closed disabled-membership boundary; it does not prove a live on-chain unauthorized return.

### 2. Queued operation guard does not recheck revoked app authority

An isolated registration was queued while ADMIN was enabled, using the actual Coordinator. After that fixture membership was disabled, `Repository.role(...,'ADMIN')` correctly rejected it, but the actual `PersistedContextGuard.validate(work)` still completed successfully. The guard checks immutable operation/config/evidence, but does not reload the principal or the required membership.

This shows a missing application authorization check at the documented pre-sign boundary, not a completed unauthorized transaction. No signer, worker run or broadcast was used. The contract can still require the correct ADMIN Stellar identity, but it cannot inspect application membership revocation.

**No fixes were applied.** No global claim that D1 tests failed is made; these cases were not covered by the earlier acceptance evidence. D1 acceptance and historical evaluations remain intact. Council review should determine revocation semantics and the smallest server-side correction before further implementation. Candidate scope for review only: require the appropriate enabled deployment membership for new user operations; revalidate the original principal/membership/actor binding at signing/dispatch gates, preserving durable UNKNOWN/reconciliation semantics. This is a proposal, not implemented behavior or permission to alter pending transactions.

## Tests and limits

`backend/tests/d2-permission-matrix.test.ts`: 3/3 characterization tests executed successfully against ephemeral migrated PGlite:

- Direct SQL role matrix covers four roles, rejected cross-role lookup, missing member, disabled COLLECTOR, unknown role and wrong deployment.
- Disabled USER open_return reproducer records the current gap.
- Revoked ADMIN pre-sign guard reproducer records the current gap.

The latter two passing assertions mean the **defects were reproduced**, not that fail-closed requirements pass. End-to-end mismatch/revocation acceptance remains NOT VERIFIED. Broader D2-004 implementation and D2-005 stopped on these findings. Existing suites and final verification outcomes are recorded in the task completion response; local logs remain ignored.

Final `npm run verify`: **PASS** â€” backend 177/177 including original Foundation tests and the three new characterization tests; TypeScript PASS; Rust native 20 + wrong-actor integration test PASS; WASM-feature run 20 + wrong-actor integration + WASM constructor test PASS; release wasm32v1-none build, rustfmt and Clippy PASS; Python 4/4 PASS; local MOCK demo reaches SENT / 10 GREEN-TEST. Rebuilt WASM SHA-256 remains `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

The initial sandboxed verification could not connect its local HTTP tests to 127.0.0.1 (`EACCES`). The complete suite was rerun outside that sandbox network restriction and passed without changing tests or protections. Frontend sources were not changed; no new frontend/browser or hosted acceptance is claimed. Scoped secret audit (seven intended files) and `git diff --check`: PASS.

## Safety and project status

Remote SQL writes: 0. Stellar transactions/signatures/broadcasts: 0. Contract/WASM/schema/RLS/roles/credentials changes: 0. Production application code changes: 0. No lifecycle, reward, set_role, Vercel action, USER2, D2-005 or merge was initiated.

D1 12/12 PASS; D2 **1/6 PASS (D2.4 only, OWNER ACCEPTED)**; D3 0/5; total **13/23**. No Stellar/SDF/Instawards acceptance or payment asserted.

Raven stellarDocs was consulted first. Its search found the official [simulateTransaction getter guide](https://developers.stellar.org/docs/build/guides/transactions/simulateTransaction-Deep-Dive); page content was checked directly because Raven's section lookup returned no content. Only unsigned getter simulations and read RPC methods were used; no submission occurs from a getter simulation.

## GAP 1 â€” FIXED

**HISTORICAL / SUPERSEDED checkpoint record.** The GAP1 fix remains in force; its GAP2-pending conclusions describe that earlier checkpoint only.

Owner decision after Council review: FIX REQUIRED; authorization semantics **B â€” continuous until broadcast**; D1 **DO NOT REOPEN**. This task implements only the GAP1 application-request boundary. Continuous authorization at transport/signing/broadcast remains **GAP2 PENDING**, not implemented or claimed here.

Previous reproduced behavior: a valid session and ACTIVE principal with USER enabled=false could enqueue open_return; protected battery reads and direct wallet mutation helpers also lacked the exact USER assertion. History accepted any enabled membership. The historical evidence above is preserved.

### Implemented gate

- One read-only `requireMembership` helper checks a known role, exact deployment, exact application user, enabled=true and ACTIVE principal. Unknown roles reject with 403. `Repository.role` delegates to it. No membership update, reactivation or grant is performed by this helper.
- Open return, cancellation, wallet challenge/verify and owner reward require USER before idempotency lookup, including cached HTTP responses and cached pending operation IDs. Existing ownership, wallet, lifecycle and reward checks remain required. Non-owner ADMIN reward override retains its existing ADMIN gate without requiring USER.
- Direct WalletService.challenge/verify calls use the same helper before changing challenge state, nonce consumption, attempts or wallet links. Signature schemes, verification algorithms and challenge bytes are unchanged.
- Protected Coordinator.get, battery detail and history require USER. History retains its read-only transaction, session check, ACTIVE check and no provisioning. An enabled ADMIN/COLLECTOR/RECYCLER sibling does not substitute for USER on protected reads.
- GET /api/me retains Auth/session/ACTIVE validation. If USER is disabled, it returns account ID, existing enabled role names and `membershipStatus: DISABLED`, plus empty wallets/requests and hasMoreRequests=false. It does not query protected wallet/request/battery data on that path. Existing privileged role names remain available for role-only application navigation; they do not authorize USER operations.
- Principal provisioning remains unchanged: first access may provision the default USER membership with ON CONFLICT DO NOTHING. An existing disabled membership stays disabled. Privileged registration/collection/recycling retain their separate role gates without a new USER prerequisite.

### Tests and regression evidence

Failing tests were written and executed before production changes. After correcting test-only fixture setup to satisfy existing deployment uniqueness and claim-binding constraints, the pre-fix run reproduced HTTP 202 instead of 403 for disabled USER open_return, missing direct wallet rejection, and protected read HTTP 200 instead of 403. No production rule or constraint was weakened to construct the fixtures.

`backend/tests/d2-user-membership.test.ts` exercises the actual local HTTP API and direct service methods with a valid test Auth identity, SQL session, ACTIVE principal, enabled/disabled memberships and verified wallets in ephemeral migrated PGlite. Its operation processor is inert: accepted requests prove durable application queue creation only, not chain execution. Its injected wallet verifier is test-only; existing real Ed25519/SEP53/legacy tests remain separate.

Coverage includes disabled USER return/cancel/owner reward/wallet operations; zero new operation/request/reward/accepted-idempotency side effects on rejection; unchanged request and nonce state; protected get/detail/history; sanitized /me with a privileged sibling role; enabled USER controls; wallet/request ownership; reward eligibility; cached pending-operation/HTTP-response replay after revocation; enabled idempotent replay and conflicting input; role-only ADMIN/COLLECTOR/RECYCLER; non-owner ADMIN reward override; wrong deployment, unknown role, first provisioning, revoked session and disabled principal.

The original GAP1 characterization is now a rejection regression test. The GAP2 pre-sign characterization remains unchanged and still demonstrates the pending gap. Existing wallet fixtures now explicitly provision USER memberships so their wrong-user/deployment/legacy/nonce tests continue to exercise their original boundaries rather than bypass the new gate.

| Verification | Result |
| --- | --- |
| Pre-fix trigger | FAIL as expected: disabled USER accepted at queue, wallet and protected read boundaries |
| Focused five-file suite | 52/52 PASS |
| Root `npm run verify` / complete backend | PASS; 184/184 backend tests, zero failures/skips, TypeScript PASS; existing Foundation and D1 tests retained |
| Frontend relevant regression | TypeScript PASS; lint PASS; 123/123 tests in 9 files PASS; no frontend source changes |
| Frozen Rust / WASM | Native 20 + wrong-actor integration PASS; WASM-feature 20 + wrong-actor + WASM constructor PASS; release build, fmt and Clippy PASS |
| Python / MOCK demo | 4/4 PASS; REGISTERED â†’ RETURNED â†’ COLLECTED â†’ RECYCLED â†’ SENT, 10 simulated GREEN-TEST |
| Secret / whitespace audit | PASS: scoped 12-file source/test/document audit with zero findings; `git diff --check` PASS; staged contents also checked before checkpoint |
| Read-only independent candidate review | No concrete in-scope surviving bypass or legitimate-input regression found. Reviewer loopback tests were sandbox-blocked by EACCES; the main permitted local HTTP run passed |

Rebuilt WASM SHA-256 is unchanged: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`. Local test logs remain ignored. No live Supabase Auth/HTTP suite was executed; these are isolated application boundary regressions, not a new remote end-to-end claim.

### Effects, remaining boundary and project status

Stellar transactions: **0**. Operational signatures: **0**. Broadcasts: **0**. Remote Supabase connections/mutations: **0**. No contract/WASM source, deployment, schema/RLS, role, credential or Vercel change. Existing local verification rebuilds must retain the frozen WASM hash. No USER2, new real lifecycle or reward was used.

PersistedContextGuard, TestnetTransport, worker submission, signer, expiry and SUBMITTING semantics are untouched. No command-to-authority mapping for queued work, AUTHORIZATION_REVOKED state or GAP2 fix was added. The owner-selected continuous authorization policy is not yet fully enforced until that separately authorized work closes GAP2.

**D2-004: PARTIAL â€” GAP 1 FIXED / GAP 2 PENDING.** D1 remains 12/12; D2 1/6 (D2.4 only); D3 0/5; total 13/23 internal owner acceptance. No D2.1 PASS, external organizer acceptance/payment, or D2-005 start is asserted. STOP after this task.

## GAP 2A â€” QUEUED AUTHORITY REVALIDATION

**HISTORICAL / SUPERSEDED checkpoint record.** Its implementation remains valid; the current GAP2B section below supersedes its pending-boundary status, not its evidence.

Current implementation record: **2026-10-28**. This section supersedes the current-status conclusions above without changing the historical reproductions or GAP1 results. Formal base: `d5e53dd589a5cb8b5dd891b78d2fed901fe2361d` on `instaward/d2-web-mvp`.

### Demo isolation and reproduced defect

The local demo-only code commit `46a1086019bbfa95efb8767cc9b2441842ea838a` and its evidence checkpoint `b4d873851699a7f0f6ec0779eacc802a1ec44ee1` are preserved on local branch `demo/local-testnet-ui`. They are excluded from this formal patch and its push. Original untracked files, including the custody audit and Obsidian tool, remain untouched and outside the commit.

Before the fix, the actual ADMIN persisted-guard regression failed with **Missing expected rejection**: after an authorized registration was queued, revoking ADMIN did not cause `PersistedContextGuard.validate` to reject. This was reproduced using disposable migrated PGlite only, with no Stellar preparation, operational signing or broadcast.

### Single authority policy and immutable context

`backend/src/application/authority.ts` defines one compile-time exhaustive policy, shared by the application queue and persisted pre-sign guard. Unknown command kinds, inherited object property names and `set_role` are denied. Wallet and protected-read USER gates introduced by GAP1 remain in place.

| Durable command | Required current application authority | Additional binding |
| --- | --- | --- |
| `register_battery` | ADMIN | Exact deployment and ACTIVE original principal |
| `open_return` | USER | Existing recipient snapshot checks retained |
| `cancel_return` | USER | Original principal owns the exact request and battery |
| `confirm_collection` | COLLECTOR | Enabled membership actor equals `command.collector` exactly |
| `confirm_recycling` | RECYCLER | Enabled membership actor equals `command.recycler` exactly |
| `pay_reward`, original principal is request owner | USER | No fallback to an enabled ADMIN sibling |
| `pay_reward`, original principal is not request owner | ADMIN | Owner resolved from the original reward attempt/request |

The durable principal is loaded from `app_private.stellar_operations.principal` through `TransportStore.work`, then independently compared with that operation's SQL row in the guard. It must be a present application UUID; request input cannot select it. The guard also verifies exact deployment/network/contract, operation command, battery, stored parameters hash and work command hash before applying current membership checks. Membership must be enabled and its principal ACTIVE.

Reward authority is resolved through the reward attempt bound to this exact operation and its original return request, with matching deployment, battery and confirmed chain projection request. The operation principal, reward-attempt request association and request owner are already immutable. No new authority-class column or migration is needed, and the lookup does not switch to an unrelated/latest claim.

Current membership/ownership/actor failures produce the stable domain error `AuthorizationRevoked`; `TestnetStellarService.process` exposes it as HTTP 403 rather than an RPC/simulation/network error. The existing transport invokes the guard before preparation and again before each signing phase. No transport, signer or worker submission redesign is included. A preparation interrupted by this rejection retains the existing auditable operation and requires `ExplicitUnsignedResumeRequired` on automatic replay; no identity or dispatch is created. This is not a new durable authorization-revoked state.

### Regression evidence

`backend/tests/d2-queued-authority.test.ts` uses the real Coordinator, SQL-backed TransportStore, PersistedContextGuard and transport with RPC/preparation/signer tripwires. All seven valid authority paths pass unchanged before their required membership is disabled. Each revoked path then rejects before those tripwires are invoked. The ADMIN case also exercises the real application service response and replay boundary: 403 `AuthorizationRevoked`, zero identities, zero dispatch attempts, then explicit unsigned review required.

Both enabled operator actor-mismatch cases reject. Additional controls cover missing/changed work principal, inactive principal, absent membership, wrong deployment, cancellation by a non-owner, SQL rejection of attempts to change reward authority bindings, and unknown commands. Ordinary schema constraints already prohibit membership deletion/rebinding. Only these adversarial membership-corruption tests temporarily disable that immutable trigger inside their disposable PGlite fixture, then restore it; no migration, production constraint or remote database is changed.

The first full run caught a response-semantics regression in the unchanged D1 retired-principal cache test: moving privileged queue checks before cache lookup threw `RoleRequired` instead of retaining the existing 403 Reply. Privileged checks were restored to their original queue/error-handling boundary while still using the shared authority policy; GAP1 USER/reward pre-cache checks remain in place. The unchanged D1 test and targeted GAP1/GAP2A recheck passed (16/16) before repeating the complete suite. D1 implementation and evidence were not changed.

| Verification, final candidate | Result |
| --- | --- |
| Original persisted ADMIN regression, before fix | FAIL as expected: Missing expected rejection |
| Focused GAP2A and permission-matrix suite | 16/16 PASS |
| Targeted recheck including unchanged D1 retired-principal regression | 16/16 PASS |
| Root `npm run verify` | PASS, exit 0 |
| Complete backend, including GAP1 and existing Foundation/D1 tests | 197/197 PASS; 0 failed, skipped or cancelled |
| Backend TypeScript | PASS |
| Frozen Rust native | 20 unit tests + 1 wrong-actor integration PASS |
| Frozen WASM-feature suite | 20 unit tests + 1 wrong-actor integration + 1 WASM constructor PASS |
| Release WASM / rustfmt / Clippy with warnings denied | PASS |
| Python | 4/4 PASS |
| Existing offline MOCK CLI demo | REGISTERED â†’ RETURNED â†’ COLLECTED â†’ RECYCLED â†’ SENT; exactly 10 simulated GREEN-TEST |
| Secrets and whitespace | Zero audit findings; `git diff --check` PASS; exact staged patch audited before commit |
| Protected paths and original untracked files | Contract, schema/RLS, frontend, signer/transport/worker unchanged; protected file hashes and original refs/tags retained |

Rebuilt WASM SHA-256: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6` (unchanged). No frontend or shared browser DTO is changed; `Work.principal` is backend-internal, so no frontend regression run is required for this patch. Logs remain local and ignored. The complete suite uses offline fixtures/local loopback, not the remote DEV HTTP suite or a live Testnet flow.

### Remaining boundary and acceptance

**D2-004: PARTIAL â€” GAP 1 FIXED / GAP 2A FIXED / GAP 2B PENDING.** Continuous authority until broadcast is not claimed complete: post-sign revocation, submit/lease transitions, envelope expiry and ledger windows remain separately reviewable GAP2B work. No GAP2B or D2-005 is started here.

New live Stellar transactions: **0**. Operational signatures: **0**. Broadcasts: **0**. Remote Supabase access/mutations: **0**. No USER2, real lifecycle, real reward, contract/WASM source, signer, deployment, roles, schema/RLS, credentials, Vercel or D1 evidence changes. Local test cryptography and the existing MOCK demo do not constitute operational Testnet signing or execution.

Internal owner acceptance remains **D1 12/12; D2 1/6 (D2.4 only); D3 0/5; total 13/23**. No additional criterion, organizer acceptance or payment is asserted.

## GAP 2B â€” CONTINUOUS AUTHORITY UNTIL FIRST DISPATCH

Owner authorization: 2026-10-28. Formal parent: `615ea9b87544e80b07fb9469b1a81f295f76bdbf`, branch `instaward/d2-web-mvp`. No demo branch content is included.

### Durable authorization boundary and serialization

The policy is **CONTINUOUS UNTIL FIRST BROADCAST ATTEMPT**, whose durable boundary is `DISPATCH_INTENT / dispatch_attempts > 0`. This is an intent boundary: a crash after committing intent may precede any actual network send. It still must reconcile the original hash rather than assume it was never sent.

`assertPersistedAuthority` extracts the GAP2A SQL checks into one SQL-only function used by both PersistedContextGuard and TransportStore.dispatchIntent. It keeps the original `requiredAuthority` mapping, immutable operation principal, original reward-attempt/request owner, cancellation ownership and exact collector/recycler actor. No client selects a role or authority class.

For a first dispatch, inside the same short fenced SQL transaction that would increment attempts, the store locks the ACTIVE principal `FOR SHARE`, then the enabled required membership `FOR SHARE`. PostgreSQL holds those locks through commit, serializing against principal disable and membership UPDATE/DELETE. The membership lock is not `FOR KEY SHARE`, which would be insufficient for an enabled-flag update. No RPC, signer, sequence read or other external callback runs inside this transaction.

If current authority is invalid, the transaction records existing review evidence: `classification: REVIEWED_RESOLUTION_REQUIRED`, `reason: AUTHORIZATION_REVOKED`. It commits that evidence before throwing `AuthorizationRevoked`, avoiding rollback of the hold. It does not increment dispatch attempts, change READY to DISPATCH_INTENT, mark application/reward attempts SUBMITTED, call assertSourceSequence, submit or re-sign. The envelope and hash remain immutable. A previously recorded authorization hold is sticky even if a role is later re-enabled.

### Actual revocation paths

Repository/migration/test search found **two internal production-source cleanup paths** that disable application memberships: `backend/src/application/dev-fixture.ts` and `backend/src/testnet/sprint-validation.ts`. No general application/browser role-revocation endpoint exists; none was created. Both internal paths now call `disableMemberships` within their existing caller-owned SQL transaction. These paths were inspected/updated, not executed against remote Auth or Supabase.

The internal helper locks the principal and all its deployment-scoped membership rows in a consistent role order, updates only requested roles (or all for cleanup), then inspects only exact-deployment/principal signed READY work with zero attempts. A current invalid required authority adds the authorization hold in that same transaction. Locking the membership rows in one order also prevents concurrent different-role revocations from inverting membership/work locks. It never takes the source lease or opens a nested transaction. Revoking an unrelated sibling role does not hold an operation with valid required authority.

Direct SQL/admin updates outside this helper cannot proactively append its review evidence. Nevertheless the independent first-dispatch locked check rejects the resulting disabled authority and persists the hold before any first attempt. Administrative tooling must use the helper for immediate signed-READY holds. No migration/trigger or new public role-management API was added.

### Signed-but-revoked, source lease and post-boundary truth

Held work retains its existing transport state (normally READY) plus append-only review evidence; no transport enum was added. An explicit reviewed first dispatch may already have observed NOT_FOUND and reached a coarse SUBMITTED_OR_UNKNOWN state with zero attempts. It remains pre-boundary: locked authorization rejection still prevents send, and joint terminal proof can resolve that hold without a replacement. The final regression covers this case; dispatch_attempts, not a coarse state label, defines the boundary. Worker restart and explicit same-hash retry routes cannot dispatch or prepare a replacement for an authorization hold. They may only gather original-hash/expiry/state evidence. The existing `(network_id, source_account)` lease rule continues excluding another unresolved operation, even after the worker releases its short claim or its lease expires.

Once `dispatch_attempts > 0`, membership revocation does not add an authorization hold, change transport outcome or block ordinary original-hash reconciliation. Existing D1 uncertainty, reviewed same-hash retry, final source-sequence check and projection semantics remain in place. Chain-confirmed truth wins after that boundary. No replacement identity is introduced.

### Expiry and terminal application semantic

A signed-revoked identity is terminal only with all four proofs together:

1. Trusted closed-ledger time is strictly greater than stored envelope max_time.
2. That ledger is strictly greater than **every** stored authorization expiration (equality is insufficient).
3. The original transaction hash is NOT_FOUND at that post-expiry closed ledger.
4. A nonempty authoritative state proof at a ledger no earlier than the observation confirms the intended effect was NOT_APPLIED.

NOT_FOUND, an RPC outage, one expired auth entry, an expired envelope alone, a stale state read, APPLIED or UNRESOLVED do not release the source. Review observations retain the AUTHORIZATION_REVOKED classification; they do not become RPC_OUTAGE, CONFIRMED_FAILED or ordinary EXPIRED_UNRESOLVED.

The real transport's separate `inspectRevokedEffect` uses the existing contract getters with restoration rejection and conservative command-specific non-application predicates: absent/different immutable registration; absent unique return request; a matching non-cancelled request for cancellation; exact still-RETURNED/OPEN collection; exact still-COLLECTED/CONFIRMED recycling; or RECYCLED/PENDING with its confirmed request for reward. It uses the **minimum** relevant getter ledger, not a maximum that could conceal a stale request read. Reward recipient facts are checked against the existing SQL snapshot. An omitted raw ledger entry alone is never proof. A getter requiring restorePreamble or an archived-entry restore list rejects, preserving the distinction between archived and nonexistent records. The ordinary post-dispatch expiry reader is unchanged.

The fenced terminal SQL transition uses existing `EXPIRED_NOT_APPLIED` plus explicit AUTHORIZATION_REVOKED evidence. The application operation becomes REJECTED with `error_code=AuthorizationRevoked`; a reward attempt becomes FAILED with that same application error (not a failed chain receipt). Open-return reservation release remains subject to existing SQL constraints. The service exposes AuthorizationRevoked as HTTP 403 and the result port preserves that application error. No new schema/state is necessary. A terminal resolution releases source exclusion for other reviewed work; it does not authorize replacing this identity or paying the same reward again.

### Signer-ledger audit and official protocol references

**SIGNER LEDGER PATH = PASS.** Node's TestnetTransport.signingRequest obtains currentLedger from `TestnetRpc.latest()` at fixed `https://soroban-testnet.stellar.org`, after the network passphrase check. Expiration remains server-derived at preparedLedger + 60; the current ledger must be within 20 ledgers of preparation. Envelope validity remains bounded (preparation uses trusted close time + 180 seconds; signing rejects bounds beyond trusted close time + 300 seconds). The unchanged Rust signer additionally bounds authorization expiry to at most 120 ledgers beyond currentLedger. HTTP bodies pass existing strict whitelists; no browser/client/API path can provide current_ledger or signature_expiration_ledger. No signing-window values or signer code changed.

Raven stellarDocs was consulted before protocol decisions. Official references: [inclusive signature-expiration boundary](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations#auth-entry-structure), [archival/automatic restoration](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival#contract-data-automatic-restoration). The SQL locking design follows [PostgreSQL row-lock conflicts](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS). No incompatibility requiring a contract or signer change was found.

### Threat-model limit

Before the durable first-attempt boundary, Byetery does not intentionally broadcast after detecting revoked application authority. It holds signed-but-undispatched work, creates no automatic replacement, and reconciles an uncertain attempted broadcast by its original hash. A revocation after committed dispatch intent does not cancel that already-started attempt. **Byetery does not prevent a stolen signed XDR or Soroban auth entry from being submitted externally outside Byetery.** Unexpected receipts or effects for a pre-dispatch hold remain reviewed resolution, not invented non-application proof. No protection against external theft/submission is claimed.

### Verification and scope

| Verification, final candidate | Result |
| --- | --- |
| GAP2B focused run before sibling-role control | 10/10 PASS |
| GAP2B final cases, included in complete suite | 12/12 PASS: 8 durable-authority cases, 2 real PostgreSQL races, 2 real transport reader/restoration cases |
| Real concurrent membership/dispatch serialization | 2/2 PASS; both deterministic winners, actual pg_stat_activity Lock wait observed |
| GAP2A and worker early regression | 33/33 PASS; every required revocation and actor-mismatch path retained |
| GAP1, D1 and Foundation regressions | PASS within complete suite; historical D1 test/evidence sources untouched |
| Root npm run verify / backend / TypeScript | PASS, exit 0; 209/209 backend, 0 failures/skips/cancellations; TypeScript PASS |
| Frontend regression | 123/123 PASS in 9 files; no frontend source or shared DTO edits |
| Frozen Rust / WASM | Native 20 + wrong-actor integration PASS; WASM-feature 20 + wrong-actor + WASM constructor PASS |
| Release WASM / rustfmt / Clippy -D warnings | PASS |
| Python | 4/4 PASS |
| Existing offline MOCK CLI demo | REGISTERED â†’ RETURNED â†’ COLLECTED â†’ RECYCLED â†’ SENT, exactly 10 simulated GREEN-TEST |
| Secret / whitespace audit | Zero findings; git diff --check PASS; exact staged patch audited before commit |

Rebuilt WASM SHA-256 remains `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`. Real PostgreSQL sessions prove the lock interleavings; PGlite is not used as evidence of concurrent row locking.

The owner separately authorized portable PostgreSQL for these tests only. Official EDB ZIP: `postgresql-17.11-5-windows-x64-binaries.zip`, SHA-256 `80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f`. Runtime, ephemeral cluster, configs and logs remain ignored under `.tools/d2-gap2b`; loopback only, no Windows service/global configuration or package dependencies changed. The Windows short path of that same ignored directory resolves an initdb path-encoding issue. Tests verify the exact local data directory before creating uniquely namespaced databases and delete only databases they created. No remote connection URL/credential is consumed by these tests. PostgreSQL is stopped after validation; the active test config is archived locally as `postgres-test.last-run.json`. To repeat the real races, start this same local cluster on its recorded loopback port and copy that archived config back to `postgres-test.json`, then run the concurrency test or npm run verify. Without the optional portable fixture, the explicit PostgreSQL integration cases report SKIP rather than pretending PGlite proves row locks; this recorded full run had zero skips.

Live Stellar transactions **0**; operational signatures **0**; broadcasts **0**; remote Supabase connections/mutations **0**. Only ephemeral fixture keys/signatures and local databases were used. Frozen contract/WASM, Rust signer, schema/RLS, roles/identities, USER2, D1 evidence, Vercel, main and tags are unchanged. No D2-005 start or new owner acceptance is asserted.
