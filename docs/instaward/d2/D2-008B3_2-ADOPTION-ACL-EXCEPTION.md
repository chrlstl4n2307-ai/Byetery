# D2-008B3.2 — Adoption ACL exception and final local patch

## STATUS

**B4 READY FOR OWNER AUTHORIZATION — LOCAL VALIDATION ONLY.**

Date: 2026-10-30, America/Santiago. Branch `instaward/d2-web-mvp`; HEAD remains `d406dad4d9edd7b9b46a0c8a8090d333554dbeb1`. No commit/push or remote apply performed. This status means the local diff and hashes are ready for owner review, not permission to execute B4 and not acceptance of D2.6.

## EXCEPTION IMPLEMENTED

Kept Council design **A**: postgres creates all new functions, closes public/hosted ACLs, then transfers ownership. The role split remains B1 intent_owner/review_app and B2 read_owner. Design B was not implemented.

Only the owner-approved adoption function receives a new post-transfer grant:

```sql
set local role byetery_d2_intent_owner;
grant execute on function review_private.adopt_registration_intent(uuid) to postgres;
reset role;
```

This runs before cleanup/COMMIT. No additional postgres grant was added for any internal function. B2's old B1 hosted-entry revocation is separately executed as its actual owner, as already approved.

## B1 PATCH

Added a temporary schema CREATE and direct postgres-issued SET TRUE / INHERIT FALSE edge. All new functions are created as postgres; all function revokes and temporary hosted entry grants precede owner transfer. service_role is explicitly revoked where present. Four definers transfer to intent_owner; immutable_intent remains postgres-owned SECURITY INVOKER. Adoption then receives the single approved independent grant.

Removed only temporary CREATE and the **postgres-granted** membership edge. The automatic creator ADMIN-only edge remains safe. Added fail-closed catalogue assertions inside the transaction for exact role flags, grantor/membership cleanup, no schema CREATE, owners, search_path, ACLs, adoption, hosted set, tables and raw table/column authority.

WAITING/adoption semantics, function headers and bodies, accepted table/policy/trigger/index definitions are unchanged. No worker/signing/submission path was added.

## B2 PATCH

B2 still creates read_owner. Temporary SET/CREATE bridges cover both relevant owners. The two old principal-taking hosted entry grants are revoked while SET LOCAL ROLE intent_owner, then RESET immediately. All eight new functions are created as postgres; their exact ACL closure/dependency/hosted grants occur **before** transfers. Six functions transfer to read_owner, two wrappers to intent_owner. No new post-transfer ACL mutation was added on those eight functions. Both bridges are cleaned up, and catalogue assertions run before COMMIT.

## DP2 DECISION

**DP2 implemented explicitly.** Removed the two owner-specific ALTER DEFAULT PRIVILEGES statements and documented why in both SQL files. They did not govern initial ACLs of functions created by postgres. The owners finish NOLOGIN and without schema CREATE; explicit ACL closure and fail-closed catalogue assertions secure these functions. The complete local pg_default_acl before/after diff is **empty**, and no owner-specific default entries exist. Remote defaults were not changed.

## LOCAL PG17.6 RESULTS

Used the existing official portable **17.6** binaries. A new disposable loopback-only cluster uses a distinct b32_bootstrap superuser solely for setup. Actual migrations/B1/B2/control/rollback applications run with both current_user and session_user **postgres**, NOSUPERUSER, CREATEROLE, CREATEDB, REPLICATION, BYPASSRLS, INHERIT and empty createrole_self_grant. Needed pg_monitor/pg_signal_backend and anon/authenticated/service_role memberships mirror observed remote executor capabilities; neither owner nor hosted role receives them.

psql commands use **`-X -v ON_ERROR_STOP=1`**, verbose SQLSTATE output, and captured stdout/stderr. No .env, remote URL, password, Auth or Stellar request is used by the runner. The cluster was stopped cleanly and runner-owned test databases dropped.

| Item | Gate | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Original B1 and B2 controls | PASS | Both fail with expected SQLSTATE 42501 at owner-specific defaults; no committed partial changes. |
| 2 | Patched B1 | PASS | Applied by actual NOSUPERUSER postgres login using psql -X / ON_ERROR_STOP=1. |
| 3 | Patched B2 | PASS | Applied by the same nonsuperuser executor after B1. |
| 4 | Privilege warnings | PASS | Zero in both apply scripts, controls and completed suites. Three separate 25P01 cleanup warnings are disclosed. |
| 5 | Function owners | PASS | Four B1 + two B2 wrappers intent_owner; six B2 read functions read_owner; invoker trigger postgres. |
| 6 | Definer/search_path | PASS | All twelve definers and invoker trigger have exact empty search_path catalogue configuration. |
| 7 | Function ACLs | PASS | Each signature checked via aclexplode for exact grantees, owner grantor, no delegated grant option. |
| 8 | Adoption EXECUTE | PASS | Independent postgres grant survives cleanup; grantor=intent_owner. |
| 9 | postgres SET after B1 | PASS | Effective SET/USAGE to intent_owner false; asserted before B1 commit. |
| 10 | Owner schema CREATE | PASS | Both false after their transactions; asserted before commit. |
| 11 | Hosted SET ROLE | PASS | Real review_app login denied for both owners, SQLSTATE 42501. |
| 12 | Raw table/column authority | PASS | Catalogue privileges absent; actual SELECT and nonexecuting DML EXPLAIN denied on all scoped tables. |
| 13 | Five hosted entrypoints | PASS | Exact signature set checked before B2 commit and exercised by existing B2 tests. |
| 14 | Old principal-taking functions | PASS | Denied to review_app after B2, catalogue plus actual calls. |
| 15 | Hosted adoption | PASS | Denied to review_app after B1/B2, catalogue plus actual call. |
| 16 | Existing suites | PASS | B1 31/31; B2 110/110 across six test files; unchanged assertion bodies. |
| 17 | OwnerRegistrationAdoption | PASS | Actual class passed after B2 injected rollback; same UUID, normal QUEUED operation only. |
| 18 | B2 rollback | PASS | Injected exception after final postconditions and before COMMIT restores entire committed B1 snapshot; B1 remains functionally healthy. |
| 19 | B1 reapply | PASS | Fails at duplicate schema (42P06), entire B1 snapshot unchanged. |
| 20 | Tables/RLS | PASS | Review tables remain postgres-owned with ENABLE + FORCE RLS; definitions unchanged. |
| 21 | No postgres definer | PASS | Zero review SECURITY DEFINER functions owned by postgres. |
| 22 | DP2 default ACL diff | PASS | Exact before/after pg_default_acl rows equal; no owner defaults created. |

Local command:

```powershell
python scripts/instaward/b32-local-postgres.py
```

The runner requires a fresh ignored `.tools/d2-008b3_2/pgdata`; it fails if that directory exists and never deletes an existing cluster automatically. The exact 17.6 runtime is under `.tools/d2-008b3_1/pgsql`. Those are local test dependencies, not a remote apply helper.

## ADOPTION ACL PROOF

After B1 and B2: owner **byetery_d2_intent_owner**, SECURITY DEFINER true, proconfig exactly `{search_path=""}`. aclexplode shows precisely:

| Grantee | Grantor | Privilege | Grant option |
| --- | --- | --- | --- |
| byetery_d2_intent_owner | byetery_d2_intent_owner | EXECUTE | false |
| postgres | byetery_d2_intent_owner | EXECUTE | false |

PUBLIC, anon, authenticated, service_role and review_app have no adoption EXECUTE. `has_function_privilege('postgres', adoption, 'EXECUTE')` is true while effective SET and inherited owner privileges are false. The actual OwnerRegistrationAdoption path also succeeds after injected B2 rollback, creating exactly the original UUID's ordinary QUEUED operation, without preparing/signing/sending.

## MEMBERSHIP CLEANUP

Direct temporary edge syntax was proved and executed on 17.6:

```sql
grant byetery_d2_intent_owner to postgres
 with inherit false, set true granted by postgres;
revoke byetery_d2_intent_owner from postgres granted by postgres;
```

Equivalent read_owner cleanup runs in B2. No direct postgres-issued edge survives. Only automatic bootstrap-issued **ADMIN TRUE / INHERIT FALSE / SET FALSE** edges remain to postgres. Owner roles are members of no roles, and review_app is a member of no roles. Real review_app SET ROLE attempts for both owners return 42501. Inline assertions prove postgres has no effective SET/USAGE path to either owner.

The remote provider's future automatic grantor cannot be known through read-only inspection before creation. It remains an **APPLY-TIME ASSERTION**, with fail-closed SQL checking a safe superuser-issued automatic edge. No alternate grantor is guessed or repaired automatically.

## SCHEMA CREATE CLEANUP

Both owner roles end with `has_schema_privilege(owner,'review_private','CREATE') = false`. review_app also lacks CREATE. Review schema and tables remain postgres-owned; definer roles never own tables. All four review tables keep ENABLE + FORCE RLS.

## FINAL FIVE HOSTED FUNCTIONS

Exactly:

1. `review_private.profile(uuid)`
2. `review_private.battery(uuid,text)`
3. `review_private.history_rows(uuid,text)`
4. `review_private.create_review_registration_intent(uuid,text,jsonb)`
5. `review_private.review_registration_intent_status(uuid,uuid)`

No sixth function, old B1 principal-taking entrypoint, adoption, require_authority, resolve_review or other internal helper is executable by review_app. No raw table or column SELECT/DML capability exists. Negative DML checks use EXPLAIN (ANALYZE FALSE), so even a privilege regression cannot execute them.

## FUNCTION OWNER AUDIT

Exact owners, definer flags, safe configuration and explicit effective ACL signatures are asserted before each commit and snapshotted after each file. Zero postgres-owned SECURITY DEFINER review functions.

| Signature | Owner | Mode | ACL grantees |
| --- | --- | --- | --- |
| `review_private.adopt_registration_intent(uuid)` | `byetery_d2_intent_owner` | DEFINER | `postgres`, `byetery_d2_intent_owner` |
| `review_private.battery(uuid,text)` | `byetery_d2_read_owner` | DEFINER | `byetery_d2_review_app`, `byetery_d2_read_owner` |
| `review_private.create_registration_intent(uuid,text,jsonb)` | `byetery_d2_intent_owner` | DEFINER | `byetery_d2_intent_owner` |
| `review_private.create_review_registration_intent(uuid,text,jsonb)` | `byetery_d2_intent_owner` | DEFINER | `byetery_d2_intent_owner`, `byetery_d2_review_app` |
| `review_private.history_rows(uuid,text)` | `byetery_d2_read_owner` | DEFINER | `byetery_d2_review_app`, `byetery_d2_read_owner` |
| `review_private.immutable_intent()` | `postgres` | INVOKER | `postgres` |
| `review_private.operation_dto(uuid)` | `byetery_d2_read_owner` | DEFINER | `byetery_d2_read_owner` |
| `review_private.profile(uuid)` | `byetery_d2_read_owner` | DEFINER | `byetery_d2_review_app`, `byetery_d2_read_owner` |
| `review_private.registration_intent_status(uuid,uuid)` | `byetery_d2_intent_owner` | DEFINER | `byetery_d2_intent_owner` |
| `review_private.require_authority(uuid)` | `byetery_d2_intent_owner` | DEFINER | `byetery_d2_intent_owner` |
| `review_private.resolve_review(uuid)` | `byetery_d2_read_owner` | DEFINER | `byetery_d2_intent_owner`, `byetery_d2_read_owner` |
| `review_private.review_registration_intent_status(uuid,uuid)` | `byetery_d2_intent_owner` | DEFINER | `byetery_d2_intent_owner`, `byetery_d2_review_app` |
| `review_private.visible_battery(uuid,text,text)` | `byetery_d2_read_owner` | DEFINER | `byetery_d2_read_owner` |

All 13 accepted function bodies and headers match the checkpoint; accepted table/policy/trigger/index definitions match as well. The retained postgres invoker trigger is intentionally distinct from the twelve definers.

## ZERO WARNING AUDIT

**ZERO PRIVILEGE WARNINGS.** Both actual SQL applications and all psql control/rollback cases generated zero privilege WARNINGs. Node/Vitest clients fail on any PostgreSQL WARNING other than the explicitly identified transaction-cleanup 25P01.

The unchanged B1 tests issue unconditional ROLLBACK after COMMIT in three cases. Their **three non-privilege warnings** — SQLSTATE 25P01, “there is no transaction in progress” — are captured and preserved, not suppressed or presented as zero total warnings. No privilege warning was waived. B2 completed without those warnings.

## FUNCTIONAL SUITES

- Existing B1 registration/adoption suite: **31 passed / 0 failed / 0 skipped**.
- Existing B2 SQL/config/Auth-boundary/HTTP/chain-stub/UI suite: **110 passed / 0 failed**, six test files. No live Auth experiment or chain request.
- Local structural/control/rollback/negative-privilege runner: **23 checks** (22 requested gates plus separate original-B2 control).

Existing application and test source files remain unchanged. The test-only adapter redirects the two fixture connection paths and username guards to the 17.6 nonsuperuser cluster and compares directory identity by device/inode to handle Windows 8.3 names. Assertions and production imports are unchanged. PostgreSQL warnings are observed at the client, not swallowed.

Preliminary development attempts were not all green: a path-spelling guard failed before SQL; a new postcondition's ambiguous PL/pgSQL variable caused transaction rollback; the first suite adapter lacked the already-observed pg_signal_backend cleanup capability and incorrectly labeled 25P01 as an ACL warning (27/31 in that attempt). These harness/assertion issues were fixed without weakening privileges or functional assertions. Final results above are from a clean rebuilt fixture. Earlier outputs remain ignored locally for traceability. No final failing assertion was bypassed.

The full unrelated Rust/backend/frontend project verification was not rerun for this SQL-only local gate; no checkpoint/commit is being created. The required existing B1/B2 suites were executed in full as listed.

## REMOTE READ-ONLY COMPLETION

Project **aemxuqnnwfclzrwwiqfd**; deployment **5c0cad2f-5f25-4216-8068-6cb9d2d26325**. Only two bounded SELECT transactions with explicit READ ONLY / ROLLBACK were submitted during B3.2. Prior B3/B3.1 inventories were reused rather than repeated.

GraphQL check at `2026-10-30T05:31:08.837653+00:00`: pg_graphql extension **absent**; graphql_public.graphql is an invoker placeholder returning “pg_graphql extension is not enabled.” Its body, configuration and extension catalogue were read; the wrapper was not called. Thus there is no active review reflection in the current configuration. No extension or schema configuration changed. Prior PostgREST 406/PGRST106 evidence permits only public and graphql_public; review_private is excluded. These are distinct checks, not an inference from the schema being absent. Future configuration drift requires a new pre-apply check.

Exact prerequisite comparison against the preserved same-day remote catalogue passed: **171 columns, 12 function body hashes/owners/flags/configurations, 141 constraints, 52 indexes and 38 triggers**; no missing, extra or differing entries in these categories. Prior metadata verifies twenty postgres-owned FORCE-RLS tables and twenty browser_deny policies. No business row or Auth personal data was read.

Latest collision read at `2026-10-30T05:37:43.923955+00:00` again reports review_private **absent**, all three review roles **absent**, and unchanged deployment/network/contract/WASM pins. Both reads explicitly reported transaction_read_only=on. The managed role hooks/defaults/event-trigger environment from B3.1 remains documented; provider-specific role creation semantics are not claimed as tested remotely.

Read-only security advisors still return only the preexisting **Leaked Password Protection Disabled** Auth WARN, unrelated/nonblocking for this SQL ownership boundary. No new material finding returned; no remediation performed. [Official remediation reference](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

GraphQL permission behavior was checked against [official pg_graphql security documentation](https://supabase.github.io/pg_graphql/security/), not inferred solely from disabled introspection. No API call authenticated a user, no credential was created, and no remote SQL mutation was performed.

## NEW B1 HASH

`957e19e768a6ca90f5bbf5c6268945ef129686d3cd342ec17cca1e3eca41585d`

File: `database/review/d2-008b1-registration-intents.sql`.

## NEW B2 HASH

`d25b53d15cbc6d6ab3b8037130c0319edd34a3349c49465af2b82153c7eb61d4`

File: `database/review/d2-008b2-direct-review.sql`.

## OLD HASHES

**OBSOLETE FOR REMOTE APPLY — never reuse for B4:**

- B1: `b6422a6b542e429a969060aae44971a8ee441eb6df42f09b84c2852db54f233a`
- B2: `7720341657b66dbc2df99145fe269eed8d6e0f899be8410e9536ff9bdc579827`

Local test harness hashes (not remote apply helpers):

- `scripts/instaward/b32-local-postgres.py` — SHA-256 `ace101b9335fcd4283cf7aeec84e29b865d665768d2f57d36be749cab0641373`.
- `scripts/instaward/b32-pg-check.mjs` — SHA-256 `1724aeaeccf032ede9976cf9e82b59a266c414797de80d47eee987407d6cda56`.
- `scripts/instaward/b32-fixture-adapter.mjs` — SHA-256 `58ce9a6df4dd375671fc7bd1707c5b7c458dd7b063b9ee94a35435bf5ae3a5f5`.
- `scripts/instaward/b32-vitest.config.mts` — SHA-256 `c6a1af7e5243f68a1155b92ac0b964d561499d2a17cbdb8e90d89b8207518951`.

## REMOTE MUTATIONS

**NONE.** No remote roles/schema/grants/RLS/defaults/business rows/intents/bindings/credentials, Auth, Vercel, Stellar, contract, WASM or signer changes. Testnet transactions/signatures/broadcasts = **0**. No USER2 use.

## FILES CHANGED

Tracked modifications: only the two SQL artifacts B1/B2. New files: the four B32 test harnesses listed above, this Markdown report and its sanitized JSON companion. Local fixture/logs/snapshots are ignored under `.tools/d2-008b3_2`.

The B3/B3.1 reports and blocker reproducer remain intact/untracked. Protected docs/security/KEY-CUSTODY-AUDIT.md and tools/sync_obsidian.py remain intact/untracked. Existing acceptance evidence, frontend/backend/contracts/signer source, package/lock/config files are unchanged. No commit, push, merge or tag changes.

Final closure checks: of 504 baseline files, only the two permitted SQL artifacts differ; **502 remain byte-identical**. Git refs (including main/tags) remain identical. `git diff --check`, new-file whitespace, Python syntax and Node syntax checks PASS. Ignored fixture configuration stays excluded from Git; PostgreSQL is stopped. Secret audit: **578 files / 700 historical blobs / 0 staged files / 0 findings**.

## PROJECT STATUS

D1 **12/12 PASS**; D2 **5/6 PASS**; D3 **0/5**; TOTAL **17/23**. D2.6 remains pending. No official acceptance, approval, payment or certification by Stellar/SDF/Instawards is claimed.

## NEXT OWNER AUTHORIZATION

**DRAFT ONLY — NOT EXECUTED.** Owner must review the local diff/hashes before publication or any remote apply.

> I authorize D2-008B4 only to apply the exact reviewed patched B1 and then patched B2 to Supabase DEV project `aemxuqnnwfclzrwwiqfd`, deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`.
>
> B1 SHA-256: `957e19e768a6ca90f5bbf5c6268945ef129686d3cd342ec17cca1e3eca41585d`.
>
> B2 SHA-256: `d25b53d15cbc6d6ab3b8037130c0319edd34a3349c49465af2b82153c7eb61d4`.
>
> Before DDL, recheck the exact project/deployment/network/contract/WASM pins, review-role/schema collision baseline, private Data API/GraphQL boundary, executor current_user=session_user=postgres NOSUPERUSER with empty createrole_self_grant, and exact artifact bytes. STOP on drift. No implicit repairs or alternate executor/superuser mechanism.
>
> Use the existing trusted connection without printing or persisting credentials, with verified TLS, **psql -X -v ON_ERROR_STOP=1**, captured sanitized stdout/stderr and hard failure on privilege warnings. Apply B1 first and verify its complete committed postconditions; then apply B2 and verify all final postconditions. Each file owns its BEGIN/COMMIT: they are individually atomic, NOT jointly atomic; do not add a misleading outer transaction.
>
> The only authorized object/ACL/default changes are those in the two hash-pinned artifacts, including the documented local adoption EXECUTE grant and bounded temporary bridges/cleanup. Future managed automatic grantor behavior is checked by the inline fail-closed assertions, never guessed or repaired.
>
> If B1 succeeds and B2 fails, STOP and report B1-committed/B2-rolled-back state. Do not automatically repair, replay, reprepare, delete roles/schema, alter the artifacts or escalate capabilities. A partial result requires owner review.
>
> Do not provision any password/credential before complete structural verification passes. This bounded SQL-apply authorization does not itself authorize password provisioning; obtain that approval separately if needed. No Auth, Vercel, Stellar, signing/broadcast, business rows, review_access/review_batteries/permission bindings, intent creation/adoption, frontend/backend/signer/contract/WASM changes, merge or tags. No remote apply has happened under B3.2. Stop after structural evidence/reporting.

This draft is not consent; B4 remains unexecuted. **STOP.**
