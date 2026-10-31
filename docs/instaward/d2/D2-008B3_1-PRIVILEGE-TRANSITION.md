# D2-008B3.1 — Privilege transition review

## STATUS

**OWNER REVIEW REQUIRED. B4 is NOT ready for authorization.**

Date: 2026-10-30 (America/Santiago). Branch: `instaward/d2-web-mvp`.
Checkpoint: `d406dad4d9edd7b9b46a0c8a8090d333554dbeb1`.

The exact PostgreSQL 17.6 reproducer identified an incompatibility between two mandatory requirements: preserve the trusted postgres adoption capability, and perform every function ACL mutation before ownership transfer. B1/B2 were left byte-identical to the checkpoint; no partially correct replacement artifacts were issued. This is a blocker report, not a completed patch or acceptance matrix.

## COUNCIL RECONCILIATION

Council verdict: **PATCH B1/B2**. Final selected design: **A**, functions created by postgres, ACLs set before transfer. Stale design B wording was not implemented. The role split remains unchanged: B1 creates intent_owner/review_app; B2 creates read_owner. No function was moved between artifacts and no application logic was changed.

## POSTGRESQL 17 RULE

The nonsuperuser executor must own the function, have SET authority to the target owner, and the target owner must have schema CREATE. CREATEROLE alone is insufficient. This is documented in [PostgreSQL 17 ALTER FUNCTION](https://www.postgresql.org/docs/17/sql-alterfunction.html).

There is an additional rule relevant to this patch: ownership transfer replaces the old owner OID in both ACL grantor and grantee positions. See PostgreSQL **REL_17_6** source [`aclnewowner`](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/utils/adt/acl.c#L1043) and [ALTER OWNER caller](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/commands/alter.c). Therefore even an explicit pre-transfer `GRANT EXECUTE ... TO postgres` does not preserve postgres as a separate grantee.

The local catalogue reproduction returned:

| Stage | Function owner | ACL | postgres EXECUTE |
| --- | --- | --- | --- |
| Before transfer | postgres | `{postgres=X/postgres}` | true |
| After transfer + cleanup | byetery_d2_intent_owner | `{byetery_d2_intent_owner=X/byetery_d2_intent_owner}` | **false** |

The ordinary nonsuperuser call was also denied with insufficient_privilege. It was caught as an **expected** negative result; no WARNING was accepted. The probe's function has the same adoption signature and an inert synthetic body, solely to isolate catalogue mechanics; it is not the accepted B1 implementation or a functional substitute for it.

## B1 PATCH

**Not applied locally.** The accepted B1 local-operator adoption path requires postgres to execute `adopt_registration_intent(uuid)`. The existing functional suite exercises adoption through `OwnerRegistrationAdoption`; deleting that capability or weakening its tests would change accepted semantics.

Creating/transferring as design A and setting every ACL before transfer loses the postgres grant after cleanup. Leaving SET TRUE or INHERIT TRUE behind would violate the required final boundary. Neither workaround was implemented.

The original B1 control was applied by nonsuperuser postgres to disposable local prerequisites. It failed with SQLSTATE **42501** at line 22: `permission denied to change default privileges`. Its transaction rolled back; the review schema and intent_owner role were absent afterward. This is the actual observed first failure, not a claim that the unpatched artifact reached ALTER OWNER. Original B2 was not executed after the blocker.

## B2 PATCH

**Not applied locally.** B2 depends on a valid B1 adoption capability. The required final five hosted entrypoints and the old principal-taking-function revokes remain planned constraints, not newly validated results. No new B2 functions were created while SET ROLE. The original role split and SQL bytes remain intact.

## DEFAULT PRIVILEGES DECISION

**DP2 selected as the proposed direction for the reviewed patch; NOT implemented during this stopped task.** The two existing ALTER DEFAULT PRIVILEGES statements remain untouched in the unchanged artifacts, which remain unsuitable for apply.

Removal in the eventual patch would not weaken its intended boundary: functions are created by postgres; owner roles finish NOLOGIN and without schema CREATE. Explicit per-function revocations before exposure, catalogue assertions and appropriate ownership maintenance are authoritative. The owner-specific defaults never secured the initial postgres-created function ACLs. No default privilege was changed remotely or committed locally by the probe.

Remote defaults are schema-specific for public/storage/graphql/extensions/realtime. No global function default for postgres was present in the returned catalogue. Thus ordinary fresh-schema PUBLIC EXECUTE must be explicitly removed; no safe default is assumed. Full rows are retained in the sanitized JSON report.

## LOCAL PG17.6 MATRIX

Downloaded the official [EDB Windows binary archive](https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip) to ignored `.tools/d2-008b3_1`; no global install/service. Archive SHA-256: `d378882abd001a186735acd6f6ba716bca6ccd192e800412d4fd15ed25376b3e` (recorded digest, not a claim of publisher signature verification).

The existing portable runtime is 17.11 and was not used for this gate. The 17.6 fixture uses separate `b31_bootstrap` only for setup, then a real login/session named postgres with LOGIN, INHERIT, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS and **NOSUPERUSER**; `createrole_self_grant=''`. B1 control, migrations and mechanics probe ran as that nonsuperuser postgres. The bootstrap superuser did not run B1/B2.

The fixture binds only loopback to a dynamically allocated port, does not read `.env` or any remote URL, and runs psql with **`-X -v ON_ERROR_STOP=1`**, capturing stdout and stderr. All probe DDL is rolled back; PostgreSQL was cleanly stopped. It is not a Supabase managed-extension emulator.

| Requested item | Result | Evidence / limitation |
| --- | --- | --- |
| 1 | PARTIAL | Original B1 fails with SQLSTATE 42501 at default privileges; rollback verified. Original B2 not run after blocker. |
| 2 | NOT_RUN | No patched B1 issued: pre-transfer-only ACL rule cannot preserve postgres adoption EXECUTE. |
| 3 | NOT_RUN | No patched B2 issued. |
| 4 | PROBE PASS | Zero privilege WARNINGs in control/probe; not an acceptance of unrun patched scripts. |
| 5 | PROBE ONLY | Synthetic adoption signature owned by intent_owner with SECURITY DEFINER and empty search_path; no full artifact audit. |
| 6 | PROBE PASS | Automatic bootstrap ADMIN/SET false/INHERIT false preserved; direct postgres grant removed. |
| 7 | PROBE PASS | Temporary intent_owner schema CREATE removed; full B1/B2 not run. |
| 8 | NOT_RUN | Final five hosted ACL set requires reviewed patch. |
| 9 | NOT_RUN | Hosted-role SET denial matrix requires reviewed patch. |
| 10 | NOT_RUN | Hosted-role raw table/column denial matrix requires reviewed patch. |
| 11 | NOT_RUN | Existing B1/B2 functional suites unchanged; not run because implementation is blocked. |
| 12 | NOT_RUN | Injected B2 rollback matrix requires reviewed patch. |
| 13 | NOT_RUN | Patched B1 reapply matrix requires reviewed patch. |
| 14 | NOT_RUN | No DP1/DP2 artifact change applied; remote defaults inventoried. |
| 15 | NOT_RUN | Prerequisite tables are postgres-owned with FORCE RLS; new review tables not created by probe. |
| 16 | PROBE ONLY | Synthetic review definer transferred successfully; rolled back at end; no complete B1/B2 run. |

Reproduction command (requires the ignored exact 17.6 binary/bootstrap fixture already prepared):

```powershell
python scripts/instaward/b31-ownership-probe.py
```

The harness intentionally reports OWNER REVIEW REQUIRED when it successfully demonstrates the constraint conflict. It is not a remote apply helper and does not run the full acceptance matrix. An initialized disposable fixture is single-use for its bootstrap database/role names; do not rerun blindly against it.

Windows setup notes: ordinary sandbox initdb could not complete its subprocess probes; that exact fixture's processes were stopped. A full Unicode path caused initdb's UTF-8 bootstrap error. Using the Windows short path resolved it. A captured inherited pipe delayed pg_ctl completion; redirected local file handles resolved it. These setup issues did not change Windows protections or database privilege assertions.

## ZERO WARNING AUDIT

**ZERO PRIVILEGE WARNINGS — bounded control/probe only.** Seven psql invocations, zero `WARNING:` entries. The expected unpatched control ERROR and one expected-denial NOTICE are preserved distinctly in results. There is no claim that the unexecuted patched B1/B2 passes a zero-warning gate.

## FUNCTION OWNER / ACL AUDIT

The mechanics probe declared its synthetic function SECURITY DEFINER with empty search_path and queried its transferred owner/ACL. It did not separately query prosecdef/proconfig, so the full function-security catalogue gate is NOT_RUN. postgres then lacked EXECUTE. All probe objects were rolled back. No complete B1/B2 final function/hosted ACL catalogue exists, so exact-five and all-thirteen-function acceptance remains NOT_RUN.

## MEMBERSHIP / CREATE CLEANUP

Proved syntax in 17.6:

```sql
GRANT byetery_d2_intent_owner TO postgres
 WITH INHERIT FALSE, SET TRUE GRANTED BY postgres;
-- temporary ownership transfer
REVOKE byetery_d2_intent_owner FROM postgres GRANTED BY postgres;
```

The direct postgres-granted edge was removed. The automatic creator edge from local bootstrap remained **ADMIN TRUE / INHERIT FALSE / SET FALSE**, without changing its grantor or destroying it. Effective SET/USAGE to owner were false, and owner schema CREATE was false. This local grantor is evidence about stock 17.6, not proof that managed Supabase will use the same grantor; that remains an APPLY-TIME ASSERTION.

## REMOTE READ-ONLY CHECKS

Project: `aemxuqnnwfclzrwwiqfd`. Metadata observed: `2026-10-30T05:07:28.464869+00:00`.
The catalogue inventory ran in explicit **BEGIN TRANSACTION READ ONLY**, reported `transaction_read_only=on`, then ROLLBACK. No data values from Auth/users, credentials, signing material or business payloads were queried.

- Executor postgres: nonsuperuser CREATEROLE/BYPASSRLS/CREATEDB/REPLICATION; server 17.6; empty createrole_self_grant. The deployment, network ID, contract and frozen WASM pins match the owner-provided checkpoint. This is SQL configuration verification, not new Stellar verification.
- No named review roles, review schema, review tables or functions exist.
- Inventoried **20 tables, 171 columns, 141 constraints, 52 indexes, 20 policies, 38 triggers and 12 functions** across the three prerequisite schemas. All 20 tables are postgres-owned with ENABLE + FORCE RLS and browser_deny policies. All 109 explicitly column-qualified prerequisite grants found by the bounded parser reference existing columns. This is not a full parser or a full equivalence proof of every function/constraint; full local/remote parity stopped at the demonstrated blocker.
- Inspected pg_default_acl and postgres membership edges, plus managed reserved-role/superuser/privileged-role settings. postgres inherits supabase_privileged_role. The three proposed review role names are not among the observed reserved names. Availability of CREATE ROLE/membership behavior under provider hooks is not proved without mutation; no such mutation was attempted.
- Six enabled event triggers inspected: pgrst_ddl_watch may issue a schema reload notification on relevant schema/function DDL; pgrst_drop_watch handles drops; the other four are extension create/drop handlers. No shown event-trigger body rewrites the proposed review ACLs. CREATE ROLE is a shared-object operation, not evidence that those schema event triggers establish its grantor. Managed C-level restrictions remain an apply-time concern.
- SQL pgrst.db_schemas was not exposed through current settings/role settings; it was not inferred from that absence. A public-key GET to the API metadata root returned 401 requiring a secret key; no credential escalation occurred. A subsequent **GET /rest/v1/registration_intents?select=operation_id&limit=0** with `Accept-Profile: review_private` returned **406 / PGRST106**, explicitly listing only **public, graphql_public** as exposed. No table rows were returned or requested beyond zero rows. No RPC or Auth endpoint was invoked.
- GraphQL wrapper is SECURITY INVOKER and no review schema exists. Role-specific future GraphQL reflection/exposure was **not fully established** before STOP; it is not asserted as a completed gate.

One additional read-only catalogue transaction inspected the four app_private domains, matching their expected base types/checks, schema CREATE authority, managed extension setting and GraphQL wrapper configuration. It also reported read_only=on. Thus total remote SQL transactions = **2**; the first inventory and the supplementary transaction performed SELECTs only. Supplementary raw output was reviewed in-session; summarized evidence is recorded here. No SQL mutation was issued.

## ADVISORS

One read-only security-advisor run returned **Leaked Password Protection Disabled** (WARN), classified **preexisting unrelated Auth configuration**, nonblocking for this ownership-transition analysis. Relevant nonblocking findings: none reported. Material blocking advisor findings: none reported. No remediation or Auth setting change performed. See [Supabase remediation guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## NEW B1 HASH

**NOT ISSUED — no patched artifact validated.** Current unchanged bytes: `b6422a6b542e429a969060aae44971a8ee441eb6df42f09b84c2852db54f233a`.

## NEW B2 HASH

**NOT ISSUED — no patched artifact validated.** Current unchanged bytes: `7720341657b66dbc2df99145fe269eed8d6e0f899be8410e9536ff9bdc579827`.

## OLD HASHES

Both supplied B1/B2 hashes are **OBSOLETE FOR REMOTE APPLY** as authorization references for a future fixed deployment, despite the local files remaining unchanged. No new B4 approval may reuse them. No new apply helper was created. Local blocker harness SHA-256: `790d3490f902685c070cce52778c2814ef01eca90b3f46413c810a4cc5fa7858`.

## REMOTE MUTATIONS

**NONE.** No remote roles/schema/defaults/grants/RLS, credentials, intents, permissions, bindings, Auth sessions/passwords, Vercel or Stellar state changed. New signatures/broadcasts/Testnet transactions = **0**. No secure-store access.

## FILES CHANGED

New untracked files:

- `scripts/instaward/b31-ownership-probe.py` — local blocker reproducer.
- `docs/instaward/d2/D2-008B3_1-PRIVILEGE-TRANSITION.md` — this report.
- `docs/instaward/d2/D2-008B3_1-PRIVILEGE-TRANSITION-RESULTS.json` — sanitized evidence.

Ignored local runtime/logs/snapshots remain under `.tools/d2-008b3_1`. The two existing B3 reports remain untouched and untracked. Protected KEY-CUSTODY-AUDIT.md and tools/sync_obsidian.py remain untouched/untracked. No frontend/backend/contracts/signer/SQL source, package files, credentials or implementation changed. No commit, push, merge or tag changes.

Closure verification: **501 existing files unchanged**, Git refs unchanged, `git diff --check` PASS, new-file whitespace check PASS, Python syntax PASS. Secret audit scanned 572 files / 700 historical blobs / 0 staged files, with **0 findings**. Existing functional suites and full repository verification were not rerun after STOP; no checkpoint was created.

## PROJECT STATUS

D1 **12/12 PASS**; D2 **5/6 PASS**; D3 **0/5**; TOTAL **17/23**. D2.6 remains pending. No acceptance decision changed.

## NEXT OWNER AUTHORIZATION

**No B4 authorization text is issued because required gates did not all pass.** The next review is only for the minimum ACL-order exception; it is not permission to apply anything remotely.

Proposed exception, NOT executed and NOT added to B1:

```sql
-- AFTER ownership transfer, while the temporary SET-capable bridge still exists:
SET LOCAL ROLE byetery_d2_intent_owner;
GRANT EXECUTE ON FUNCTION review_private.adopt_registration_intent(uuid) TO postgres;
RESET ROLE;
-- Then revoke temporary CREATE and the postgres-granted membership edge.
```

This keeps design A for all function creation, preserves the original role split and grants only the already-approved local operator capability. The single owner-issued post-transfer grant is necessary because the pre-transfer grant is rewritten by PostgreSQL. Its approval would allow a subsequent LOCAL patch/test pass; it would not authorize B4. No broad owner membership, extra role, SUPERUSER/LOGIN/BYPASSRLS for owners, or hosted adoption would be introduced.

After owner review: finish the patch with transactional assertions, all 16 local gates, existing functional suites and remaining read-only exposure/parity checks. Only then issue new B1/B2 hashes and one bounded B4 request using psql -X/ON_ERROR_STOP with separate-file atomicity and stop-on-partial-apply rules. **STOP.**
