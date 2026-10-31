# D2-008B4.3R2 — Four-role Auth and bounded read verification

## STATUS

**D2-008B4.3 = FOUR-ROLE AUTH/READ PASS**

Finished: `2026-10-31T01:30:50.831Z`. Stop category: `NONE`. Post-check category: `NONE`. This is technical Auth/SQL-read evidence, not acceptance of D2.6 or approval by Stellar/SDF/Instawards.

## VALIDATOR FIX

Only a new Git-ignored local harness/validator was created. Production frontend/backend code, DTO definitions, SQL, functions, schema/RLS/ACL and reviewConfiguration remain unchanged. Historical B4.3 failure evidence is preserved; its overly strict validator failure is not a SQL/application failure.

The corrected validator accepts every nullable field in the accepted contract, does not impose revision 1/non-null hashes, and allows verification.confirmedAt to be absent. It rejects internal/extra fields on the safe/public row. Offline regression tests: **29 PASS**, no Auth mock and 0 network calls.

Two actual source layers are checked explicitly. The restricted SQL history wrapper returns its accepted internal HistoryRow model, which may include identityContract/identityNetwork/requestId and has no verification property. The production HTTP layer calls safeHistoryRow to omit these internal fields and adds chain verification separately. The harness reads/transpiles and invokes that exact existing projection function from the unchanged source; it does not replace production code or pretend that the SQL object is a public HTTP response.

For the local projection/schema test only, each row receives an explicit UNVERIFIED verification object with reason B4_3R2_NO_FRESH_CHAIN_READ. This metadata is locally supplied and labelled; it was not returned by SQL or a hosted route. It proves shape, nullability and disclosure boundaries, not a live/public route or new chain receipt. No live chain reader, Horizon or RPC transport is instantiated/called. Hosted route/origin/current-network verification remains for a separately authorized gate.

## REVIEW-USER

- login: **PASS**
- getUser: **PASS**
- profile: **PRIOR PASS — B4.3**
- battery: **PRIOR PASS — B4.3**
- history: **PASS**
- cleanup: **PASS**

Exact UID linkage: PASS. Ordinary login attempts: 1. History source: FRESH RESTRICTED SQL + LOCAL SOURCE-EXACT PUBLIC PROJECTION.
## REVIEW-ADMIN

- login: **PASS**
- getUser: **PASS**
- profile: **PASS**
- battery: **PASS**
- history: **PASS**
- cleanup: **PASS**

Exact UID linkage: PASS. Ordinary login attempts: 1. History source: FRESH RESTRICTED SQL + LOCAL SOURCE-EXACT PUBLIC PROJECTION.
## REVIEW-COLLECTOR

- login: **PASS**
- getUser: **PASS**
- profile: **PASS**
- battery: **PASS**
- history: **PASS**
- cleanup: **PASS**

Exact UID linkage: PASS. Ordinary login attempts: 1. History source: FRESH RESTRICTED SQL + LOCAL SOURCE-EXACT PUBLIC PROJECTION.
## REVIEW-RECYCLER

- login: **PASS**
- getUser: **PASS**
- profile: **PASS**
- battery: **PASS**
- history: **PASS**
- cleanup: **PASS**

Exact UID linkage: PASS. Ordinary login attempts: 1. History source: FRESH RESTRICTED SQL + LOCAL SOURCE-EXACT PUBLIC PROJECTION.

## REVIEW-USER EVIDENCE LINEAGE

Previous B4.3 established real login/getUser/profile/battery/logout PASS for the same bound identity. Its raw history response was not retained, so offline replay could not complete the missing evidence. This gate therefore used one new USER login/getUser and only the missing history wrapper, then local logout. Existing profile/battery PASS evidence is explicitly carried forward; it is not relabelled as a fresh call. All three remaining roles use fresh full profile/battery/history reads.

## HISTORY NULLABILITY MATRIX

| Field | Validator rule | Live NULL counts: USER / ADMIN / COLLECTOR / RECYCLER |
| --- | --- | --- |
| transactionHash | ACCEPTED | 0 / 0 / 0 / 0 |
| ledger | ACCEPTED | 0 / 0 / 0 / 0 |
| updatedAt | ACCEPTED | 5 / 5 / 5 / 5 |
| errorCode | ACCEPTED | 5 / 5 / 5 / 5 |
| revision | ACCEPTED | 2 / 2 / 2 / 2 |
| payloadHash | ACCEPTED | 2 / 2 / 2 / 2 |
| commitment | ACCEPTED | 3 / 3 / 3 / 3 |

All seven nullable fields are tested independently and together as NULL. No failure is inferred solely from NULL. If a hash or ledger is present, it is compared with the already-accepted historical D2-003 record. Core operation identity/kind/status/time/order and exact historical battery/deployment are checked from persisted data. A confirmed SQL operation is not treated as newly verified on-chain.

identityContract, identityNetwork and requestId are **not required in the safe/public DTO** and are rejected if present there. Their expected internal SQL presence is checked at the internal layer and removed by the existing projection. verification follows the existing status/reason/verifiedAt schema, with confirmedAt optional, across all six accepted verification states. The local live-projection check uses only UNVERIFIED.

## PROFILE / ROLE MATRIX

| Alias | Expected/proven review role | canCreateIntent | Approved battery count |
| --- | --- | --- | --- |
| REVIEW-USER | USER | False | 1 |
| REVIEW-ADMIN | ADMIN | False | 1 |
| REVIEW-COLLECTOR | COLLECTOR | False | 1 |
| REVIEW-RECYCLER | RECYCLER | False | 1 |

Only the Auth UID returned by authoritative Supabase getUser is used in parameterized wrapper calls. user_metadata never authorizes a role. The exact historical principal/Auth mapping is checked privately before each login, and enabled actor relationships are validated in pre/post baselines. No extra review role/battery is allowed.

## BATTERY SCOPE MATRIX

All roles are scoped to the existing historical fixture `BYE-W1-002-64257020134D4A0F` in the exact configured deployment. Accepted battery state is RECYCLED, reward SENT, source TESTNET. USER's prior bounded ownRequest relationship is retained from B4.3; the current SQL visibility predicate and unchanged baseline validate its current scope. Fresh ADMIN/COLLECTOR/RECYCLER battery reads require ownRequest NULL and the accepted DTO whitelist. Collector/recycler actor bindings remain matched to the historical confirmed relations.

Optional non-allowlisted denial: **SKIPPED**. The previous private candidate ID was held only in memory and not retained. This gate did not discover a new unrelated battery solely for that optional test.

## INTENT SAFETY

Pre-baseline: **PASS**. Post-baseline: **PASS**.

Before: `{"permissions": 0, "registration_intents": 0, "review_access": 4, "review_batteries": 1}`. After: `{"permissions": 0, "registration_intents": 0, "review_access": 4, "review_batteries": 1}`.

A PASS requires **4/1/0/0**, all can_create_intent false, exact bindings/principals/memberships, exact-five EXECUTEs, no raw authority/owner SET/schema CREATE and unchanged function/ACL/RLS/policy state. Rowset fingerprints over 20 deployment/principal-scoped application/API/chain tables are unchanged: **True**.

Wrapper invocations: **10**; only profile, battery and history_rows were permitted. Intent/adoption/status functions and routes: **0**. No synthetic battery, lifecycle or reward operation was created.

## RESTRICTED DATABASE BOUNDARY

Live wrappers used only current_user = session_user = byetery_d2_review_app, with authorized/verified TLS and the existing owner-entered restricted credential in memory. Restricted identity/TLS evidence: `{"identity": "PASS", "privileged_fallback": false, "tls_authorized": true, "tls_protocol": "TLSv1.3"}`. There is no postgres/admin/service-role fallback for wrapper results. Existing administrative DB credentials are used exclusively for authorized SELECT-only baseline/identity checks; all such transactions roll back. No Supabase admin API or Auth password update is invoked.

## SESSION CLEANUP

Passwords are entered through native Python getpass; they are not trimmed, normalized, echoed, logged, placed in environment/CLI arguments or persisted. Private parent/worker communication uses anonymous pipes only. Each required alias has one ordinary signInWithPassword, authoritative getUser exact-UID/authenticated-role validation and explicit local signOut. Any returned session is cleaned up even after a later failure; the SDK memory session must then be absent and auto-refresh stops. No global/others signout or unrelated-session inspection occurs. No claim is made about immediate expiry of old JWTs.

## SECRET AUDIT

No raw Auth user object, email, Auth UID, password, token or restricted credential is serialized into evidence. The status writer contains only aliases, fixed/allowlisted statuses, public historical hashes/ledgers and NULL counts; it rejects email/Auth UID/JWT patterns. SQL raw rows are used in memory only; the report retains bounded summaries. No exact-value scan of owner-held credentials is performed. Final local audits are below and in the companion JSON.

## REMOTE MUTATIONS

Database/business = **NONE**. Auth password/account changes = **NONE**. Only ordinary fresh Auth sessions and their session-local cleanup are permitted and evidenced. No Vercel, Horizon/RPC, Stellar transaction/signature/broadcast, signer, account/role/binding/schema change or production implementation change occurred.

## FILES CHANGED

New sanitized local reports only:

- `docs/instaward/d2/D2-008B4_3R2-FOUR-ROLE-AUTH-READ.md`
- `docs/instaward/d2/D2-008B4_3R2-FOUR-ROLE-AUTH-READ-RESULTS.json`

Ignored helpers/evidence reside in `.tools/d2-008b4_3r2/`. Prior reports/helpers, protected untracked security report and tools/sync_obsidian.py remain intact. No stage, commit, push, merge or tag change.

## PROJECT STATUS

D1 **12/12 PASS**; D2 **5/6 PASS**; D3 **0/5**; TOTAL **17/23**. D2.6 remains **PENDING**. No criterion is newly owner-accepted.

## NEXT OWNER AUTHORIZATION

Draft only: **D2-008B4.4 — Vercel Preview hosted review verification**. NOT EXECUTED. A separate owner authorization should pin the exact reviewed branch/SHA and approved HTTPS origin, use the existing owner-held restricted DB credential, and define a bounded hosted-browser/read-route test for the same four accounts and historical fixture. Keep intent creation disabled. Inspect current deployment/configuration and request the precise infrastructure authorization before any provisioning or deployment. Any fresh Horizon/RPC reads must be explicitly included in that later scope. Do not weaken reviewConfiguration or infer hosted access from this local gate.

## LOCAL CLOSURE

PASS: git diff --check and report whitespace/privacy checks. Secret-pattern audit covered 594 files, 700 historical blobs and 0 staged files with 0 findings. The ignored maintenance directory also passed a pattern-only scan; no owner password or exact-value password scan was used. All 524 baseline files, historical private mapping, protected untracked files and Git refs remain unchanged. Only these two sanitized reports are new nonignored files. Execution-helper hashes match the pre-live record. No stage, commit, push, merge or tag change. B4.4 was not executed.

STOP. No B4.4/Vercel execution.
