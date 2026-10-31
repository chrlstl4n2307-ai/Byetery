# D2-008B4 — Remote structural apply of patched B1 + B2

## STATUS

**D2-008B4 = B4 STRUCTURAL APPLY PASS.**

Date: 2026-10-30 (America/Santiago). Supabase DEV project `aemxuqnnwfclzrwwiqfd`; deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`.

B1 and B2 each ran **once**, each returned COMMIT and each passed independent post-commit catalogue verification. They are individually atomic, **not jointly atomic**. No outer transaction, repair, replay, alternate executor, credential provisioning or business operation was used. D2.6 remains pending.

## PRE-APPLY CHECK

- Branch `instaward/d2-web-mvp`, unchanged local HEAD `d406dad4d9edd7b9b46a0c8a8090d333554dbeb1`.
- B1 SHA-256: `957e19e768a6ca90f5bbf5c6268945ef129686d3cd342ec17cca1e3eca41585d`.
- B2 SHA-256: `d25b53d15cbc6d6ab3b8037130c0319edd34a3349c49465af2b82153c7eb61d4`.
- Recomputed each exact file digest before application. No normalization, edit or substitution of authorized SQL bytes. psql consumed those bytes on stdin; credentials were never arguments or stdin SQL.
- Verified deployment mode TESTNET, contract `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`, network ID `cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472`, and frozen WASM SHA-256 `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.
- current_user=session_user=postgres; NOSUPERUSER, CREATEROLE, server 17.6, empty createrole_self_grant.
- Fresh READ ONLY catalogue transaction at `2026-10-30T23:20:48.643884+00:00`: review_private and all three named roles absent. Immediate per-phase SELECT checks repeated the pins/executor and expected schema/role baseline immediately before each apply.
- Exact prerequisite parity: 171 columns, 12 auxiliary function body hashes/owners/flags/configurations, 141 constraints, 52 indexes, 38 triggers. Twenty existing tables remain postgres-owned with ENABLE/FORCE RLS. Existing policies, default ACLs and event-trigger definitions match the prior reviewed inventory.
- PostgREST zero-row GET with Accept-Profile review_private returned 406/PGRST106, explicitly permitting only public and graphql_public. GraphQL extension absent; the sole graphql_public wrapper is the existing invoker placeholder reporting that pg_graphql is not enabled. No RPC/wrapper invocation or exposure configuration changed.

Transport: used the existing trusted ignored .env connection, psql **17.6**, `-X -v ON_ERROR_STOP=1`, CA verified and **sslmode=verify-full**. Client conninfo: `SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off, ALPN: none)`. No certificate copy or configuration change was needed. Credentials existed only in process memory/child environment and were not written, printed or placed in shell history/arguments.

Transport distinction: the pooler-to-Postgres backend reports pg_stat_ssl=false; that is distinct from the client-to-pooler connection above. An initial read-only harness assertion wrongly treated the backend leg as the client TLS indicator and stopped **before DDL**. The client leg was then verified directly using psql conninfo while retaining verify-full. No TLS protection was relaxed and no SSL enforcement was changed. Do not interpret this report as evidence that the internal pooler/backend leg is TLS-encrypted. See [libpq verify-full](https://www.postgresql.org/docs/17/libpq-ssl.html) and [Supabase SSL enforcement / pooler legs](https://supabase.com/docs/guides/platform/ssl-enforcement).

## B1 APPLY

Attempt time: `2026-10-30T23:22:21.322Z`. Exactly one hash-pinned B1 stdin execution. Exit **0**, explicit **COMMIT** response, **0 warnings**. No manual statements were appended to the artifact. The temporary bridges and owner-issued adoption EXECUTE exception were the exact reviewed statements inside B1.

## B1 POSTCONDITIONS

Post-commit READ ONLY verification at `2026-10-30T23:22:33.236122+00:00` passed before B2 was permitted:

- Two roles, exact safe flags; four expected SECURITY DEFINER functions owned by intent_owner; invoker trigger owned by postgres.
- Exact empty search_path and function-body hashes; aclexplode ACLs/grantor provenance exactly match the reviewed local B1 matrix.
- Independent owner-issued adoption EXECUTE to postgres retained; PUBLIC/anon/authenticated/service_role/review_app denied adoption.
- No owner CREATE, no effective SET/INHERIT owner path for postgres, no hosted role membership.
- Two review tables postgres-owned with ENABLE/FORCE RLS; only the two temporary B1 hosted entrypoints executable by review_app.
- No raw hosted table/column SELECT/DML capability. Permissions and registration_intents remain empty.

## B2 APPLY

Attempt time: `2026-10-30T23:23:01.130Z`. Started only after B1 COMMIT plus verified PASS. Exactly one hash-pinned B2 execution, exit **0**, explicit **COMMIT**, **0 warnings**. No replay or ACL repair.

## B2 POSTCONDITIONS

Post-commit READ ONLY verification at `2026-10-30T23:23:12.838875+00:00` passed all exact role/function/table/ACL/cleanup checks. A second connection through Supabase MCP independently read the final state at `2026-10-30T23:24:15.364379+00:00` in READ ONLY mode and confirmed the five hosted signatures, twelve definers, zero postgres definers, unchanged defaults and zero rows in all four review tables.

## ROLE INVENTORY

| Role | Login | NOINHERIT / NOSUPERUSER / NOBYPASSRLS / NOCREATEDB / NOCREATEROLE / NOREPLICATION |
| --- | --- | --- |
| `byetery_d2_intent_owner` | NOLOGIN | PASS |
| `byetery_d2_read_owner` | NOLOGIN | PASS |
| `byetery_d2_review_app` | LOGIN | PASS |

No role password or login credential was provisioned. LOGIN on review_app is only the reviewed role attribute, not a claim that a restricted credential/connection is ready.

## FUNCTION OWNER AUDIT

| Signature | Owner | Security mode |
| --- | --- | --- |
| `review_private.adopt_registration_intent(uuid)` | `byetery_d2_intent_owner` | DEFINER |
| `review_private.battery(uuid,text)` | `byetery_d2_read_owner` | DEFINER |
| `review_private.create_registration_intent(uuid,text,jsonb)` | `byetery_d2_intent_owner` | DEFINER |
| `review_private.create_review_registration_intent(uuid,text,jsonb)` | `byetery_d2_intent_owner` | DEFINER |
| `review_private.history_rows(uuid,text)` | `byetery_d2_read_owner` | DEFINER |
| `review_private.immutable_intent()` | `postgres` | INVOKER |
| `review_private.operation_dto(uuid)` | `byetery_d2_read_owner` | DEFINER |
| `review_private.profile(uuid)` | `byetery_d2_read_owner` | DEFINER |
| `review_private.registration_intent_status(uuid,uuid)` | `byetery_d2_intent_owner` | DEFINER |
| `review_private.require_authority(uuid)` | `byetery_d2_intent_owner` | DEFINER |
| `review_private.resolve_review(uuid)` | `byetery_d2_read_owner` | DEFINER |
| `review_private.review_registration_intent_status(uuid,uuid)` | `byetery_d2_intent_owner` | DEFINER |
| `review_private.visible_battery(uuid,text,text)` | `byetery_d2_read_owner` | DEFINER |

All 13 exact signatures/body hashes/ACLs and configurations match the B3.2 matrix. Twelve definers; **zero** postgres-owned definers. immutable_intent is the intentional postgres-owned invoker. Every function has the expected fixed empty search_path.

## FINAL FIVE HOSTED EXECUTES

1. `review_private.profile(uuid)`
2. `review_private.battery(uuid,text)`
3. `review_private.history_rows(uuid,text)`
4. `review_private.create_review_registration_intent(uuid,text,jsonb)`
5. `review_private.review_registration_intent_status(uuid,uuid)`

Exactly five. No hosted EXECUTE on adoption, require_authority, old principal-taking create/status, resolve_review, visible_battery, operation_dto or immutable_intent. Verified from effective catalogue privileges, not inferred from SQL source. No function invocation was used as a probe.

## ADOPTION ACL

Final adoption owner/grantor: **byetery_d2_intent_owner**. aclexplode shows exactly owner EXECUTE plus **postgres EXECUTE granted by intent_owner**, without grant option. PUBLIC/anon/authenticated/service_role/review_app absent. postgres cannot SET ROLE intent_owner and does not inherit its privileges. No adoption invocation occurred.

## MEMBERSHIP CLEANUP

Final actual remote edges:

| Granted role | Member | Grantor | ADMIN | INHERIT | SET |
| --- | --- | --- | --- | --- | --- |
| `byetery_d2_intent_owner` | `postgres` | `supabase_admin` | true | false | false |
| `byetery_d2_read_owner` | `postgres` | `supabase_admin` | true | false | false |
| `byetery_d2_review_app` | `postgres` | `supabase_admin` | true | false | false |

These are the expected automatic creator ADMIN-only edges, not leftover temporary postgres-granted edges. All direct temporary edges are gone. Owners and review_app are members of no role; postgres has no effective SET/USAGE path to either owner. Supabase's actual automatic grantor was observed and verified as a superuser, not assumed or manually replaced.

## SCHEMA CREATE CLEANUP

intent_owner CREATE=false; read_owner CREATE=false. All temporary CREATE grants were revoked inside their artifacts before COMMIT. The schema remains postgres-owned and review_app has no schema CREATE.

## RLS / TABLE OWNERS

Four review tables — permissions, registration_intents, review_access, review_batteries — are postgres-owned with ENABLE RLS + FORCE RLS. Their declared keys/constraints/indexes/triggers and all accepted scoped policies are those of the exact reviewed artifacts. No owner became a review-table owner.

Final row counts: **permissions=0; registration_intents=0; review_access=0; review_batteries=0**. No bindings, intent, adoption or Foundation/business row was created by this gate.

## RAW PRIVILEGE NEGATIVE CHECKS

Read-only effective authorization probes covered **24 review/business tables**, using has_table_privilege and has_any_column_privilege: table SELECT/INSERT/UPDATE/DELETE are false and column-level SELECT/INSERT/UPDATE/REFERENCES are false for review_app. has_function_privilege and pg_has_role also verified function denial/role boundaries.

These are **catalogue-based negative privilege probes**. An actual login as review_app and active SQL denial tests were **NOT RUN**: this gate forbids credential provisioning, and postgres is intentionally not allowed to SET ROLE that role after cleanup. No temporary membership or other bypass was introduced to perform a probe. The real restricted connection gate is explicitly deferred to B4.1; no credential-based connectivity is claimed here.

## WARNINGS

psql apply/verification warnings: **0 total / 0 privilege warnings**. No unexplained SQLSTATE 25P01 appeared in B4. Captured sanitized stdout/stderr and command exit metadata remain in ignored .tools/d2-008b4. The preliminary client/backend TLS-check issue above was resolved before any DDL; it was not a failed apply or a retry of B1/B2.

Security advisors after both commits report only the same preexisting **Leaked Password Protection Disabled** Auth WARN. It is unrelated to this structural role boundary, was not newly introduced, and was not remediated. No new material blocker returned. [Official advisor reference](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## REMOTE MUTATIONS

Authorized mutations only, from the two exact hash-pinned artifacts:

- Three database roles created; review_private schema and four tables with their constraints/implicit indexes created.
- Thirteen functions (twelve definers and one invoker trigger function), two triggers, explicit partial unique index, and 36 scoped policies added.
- Reviewed schema/column/function grants and explicit public/browser/hosted revokes; exact function ownership transfers; single independent postgres adoption grant.
- Temporary owner CREATE and direct SET-capable bridges created then removed; automatic safe creator administration edges retained.
- DP2: no default privileges changed. Final hosted authority restricted to the exact five entrypoints.

No manual additional GRANT/REVOKE, repair, replay, role drop or escalation. No password/credential provisioning, Auth, Vercel, business rows, intent/adoption, Stellar calls/signatures/broadcasts, USER2, D3, contract/WASM/signer/frontend/backend changes.

## SECRET EXPOSURE AUDIT

No DB password, credential URL, Supabase key/token, Auth user identifier or signing material is included in these reports. Existing connection material was read locally only; not passed in CLI arguments or persisted anew. Local helper redacts known credential values from outputs before storing them. SQL statements themselves contain no credentials.

Repository audit and an additional local scan of B4 artifacts/logs against the existing secret values are recorded in the JSON companion. No secret value or matching excerpt is printed by the scan. No public publication occurred.

Final result: **PASS**. Repository scan: 580 files, 700 historical blobs, 0 staged files, **0 findings**. Additional local value-based scan: 41 files, **0 matches**, with no values/excerpts printed. These checks include the generated reports and sanitized ignored execution evidence.

## FILES CHANGED

New local report files:

- `docs/instaward/d2/D2-008B4-REMOTE-APPLY.md`
- `docs/instaward/d2/D2-008B4-REMOTE-APPLY-RESULTS.json`

Execution helper, guards, sanitized logs and snapshots remain ignored in `.tools/d2-008b4`; no tracked helper/application/configuration change. B1/B2 bytes remain exactly the owner-approved hashes. The earlier B3/B3.1/B3.2 local diffs/untracked files remain preserved.

Protected docs/security/KEY-CUSTODY-AUDIT.md and tools/sync_obsidian.py remain intact and untracked. No commit/push/merge/tag change. Local git closure evidence is in the companion JSON.

Final closure: all **510 preexisting tracked/untracked baseline files remain byte-identical** for this B4 task; Git refs unchanged. `git diff --check` and new-report whitespace checks PASS. The existing two modified SQL artifacts remain modified relative to HEAD from B3.2, with no byte changed during B4. The only new non-ignored files in this task are the two B4 reports.

## PROJECT STATUS

D1 **12/12 PASS**; D2 **5/6 PASS**; D3 **0/5**; TOTAL **17/23**. **D2.6 pending**. This structural apply is not owner acceptance of D2.6, nor approval/certification/payment by Stellar/SDF/Instawards.

## NEXT OWNER AUTHORIZATION

**Draft only — D2-008B4.1: restricted review credential provisioning + restricted-role connection verification. NOT EXECUTED.**

> Authorize provisioning a password only for the existing database role byetery_d2_review_app in Supabase DEV aemxuqnnwfclzrwwiqfd, after re-verifying the B4 final structural boundary. Use a secure local interactive input or owner-controlled secure storage and an official PostgreSQL password mechanism; no password/credential URL in chat, CLI arguments, SQL/logs, repository files, screenshots or reports. Do not change role attributes, memberships, object grants or function definitions.
>
> Use verified TLS to establish one restricted-role connection, recording only public/non-sensitive connection identity evidence. Validate current_user=session_user=byetery_d2_review_app, exact five effective entrypoints, no memberships/owner SET, no schema CREATE and no raw table/column authority. Use read-only catalogue/SELECT and nonexecuting permission-denial probes; expected permission failures must be SQLSTATE 42501, not merely zero rows or read-only-transaction errors. No intent/adoption/business-function invocation, Auth, Vercel, review bindings, SQL schema/ACL changes or Stellar activity.
>
> If provider connectivity or provisioning requires any extra privilege/role/configuration change, STOP for owner review. Do not repair, broaden authority or fall back to postgres for the restricted checks. Keep new connection material local and secure; do not deploy it. Stop after sanitized connection/security evidence. No commit/push automatically.

This text is a proposal, not authorization. No new password, credential configuration or restricted connection has been created under B4. **STOP.**
