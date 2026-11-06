# Owner Option A — manual read-only export

This procedure prepares tooling only. It does not authorize a run, transaction,
signature, credential change or remote SQL execution by Codex. Christián executes
the query manually in his own existing local PostgreSQL session, when separately
ready. Do not paste credentials, connection strings, Auth data or raw exports into
chat, Slack, Git or screenshots.

## Approved query

File: `tools/d3-evidence-capture/sql/owner-export.sql`

OWNER_EXPORT_QUERY_SHA256:
`d4e82f4221d187aecdee7440b8331ebbe54e96d0b7400d06bc1430b8d793c9f1`

One SELECT statement with SELECT CTEs, fixed schema-qualified PostgreSQL built-ins,
no custom functions, dynamic SQL, DDL, mutations, temporary objects or SET ROLE.
It filters the exact Testnet deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`
and 1–15 explicit operation UUIDs. UUIDs must come from approved existing run
receipts/manifests, never arbitrary rows or all operations in the deployment.
The parser requires exactly the requested rows; omissions and duplicates STOP.

`CONFIRMED_SUCCESS` becomes `PROJECTED` after SQL projection in the frozen
TransportStore. The query exports a normalized `state=CONFIRMED_SUCCESS` for
that terminal state while preserving `durable_state=PROJECTED` and the logical
application state separately. Only persisted confirmations with terminal
SUCCESS/FAILED observations qualify. A state-read-only reconciliation without
a retained RPC Confirmation does not qualify. FAILED receipts are retained for
review, never made run/handoff-ready.

## Manual workflow — not executed by this task

1. From the repository root, confirm the query hash and ignored output path in
   your own PowerShell terminal:

   ```powershell
   (Get-FileHash -LiteralPath tools/d3-evidence-capture/sql/owner-export.sql -Algorithm SHA256).Hash.ToLowerInvariant()
   git check-ignore .tools/owner-export-A/export.json
   New-Item -ItemType Directory -Force .tools/owner-export-A | Out-Null
   if (Test-Path -LiteralPath .tools/owner-export-A/export.json) { throw 'Choose a fresh output file; preserve the prior export' }
   ```

   STOP if the hash differs or the output is not ignored. Later query changes
   require review, not a new self-approved hash.

2. Connect with your existing local `psql` setup to Supabase DEV
   `aemxuqnnwfclzrwwiqfd`, database `postgres`, using verified TLS and the
   existing CA. For an **already configured** libpq service, the generic form is:

   ```text
   psql -X -W -d "service=YOUR_EXISTING_BYETERY_DEV_SERVICE"
   ```

   This is a placeholder, not a new service to create. Use your own existing
   connection parameters/session if no service is configured. Enter a password
   only at psql's hidden `-W` prompt; never put it in a CLI argument, URL,
   environment variable, script, repository file or chat. Do not create/rotate
   credentials or broaden grants. If the existing account cannot read the fixed
   query, STOP and return for owner review. No Supabase admin MCP fallback.

3. In that psql session, replace `EXISTING_OPERATION_UUID` below with the exact
   approved UUID list. Keep the supplied query hash unchanged. Use forward slashes
   and single quotes around absolute paths containing spaces. Commands shown use
   the canonical Windows project path:

   ```text
   \set ON_ERROR_STOP on
   \set QUIET 1
   \set ECHO none
   \encoding UTF8
   \pset format unaligned
   \pset tuples_only on
   \pset pager off
   \set operation_ids '["EXISTING_OPERATION_UUID"]'
   \set query_sha256 'd4e82f4221d187aecdee7440b8331ebbe54e96d0b7400d06bc1430b8d793c9f1'
   BEGIN TRANSACTION READ ONLY;
   SHOW transaction_read_only;
   \o 'C:/Users/Christián/Documents/Codex/Byetery-d3-wallet-link/.tools/owner-export-A/export.json'
   \i 'C:/Users/Christián/Documents/Codex/Byetery-d3-wallet-link/tools/d3-evidence-capture/sql/owner-export.sql'
   \o
   ROLLBACK;
   \q
   ```

   `SHOW` must display `on` before opening the output file. If it does not, STOP.
   The query itself returns no row unless read-only is on. On any SQL error,
   restore output with `\o`, issue `ROLLBACK;`, exit, and preserve the failed
   file separately. Do not use a partial/empty export. Do not run other queries
   or connect/disconnect under another role to make this export succeed.

   **Windows path STOP rule:** the documented path contains `Christián`. If
   `\o` fails (including Unicode/path/permission errors), **STOP**. Do not
   silently switch to another path or an ASCII alias. Record any explicitly
   approved new output path before using it, then record the new export file's
   SHA-256. Preserve the original attempt; never substitute an output silently.

4. Compute and retain the exact file hash **before** formatting or sanitizing:

   ```powershell
   $ownerExportHash = (Get-FileHash -LiteralPath .tools/owner-export-A/export.json -Algorithm SHA256).Hash.ToLowerInvariant()
   $ownerExportHash
   ```

   The hash is public metadata. The JSON remains local-only until reviewed.
   Changing whitespace or line endings changes this file hash and requires a
   new explicitly recorded observation; do not silently substitute a new hash.

5. Prepare a local scope JSON containing only the approved existing operations:

   ```json
   {
     "deployment_id": "5c0cad2f-5f25-4216-8068-6cb9d2d26325",
     "operations": [
       {
         "operation_id": "EXISTING_OPERATION_UUID",
         "transaction_hash": "EXISTING_64_HEX_HASH",
         "command": "register_battery",
         "battery_id": "EXISTING_BATTERY_ID"
       }
     ]
   }
   ```

   Placeholders are deliberately invalid. Do not generate new identifiers.
   Map the scope to already captured chain bundles and reviewed run manifests;
   SQL export metadata alone does not approve a new scope.

6. Verify locally without any SQL/RPC request:

   ```powershell
   node tools/d3-evidence-capture/cli.mjs --local verify-owner-export --export .tools/owner-export-A/export.json --sha256 $ownerExportHash --scope .tools/owner-export-A/scope.json --bundle PATH_TO_CAPTURED_CHAIN_BUNDLE --out .tools/owner-export-A/comparison.json
   ```

   For one controlled pass covering all three future runs, replace `--bundle`
   with `--bundles .tools/owner-export-A/bundles.json`; that JSON is an array of
   exactly three local bundle paths. The scope/export must cover all 15 unique
   operations, and every row must map to captured chain evidence. No re-fetch of
   expired RPC data is needed or accepted as a substitute for a missing bundle.

7. Final handoff check uses the same inputs, `--bundles` and a local
   `--evidence-commits commits.json` mapping RUN1/RUN2/RUN3 to the actual evidence
   commits. Command: `check-handoff` instead of `verify-owner-export`. It requires
   three complete distinct runs, exact SQL scope coverage and committed bytes
   for every chain artifact. It does not grant owner acceptance or execute a run.

The CLI rejects unknown fields, duplicate JSON keys, missing/duplicate/unrelated
operations, wrong deployment/query/file hash, unconfirmed states, missing receipts
and PII. It never silently strips fields from the input before comparison.
Only a derived report with public operation references/hashes is a publication
candidate. Original export and original file hash must remain available locally.

## Machine-readable format and ordering

One UTF-8 JSON object (one result column/row; no psql table borders, footer or
headers). Terminal newline from psql is retained in the file hash. psql JSONB
object-key order is not a security assumption. Rows/requested IDs are sorted
ascending by operation UUID text with `COLLATE "C"`; receipt arrays by observation
ID. Events preserve their original order; never sort or deduplicate them.

Top-level fields: `schema`, `metadata`, `rows`.

Metadata fields: `query_sha256`, `export_time`, `deployment_id`, `database`,
`project_ref`, `business_execution_sha`, `transaction_read_only`,
`requested_operation_ids`. Schema is `BYETERY_OWNER_EXPORT_V1`.

Each row: `deployment_id`, `operation_id`, `battery_id`, `command`,
`source_account`, `state`, `durable_state`, `logical_state`, `confirmation`,
`state_evidence`, `envelope`, `terminal_evidence`.

Envelope: `transaction_hash`, `signed_envelope`, `network_id`, `contract_address`.
The SELECT removes PostgreSQL bytea/base64 newline wrapping only from this
envelope encoding; the signed bytes themselves are unchanged.

Confirmation: the original stored `transactionHash`, `observationLedger`,
`confirmationLedger`, `resultXdr`, `resultMetaXdr`, ordered `events`,
`sorobanResult`, `correlationId`, optional `confirmedAt`/`facts`. Each terminal
observation contains `kind`, exact `evidence`, `observation_ledger`,
`confirmation_ledger`, `state_read_ledger`. Facts retain battery/request/reward
and stateReadLedger, not Auth/user profiles or command parameters.

## Comparison matrix

| Field | Compare method |
|---|---|
| resultXdr | Decode/roundtrip TransactionResult AND exact encoded SQL/RPC equality: frozen transport stores the RPC representation directly. |
| resultMetaXdr | Decode/roundtrip TransactionMeta AND exact encoded SQL/RPC equality for the same retained representation. |
| events | Validate canonical ordered ContractEvent bytes AND exact ordered retained values. No sorting, flattening across unrelated transactions or deduplication. |
| header | Wrapper-aware RPC LedgerHeaderHistoryEntry hash/header/ext.v0 versus exact Horizon LedgerHeader bytes. Unknown extension STOP; no unsupported full protocol header decode is claimed. |
| signed envelope | Canonical decoded TransactionEnvelope bytes, network-bound hash and existing source/collector signatures. Only documented base64 line wrapping differs. |
| confirmation copies | Exact recursively ordered JSON equality of the stored Confirmation and each SUCCESS observation; arrays retain order. |
| facts/state_evidence | Getter read ledger retained and bounded; changed battery/request facts checked against captured meta. APPLIED state evidence must match its predicate and facts; old unresolved/negative assertions are retained and explicitly not used as success proof. |

An API wrapper difference is handled explicitly, not by loosening all fields.
Same-representation SQL/RPC mismatches remain STOP. A hash records bytes, not
truth. Metadata saying READ ONLY or Supabase DEV is **owner-asserted**, not a
database signature, live credential certification or independent proof that
the SQL was actually executed. Authenticity relies on the controlled owner
procedure, recorded scope/hash and owner/Council review. Synthetic fixtures must
never be presented as live exports. Service corroboration is not validator-grade
inclusion proof and digital attestations do not prove physical recycling.

## Separate gates

Option A may use an existing **owner-capable session**; that does not make the
credential intrinsically SELECT-only. Safety depends on BOTH
`BEGIN TRANSACTION READ ONLY` and the **exact pinned SELECT-only query SHA**.

`NO OTHER QUERIES DURING EXPORT SESSION`

Permitted SQL is limited to BEGIN READ ONLY, the required SHOW, the exact pinned
SELECT, and ROLLBACK. psql output/encoding controls are local client commands.
If `SHOW transaction_read_only != on`, STOP. If the query hash differs, STOP.
No administrative MCP fallback, privilege change or query substitution.

`CHAIN_GATE_REQUIRED_BETWEEN_RUNS = YES`

Envelope/hash/signatures, RPC result/meta/events, inclusion header and Horizon
corroboration must be captured promptly, verified/sanitized, committed, then
reviewed by owner/Council before the next run. A complete chain bundle can be
ready with SQL pending; a partial/retired/failed run cannot.

`SQL_RPC_GATE_REQUIRED_BEFORE_HANDOFF = YES` — deadline **2026-11-13**.

The approved owner export and recorded file hash must compare against frozen
chain bundles before final handoff. It may happen per run or in one controlled
pass. Mismatches STOP. No automatic chaining/retry/continuation. A standalone
gate cannot authenticate an owner JSON or stop an unrelated runner ignoring it;
the frozen business runtime is not modified or claimed to enforce this tool.
