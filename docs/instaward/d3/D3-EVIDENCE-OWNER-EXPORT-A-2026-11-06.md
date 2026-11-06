# D3-EVIDENCE-OWNER-EXPORT-A â€” 2026-11-06

Owner decision: **OPTION A â€” OWNER READ-ONLY EXPORT**.

Tooling gates: **PASS**. Live SQL integrity: **PENDING_OWNER_EXPORT**.
The success label `D3_EVIDENCE_TOOLING_PUBLISHED_OPTION_A` applies only after
the single scoped commit/push is independently verified. The final task reply
and local publication receipt provide that outcome. No D3 criterion is accepted.

```text
BUSINESS_EXECUTION_SHA = c6ba2e837ed0f7b81373655b8106b58ecb86a8cd
BUSINESS_FINGERPRINT_UNCHANGED = YES
BUSINESS_FINGERPRINT = e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539
OWNER_EXPORT_OPTION = A
OWNER_EXPORT_QUERY_SHA256 = d4e82f4221d187aecdee7440b8331ebbe54e96d0b7400d06bc1430b8d793c9f1
SCRIPT_SHA256 = 14819fb97af37b77581fb5ff7956acd80b66474d33d7caa4330cabec83bcfc20
CHAIN_GATE_READY = YES (tool capability; no future run cleared)
SQL_RPC_GATE_READY_FOR_OWNER_EXPORT = YES (live integrity still pending)
CHAIN_GATE_REQUIRED_BETWEEN_RUNS = YES
SQL_RPC_GATE_REQUIRED_BEFORE_HANDOFF = YES
READY_FOR_COUNCIL_TOOL_REVIEW = YES
```

## Proven D3 database location

`D3_EVIDENCE_DATABASE = SUPABASE_DEV` â€” project `aemxuqnnwfclzrwwiqfd`,
deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`. This is not a guess based on the presence of
local PostgreSQL or test databases. Config file choice/credentials are local
configuration inputs, but the frozen API validates the exact DEV project and
rejects a localhost/non-project database before constructing its pool.

| Trace | Finding |
|---|---|
| `backend/src/application/config.ts:10â€“30` | settings reads BYETERY_CONFIG_FILE or root .env; process overrides; validates DEV/project URL and rejects any DATABASE_URL outside exact project Supabase host/pooler; TESTNET deployment selected explicitly. |
| `backend/src/application/server.ts:12â€“19` | settings -> Repository -> TestnetStellarService, same Repository object. |
| `backend/src/application/repository.ts:14â€“19` | Repository owns new Pool(config.database). |
| `backend/src/testnet/service.ts:67â€“73` | TransportStore(new PgTransportDatabase(repo.pool)); no independent local evidence pool. |
| `backend/src/testnet/store.ts:11â€“16, 294â€“308, 312â€“327` | Transport database uses the same pool; observed writes Confirmation/state_evidence and terminal observations there; projection advances worker state to PROJECTED. |
| `.tools/d3-11-run1/context.mjs (local only, not selected):8, 19â€“22` | Historical launcher selects sibling Byetery-testnet/.env and frozen settings; credential-free inspection confirms that file targets approved Supabase DEV/TESTNET deployment. No launcher import/execution. |

Only credential-free booleans/public project/deployment identifiers were emitted
when inspecting the historical configuration. No raw connection string or secret
was printed, no settings function/launcher was invoked, and no DB connection or
application server was started. Local PostgreSQL/PGlite remain tests only.

## Query, schema and manual procedure

Canonical query: `tools/d3-evidence-capture/sql/owner-export.sql`.
Exact SHA-256 is pinned in `owner-export.mjs`, `spec.json`, README and this report.
Any later byte change fails closed and requires review.

```sql
-- BYETERY OWNER EXPORT V1. Run manually with psql inside BEGIN TRANSACTION READ ONLY.
-- psql inputs: operation_ids (JSON array of exact UUIDs), query_sha256 (approved file hash).
-- No credentials, Auth/profile tables, command parameters, or internal principals are exported.
WITH requested_input AS (
  SELECT :'operation_ids'::jsonb AS ids
), requested AS (
  SELECT value::uuid AS operation_id
  FROM requested_input, pg_catalog.jsonb_array_elements_text(ids)
  WHERE pg_catalog.jsonb_array_length(ids) BETWEEN 1 AND 15
), selected AS (
  SELECT w.deployment_id, w.operation_id, w.battery_id, w.command,
         w.source_account, w.state AS durable_state, o.state AS logical_state,
         CASE WHEN w.state = 'PROJECTED' THEN 'CONFIRMED_SUCCESS' ELSE w.state END AS state,
         w.confirmation, w.state_evidence,
         pg_catalog.jsonb_build_object(
           'transaction_hash', pg_catalog.encode(e.transaction_hash, 'hex'),
           'signed_envelope', pg_catalog.replace(pg_catalog.encode(e.signed_envelope, 'base64'), E'\n', ''),
           'network_id', pg_catalog.encode(e.network_id, 'hex'),
           'contract_address', e.contract_address
         ) AS envelope,
         (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'kind', x.kind, 'evidence', x.evidence,
           'observation_ledger', x.observation_ledger,
           'confirmation_ledger', x.confirmation_ledger,
           'state_read_ledger', x.state_read_ledger
         ) ORDER BY x.id)
          FROM api_private.testnet_observations x
          WHERE x.deployment_id = w.deployment_id AND x.operation_id = w.operation_id
            AND x.kind IN ('SUCCESS', 'FAILED')) AS terminal_evidence
  FROM api_private.testnet_work w
  JOIN requested r ON r.operation_id = w.operation_id
  JOIN app_private.stellar_operations o
    ON o.deployment_id = w.deployment_id AND o.id = w.operation_id
  JOIN api_private.testnet_envelopes e
    ON e.deployment_id = w.deployment_id AND e.operation_id = w.operation_id
  WHERE w.deployment_id = '5c0cad2f-5f25-4216-8068-6cb9d2d26325'::uuid
    AND w.state IN ('CONFIRMED_SUCCESS', 'CONFIRMED_FAILED', 'PROJECTED')
    AND w.confirmation IS NOT NULL
)
SELECT pg_catalog.jsonb_build_object(
  'schema', 'BYETERY_OWNER_EXPORT_V1',
  'metadata', pg_catalog.jsonb_build_object(
    'query_sha256', :'query_sha256'::text,
    'export_time', pg_catalog.statement_timestamp(),
    'deployment_id', '5c0cad2f-5f25-4216-8068-6cb9d2d26325',
    'database', 'SUPABASE_DEV', 'project_ref', 'aemxuqnnwfclzrwwiqfd',
    'business_execution_sha', 'c6ba2e837ed0f7b81373655b8106b58ecb86a8cd',
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'requested_operation_ids',
      (SELECT pg_catalog.jsonb_agg(operation_id::text ORDER BY operation_id::text COLLATE "C") FROM requested)
  ),
  'rows', coalesce(
    (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(selected) ORDER BY operation_id::text COLLATE "C") FROM selected),
    '[]'::jsonb
  )
) AS owner_export
WHERE pg_catalog.current_setting('transaction_read_only') = 'on';
```

`PROJECTED` is the frozen durable post-projection success state. The SELECT
normalizes it to CONFIRMED_SUCCESS but preserves original durable/logical states
and requires retained confirmation/terminal evidence. It does not widen success
to UNKNOWN, state-read-only reconciliation, pending or an omitted RPC receipt.

Output schema is BYETERY_OWNER_EXPORT_V1: one metadata/rows JSON object. Exact
field names, state mapping, deterministic ordering, local output paths, psql
transaction/output commands, file hash and scope examples are in
[OWNER-EXPORT.md](../../../../tools/d3-evidence-capture/OWNER-EXPORT.md).

The owner connects through his existing local session, checks the approved query
hash, starts `BEGIN TRANSACTION READ ONLY`, verifies `on`, exports the SELECT as
UTF-8 unaligned/tuples-only JSON, restores output, rolls back/exits, records the
file hash, then passes only JSON/hash/scope and captured bundles to the tool.
This procedure was prepared, **not executed on behalf of the owner**.

No role, grant, RLS, schema, function, owner, Auth or credential was changed.
The tool has no pg import/connection path and no credential fallback. Its old
readSqlReceipt stub still fails closed, without reading its arguments; historical
missing-SQL bundle labels do not request a credential under current Option A.
Synthetic SQL comparison fixtures remain explicitly test-only.

## Comparator semantics

| Field | Compare method |
|---|---|
| resultXdr | Canonical TransactionResult decode/roundtrip + exact same-representation retained SQL/RPC string equality |
| resultMetaXdr | Canonical TransactionMeta decode/roundtrip + exact same-representation retained SQL/RPC string equality |
| events | Ordered canonical ContractEvent binary validation + exact ordered retained events; never sort/deduplicate |
| header | Wrapper-aware RPC LedgerHeaderHistoryEntry hash + exact Horizon LedgerHeader + ext.v0; unsupported extension STOP |
| envelope | Canonical TransactionEnvelope binary equality after documented base64 wrapping removal; hash/network/source/existing signatures checked |
| facts | Exact changed getter facts vs captured meta with read ledger bounded; original SUCCESS copies exact |
| stateEvidence | APPLIED predicate/facts/read ledger compared to captured meta. Historical non-success state assertions retained/hash-recorded, never used as receipt success. |

Different API wrappers are handled explicitly rather than weakening all equality
checks. The original PostgreSQL JSON Confirmation stores the same RPC encoding,
so exact result/meta/event strings remain required there. Only the bytea envelope
base64 wrapping and documented ledger-header wrapper differ. An altered XDR object,
event order, hash, ledger, operation or relevant fact fails closed.

Owner export metadata/file hashes are **owner-asserted provenance**, not a server
attestation or cryptographic proof of SQL execution. Recorded scope/hash, the
manual read-only procedure and owner/Council review remain essential. Historical
non-success state evidence does not overwrite a confirmed receipt. Digital/on-chain
attestations do not independently prove physical recycling.

The official frozen transport/schema were inspected alongside Raven stellarDocs
and the [Stellar RPC references](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction).
Header policy follows [getLedgers](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgers).
The manual workflow uses documented [psql output controls](https://www.postgresql.org/docs/current/app-psql.html),
[READ ONLY transactions](https://www.postgresql.org/docs/current/sql-set-transaction.html)
and [PostgreSQL JSON functions](https://www.postgresql.org/docs/current/functions-json.html).
Supabase changelog markdown fetch was unsupported by the browser; no new Supabase
API, setting, feature, dependency or schema was introduced.

## Chain gate and SQL gate

**CHAIN EVIDENCE GATE â€” mandatory between runs:** capture signed envelope, recompute
Testnet hash, verify existing signatures, retain RPC confirmation/result/meta/events,
ledger header and Horizon corroboration, verify/sanitize/inventory, commit exact
bytes, then owner/Council decision. SQL can be pending between runs. No automatic
chaining and no reliance on fetching RPC data after retention expires.

**SQL INTEGRITY GATE â€” mandatory before 2026-11-13 handoff:** approved owner export,
recorded export file hash, exact SQL-to-captured-chain comparisons and complete
scope coverage. Mismatch STOP. check-handoff also requires the three distinct
complete chain bundles and their exact committed bytes. It cannot grant acceptance.

The old historical bundle stays RUN_RETIRED_OR_STOPPED and is not eligible for any
next run. Chain readiness is tool capability, not clearance to execute RUN1.
The standalone checker cannot authenticate an owner JSON or stop an unrelated runner;
no frozen business runtime enforcement/change is claimed.

## Tests and safety

**70/70 PASS: 42 existing tests + 28 new tests; 0 failed, 0 skipped.**

Command:
`node --test --test-concurrency=1 tools/d3-evidence-capture/tooling.test.mjs tools/d3-evidence-capture/owner-export.test.mjs`

Coverage includes all original 20 fail-closed negatives; malformed/duplicate-key
exports, missing fields, wrong query/deployment/state, duplicates, missing receipt,
unrelated scope, PII, exact file tampering, canonical decoded equality, semantic
XDR mismatch, result/meta/event changes, read-write metadata, altered approved
query, applied state evidence, SQL-pending chain readiness and blocked final handoff.
The command-level historical export comparison leaves the original chain bundle
unchanged. All .mjs syntax checks PASS.

Query syntax/logic was exercised inside PostgreSQL WASM using typed SELECT-only
relational CTE fixtures. No DDL/INSERT or remote SQL was used. This validates the
known schema mapping; it is not a live owner export or live role certification.

Static/transitive import review: zero business/signing/worker imports, zero full
SDK-root or pg loads. Only pure official XDR serializers/public helpers plus
node:crypto verification are loaded (465 cached serializer/helper modules).
No new key/signature was generated. Product tests were not rerun: the task forbids
signing and the broad backend suite generates test signatures; its frozen sources
and all 34 files from the prior freeze were verified by exact hashes instead.
No application checkpoint or new execution SHA is created.

Secret/PII publication scan: **PASS**, no unresolved finding. Five matches are
reviewed nonfunctional negative-test vectors (invalid JWT/email/zero Auth-ID);
exact source-line hashes are in the JSON companion. No capture-bundle exception.

## Historical evidence and TTL

Original historical chain bundle verification PASS, unchanged SHA-256:
`42aab997fc7df0440f6f54807b54148f3aed850ae88200ef117b1aa0840b9e45`.
Three existing tx envelopes/hash/signatures/header corroboration are exercised by
the tests. No re-execution, RPC call, live SQL export or new lifecycle occurred.

Council conclusion: SAC pool balance is persistent ContractData Balance(C),
`liveUntilLedgerSeq = 6703017`, therefore `SAC_POOL_TTL_MAINTENANCE_REQUIRED = NO`
for the approved horizon. This reuses the recorded 2026-11-06 read; it is not a new
observation. Exact public LedgerKey/entry provenance is in the JSON companion.
Wallet A/B remain classic trustlines, NO_CONTRACT_TTL. Normal future maintenance
candidates are Battery(id)/Request(rid), derived from actual future footprints.
No maintenance or future absolute ledger target was prepared/executed. Reviewer
target 2026-11-27, buffer through 2026-11-30, safety lead two days remain planning.

## Publication, identities and Git

Publish only the following scoped paths:

- `tools/d3-evidence-capture/audit-imports.mjs`
- `tools/d3-evidence-capture/business-files.json`
- `tools/d3-evidence-capture/capture.mjs`
- `tools/d3-evidence-capture/cli.mjs`
- `tools/d3-evidence-capture/common.mjs`
- `tools/d3-evidence-capture/comparison.mjs`
- `tools/d3-evidence-capture/fixtures/historical.json`
- `tools/d3-evidence-capture/gate.mjs`
- `tools/d3-evidence-capture/inventory.mjs`
- `tools/d3-evidence-capture/network.mjs`
- `tools/d3-evidence-capture/OWNER-EXPORT.md`
- `tools/d3-evidence-capture/owner-export.mjs`
- `tools/d3-evidence-capture/owner-export.test.mjs`
- `tools/d3-evidence-capture/pins.mjs`
- `tools/d3-evidence-capture/README.md`
- `tools/d3-evidence-capture/sanitizer.mjs`
- `tools/d3-evidence-capture/spec.json`
- `tools/d3-evidence-capture/sql/owner-export.sql`
- `tools/d3-evidence-capture/sql-readonly.mjs`
- `tools/d3-evidence-capture/tooling.test.mjs`
- `tools/d3-evidence-capture/verifier.mjs`
- `tools/d3-evidence-capture/xdr-reader.mjs`
- `docs/instaward/d3/D3-EVIDENCE-OWNER-EXPORT-A-2026-11-06.md`
- `docs/instaward/d3/D3-EVIDENCE-OWNER-EXPORT-A-2026-11-06.json`

All prior untracked reports/ZIP are excluded, preserved unchanged. Live owner exports,
.tools raw captures/diagnostics, credentials, Auth/session data, private keys/seeds,
Secure Store and unresolved PII remain outside publication.

One tooling/docs commit and one fast-forward push maximum, solely to
`instaward/d2-web-mvp`, parent the frozen business SHA. No merge or tag change.
The existing Vercel branch auto-deployment barrier remains unchanged/disabled.
Pre-publication checks require exact file hashes, staged-path allowlist, tests,
secret scan and git diff --check. A tooling HEAD never becomes business execution
authority: future execution still binds to the frozen SHA/fingerprint.

TOOLING_PUBLICATION_SHA is the commit containing this report, resolved with:
`git log -1 --format=%H -- docs/instaward/d3/D3-EVIDENCE-OWNER-EXPORT-A-2026-11-06.md`.
Embedding that same enclosing commit hash inside itself would be circular.
The exact post-push SHA/outcome is supplied in the task final response and ignored
`.tools/evidence-owner-a-publication-receipt.json`; no second/amended commit is used.

## No-execution audit and STOP

Business/maintenance transactions, simulations, new signatures, broadcasts,
Friendbot, new accounts, Secure Store mutations, Supabase writes/remote SQL reads,
DDL/RLS/roles/grants, TTL changes, deployments, RUN IDs, business source/test changes
and dependency installs: **all 0**.

D1 12/12; D2 6/6; D3 0/5; total 18/23. No criterion changes.
Cap stays 18 total / 3 consumed / 15 available / 15 required / margin 0.
Any unexpected/partial/failed/expired/uncertain step STOP; no retry, replacement,
continuation or higher cap is authorized.

**STOP after publication verification. Do not simulate step 1, create a maintenance
account, extend TTL or start RUN1.**
