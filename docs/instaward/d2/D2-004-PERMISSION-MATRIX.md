# D2-004 — Role / permission matrix

Status: **BLOCKED — COUNCIL REVIEW RECOMMENDED**. Read-only observations and isolated characterization tests are complete; permission requirements are NOT fully verified. This is not D2.1 acceptance and is not `IMPLEMENTED / VERIFIED / EVIDENCE READY`.

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

Both actor-role booleans were read for each address, so NONE means both returned false, not a missing provider response. Config was read at ledger 5338859; role reads span ledgers 5338859–5338861. These are sequential read snapshots, not one atomic ledger snapshot. No USER2 was queried.

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

Final `npm run verify`: **PASS** — backend 177/177 including original Foundation tests and the three new characterization tests; TypeScript PASS; Rust native 20 + wrong-actor integration test PASS; WASM-feature run 20 + wrong-actor integration + WASM constructor test PASS; release wasm32v1-none build, rustfmt and Clippy PASS; Python 4/4 PASS; local MOCK demo reaches SENT / 10 GREEN-TEST. Rebuilt WASM SHA-256 remains `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

The initial sandboxed verification could not connect its local HTTP tests to 127.0.0.1 (`EACCES`). The complete suite was rerun outside that sandbox network restriction and passed without changing tests or protections. Frontend sources were not changed; no new frontend/browser or hosted acceptance is claimed. Scoped secret audit (seven intended files) and `git diff --check`: PASS.

## Safety and project status

Remote SQL writes: 0. Stellar transactions/signatures/broadcasts: 0. Contract/WASM/schema/RLS/roles/credentials changes: 0. Production application code changes: 0. No lifecycle, reward, set_role, Vercel action, USER2, D2-005 or merge was initiated.

D1 12/12 PASS; D2 **1/6 PASS (D2.4 only, OWNER ACCEPTED)**; D3 0/5; total **13/23**. No Stellar/SDF/Instawards acceptance or payment asserted.

Raven stellarDocs was consulted first. Its search found the official [simulateTransaction getter guide](https://developers.stellar.org/docs/build/guides/transactions/simulateTransaction-Deep-Dive); page content was checked directly because Raven's section lookup returned no content. Only unsigned getter simulations and read RPC methods were used; no submission occurs from a getter simulation.
