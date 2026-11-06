# D3 tooling identity and execution preflight close — 2026-11-06

**D3_TOOLING_IDENTITY_AND_PREFLIGHT_CLOSED**

The owner ratifies the existing published tooling pair and accepts Option A.
Business authority remains frozen; the CLI file hash is informational only.
This task closes tooling/preflight conditions, not any D3 acceptance criterion.

```text
BUSINESS_EXECUTION_SHA = c6ba2e837ed0f7b81373655b8106b58ecb86a8cd
BUSINESS_FINGERPRINT = e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539
BUSINESS_FINGERPRINT_UNCHANGED = YES
TOOLING_HEAD_RATIFIED = PASS
RATIFIED_PUBLISHED_TOOLING_SHA = 2c6fb3c9e749eddfd61a2f217e9292cb880dc9e2
RATIFIED_PUBLISHED_TOOLING_TREE_HASH = dc83d7071f049e298c3d8deca671d0934029935d
RATIFIED_TOOLING_TREE_HASH_MATCH = YES
TOOLING_IDENTITY_POLICY = COMMIT_PLUS_TREE_HASH
NEW_TOOLING_TREE_HASH = cccda6b882bba85f848064ef70d086588c65608b
OWNER_EXPORT_QUERY_SHA256 = d4e82f4221d187aecdee7440b8331ebbe54e96d0b7400d06bc1430b8d793c9f1
FRESH_D3_DEPLOYMENT_ID = 5c0cad2f-5f25-4216-8068-6cb9d2d26325
TESTNET_NETWORK_ID = cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472
NETWORK_ID_BINDING = PASS
NETWORK_BOUND_TX_HASH_VERIFICATION = PASS
EMPTY_OWNER_EXPORT_REJECTED = YES
RPC_RETENTION_POLICY_READY = YES
OWNER_EXPORT_PATH_STOP_RULE = PRESENT
READY_FOR_TTL_MAINTENANCE_ACCOUNT_AND_BUDGET_GATE = YES
```

## Git identities and source freeze

Entry branch instaward/d2-web-mvp; HEAD 2c6fb3c9e749eddfd61a2f217e9292cb880dc9e2; its parent is exactly
c6ba2e837ed0f7b81373655b8106b58ecb86a8cd. Versus business: ahead 1 / behind 0. Versus the published remote:
ahead 0 / behind 0. The remote HEAD was read independently; main/tags unchanged.
Tracked diff/index were empty at entry; the nine pre-existing untracked reports/
historical ZIP remain excluded and intact.

`git rev-parse 2c6fb3c9e749eddfd61a2f217e9292cb880dc9e2:tools/d3-evidence-capture`
returns the exact Council Git tree dc83d7071f049e298c3d8deca671d0934029935d.
This is a real Git object identity, not a custom filesystem approximation.
The 24 frozen source/test hashes reproduce the exact fingerprint; all 34 files
from the frozen business commit remain byte-identical. Contract/WASM/schema,
signer/worker/API/frontend and business manifest schema are untouched.

Necessary tooling changes produce a new Git tree, shown above. It was computed
from the staged tooling subtree with git write-tree/rev-parse. Report files are
outside that subtree; no impossible self-embedded tree hash is introduced.
The new local tooling HEAD is the **single commit containing this report**:
`git log -1 --format=%H -- docs/instaward/d3/D3-TOOLING-IDENTITY-AND-EXECUTION-PREFLIGHT-CLOSE-2026-11-06.md`.
Its exact SHA and installed-tree verification are returned in the task final
response and ignored `.tools/d3-identity-close-receipt.json`. No second/amended
commit is used to embed its own enclosing commit hash.

This task authorizes one commit if necessary, but contains no push authorization.
Therefore the new commit remains local; the ratified public pair is still the
2c6fb3c9/dc83d707 pair. A local new pair is not represented as publicly published.

## Future identity record

Every separately authorized future D3 run must cite BUSINESS_EXECUTION_SHA,
BUSINESS_FINGERPRINT, TOOLING_PUBLICATION_SHA, TOOLING_TREE_HASH and
OWNER_EXPORT_QUERY_SHA256 in its reviewed companion evidence/preflight record.
The CLI hash alone cannot identify the dependency/spec/verifier tree. Existing
business manifest schema and exact-HEAD execution guard are not changed; use the
frozen business checkout and separately reviewed tooling companion.

`tooling-identity --identity <reviewed-local-identity.json>` checks the exact
five-field record against real HEAD/tree Git objects, installed committed bytes,
the frozen business fingerprint and pinned owner query. Commit/tree mismatch,
missing fields and uncommitted tooling drift STOP. Deriving a new record locally
does not itself authenticate owner approval or authorize execution.

## Exact fresh deployment proof

Only config/static read inspection occurred; no runtime, login, database query or
RUN allocation was started. The existing approved ../Byetery-testnet/.env targets
DEV/TESTNET and the exact deployment; only public identifiers/boolean comparisons
were emitted. No credentials, CA data or connection strings were printed.

| Frozen path | Binding |
|---|---|
| `backend/src/d3/operator-control.ts:55-59` | Each fresh operator preflight requires TESTNET/network/contract/WASM and exact deployment 5c0cad2f-5f25-4216-8068-6cb9d2d26325; wrong value fails before signing. |
| `backend/src/d3/live-operator.ts:154-160` | fresh() obtains new readPreflight state and invokes that exact preflight for each step. All RUN1/RUN2/RUN3 use this path. |
| `backend/src/application/config.ts:12-30` | Existing approved BYETERY_CONFIG_FILE source selects TESTNET and BYETERY_TESTNET_DEPLOYMENT_ID; validates exact Supabase DEV project. |
| `backend/src/application/server.ts:12-19; repository.ts:18` | One Repository(config) owns Pool(config.database) and deploymentId; passed unchanged to TestnetStellarService. |
| `backend/src/testnet/service.ts:67-73` | TransportStore(new PgTransportDatabase(repo.pool)); deployment context is repo.deploymentId. |
| `backend/src/testnet/store.ts:33-56` | queue filters SQL by the supplied deployment and TESTNET network; context mapping preserves/validates deployment, source and operation. |
| `tools/d3-evidence-capture/sql/owner-export.sql` | Pinned SELECT filters exactly the same deployment. No query modification. |

The preflight check is executed by fresh() for every RUN1/RUN2/RUN3 step, and
the API/service/store use the same configured deployment/pool. A wrong or missing
configuration fails the approved path; there is no fallback to another deployment.
This proves the current approved route, not an arbitrary external runner bypassing
it. Fresh observations/config must be rechecked before a later authorized execution.

## Network-bound historical transaction identity

Canonical passphrase: `Test SDF Network ; September 2015`.
network_id = SHA256(UTF8(exact passphrase)), with no newline. The tooling now
derives it explicitly and checks the stored spec/captured/exported network ID.

Transaction hash is SHA256 of the XDR TransactionSignaturePayload containing
that network ID and envelopeTypeTx(original transaction body), decoded from the
canonical v1 TransactionEnvelope. It is not a hash of the signatures. Existing
source/collector signatures are verified separately; no signature is generated.

| Method | Recomputed = RPC = stored artifact = fixture hash |
|---|---|
| register_battery | `5d7fff5457e19ad337e50398a07d403e68a054dbf58d8a5959c826c540b3d937` — PASS |
| open_return | `3e8a0482e3f32ea314c7df0da7ef6a8d3394b8aef354fa291fd7d6cd06007c15` — PASS |
| confirm_collection | `32ba94f9da05b52f44813e26e576cc994fd694f1df9132dd14d67557aa0ddd06` — PASS |

Stored artifact means the preserved local chain bundle transaction.json, not a
new remote SQL export. Synthetic historical owner-export fixtures independently
test exported network/hash binding. Live owner SQL integrity remains pending;
this task does not claim an export was run. The existing historical bundle stays
retired/non-counting and its original inventory/hash are unchanged.

## Negative cases and tests

**91/91 PASS — 70 baseline + 21 additional; 0 failed, 0 skipped.**

Command:
`node --test --test-concurrency=1 tools/d3-evidence-capture/tooling.test.mjs tools/d3-evidence-capture/owner-export.test.mjs tools/d3-evidence-capture/identity-preflight.test.mjs`

| Required negative | Explicit test |
|---|---|
| wrongTestnetPassphrase | I02 — rejects |
| wrongNetworkId | I03 — rejects |
| correctEnvelopeWrongNetwork | I04 — rejects |
| wrongNetworkRecomputedTxHash | I05 — rejects |
| exportedNetworkIdMismatch | A32 — rejects |
| emptyOwnerExport | A29 — rejects |
| partialOwnerExport | A30/A33 — rejects |
| toolingTreeMismatch | I08 — rejects |
| toolingCommitMismatch | I09 — rejects |
| businessFingerprintMismatch | I10 — rejects |

Empty rows cannot PASS for a nonempty requested scope. Missing rows, partial
metadata, an internally consistent partial export against a complete captured
scope, extra operations and wrong deployment all fail closed. Other new tests
cover incomplete identity, exact Git objects, retention unknown/exhausted/invalid
windows and the canonical positive network/transaction derivation.

All .mjs syntax checks PASS. Static/transitive import review finds no signer,
worker, productive runtime, full SDK root or pg import. Pure XDR/public encoding
helpers and node:crypto.verify only; 465 cached serializer/helper modules.
No broad business suite is rerun: it generates test signatures, outside the
no-signing tooling task. Frozen source/test/commit hashes were verified instead.
No productive test file changed.

## Retention gate

For the first future RUN1 tx preserve original getTransaction receipt fields:
inclusion ledger, oldestLedger (or explicit retention indicator), latestLedger
and observation time. Raw RPC capture already retains these fields. Then derive:

`SQL_RPC_CROSSCHECK_LATEST_SAFE_LEDGER = inclusionLedger + (latestLedger - oldestLedger + 1) - 1 - reserveLedgers`

The internal scheduling reserve is 120 ledgers. This is an observed-window
planning/escalation bound, not a provider guarantee. No seven-day/calendar window
is assumed. Missing indicators, changed/invalid ranges, a receipt outside the
window or reaching the bound require STOP/review. Providers may change retention.
No absolute fresh RUN1 bound exists here because RUN1 is not started.

Historical **non-counting example only** from the already captured receipt:
inclusion 5559684, oldest 5461163, latest 5582122, observed 2026-11-06T03:04:13.954Z; derived scheduling bound 5680523. It is not a new RPC observation or a future RUN1 target.

Capture/verify/sanitize and commit originals immediately, before eviction.
At the scheduling checkpoint, complete any planned live comparison or return to
owner/Council with the preserved originals. Before final handoff, check-handoff
must prove exact original RPC artifact bytes already exist in the referenced
evidence commits via assertCommittedBundle. SQL comparison can run offline against
those originals after RPC expiry; it cannot depend on an expired-receipt re-fetch.
If originals were not captured/committed in time, STOP. Calendar handoff deadline
2026-11-13 remains an additional condition. No future handoff/RUN gate passed here.

Raven stellarDocs was consulted first. The official
[getTransaction reference](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction)
documents ledger-bounded configurable retention and oldestLedger/latestLedger.
Only the relevant fields were used; no default duration is treated as a promise.

## Owner export session and Windows path

The query is unchanged byte-for-byte and retains its approved SHA. Option A may
use an existing owner-capable session; that session is not inherently SELECT-only.
Safety requires BOTH BEGIN TRANSACTION READ ONLY and the exact pinned SELECT SHA.

`NO OTHER QUERIES DURING EXPORT SESSION`

Only BEGIN READ ONLY, the required SHOW, the exact pinned SELECT and ROLLBACK are
permitted SQL; psql output controls are local commands. SHOW not on or a different
query hash means STOP. No administrative MCP fallback.

The path contains Christián. If \o fails for Unicode/path/permission reasons,
STOP. Do not silently switch paths or ASCII aliases. Any approved new path must
be recorded, followed by the new export file SHA-256. Preserve the failed attempt.
These explicit rules are in tools/d3-evidence-capture/OWNER-EXPORT.md. No export,
path change or credential request was performed by this task.

## Publication safety and commit decision

Secret/PII scan PASS, no unresolved findings. Five intentional nonfunctional
negative-test matches (invalid email/JWT/zero Auth-ID) are reviewed by exact source
line hash in the JSON companion; no exception applies to real evidence. Scan
covers all 26 tooling files and these two reports; old ZIPs/exports stay excluded.
git diff --check and staged whitespace checks PASS. The prior nine untracked
reports/archive and protected files remain intact/outside this commit.

NEW_TOOLING_COMMIT_REQUIRED = YES. Explicit identity/network/empty/partial tests
and Council's path/session/retention documentation were missing. Changes are
limited to 13 tooling files plus these two reports; no functional business change.

- `tools/d3-evidence-capture/OWNER-EXPORT.md`
- `tools/d3-evidence-capture/README.md`
- `tools/d3-evidence-capture/capture.mjs`
- `tools/d3-evidence-capture/cli.mjs`
- `tools/d3-evidence-capture/identity-preflight.test.mjs`
- `tools/d3-evidence-capture/network-identity.mjs`
- `tools/d3-evidence-capture/owner-export.mjs`
- `tools/d3-evidence-capture/owner-export.test.mjs`
- `tools/d3-evidence-capture/retention.mjs`
- `tools/d3-evidence-capture/spec.json`
- `tools/d3-evidence-capture/tooling-identity.mjs`
- `tools/d3-evidence-capture/verifier.mjs`
- `tools/d3-evidence-capture/xdr-reader.mjs`
- `docs/instaward/d3/D3-TOOLING-IDENTITY-AND-EXECUTION-PREFLIGHT-CLOSE-2026-11-06.md`
- `docs/instaward/d3/D3-TOOLING-IDENTITY-AND-EXECUTION-PREFLIGHT-CLOSE-2026-11-06.json`

One local commit maximum: `chore(instaward): pin D3 evidence tooling identity`.
Parent is the ratified published tooling commit. No push is requested/attempted;
main, tags and the Vercel auto-deployment barrier remain unchanged.

## Maintenance planning and no-execution audit

SAC pool TTL maintenance: NO (Council's persistent pool key liveUntil 6703017;
no new live observation). Future expected candidates: Battery(id), Request(rid),
derived from actual future footprints. No account creation, preparation,
simulation, maintenance transaction or budget decision is performed.

Business/maintenance tx, simulateTransaction, signatures, broadcasts/sendTransaction,
Friendbot, new accounts, Secure Store mutation, Supabase writes/remote SQL, DDL,
RLS/roles/grants, TTL, deployments and consumed RUN IDs: **all 0**.

D1 12/12; D2 6/6; D3 0/5; total 18/23. No acceptance change.

Next owner gate: **TTL_MAINTENANCE_ACCOUNT_AND_BUDGET_DECISION**.
READY_FOR_TTL_MAINTENANCE_ACCOUNT_AND_BUDGET_GATE = YES — decision only.

**STOP. Do not simulate step 1, create a maintenance account, extend TTL or start RUN1.**
