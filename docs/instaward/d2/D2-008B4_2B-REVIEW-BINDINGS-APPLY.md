# D2-008B4.2B — Exact review bindings apply

## STATUS

**B4.2B REVIEW BINDINGS PASS**

Owner-authorized execution on 2026-10-30 (America/Santiago). Post-commit verification: `2026-10-31T00:32:38.631935+00:00`. This gate does not accept D2.6 and does not assert approval by Stellar, SDF or Instawards.

## PRE-INSERT BASELINE

The read-only preflight at `2026-10-31T00:29:04.959684+00:00` found all four review tables empty: review_access 0, review_batteries 0, permissions 0 and registration_intents 0. The four exact approved principals existed, were ACTIVE and retained their exact enabled deployment memberships. The existing USER1 wallet linkage remained unique. Collector/recycler actor bindings and historical battery relationships matched the approved packet. No Auth metadata or login was refreshed in this task; B4.2A remains the Auth readiness basis.

The baseline security checks passed before any INSERT. The same identity, battery, empty-table and privilege predicates were checked again inside the transaction before the INSERT statements.

## INSERT TRANSACTION

One explicit BEGIN/COMMIT transaction executed once, with exactly five literal INSERT statements: four access rows and one battery row. PostgreSQL returned five `INSERT 0 1` responses and COMMIT; process exit was 0 with no warnings. A durable local attempted marker prevents replay. There was no UPSERT, ON CONFLICT repair, UPDATE or DELETE.

Temporary transaction locks covered only the four review tables to guard the empty baseline. Assertions checked exact row contents before COMMIT. A separate read-only transaction verified committed rows and the security snapshot afterward. Default granted_at/approved_at were used; disabled_at remained NULL. No business/review function was invoked.

## REVIEW_ACCESS RESULT

| Alias | Role | Enabled | Can create intent | Disabled at |
| --- | --- | --- | --- | --- |
| REVIEW-USER | USER | true | false | NULL |
| REVIEW-ADMIN | ADMIN | true | false | NULL |
| REVIEW-COLLECTOR | COLLECTOR | true | false | NULL |
| REVIEW-RECYCLER | RECYCLER | true | false | NULL |

Exactly the four approved principal/role/deployment rows exist. There is no fifth access row. Exact private identifiers remain only in ignored owner-private execution evidence.

## REVIEW_BATTERIES RESULT

Exactly one existing historical fixture is allowlisted: `BYE-W1-002-64257020134D4A0F`, in the exact configured DEV/Testnet deployment. It is enabled with purpose HISTORICAL, USER scope REVIEW-USER, collector_relevant true, recycler_relevant true and intent_operation_id NULL. There is no second battery row and no synthetic battery was created. Its persisted projection remains RECYCLED with reward SENT.

This task checked persisted relationships only; it made no fresh Stellar call and did not revalidate a Testnet lifecycle. Historical on-chain provenance remains documented in D2-003 and subsequent evidence.

## ROLE VISIBILITY RECHECK

All four read-only, predicate-equivalent checks passed without invoking hosted functions:

- REVIEW-USER retains the qualifying historical battery relationship and unique existing verified wallet linkage.
- REVIEW-ADMIN retains its ACTIVE principal, enabled ADMIN membership and enabled review binding; can_create_intent remains false.
- REVIEW-COLLECTOR matches the historical confirmed collector actor and enabled membership.
- REVIEW-RECYCLER matches the historical confirmed recycler actor and enabled membership.

These checks establish binding eligibility; they do not prove real application login or a request through the hosted review functions.

## SECURITY BOUNDARY RECHECK

Before/after security snapshots matched exactly: role flags/configuration, function bodies/owners/ACLs, review table ownership/ACLs/RLS and policies in review/app/API/chain private schemas.

The restricted review application role retains exactly five EXECUTEs: profile, battery, history_rows, create_review_registration_intent and review_registration_intent_status. It has no membership, no raw table/column authority, no schema CREATE and no owner SET capability. Owner temporary CREATE/SET bridges remain absent. Binding insertion did not alter any of these properties. Existing function EXECUTE capability does not grant intent creation: all access flags are false and permissions remain empty.

## PERMISSIONS / INTENTS

Post-COMMIT counts: review_access **4**, review_batteries **1**, permissions **0**, registration_intents **0**. No intent creation or adoption occurred.

## AUTH LOGIN READINESS

**NOT YET PROVEN BY REAL LOGIN**

B4.2A found eligible Auth metadata for the four principals. No login, reset, session operation, new user or password action was performed here. The restricted credential was not requested, read or changed.

## REMOTE MUTATIONS

- 4 approved review_access rows inserted.
- 1 approved review_batteries row inserted.

No other mutation was performed. No app/API/chain business mutation, Auth change, role or membership change, schema/RLS/ACL/function change, Vercel operation, Stellar transaction, signature or broadcast was executed.

## FILES CHANGED

New sanitized local reports only:

- `docs/instaward/d2/D2-008B4_2B-REVIEW-BINDINGS-APPLY.md`
- `docs/instaward/d2/D2-008B4_2B-REVIEW-BINDINGS-APPLY-RESULTS.json`

Execution helpers, exact row packet, attempted marker, SQL and private readbacks remain under Git-ignored `.tools/d2-008b4_2b/`. No pre-existing file was intentionally edited. The two earlier modified review SQL files and all earlier untracked evidence remain pre-existing work. Protected `docs/security/KEY-CUSTODY-AUDIT.md` and `tools/sync_obsidian.py` are preserved untracked. No stage, commit, push, merge or tag change.

## PROJECT STATUS

D1 **12/12 PASS**; D2 **5/6 PASS**; D3 **0/5**; TOTAL **17/23**. D2.6 remains **PENDING**. No acceptance status was changed.

## NEXT OWNER AUTHORIZATION

Proposed gate: **D2-008B4.3 — four application-role login/access verification**. **NOT EXECUTED; separate owner authorization required.**

Suggested bounded authorization: inspect the existing runtime first, then verify real login/access for the four existing application-role accounts using owner-entered local credentials and validated Supabase sessions. Check the expected profile/role and the exact historical battery scope. If separately approved, call only the existing profile, battery and history read wrappers for those accounts; never invoke intent creation/status mutation, adoption or lifecycle operations. Treat metadata eligibility as distinct from login success.

Do not create/reset accounts, change credentials/memberships/grants/schema/functions, introduce new runtime credentials or deployment/configuration, invoke Vercel or Stellar, or change acceptance counts. If existing runtime or credentials are insufficient, STOP for owner review. Keep any restricted database credential owner-held and out of model input, logs, CLI arguments and repository files.

STOP after this report. B4.3 has not begun.

## LOCAL CLOSURE

PASS: git diff --check and both new report whitespace checks. All 516 pre-existing nonignored files are byte-for-byte unchanged. Only the two reports are new nonignored files; all Git refs and protected untracked files are unchanged. Private execution evidence is Git-ignored; sanitized reports contain no internal principal identifiers or actor/wallet mappings. Secret audit: 586 files, 700 historical blobs, 0 staged files, 0 findings. No commit or push. No B4.3 execution.
