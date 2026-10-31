# D2 local PostgreSQL evidence pack

Consolidated 2026-10-31 for D2-008B4.4-PREP. **LOCAL evidence only**.
No fresh remote PostgreSQL/Auth/chain/Vercel observation is made by this document.

## Existing recorded execution

Canonical prior report and machine-readable record:
[fixture preflight](D2-POSTGRES-FIXTURE-AND-VERCEL-PREFLIGHT-2026-10-31.md),
[JSON](D2-POSTGRES-FIXTURE-AND-VERCEL-PREFLIGHT-2026-10-31.json).
Use `local_fixture`, `negative_SUPERUSER_controls`, `suite`, `integrity` and
`checks` in that JSON. Its separate historical remote/Vercel sections are not
re-executed or promoted by this pack. Files remain **LOCAL EVIDENCE — SHA PENDING**.

| Evidence | Recorded local result |
| --- | --- |
| PostgreSQL binary | 17.6; server_version_num 170006 |
| Positive direct executor 1 | current_user = session_user = postgres |
| Positive direct executor 2 | current_user = session_user = byetery_gap2b |
| rolsuper | false for both positive direct LOGIN roles |
| Other verified attributes | rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls = true |
| createrole_self_grant | Empty string, for both direct connections |
| Local memberships | anon/authenticated/service_role ADMIN=true; pg_monitor/pg_signal_backend ADMIN=false; INHERIT/SET=true |
| SUPERUSER negative B1 | SQLSTATE P0001 / ReviewRequiresNonSuperuserPostgresEmptySelfGrant |
| SUPERUSER negative B2 | SQLSTATE P0001 / ReviewRequiresNonSuperuserPostgresEmptySelfGrant |
| Original backend | 343 tests, 343 PASS, 0 FAIL, 0 SKIP |
| TypeScript | PASS as part of unchanged backend verify command |
| SQL / tests | Before/after exact SHA-256 maps equal; refer to JSON, not duplicated dumps |
| Secret-pattern audit | PASS; locations-only scanner, no credential values emitted |
| git diff --check | PASS |
| Cleanup | 0 fixture databases; test cluster stopped/retained; original stopped cluster restored |

Bootstrap SUPERUSER is limited to local provisioning and negative controls; its
connections close before positive tests. It is not the application connection.
No privileged SET ROLE impersonation is used for positive executor evidence.
NOSUPERUSER here is a test setup identity with the listed deliberate local
capabilities, not a claim that it is a restricted production app principal.

The fixture does not fabricate provider-only memberships. In particular,
pg_read_all_data/pg_create_subscription are absent and pg_monitor/pg_signal_backend
ADMIN differs from the separately recorded provider environment; the fixture
tests only the local capabilities it actually needs. Unit PGlite/MOCK tests remain
unchanged and distinct from native two-session PostgreSQL integration tests.

## PREP repeat and audit linkage

The PREP final report and JSON record a new execution, output hashes and baseline
comparison. They link to the ignored detailed run instead of copying full SQL,
test output or connection material. No replacement of the original 343 assertions
is permitted. The new orchestrator calls the existing launcher and its original
`npm --prefix backend run verify` child, adding deny-only JS network instrumentation.

PREP repeat: **343/343 PASS, 0 FAIL, 0 SKIP**, TypeScript PASS. The final run is
`.tools/d2-b44-prep/postgres/run-ab948f0f30fc4f1c996543878c097aa2/result.json`.
Its 39 SQL/backend-test before/after hashes are identical; both P0001 controls and
cleanup passed. The broader 537-file PREP baseline (including 8 SQL and 54 existing
test files) is unchanged. See
[PREP final report](D2-008B4_4-PREP-LOCAL-HOSTED-READINESS.md) and its JSON for hashes.

Frontend PostgreSQL tests additionally use a new test-only configuration transform
to select the existing verified `postgres` NOSUPERUSER LOGIN for their two fixture
setup pools. The restricted `byetery_d2_review_app` pool, loopback/path guards,
SQL and every assertion remain unchanged. Existing source files stay byte-identical.
This connection selection must not be mistaken for a production change or for
editing assertions to pass.

Reproduction with existing installed dependencies and existing portable PG17.6:

```text
python scripts/instaward/b44-prep-local.py
```

Run only when the original local cluster is stopped and no active fixture config
exists. The script refuses to overwrite an already-built isolated stage; retain
the previous evidence and select a newly reviewed local output directory for a
later run. No install, .env import, remote connection or credential prompt is used.

Results do not prove Hosted Preview access. D1 12/12; D2 5/6; D3 0/5; total17/23.
