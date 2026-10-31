# D2-008B3 — Supabase remote review boundary preflight

Date: 2026-10-30. Branch: `instaward/d2-web-mvp`. HEAD unchanged: `d406dad4d9edd7b9b46a0c8a8090d333554dbeb1`.

## STATUS

**OWNER REVIEW REQUIRED. REMOTE APPLY IS NOT APPROVED/READY.**

The first authorized remote SELECT exposed an apply-privilege prerequisite gap. Following the owner's immediate-stop instruction, no further project queries/advisors were run. This is an early-stopped preflight, not a complete remote certification. No attempt was made to execute B1/B2 to manufacture a failure. The original artifacts, completed B1/B2/B2A gates and application behavior remain unchanged.

## CURRENT REMOTE STATE

Target project ref: `aemxuqnnwfclzrwwiqfd` (owner label: Byetery Dev). Observed at `2026-10-30T04:23:41.436575+00:00` through `execute_sql` with that exact project selector. Project display-name metadata was not independently fetched.

| Check | Observed result |
| --- | --- |
| PostgreSQL | 17.6 / 170006 |
| current_user / session_user | postgres / postgres |
| SUPERUSER | false |
| CREATEROLE | true |
| INHERIT / LOGIN / CREATEDB / BYPASSRLS / REPLICATION | true / true / true / true / true |
| createrole_self_grant | empty |
| SQL execution | One SELECT only; server transaction_read_only was off, so read-only is established by the submitted statement, not a claimed server-enforced read-only transaction |
| app_private / api_private / chain_private | Exist, owned by postgres |
| Target deployment | `5c0cad2f-5f25-4216-8068-6cb9d2d26325`, TESTNET, schema_version 1 |
| Contract | `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON` — matches |
| Network ID | `cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472` — matches |
| Frozen WASM | `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6` — matches |
| Built-in SHA-256 / known abc vector | Available / matches |
| Built-in gen_random_uuid | Available |

This verifies database configuration pins, not current live Stellar state. No Stellar request was made. Deployment table existence is proven by its SELECT; the rest of the required table/column/constraint/index/trigger and membership infrastructure was **not fully inspected after STOP**. Earlier reports/local fixtures are not substituted for those missing current checks.

## ROLE INVENTORY

| Role | Exists remotely? | Attributes / memberships |
| --- | --- | --- |
| `byetery_d2_intent_owner` | NO | Not applicable; role does not exist |
| `byetery_d2_read_owner` | NO | Not applicable; role does not exist |
| `byetery_d2_review_app` | NO | Not applicable; role does not exist |

Only safe pg_roles attributes were selected. No pg_authid/password verifier, Auth user/session data, token or credential was requested. Membership arrays for nonexistent roles are empty by construction; do not infer a completed privileged-membership audit of the executor.

## REVIEW_PRIVATE INVENTORY

`review_private` does not exist. Therefore its observed relations/functions are empty and it has no resident tables, indexes, triggers, policies or grants to compare. No B1/B2 object was overwritten. Detection of old objects under other unexpected schemas was not completed after STOP.

Expected future footprint from the exact source: four review tables, 13 functions (12 SECURITY DEFINER and one trigger INVOKER), 36 new policies, two new review triggers plus the B1 partial unique index/constraints. This is a source manifest, not a remote-applied inventory; detailed function body hashes are in JSON.

## PARTIAL/COLLISION CHECK

No named review role, schema, relation or function collision was observed in the initial query. This is not blanket approval of uninspected prerequisites, default ACLs or event-trigger behavior. Future execution must repeat collision checks and STOP on any existing/partial review structure instead of replaying CREATE or repairing it.

## B1 COMPATIBILITY

Static functional design remains as accepted: separate WAITING intent only; no Foundation object/work/envelope/lease before explicit adoption; immutable UUID/material; current ACTIVE ADMIN + separate permission + deployment pins; local-owner adoption creates ordinary QUEUED work and does not process/sign/send it.

Remote apply as observed `postgres` is **not ready**. B1 line 91 grants only schema USAGE to the intent owner; lines 273–276 transfer function ownership without schema CREATE for that owner or an explicit executor SET-role bridge. Its default-privilege command at line 22 also requires the correct role authority. Local superuser fixture success does not prove these non-superuser permissions.

Under [PostgreSQL 17 ALTER FUNCTION](https://www.postgresql.org/docs/17/sql-alterfunction.html), a non-superuser ownership transfer needs executor SET ROLE capability and CREATE on the schema for the new owner. Here the source supplies no CREATE. The observed empty [createrole_self_grant](https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-CREATEROLE-SELF-GRANT) does not automatically supply SET capability. CREATEROLE alone must not be treated as superuser. A managed-platform exception or more privileged executor was neither demonstrated nor assumed.

## B2 COMPATIBILITY

After B1, source creates the separate read owner and two allowlist tables. It maps Auth UID to ACTIVE principal/current matching membership/review access, keeps per-role battery scope, reuses B1 generation, and revokes hosted access to the principal-taking B1 functions. Raw business/review table grants and adoption are not given to the hosted role.

B2 has the same ownership prerequisite gap: line 42 grants USAGE only; lines 232–239 change function owners. Its line-13 default-privilege authority also needs review. No artifact was edited.

Expected final hosted EXECUTE set, **not tested remotely**:

- `review_private.profile(uuid)`
- `review_private.battery(uuid,text)`
- `review_private.history_rows(uuid,text)`
- `review_private.create_review_registration_intent(uuid,text,jsonb)`
- `review_private.review_registration_intent_status(uuid,uuid)`

No sixth function, adopt/internal B1 helper, raw table/column DML/SELECT, worker/signer surface, BYPASSRLS or privileged membership is acceptable.

## SECURITY DEFINER / RLS REVIEW

Planned function owners/settings:

| Signature | Security | Intended owner | search_path |
| --- | --- | --- | --- |
| `immutable_intent()` | INVOKER | `apply role (postgres); SECURITY INVOKER trigger` | Empty/fixed |
| `require_authority(uuid)` | DEFINER | `byetery_d2_intent_owner` | Empty/fixed |
| `create_registration_intent(uuid,text,jsonb)` | DEFINER | `byetery_d2_intent_owner` | Empty/fixed |
| `registration_intent_status(uuid,uuid)` | DEFINER | `byetery_d2_intent_owner` | Empty/fixed |
| `adopt_registration_intent(uuid)` | DEFINER | `byetery_d2_intent_owner` | Empty/fixed |
| `resolve_review(uuid)` | DEFINER | `byetery_d2_read_owner` | Empty/fixed |
| `visible_battery(uuid,text,text)` | DEFINER | `byetery_d2_read_owner` | Empty/fixed |
| `profile(uuid)` | DEFINER | `byetery_d2_read_owner` | Empty/fixed |
| `operation_dto(uuid)` | DEFINER | `byetery_d2_read_owner` | Empty/fixed |
| `battery(uuid,text)` | DEFINER | `byetery_d2_read_owner` | Empty/fixed |
| `history_rows(uuid,text)` | DEFINER | `byetery_d2_read_owner` | Empty/fixed |
| `create_review_registration_intent(uuid,text,jsonb)` | DEFINER | `byetery_d2_intent_owner` | Empty/fixed |
| `review_registration_intent_status(uuid,uuid)` | DEFINER | `byetery_d2_intent_owner` | Empty/fixed |

The twelve definer owners are intended NOLOGIN/NOINHERIT/NOBYPASSRLS roles, not owners of underlying application tables. The trigger function is INVOKER and is not misclassified as a definer. Built-ins resolve through pg_catalog; application/review relations are qualified. Source ends with explicit PUBLIC/anon/authenticated revocation; only the five intended hosted wrappers remain executable after B2.

All four new review tables get ENABLE and FORCE RLS. Added policies target only the new private roles; no USING(true) appears, and source does not remove existing browser_deny policies. **Scope precision:** B1 intent/permission SELECT policies are deployment/capability-scoped; principal checks are additionally enforced by bounded functions and principal-specific authority/lock policies. It would be inaccurate to claim every B1 RLS SELECT is principal-scoped. B2 read policies and wrapper checks add approved-battery and review-access scope. This source review does not certify remote existing RLS/policy/grant state; those reads stopped.

Smallest proposed correction to review, **not implemented**: an explicit, temporary ownership-transition privilege path for the trusted apply operator, with CREATE confined to review_private for the required NOLOGIN owners during transfer, removed before commit. Never grant postgres/admin/BYPASSRLS membership to the hosted or definer roles. Review SET/default-privilege authority together, validate under PostgreSQL 17 non-superuser semantics, and freeze any new reviewed wrapper/modified-artifact hash before use. Merely switching from MCP to psql does not supply missing privileges.

## DEFAULT PRIVILEGES

Current remote pg_default_acl/event-trigger/grant-option state: **NOT INSPECTED — STOP CONDITION**. No claim that advisors/default grants are clean.

Source safeguards: B1 and B2 each have one explicit BEGIN/COMMIT; all final revocations precede their COMMIT. PostgreSQL's [SECURITY DEFINER guidance](https://www.postgresql.org/docs/17/sql-createfunction.html) uses transactional creation/revocation to avoid a committed exposure interval. The owner-role default changes do not replace explicit revokes for functions actually created as postgres; [defaults follow the creating role](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html). No uncommitted-to-other-session exposure claim or successful remote apply is invented. A client that splits statements/autocommits would invalidate this plan.

## ARTIFACT HASHES

Both working files are byte-identical to their blobs at HEAD, not just semantically equivalent.

| Artifact | SHA-256 |
| --- | --- |
| B1 | `b6422a6b542e429a969060aae44971a8ee441eb6df42f09b84c2852db54f233a` |
| B2 | `7720341657b66dbc2df99145fe269eed8d6e0f899be8410e9536ff9bdc579827` |

These are **inspection pins**, not permission to apply. Any changed artifact or new execution wrapper needs a separately reviewed hash; do not silently reuse these values for a patched script.

## RECOMMENDED APPLY MECHANISM

Order is accepted **in principle only**: B1 -> B2 -> structural verification -> approved role hardening -> restricted credential -> restricted-role checks. Account/battery/permission bindings remain a later separate gate. The present stop blocks execution of that order.

Prefer a controlled existing local psql client after a valid owner-transition plan is approved: -X (ignore startup scripts), ON_ERROR_STOP=1, verified TLS, explicit DEV target and exact-file execution. Keep each file's own BEGIN/COMMIT intact; do not wrap both blindly in another transaction because their internal COMMIT ends it. The two files are individually atomic, **not jointly atomic**. If B1 commits but B2 fails, STOP with a partial-state report, do not provision credentials or repair/replay. MCP execute_sql is available but was observed as the same non-superuser postgres; it cannot be assumed to solve ownership privileges or multi-statement behavior without review. No automatic migration pipeline or apply_migration call.

## RESTRICTED CREDENTIAL PLAN

No password was generated, entered, set or retrieved in B3. Future owner-only flow: use a local CSPRNG/password manager, retain the secret outside chat/model logs and repository files, and enter it interactively through the official [psql password command](https://www.postgresql.org/docs/17/app-psql.html):

```text
\password byetery_d2_review_app
```

Use only after structural/hardening checks, in a genuine local interactive TLS-verified operator session, with no transcript/debug capture. No plaintext SQL password literal, CLI argument, PGPASSWORD, repo .env/.pgpass, MCP query body or report. psql performs its hidden input/encryption internally; do not retrieve or print its generated verifier either. Future Vercel secret placement is separately authorized, not part of B4's no-Vercel scope.

Non-secret future connection shape only: shared Supavisor transaction host verified for this project, port **6543**, database **postgres**, client username **byetery_d2_review_app.aemxuqnnwfclzrwwiqfd**, server role **byetery_d2_review_app**, variable **BYETERY_REVIEW_DATABASE_URL**, verified CA. No credential-bearing URL is constructed here and actual host/restricted login are untested.

The existing pg client uses pool max 1, unnamed parameterized calls and transaction-local context, which fit [Supavisor transaction mode](https://supabase.com/docs/guides/database/connecting-to-postgres#transaction-mode-limitations). No named prepared statement/session-state assumption; connect 5s, idle 10s and query 6s client limits remain unchanged. Role-level limits must be verified on a fresh restricted pooler connection. No fallback to postgres/admin/service-role credentials in the hosted app.

## FUTURE ROLE HARDENING

B1 already specifies LOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION for a newly created review_app role. The two owners are NOLOGIN with the other safe flags. Existing roles would require collision/attribute review, not automatic reuse.

Additional **proposed owner-reviewed settings**, not in B1 and not applied: connection limit **4**, statement_timeout **5s**, idle_in_transaction_session_timeout **5s**. The selected cap is a proposal for a small review window, not an already approved/project-capacity measurement. Future explicit hardening text:

```sql
ALTER ROLE byetery_d2_review_app WITH LOGIN NOINHERIT NOSUPERUSER
  NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 4;
ALTER ROLE byetery_d2_review_app SET statement_timeout = '5s';
ALTER ROLE byetery_d2_review_app SET idle_in_transaction_session_timeout = '5s';
```

No new membership in privileged/owner roles. Recheck actual server settings via a fresh restricted connection; do not assume warm pool backends changed.

## POST-APPLY VERIFICATION PLAN

**PLAN ONLY; none executed.** Before this can run, finish the stopped prerequisite/default-ACL/advisor checks and review the privilege correction. Use read-only catalogue queries first, never business-row fixtures or adoption.

1. Verify role flags/membership edges, exact four review tables/constraints/index/triggers, 13 function signatures/body hashes/12 definer owners/search_path, 36 planned policies, FORCE RLS, existing browser_deny and unmodified prerequisite owners. Compare source hashes and canonical catalog representations; don't compare pretty-printed policy whitespace as if it were semantics.
2. Check effective EXECUTE and raw table **and column** ACLs. Required exact function set: five. Reject unexpected PUBLIC/anon/authenticated EXECUTE or review schema USAGE and privileged memberships. Read-only examples, only after the roles exist:

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid),
       pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig,
       encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS body_sha256,
       has_function_privilege('byetery_d2_review_app',p.oid,'EXECUTE') AS hosted_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='review_private' ORDER BY p.proname;

SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,
       has_table_privilege('byetery_d2_review_app',c.oid,'SELECT') AS raw_select,
       has_any_column_privilege('byetery_d2_review_app',c.oid,'SELECT') AS column_select,
       has_any_column_privilege('byetery_d2_review_app',c.oid,'INSERT') AS column_insert,
       has_any_column_privilege('byetery_d2_review_app',c.oid,'UPDATE') AS column_update,
       has_table_privilege('byetery_d2_review_app',c.oid,'DELETE') AS raw_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('review_private','app_private','api_private','chain_private')
  AND c.relkind IN ('r','p') ORDER BY n.nspname,c.relname;
```

3. With the future restricted credential, assert current_user equals the base review_app role, no BYPASSRLS/role fallback, timeout settings and exactly intended function authority. Negative tests must produce SQLSTATE **42501**, not merely zero rows or a read-only-transaction error. Raw SELECT uses WHERE false. For DML use EXPLAIN with ANALYZE FALSE, never actual DML, so an unexpected privilege success cannot write rows:

```sql
SELECT * FROM review_private.review_access WHERE false;
EXPLAIN (ANALYZE FALSE, COSTS FALSE)
  INSERT INTO review_private.review_access(deployment_id,principal_id,review_role)
  SELECT NULL::uuid,NULL::uuid,'USER' WHERE false;
EXPLAIN (ANALYZE FALSE, COSTS FALSE)
  UPDATE review_private.review_access SET enabled=enabled WHERE false;
EXPLAIN (ANALYZE FALSE, COSTS FALSE)
  DELETE FROM review_private.review_access WHERE false;
```

Use one controlled read-only transaction/savepoint per negative probe, assert the exact error and roll back; unexpected success is a failed boundary test. Also deny raw business-table/column privileges through the catalogue matrix. Adopt/internal-B1 EXECUTE must be false; do **not** invoke adoption to test permissions. A valid read-only boundary test can use known NULL/invalid inputs only after function-body/grant identity is verified; it must never generate or adopt an intent.

4. Before bindings, expected safe wrapper behavior is ReviewAccessDisabled for a synthetic unmapped UUID; grant visibility can be proven without inventing an evaluator. Actual positive profile/battery/history/status behavior for a real approved principal is **deferred until the separate bindings gate**. A positive create-intent test is a write and cannot be included in B4's read-only/no-business-row verification. It requires later explicit intent authorization; do not count an ACL check as a completed business-positive test.
5. Inspect security advisors read-only and compare only relevant structural changes against a fresh preexisting baseline. No automatic fixes, role alteration, Auth/session experiment, live Stellar check or Vercel action is part of verification.

## SUPABASE ADVISORS

**NOT_RUN — immediate stop condition reached.** Preexisting findings: NOT ASSESSED; materially relevant B1/B2 findings: NOT ASSESSED; unrelated findings: NOT ASSESSED. There is no assertion of zero findings and no advisor remediation. The current Supabase changelog was read, including the documented 17.6-to-17.11 minor rollout; no upgrade, extension install, reindex or unrelated scan was performed. Current remaining advisors/default ACL/prerequisite reads must finish before apply readiness can be reconsidered.

## REMOTE MUTATIONS

**NONE.** One authorized SELECT over safe catalogs, built-in capability checks and the exact pinned deployment row. No SQL artifact/DDL, CREATE/ALTER/DROP/GRANT/REVOKE, password creation, Auth login/logout/user/session change, business/review binding row, Vercel or Stellar action. Ordinary database query telemetry is not a business mutation. No secret or password hash was requested or exposed. No claim is made that unrelated external workflows were globally quiescent.

## FILES CHANGED

Only two new local untracked reports: D2-008B3-REMOTE-SQL-PREFLIGHT.md and D2-008B3-REMOTE-SQL-PREFLIGHT-RESULTS.json. No SQL artifact, code, dependency, config, contract/WASM, signer, previous evidence or protected file change. No commit/push. Ignored local metadata captures support the report.

## NEXT OWNER AUTHORIZATION

**B4 HOLD. Do not request/interpret an execution approval as implicitly fixing this gap.** First obtain owner review of the minimum local privilege-transition/apply plan and complete the stopped read-only checks. If any artifact/wrapper changes, record and approve its new hash; this original-hash template is then obsolete. The requested single bounded future authorization, deliberately inactive now:

> D2-008B4 — Apply B1+B2 remotely and provision restricted review credential — HOLD / NOT READY TO AUTHORIZE.
Autorizacion propuesta, solo despues de cerrar la brecha de privilegios mediante revision OWNER y revalidar los prerrequisitos pendientes: exclusivamente proyecto aemxuqnnwfclzrwwiqfd y deployment 5c0cad2f-5f25-4216-8068-6cb9d2d26325. Verificar antes de DDL B1 SHA-256 b6422a6b542e429a969060aae44971a8ee441eb6df42f09b84c2852db54f233a y B2 SHA-256 7720341657b66dbc2df99145fe269eed8d6e0f899be8410e9536ff9bdc579827; aplicar B1 completo, luego B2 completo, luego verificacion estructural, hardening aprobado, provision interactiva de la credencial restringida y pruebas del rol. Roles nuevos/atributos: byetery_d2_intent_owner, byetery_d2_read_owner, byetery_d2_review_app. ACLs adicionales solo las exactas del plan aprobado, incluyendo revocaciones a PUBLIC/anon/authenticated y EXECUTE de adopcion al operador postgres segun B1; ningun atributo privilegiado nuevo para esos roles ni membresia privilegiada al rol hosted. No business rows, intents, bindings review_access/review_batteries/permissions, Auth, Vercel ni Stellar. Contrasena CSPRNG generada localmente y entrada oculta, sin chat/log/CLI/env del repositorio; no generar ni compartir URL con credencial. STOP antes de DDL si persiste la brecha observada, falta cualquier prerrequisito, cambia cualquier hash/owner/ACL/rol/atomicidad, hay colision o se necesita un cambio no aprobado. Si el arreglo requiere editar los artefactos o un wrapper de ejecucion, esta propuesta queda invalidada hasta revisar y congelar su contenido/hashes nuevos; no autoriza cambios implicitos.

Current internal status stays **D1 12/12 PASS; D2 5/6 PASS; D3 0/5; TOTAL 17/23**. D2.6 pending. B1/B2/B2A historical acceptance is not reopened by this deployment-prerequisite finding. STOP after this report; no remote apply, credential, Vercel or Stellar phase starts.
