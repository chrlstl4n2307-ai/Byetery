# D2 PostgreSQL fixture and Vercel preflight — 2026-10-31

## Result and scope

**Backend 343/343 PASS, 0 FAIL, 0 SKIP. SUPERUSER negative controls PASS. Vercel classification C; Git publication remains blocked.** No commit, push or deployment is authorized/performed. B4.4 remains STOPPED / NOT PASS; D2.6 BLOCKED / PENDING. Internal owner acceptance remains D1 12/12 PASS, D2 5/6 PASS, D3 0/5, TOTAL 17/23. No Stellar/SDF/Instawards approval or payment is asserted.

Branch and local HEAD: `instaward/d2-web-mvp` / `d406dad4d9edd7b9b46a0c8a8090d333554dbeb1`. Existing SQL changes, prior reports and protected untracked files are preserved. Earlier fixture/publication reports retain their contemporaneous failures as history.

## Remote PostgreSQL — verified read-only

Target: Supabase Dev `aemxuqnnwfclzrwwiqfd`. Only catalog/settings SELECTs inside explicit **BEGIN TRANSACTION READ ONLY / ROLLBACK** were submitted. The first multi-result response exposed only a subset, so a second read-only SELECT aggregated the complete evidence into one JSON result. No DDL, business/Auth row query, pg_authid/password verifier, secret value or side-effect function was used.

- Version: **PostgreSQL 17.6**, server_version_num **170006**, Linux x86_64.
- current_user = session_user = **postgres**.
- transaction_read_only = **on**.
- createrole_self_grant = **empty**; source **default**; boot/reset values empty; no relevant role/database override found.

| Attribute | Remote postgres | Local executors |
| --- | --- | --- |
| rolsuper | false | false |
| rolinherit | true | true |
| rolcreaterole | true | true |
| rolcreatedb | true | true |
| rolcanlogin | true | true |
| rolreplication | true | true |
| rolbypassrls | true | true |

Remote memberships, all granted by supabase_admin:

| Granted role | Member | ADMIN | INHERIT | SET |
| --- | --- | --- | --- | --- |
| anon | postgres | true | true | true |
| authenticated | postgres | true | true | true |
| authenticator | postgres | true | true | true |
| byetery_d2_intent_owner | postgres | true | false | false |
| byetery_d2_read_owner | postgres | true | false | false |
| byetery_d2_review_app | postgres | true | false | false |
| pg_create_subscription | postgres | true | true | true |
| pg_monitor | postgres | true | true | true |
| pg_read_all_data | postgres | true | true | true |
| pg_signal_backend | postgres | true | true | true |
| postgres | cli_login_postgres | false | false | true |
| service_role | postgres | true | true | true |
| supabase_privileged_role | postgres | false | true | true |

These observations determine the executor attributes; CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS were measured, not assumed. Local membership reproduction is deliberately narrower: anon/authenticated/service_role for unchanged role-boundary fixtures, pg_monitor for settings/lock visibility and pg_signal_backend for disposable-DB cleanup. Provider-specific roles, unrelated reading/subscription capabilities and the incoming CLI membership are not fabricated locally. Local pg_monitor/pg_signal_backend grants have ADMIN=false, unlike the remote ADMIN=true; those extra administration capabilities are unnecessary. SQL-created review-role edges are tested by the unchanged B1 assertions.

## Local fixture patch

Prior design: PostgreSQL 17.11, direct byetery_gap2b SUPERUSER. Restoring its generated configuration removed ENOENT but correctly produced **P0001: ReviewRequiresNonSuperuserPostgresEmptySelfGrant**, because current review SQL requires postgres NOSUPERUSER with empty createrole_self_grant.

Only two code artifacts changed in this task:

1. **New launcher:** `scripts/instaward/local-postgres-fixture.py`.
2. **Fixture helper:** `backend/tests/review-postgres-fixture.ts`.

Run the complete local validation from the root with:

```powershell
python scripts/instaward/local-postgres-fixture.py
```

The launcher uses the already-installed official portable PostgreSQL **17.6** binaries; no download, global install or service. It verifies the legacy cluster is stopped and no active config exists, checks resolved move paths stay inside this repository's ignored .tools, preserves the legacy data directory, and creates a fresh temporary cluster at the fixture's existing guarded path. Its bootstrap SUPERUSER is used only for fixture provisioning and the explicitly required negative controls; every psql bootstrap process finishes before positive tests start.

Fresh direct LOGIN connections verify both current_user and session_user, exact version 170006, all executor attributes, required memberships and empty self-grant before running the suite. Review B1 uses **postgres NOSUPERUSER**. The two unchanged GAP2B concurrency cases retain their required **byetery_gap2b** alias, also **NOSUPERUSER**, with the same measured attributes. Both aliases are test-only roles in the fresh cluster. No SUPERUSER-session SET ROLE impersonation supplies a positive test result; SET ROLE calls inside unchanged privilege tests/SQL retain their original purpose.

The generated ignored config preserves the existing host/high-port/database/user guard and adds reviewUser=postgres. The helper selects that direct executor explicitly, aborts on missing/mismatched selection, and adds identity/version/NOSUPERUSER/self-grant assertions. All pre-existing helper assertions remain present. The .test.ts case files, SQL, expected errors and business assertions are unchanged. No runtime source rewriting or B3.2 assertion adapter is used.

Unit tests and PGlite/mock tests remain their original implementations. The NOSUPERUSER profile governs the real portable PostgreSQL integration fixtures; this is not a claim that every unit test opens a network database connection.

## Negative controls and complete suite

Both exact, unmodified SQL files were submitted through a direct bootstrap SUPERUSER session, with ON_ERROR_STOP and verbose SQLSTATE output. Their first guard rejected execution before review objects/business records could be created. Closing the failed psql session rolls back its transaction.

| Control | Result | SQLSTATE / expected error |
| --- | --- | --- |
| B1 as SUPERUSER | PASS | P0001 / ReviewRequiresNonSuperuserPostgresEmptySelfGrant |
| B2 as SUPERUSER | PASS | P0001 / ReviewRequiresNonSuperuserPostgresEmptySelfGrant |

Complete `npm --prefix backend run verify` ran under the provisioned local fixture: TypeScript PASS; **343 tests, 343 PASS, 0 FAIL, 0 SKIP**, exit 0. This includes the original Foundation cases, all 31 B1 cases and both real PostgreSQL serialization cases. No additional test case was inserted into the 343 count. The two launcher negative controls are separate checks.

Cleanup verified **0 remaining fixture databases**, stopped the temporary cluster, removed only its generated active config and restored the original legacy cluster directory. The stopped test cluster/logs are retained under ignored .tools for evidence. The original legacy cluster was not started, connected to or given new roles. No unrelated database directory was deleted. The archived old last-run config remains unchanged; using the new launcher is required for this new execution profile.

## Integrity evidence

**8 SQL files and 40 .test.ts case files** have identical SHA-256 before/after. The complete per-file manifest is in the [JSON companion](D2-POSTGRES-FIXTURE-AND-VERCEL-PREFLIGHT-2026-10-31.json), including both full values for every file. B3's ownership patches are contained in current B1/B2; there is no invented third SQL artifact.

| Main artifact | SHA-256 before = after |
| --- | --- |
| database/review/d2-008b1-registration-intents.sql | 957e19e768a6ca90f5bbf5c6268945ef129686d3cd342ec17cca1e3eca41585d |
| database/review/d2-008b2-direct-review.sql | d25b53d15cbc6d6ab3b8037130c0319edd34a3349c49465af2b82153c7eb61d4 |
| backend/tests/review-registration-intents.test.ts | b1ffa6b0bb0693f5b240dbcb341a04c22f5981b445c865d8a7828491661f37e1 |
| backend/tests/d2-dispatch-concurrency.test.ts | 0478159d542d7429b9493359da791bf4ca7d42fbe716cd3cd8a0082417514e0b |

The separately authorized helper changed from **ac69941f52416169b7d838e78110d93bb3d4a4cad6de77d62b8e37b82add3ab1** to **28691b3f4b86945e47df49aea5683240094d60068135ddaed9b6a4b7037609b3**. New launcher SHA-256: **d7e5644f177220ec6637380b7789952ccdeccd5fca594f49da2bbddc9d848f27**. This helper change is explicitly distinguished from unchanged case/assertion source, not hidden in a test-hash claim. Application, contract/WASM/signer, schema artifacts and protected custody/sync files are untouched.

## Vercel read-only preflight

Exact project `byetery` / prj_gVe1Sz73FRZ4bAQPubimaqOXQylH in team_EuRw1k4ZykOoSP1fBTcumdnO. Authenticated MCP context confirms GitHub **chrlstl4n2307-ai/Byetery**. Scoped project/deployment GETs confirm framework Next.js, Node 24.x, live=false, latestDeployment=null, **0 deployments**, unchanged updatedAt and Vercel Authentication all_except_custom_domains.

| Decision-critical setting | Evidence |
| --- | --- |
| Production branch | UNKNOWN; normalized MCP response omits it |
| Is instaward/d2-web-mvp Production? | UNKNOWN |
| Effective Root Directory | UNKNOWN; historical requested frontend is not treated as an independent read |
| Repository vercel.json/vercel.ts/now.json | None found; no configuration file added |
| git.deploymentEnabled / branch-specific remote rules | UNKNOWN effective configuration |
| Ignored build step / skip-build settings | UNKNOWN effective configuration |
| Deploy hooks | UNKNOWN; no hook URL requested, disclosed or invoked |

One explicitly scoped, noninteractive CLI **GET /v9/projects/{exact-id}** was attempted to obtain the fields omitted by normalized MCP. It timed out; the sanitized result records TIMEOUT, not a fresh token-validity conclusion. Raw response/error output was not saved or printed, and no login/token/linking flow was started. The [official endpoint schema](https://vercel.com/docs/rest-api/projects/find-a-project-by-id-or-name) confirms Production branch/Root Directory are configuration fields, not values that can be inferred from the project name. Prior browser-initialization failures are not relabelled as a successful current read.

**Classification C: insufficient evidence to determine what a push to this exact branch would create. Git remains blocked.** No push, disposable branch, deployment, Git disconnection or settings update was used as a probe. [Vercel's branch-specific git.deploymentEnabled](https://vercel.com/docs/project-configuration/git-configuration) remains a potential future reviewed option, not implemented. Ignored Build Step is not used as a zero-deployment workaround; no skip mechanism was applied.

## Final boundaries

Local PostgreSQL validation is not hosted Preview evidence. It does not accept B4.4 or D2.6, start another deliverable, or imply organizer approval. Remote Supabase activity was read-only; no Auth, business record, migration, RLS, grant or role mutation. No Stellar call, operational signature or broadcast. Vercel reads only; 0 deployments, 0 Production changes. No commit, push, merge to main or tag action. Notion was not edited by this task. Final whitespace/secret-audit/readback results are recorded in the JSON companion after closure. **STOP.**
