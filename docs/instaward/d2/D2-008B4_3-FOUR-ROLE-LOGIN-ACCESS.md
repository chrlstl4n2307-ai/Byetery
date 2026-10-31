# D2-008B4.3 — Four application-role login and read-access verification

## STATUS

**OWNER REVIEW REQUIRED**

Finished: `2026-10-31T00:45:10.977Z`. Stop category: `HistoryEvidenceShape`. This is a bounded technical verification, not owner acceptance of D2.6 or approval by Stellar/SDF/Instawards. REVIEW-USER authenticated, passed profile/battery checks and was logged out; its history query returned but the local assertion stopped validation. The other three logins were not attempted. This is not a credential-failure finding or a demonstrated production SQL incompatibility.

## RUNTIME INSPECTION

Hosted Vercel Preview and evaluator/browser-route access were **NOT TESTED**. Existing `reviewConfiguration()` still requires DIRECT_REVIEW / D2_PREVIEW / TESTNET, the exact deployment, Vercel Preview branch, approved HTTPS origin and restricted database configuration. No origin/configuration check or frontend code was patched.

The harness directly exercises the production architecture's underlying real components: installed Supabase SDK signInWithPassword, authoritative getUser(access_token), and the exact parameterized profile/battery/history SQL calls from PgReviewDatabase. It does not invoke route code, a mocked Auth service or any Stellar reader. Existing route/page implementations were inspected read-only. The installed packages were reused without installing/updating dependencies.

## PRE-GATE BINDINGS

Pre-gate: **PASS**. Post-gate: **PASS**. Counts before: `{"permissions": 0, "registration_intents": 0, "review_access": 4, "review_batteries": 1}`. Counts after: `{"permissions": 0, "registration_intents": 0, "review_access": 4, "review_batteries": 1}`.

The exact B4.2B principal packet is hash-pinned, not reselected. Preflight resolved each already-linked Auth account privately, checked uniqueness/eligibility, and retained email/Auth UID only in process memory. All four review access flags were false for intent creation. The historical allowlist and exact-five restricted EXECUTE boundary matched the accepted baseline. No privileged fallback was permitted for wrapper results. Administrative read-only access was limited to account resolution and baseline/optional fixture inventory.

## REVIEW-USER

- login: **PASS**
- getUser: **PASS**
- profile: **PASS**
- battery: **PASS**
- history: **QUERY SUCCEEDED / VALIDATION STOP**
- cleanup: **PASS**

Ordinary password attempts: 1. No automatic retry. Optional denial: NOT RUN.
## REVIEW-ADMIN

- login: **NOT RUN**
- getUser: **NOT RUN**
- profile: **NOT RUN**
- battery: **NOT RUN**
- history: **NOT RUN**
- cleanup: **NOT RUN**

Ordinary password attempts: 0. No automatic retry. Optional denial: NOT RUN.
## REVIEW-COLLECTOR

- login: **NOT RUN**
- getUser: **NOT RUN**
- profile: **NOT RUN**
- battery: **NOT RUN**
- history: **NOT RUN**
- cleanup: **NOT RUN**

Ordinary password attempts: 0. No automatic retry. Optional denial: NOT RUN.
## REVIEW-RECYCLER

- login: **NOT RUN**
- getUser: **NOT RUN**
- profile: **NOT RUN**
- battery: **NOT RUN**
- history: **NOT RUN**
- cleanup: **NOT RUN**

Ordinary password attempts: 0. No automatic retry. Optional denial: NOT RUN.

## PROFILE / ROLE MATRIX

| Alias | Expected review role | canCreateIntent | Battery count | Own request |
| --- | --- | --- | --- | --- |
| REVIEW-USER | USER | false | 1 | OWN HISTORICAL REQUEST ONLY |
| REVIEW-ADMIN | ADMIN | not tested | NOT TESTED | NOT TESTED |
| REVIEW-COLLECTOR | COLLECTOR | not tested | NOT TESTED | NOT TESTED |
| REVIEW-RECYCLER | RECYCLER | not tested | NOT TESTED | NOT TESTED |

Only the Auth UID returned by authoritative getUser can be passed to the restricted functions; user_metadata is not used for authorization. A successful profile must expose exactly its approved single review role and exactly the one allowlisted historical battery. Untested values are not evidence of success.

## HISTORICAL BATTERY SCOPE

Approved fixture: `BYE-W1-002-64257020134D4A0F`, in the exact configured Testnet deployment. Each successful battery check requires source TESTNET, exact deployment/battery, confirmed physical state RECYCLED and reward SENT, with the accepted bounded DTO field set. Own request data is checked against the user's historical request; other role DTOs must not expose that user's private ownRequest. The reward attempt's success status is SUCCEEDED, independently of reward state SENT.

## HISTORY DTO CHECK

No history DTO was successfully validated in this execution.

Successful history checks require the five accepted operations in chronological order with exact archived operation identities, hashes, ledgers, timestamps, contract/network and bounded DTO keys. No command, XDR, signer material or raw payload is returned or persisted in the report. Source evidence: `D2-003-TIMELINE.json`; existing B2 SQL/TypeScript DTOs define allowed fields. Accepted SQL history contains bounded identity/request references; the existing HTTP layer removes internal verification-only fields before its public response. This gate tested the SQL boundary, not that hosted HTTP response.

The current run stopped inside history validation before marking it PASS. The private raw status retains NOT RUN as its initial marker; the report clarifies this as QUERY SUCCEEDED / VALIDATION STOP based on the executed control flow. The over-strict local check requires revision 1 and non-null evidence hashes for all three attestation kinds, while the accepted DTO allows nullable evidence fields. Offline tests missed that valid nullable case. Raw rows were intentionally not retained, so this report cannot identify which row/field triggered the assertion or claim complete history/field verification. The harness was not patched/replayed after this stop.

Any successfully compared values are persisted historical records checked against already-accepted D2 evidence. No new Horizon/RPC lookup or fresh on-chain verification was performed. No environmental/physical attestation is inferred from reading the history.

## OPTIONAL NON-ALLOWLISTED DENIAL

Fixture inventory: EXISTING PRIVATE SAME-DEPLOYMENT FIXTURE. Only a single existing same-deployment battery ID outside the allowlist may be held privately in process memory. No extra metadata is selected. See each alias's denial result above; PASS requires P0002 and no returned data. No fixture is created or added to review scope. An optional skip is not gate failure.

## INTENT SAFETY

Binding can_create_intent remains false for all four roles, including ADMIN. Permissions and registration_intents must remain zero as verified in the pre/post snapshots. No create-intent or intent-status function, intent route, adoption or lifecycle mutation was invoked. A capability's EXECUTE grant alone was not treated as permission to create an intent.

## AUTH SESSION CLEANUP

Each account is sequential and has at most one ordinary password attempt. Each returned session is held only in SDK/process memory; cleanup uses signOut with explicit scope local, then verifies that the SDK's local session is absent and stops auto-refresh. Cleanup runs even after later read/validation failure. No global or others signout is allowed. The harness never reuses a disposed session. If no session was returned, cleanup is recorded as not required; an ambiguous transport/login result is stopped for owner review.

Logout cleanup does not claim instantaneous JWT invalidation or prove another device was affected. No refresh-token replay, unrelated session query or blanket session revocation is performed.

## SECRET AUDIT

Procedural controls: native no-echo local input, memory-only credentials/tokens, no terminal transcript, no stdin logging, no raw Auth/account/DTO dumps, and an allowlisted status writer that rejects email/Auth UID/token patterns. Auth transport permits only the pinned project's password token endpoint, one authoritative user read and explicit local logout for each alias. Restricted DB password is not in environment files or CLI arguments. The owner is never asked to share credentials in chat. No exact-value password scan is performed.

Offline DTO validation: **43 checks PASS**, no Auth mocking and no remote calls, with the nullable-case coverage gap described above. This is not an all-green gate result. Final secret-pattern audit and local file-integrity checks are recorded below and in the companion JSON.

Official API references: [password login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [authoritative user lookup](https://supabase.com/docs/reference/javascript/auth-getuser), [local signout](https://supabase.com/docs/reference/javascript/auth-signout).

## REMOTE MUTATIONS

Database/business mutations: **NONE**. Expected Auth effects are only ordinary successful login sessions and local cleanup of the newly created sessions; per-alias HTTP/status evidence is in the companion JSON. Password changes: 0. No Auth account creation/reset, membership/role change, SQL/ACL/RLS change, intent/adoption, Vercel operation, Stellar call/signature/broadcast or USER2 usage.

## FILES CHANGED

New sanitized local files only:

- `docs/instaward/d2/D2-008B4_3-FOUR-ROLE-LOGIN-ACCESS.md`
- `docs/instaward/d2/D2-008B4_3-FOUR-ROLE-LOGIN-ACCESS-RESULTS.json`

Ignored local harness/evidence: `.tools/d2-008b4_3/`. All existing nonignored files, including the two pre-existing modified SQL artifacts, must remain byte-identical to the task baseline. Protected untracked security report and sync tool remain untouched. No staging, commit, push, merge or tag change.

## PROJECT STATUS

D1 **12/12 PASS**; D2 **5/6 PASS**; D3 **0/5**; TOTAL **17/23**. D2.6 remains **PENDING**. No formal acceptance changes.

## NEXT OWNER AUTHORIZATION

OWNER REVIEW REQUIRED. First review the ignored harness's over-strict history assertion against the already-approved nullable DTO, without changing application/SQL code. The assertion requires revision 1 and non-null hashes for three event kinds, while the approved HistoryRow fields allow NULL; that requirement exceeded B4.3. A raw row was not retained, so no particular missing field or SQL defect is established. Do not infer that the history query failed or that its entire response passed validation.

The owner separately reported an unavailable credential without naming an alias. No missing/invalid password alias was established by a failed Auth attempt: REVIEW-USER authenticated successfully, and the other three accounts were not attempted. Identify only the unavailable alias/credential category without sharing a password before proposing any separately authorized recovery. Do not reset successful or untested accounts automatically.

A new bounded authorization is required before any further ordinary login attempt for REVIEW-USER; this gate already used its single attempt and disposed the session. No automatic replay, recovery, runtime patch, deployment or continuation to other roles was executed.

## LOCAL CLOSURE

PASS: git diff --check; new report whitespace/privacy checks; secret-pattern audit over 588 files and 700 historical blobs with 0 findings and 0 staged files. Pattern-only scan of this gate's ignored helper/output files also passed; no exact-value password scan was performed. All 518 baseline files and all Git refs remain unchanged. Only the two sanitized reports are new nonignored files. Protected files remain untouched/untracked. Helper hashes match the pre-login integrity record. No commit or push.

STOP. No next gate executed.
