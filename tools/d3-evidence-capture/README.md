# D3 evidence capture â€” independent local tool

BUSINESS_EXECUTION_SHA: c6ba2e837ed0f7b81373655b8106b58ecb86a8cd
BUSINESS_FINGERPRINT: e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539

This tool does not execute a lifecycle, start a server, load a signer, access
Secure Store, call a business API or change the business manifest schema.

## Local commands

Use Node 24 and the already locked backend dependencies. No installation or
global configuration change is performed by this task. The only SDK entry
loaded is the official pure @stellar/stellar-sdk/xdr serializer. It transitively
loads public encoding helpers, not the SDK root, Keypair, transaction builder
or RPC client. Existing public signatures are verified with node:crypto.verify.

    node tools/d3-evidence-capture/cli.mjs --local status
    node tools/d3-evidence-capture/cli.mjs --local capture-run --fixtures tools/d3-evidence-capture/fixtures/historical.json --out .tools/example-offline-bundle
    node tools/d3-evidence-capture/cli.mjs --local capture-run --input .tools/approved-capture-input.json --out .tools/example-live-bundle
    node tools/d3-evidence-capture/cli.mjs --local capture-tx --input .tools/approved-one-tx.json --out .tools/example-one-tx
    node tools/d3-evidence-capture/cli.mjs --local verify-bundle --bundle .tools/example-live-bundle
    node tools/d3-evidence-capture/cli.mjs --local scan-bundle --bundle .tools/example-live-bundle
    node --test --test-concurrency=1 tools/d3-evidence-capture/tooling.test.mjs

Outputs must not already exist. Bundles are immutable; the tool does not remove
or overwrite one. Product paths are refused as output. Inputs and paths are
bounded; symlinks, traversal, unlisted artifacts and unsupported RPC responses
fail closed. Hosted/CI/serverless flags and production NODE_ENV are refused.
Only Testnet RPC allowlisted read methods and fixed Horizon GET paths exist.
The HTTP sender is private; there is no generic mutation endpoint.

Capture input is public JSON with:
- run: runId RUN1/RUN2/RUN3 (or historical label), retired boolean, complete boolean.
- transactions: ordered expected records, each hash, method, batteryId,
  requestId when known and approved recipient.
For capture-tx use one object with an expected record instead.

Only already existing hashes/identities are inputs. Capture does not generate
or reserve a battery/request/run identity. An input is not execution authority.
Historical AF7A44A515AC must be retired and cannot count.

## Current SQL policy — OWNER OPTION A (2026-11-06)

The owner manually exports JSON from an existing local database session using
[sql/owner-export.sql](sql/owner-export.sql). The tool receives only that JSON,
its independently recorded SHA-256, an exact operation scope and chain bundles.
It does not receive/read database credentials, load pg, open a DB connection,
execute SQL, or use an administrative connector. No new role/grant/RLS change.
The legacy readSqlReceipt entry is disabled and fails before any credential access.
Legacy role-check tests remain pure offline checks, not a live role certification.

OWNER_EXPORT_QUERY_SHA256:
`d4e82f4221d187aecdee7440b8331ebbe54e96d0b7400d06bc1430b8d793c9f1`

The approved query file is hash-pinned in code and spec. Any byte change requires
review; copying the old hash into metadata does not approve a changed query.
See [OWNER-EXPORT.md](OWNER-EXPORT.md) for the exact manual workflow, schema,
comparison matrix, scope and provenance limitations. No export is executed on
behalf of the owner in this task. Historical comparator tests are synthetic SQL
values made from public chain records; they are not live SQL evidence.

D3_EVIDENCE_DATABASE = SUPABASE_DEV (aemxuqnnwfclzrwwiqfd). The frozen API
settings enforce that target, Repository owns its pool, and TestnetStellarService
passes that same pool to PgTransportDatabase/TransportStore. Local PostgreSQL
and PGlite are fixture/test environments, not a second D3 persistence target.
Config file selection is configurable, but a valid frozen runtime config cannot
redirect the business evidence to localhost. No runtime was started to prove this.

## Artifacts and canonical inventory

Each step directory includes raw signed envelope/result/meta XDR, events,
Horizon transaction/ledger, RPC transaction and ledger header projection,
both raw header forms when available, footprint/changed keys, current entry
XDR/TTL observations, balances, SQL crosscheck and verification.
Missing SQL is recorded explicitly; it never becomes PASS.

RPC getLedgers.headerXdr is LedgerHeaderHistoryEntry; Horizon header_xdr is
LedgerHeader. The verifier checks the exact header bytes inside the documented
hash/header/ext.v0 wrapper, previous hash and service close time. Unsupported
wrapper extensions stop. Full Protocol30 SCP/header decoding is not claimed.

The inventory contains sorted relative paths, byte lengths, SHA-256, origin,
observation times, classification and raw-public/sanitized flags. Its canonical
UTF-8 JSON has sorted object keys, sorted artifact paths and one terminal LF.
BUNDLE_SHA256 is SHA-256 of those exact inventory bytes. Inventory and its hash
file are excluded from the artifact list to avoid a circular hash. Both are
required and any extra file fails verification.

Verification repeats transaction identity/signature/contract/method/context
checks and recomputes summary eligibility rather than trusting labels.
SERVICE_CORROBORATED_INCLUSION means independently queried RPC and Horizon,
both SDF services; it is not validator-grade consensus or archive inclusion
proof. A history/archive reference explicitly records NOT_CAPTURED unless
such stronger material is actually obtained.

## Balances and TTL planning

G-wallet GREENTEST balances are classic trustlines: NO_CONTRACT_TTL.
The SAC pool uses persistent ContractData Balance(C). Known liveUntil is
6703017; SAC_POOL_TTL_MAINTENANCE_REQUIRED = NO for the approved planning
horizon. Future normal maintenance candidates are Battery(id)/Request(rid)
derived from actual future lifecycle footprints, not the already sufficient pool.
The tool derives that
LedgerKey and records its current entry/TTL independently of wallet trustlines.
Temporary collector nonces are replay protection; never select them for TTL.

For reward, record independent pre/post observations when available. Otherwise
retain exact transaction-meta-local deltas with that provenance; never invent
a historical pre-observation.

Planning only: external deadline 2026-11-13, reviewer live target 2026-11-27,
buffer through 2026-11-30, safety lead two days. No future absolute ledger is
frozen. Derive an approved maintenance whitelist from actual lifecycle RO/RW
footprints and changed parent entries, identify relevant persistent/code keys,
re-read presence/TTL, remove already-sufficient shared keys, exclude classic,
temporary and TTL companions, deduplicate/sort raw XDR bytes. Unknown keys STOP.
This tool has no TTL transaction operation or maintenance account path.

## Operational gate and interruption policy

RUN(n+1) MUST NOT START UNTIL RUN(n) EVIDENCE BUNDLE IS CAPTURED, VERIFIED,
SANITIZED AND COMMITTED.

    node tools/d3-evidence-capture/cli.mjs --local check-next-run --next-run RUN2 --bundle docs/instaward/d3/evidence/RUN1 --evidence-commit <40-hex-commit> --owner-decision <reviewed-public-decision.json>

CHAIN_GATE_REQUIRED_BETWEEN_RUNS = YES.
SQL_RPC_GATE_REQUIRED_BEFORE_HANDOFF = YES (2026-11-13).

The check requires a complete successful same-lifecycle/request bundle,
chain/ledger evidence, committed bytes matching every artifact and a
matching explicit owner/Council gate. SQL may remain PENDING_OWNER_EXPORT
between runs; it is mandatory before final handoff. Freeze RPC evidence promptly;
no run may depend on re-fetching it after retention expires. No automatic chaining. A standalone
checker cannot authenticate an owner merely from JSON or prevent a different
runner ignoring it. It never starts a run or grants execution authority.
The owner/operator must invoke this gate BEFORE credentials/reservation in a
separately authorized future task. No generic frozen-backend enforcement is
claimed; the runtime was not modified.

Any interrupted, failed, expired, uncertain or owner-stopped run is retired.
Capture all available completed/attempted evidence immediately, label
RUN_RETIRED_OR_STOPPED, do not regenerate it as complete and return to owner.
NOT_FOUND is not non-application proof. Failed/unconfirmed attempt captures
are diagnostic and never enable the next run.

Business cap 18; consumed 3; available/required 15; margin 0. No retry,
replacement, continuation, larger cap or later run is authorized by this tool.

## Execution and tooling SHAs are separate

Owner ratification on 2026-11-06 confirms the published pair:
commit `2c6fb3c9e749eddfd61a2f217e9292cb880dc9e2`, exact Git subtree
`dc83d7071f049e298c3d8deca671d0934029935d` for tools/d3-evidence-capture.
The identity policy is **COMMIT_PLUS_TREE_HASH**, not the CLI file hash alone.
Legitimate later tooling changes require a new reviewed pair; they do not
redefine the frozen business execution SHA/fingerprint.

Before any separately authorized future D3 execution, its companion evidence
manifest/preflight record must cite all five fields:
BUSINESS_EXECUTION_SHA, BUSINESS_FINGERPRINT, TOOLING_PUBLICATION_SHA,
TOOLING_TREE_HASH, OWNER_EXPORT_QUERY_SHA256. Keep this in an evidence sidecar;
the frozen business manifest schema/runtime is unchanged. The owner/Council must
review that pair; computing a new local HEAD does not grant execution authority.

    node tools/d3-evidence-capture/cli.mjs --local tooling-identity --identity .tools/reviewed-tooling-identity.json

The supplied record has exactly those five uppercase keys. The command compares
HEAD's real Git commit/subtree objects and every installed tooling file against
committed bytes, rejects uncommitted drift, and rechecks the business fingerprint
and pinned query. Do not embed a tree hash inside the same tree it describes.

### RPC retention checkpoint

For the first RUN1 transaction, retain its original RPC getTransaction response:
inclusion ledger, oldestLedger, latestLedger, and capture observation time. The
raw RPC artifact already preserves these fields. Derive the planning checkpoint
from observed ledger retention, not an assumed seven-day/calendar window:

SQL_RPC_CROSSCHECK_LATEST_SAFE_LEDGER = inclusionLedger +
(latestLedger - oldestLedger + 1) - 1 - reserveLedgers.

The internal scheduling reserve is 120 ledgers; it is not a protocol lifetime or
provider guarantee. Retention can change. Missing/invalid indicators, an expired
receipt or a reached checkpoint require STOP/review; never silently invent a date.
Capture/verify/sanitize and commit the original receipt immediately. At the
checkpoint, finish any planned live comparison or review the preserved originals
with owner/Council. Final SQL integrity can compare offline against those already
committed exact bytes; it must not depend on re-fetching an expired receipt.
If originals were not captured/committed before eviction, STOP. Calendar deadline
2026-11-13 remains an additional handoff constraint, not a retention guarantee.

    node tools/d3-evidence-capture/cli.mjs --local retention-check --bundle .tools/already-captured-chain-bundle

This command reads only local captured artifacts. The existing check-handoff
verifies exact committed artifacts; merely having an uncommitted export/report
does not close the original-RPC evidence gate. No first fresh RUN1 receipt exists
in this task, so no fresh absolute retention ledger is assigned.

A future tooling/docs commit may move repository HEAD. The tool explicitly
pins and checks the 24 frozen source/test file hashes. It does not make a new
HEAD the approved business execution SHA. The existing operator checks exact
HEAD; future business execution must use an owner-reviewed isolated checkout
at the frozen SHA, with this tool as an external companion. Do not alter that
guard to make a tooling HEAD executable.

The captured execution SHA is provenance bound to the reviewed business run;
Stellar itself does not attest a backend Git SHA. Source-pin checks and the
owner's execution/manifest evidence remain necessary.

## Publication boundary

A: reviewed tool source/spec/tests, curated public-chain fixtures and sanitized
reports are publication candidates only after all required gates pass.
Negative tests intentionally contain nonfunctional JWT/invalid-domain email
examples; publication scanning records specific reviewed false positives.
Do not add scanner exceptions for actual capture bundles.

B: ignored .tools captures, diagnostics and prior raw historical ZIP remain
local-only until individually audited and separately approved. Never blindly
stage the old archive or unrelated untracked reports.

C: credentials, env, Auth identities/sessions, emails, cookies, seeds/private
keys and Secure Store material must never be published. The explicit sanitizer
removes private SQL fields; scanners reject unresolved values, including
inside raw binary XDR. Public operation IDs and G/C addresses may be retained.

Capture promptly after each tx, within 24h of a completed lifecycle. Commit
evidence and obtain the next owner/Council gate before proceeding. The current
task publishes only tooling/docs after its local gates pass; live SQL integrity
remains pending the manual owner export. No business run is authorized.
