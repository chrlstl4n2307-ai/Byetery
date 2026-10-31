# D2-008B4.4-PREP — local hosted readiness

2026-10-31 · `instaward/d2-web-mvp` · base HEAD
`d406dad4d9edd7b9b46a0c8a8090d333554dbeb1`.

**LOCAL PREP PASS. B4.4 NO PASS. D2.6 BLOCKED/PENDING.**
**LOCAL EVIDENCE — SHA PENDING.** No new owner acceptance or organizer approval.
The [JSON companion](D2-008B4_4-PREP-LOCAL-HOSTED-READINESS.json) contains the
sanitized machine-readable results, exact output references and hashes.

## Summary

Added only local tests, one sanitized fixture description, test/audit scripts and
documentation. No application logic, existing test source, SQL, schema/RLS,
lockfile, contract, WASM, signer, credentials or deployment configuration changed.
All 537 pre-existing inventoried files remain byte-identical to the start of PREP,
including pre-existing dirty files and both protected untracked files.

## Build

| Item | Result |
| --- | --- |
| Node | v24.16.0 |
| npm | 11.13.0 |
| Next.js | 16.3.5, Turbopack |
| Dependency lock | frontend/package-lock.json; SHA-256 `633c0f5f1ae347d34aa0a2e45d43224b29e24ff8ffe1252d086b28cc2cdb8679` |
| Exact package command | `npm run build` → `next build` |
| Result | PASS; exit 0; 17.26 seconds for final attempt |
| TypeScript | PASS; build typecheck plus `tsc --noEmit --incremental false` (5.64 seconds) |
| BUILD_ID | `sT7DSX6fUTw1Fnn2h-Lpb` |
| Client content-tree SHA-256 | `e610b9d70d49f2eb26cd5727c7dc70c7c6dc5f9ad8e1f28af6c252bd2892431a` |

Build runs in `.tools/d2-b44-prep/workspace/frontend`, copied without any .env
files, previous .next or caches. Existing installed dependencies are locally
hardlinked/copied, with no installation/update. Three existing public JSONs
imported by tests are also copied; source files and lockfiles are unchanged.
Build-only environment uses DIRECT_REVIEW with simulated D2_PREVIEW/TESTNET flags,
example.invalid origins/URL, dummy deployment UUID and `test-only` publishable
value. These deliberately fail runtime validation; **no real runtime login or
hosted readiness can be inferred from successful compilation**.

Setup attempts are retained locally: the first dependency copy hit Windows path
length limits, resolved in the new script using extended filesystem paths. The
first build hit sandbox denial of Turbopack's pg junction, resolved by running the
same local build outside the sandbox without changing Windows protections. A
subsequent isolated-copy typecheck lacked the three imported public JSONs; copying
them resolved that packaging issue without altering tests. These were preparation
issues, not a productive-code fix or a failed existing regression assertion.

## Client bundle

15 static files scanned (14 JS/map artifacts in the existing audit; CSS included
in the new scan). Stellar-seed pattern candidates: **0**; checksum-valid seeds:
**0**, secret scan **NO MATCH**. Stellar client libraries: **0**. Server-only/runtime
leakage: **0**. Forbidden server variable names, service_role, PRIVATE_KEY,
ADMIN_SECRET and generic SECRET word occurrences: **0**. Only finding locations
would be emitted on failure; values are never printed by the scanner.

The existing source/build audit also passed: no outside frontend production
imports, forbidden own code or marker failures. Its broader source/server/static
scan inspected 355 files and checksum-rejected 12 pattern candidates; **0 valid
seeds**. This broader source/server count is separate from the client-only result.
Generated server manifests/build internals remain ignored; only their SHA-256
values and sanitized route/action summaries are retained in this public-format report.

## Manifests

| Manifest item | Type | Expected | Found | PASS/FAIL |
| --- | --- | --- | --- | --- |
| `/`, `/login`, `/dashboard`, `/admin`, `/collector`, `/recycler`, `/battery/[batteryId]`, `/review/evidence` | Review pages | 8 REVIEW_PAGES | Exactly 8 | PASS |
| `/api/me`, `/api/batteries/[batteryId]`, `/api/batteries/[batteryId]/history`, `/api/review/registration-intents/[operationId]` | GET handlers | 4 REVIEW_ROUTES | Exactly 4 | PASS |
| `/api/review/registration-intents`, `/auth/login`, `/auth/logout` | POST handlers | 3 REVIEW_ROUTES | Exactly 3 | PASS |
| Extra business routes / catchalls | Routes | 0 | 0 | PASS |
| Framework not-found/global-error entries | Framework | Excluded from business comparison | Only framework entries excluded | PASS |
| Next server actions, node + edge | Actions | 0 in current implementation | 0 | PASS |
| Proxy / middleware | Boundary | `/` matcher excluding static/image/favicon | `/` entry and expected matcher | PASS |

The prompt's expected login/logout **Server Actions** differ from the implemented
design: they are bounded **HTTP POST handlers**. Zero Server Actions is intentional
and matches the existing package/audit. No actions were added or hidden. HTTP tests
verify methods, exact Origin and Sec-Fetch-Site before Auth/SQL effects. Manifest
presence alone is not a permission grant.

## Security tests

| New file | Tests PASS | Coverage |
| --- | --- | --- |
| b44-prep-csrf.test.ts | 24 | Exact allowed Origin; 3 POST routes × 6 missing/malformed/cross-origin/cross-site/bad-host cases; ambiguous runtime configuration; branch-URL fallback |
| b44-prep-dto.test.ts | 16 | Four profile roles; battery/history projection; internal request/identity removal; raw exception and actual SQL-adapter redaction; write OutcomeUnknown |
| b44-prep-build-audit.test.ts | 2 | Actual isolated build routes/actions/client scan; no .env and identical dependency lock |
| b44-prep-network-guard.test.ts | 1 | Four explicit remote control attempts blocked before fetch/HTTP/socket/DNS transport |
| b44-prep-stellar-offline.test.tsx | 4 | Expiration, reset, missing-instance nuance and retention absence |
| **Total** | **47** | All new tests PASS; zero fail/skip |

Existing SQL DTO/permission tests also passed against native PostgreSQL and the
restricted application pool. Mock DTO assertions do not replace those real SQL
checks or assume that a typed internal SQL object is already a public HTTP response.

Configuration nuance: absent VERCEL_URL may use the existing exact, approved
VERCEL_BRANCH_URL fallback. Missing **both**, inconsistent runtime URL, malformed
URL or an unapproved host fails closed with ConfigurationUnavailable. This is the
existing approved semantics, not a relaxation made by PREP.

## Stellar offline

| Scenario | Result | Preserved meaning |
| --- | --- | --- |
| STATE_EXPIRED | PASS | Missing/expired confirmed storage is not NotFound/not registered; RECYCLED and SENT persist independently |
| NETWORK_RESET | PASS | Fixture ledger below durable confirmed anchor plus absent entries maps to NETWORK_RESET |
| Missing instance without reset proof | PASS | Existing semantics return STATE_EXPIRED; absence alone does not prove a network reset |
| NOT_RETAINED | PASS | Simulated Horizon 404 maps to RETENTION_UNAVAILABLE / NOT_RETAINED_BY_HORIZON while intact fixture storage is VERIFIED; no invented receipt or absent battery |

Tests inject in-memory transports using existing sanitized XDR/receipt fixtures and
new conceptual scenario metadata in `frontend/tests/fixtures/b44-prep/scenarios.json`.
No signing or broadcast is performed. Fixture VERIFIED labels are simulated local
results, **not fresh Testnet verification**. Historical confirmations remain
separate from current retention/storage availability.

## Regression and PostgreSQL evidence

Original backend: **343/343 PASS**, 0 FAIL, 0 SKIP; TypeScript PASS. Full frontend:
**321/321 PASS** across 22 files: **274 existing + 47 new**, 0 FAIL, 0 SKIP.
No snapshots updated. Backend Node TAP duration 178.49 seconds; frontend command
63.19 seconds (Vitest measured 57.63 seconds).

Native local PostgreSQL **17.6**, loopback high port only. Direct setup identities
current_user=session_user are postgres and byetery_gap2b, both NOSUPERUSER, empty
createrole_self_grant, with the precisely recorded fixture attributes/memberships.
Both B1/B2 SUPERUSER negative controls return P0001. Bootstrap sessions close before
positive tests. Database cleanup is zero remaining fixture databases, stopped test
cluster retained, original stopped legacy cluster restored.

The unchanged backend launcher and command are reused. For existing frontend SQL
tests, a new test-only Vitest transform selects the verified postgres NOSUPERUSER
for two setup pools; source bytes, SQL, assertions and restricted app pool remain
unchanged. The transform fails on an unexpected source shape. It does not skip a
guard or impersonate a setup role through SUPERUSER SET ROLE.

## Evidence

- [D2 evidence matrix](D2-EVIDENCE-MATRIX.md): criterion, evidence level, source,
  SHA and remaining gap; no local-to-hosted promotion.
- [Reviewer runbook](D2-REVIEWER-RUNBOOK.md): four-role routes, bounded data,
  current disabled intent authority, negative statuses and future revocation.
- [343/343 evidence pack](D2-LOCAL-TEST-EVIDENCE-PACK.md): prior evidence lineage
  and this repeat, without duplicate dumps.
- [Sanitized results](D2-008B4_4-PREP-LOCAL-HOSTED-READINESS.json): output/log hashes,
  exact manifests, SQL hashes, test counts and executor evidence.

Raw outputs stay under ignored `.tools/d2-b44-prep/`. The JSON links exact files
and hashes including the native PostgreSQL run result; it contains no credentials.

## Integrity / Git / remote boundary

Frozen WASM SHA-256:
`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6` — MATCH.
All 8 SQL files, 54 pre-existing test files, configuration/locks and all 537 baseline
files are unchanged. Existing launcher separately reports 39 protected SQL/backend
test paths before/after identical. Detailed maps and aggregate hash references are
in the JSON/ignored baseline. No new Rust compilation/test result is claimed here.

Final git diff --check and secret-pattern audit: **PASS**, with the final audit
counts in the JSON. No stage, commit, push, merge or tag movement. HEAD, main/tag
refs and both protected untracked files unchanged. Pre-existing dirty/untracked
work remains; this task adds only the listed test/script/fixture/doc files.

Vercel touched: **NO**. Supabase touched: **NO**. Stellar touched: **NO**.
Notion touched: **NO**. Transactions/signatures/broadcasts: **0**.
The deny-only JS instrumentation recorded only the four deliberately blocked
control attempts to example.invalid. No unexpected remote attempt was recorded.
This is process instrumentation, not an OS firewall guarantee; native build
traffic is not independently captured. No external fonts/resources are requested
by this review build and telemetry is disabled. No Windows protection was changed.

## Limitations and STOP

Everything produced by PREP is LOCAL. Historical REAL_AUTH/REAL_DB/TESTNET reports
retain their original scope/dates and are not rerun. Dummy compilation cannot
establish a usable Hosted Preview, configuration, TLS/Auth session, hosted cookie,
public URL, current on-chain receipt or reviewer access. No credentials were loaded.

D1 **12/12**; D2 **5/6**; D3 **0/5**; total **17/23**.
**B4.4 NO PASS. D2.6 NOT PROVEN — HOSTED PREVIEW REQUIRED.**
No implementation defect requiring a productive-code change was found by these
tests. STOP. No publication, Preview deployment, acceptance change or D3 starts.
