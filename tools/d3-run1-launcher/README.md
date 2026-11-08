# D3-17-RUN1 review launcher

This package isolates RUN1 orchestration from the frozen operator. `replay.mjs --offline-replay` is the synthetic CLI. `live.mjs` is the K6 local CLI for the frozen F1 composition root `launcher.mjs`. The Ed25519 owner key and fingerprint in `owner-grant-key.mjs` are PINNED.

The CLI requires a fresh signed grant bound to the actual K6 checkout and a separate owner authorization for RUN1. It loads the frozen operator from a clean linked worktree at the pinned business SHA in the same Git common directory. The composition checks both checkouts and the ratified capture subtrees before admission and factory invocation. The CLI fixes the verifier, capture implementation and operator factory.

## K6 local CLI

From the composition worktree, the exact command for a separately authorized RUN1 is:

```powershell
node tools/d3-run1-launcher/live.mjs --live --task-id D3-17-RUN1 --expected-sha c6ba2e837ed0f7b81373655b8106b58ecb86a8cd
```

The input is a regular UTF-8 file of at most 4 KiB at `%LOCALAPPDATA%\OwnerKeyCustody\Byetery-D3-RUN1\live\RUN1-owner-grant-envelope.json`. The CLI reads it after local and Git checks. The owner grant must bind the new, owner-ratified K6 SHA. A grant for K4b fails. The file input leaves the local terminal available for the existing no-echo credential flow. Grant data and credentials stay out of argv.

The non-secret `BYETERY_K6_API_ORIGIN` selects the separately prepared numeric loopback HTTP API and port. `BYETERY_K6_FROZEN_ROOT` is the absolute path of the frozen linked worktree. The owner supplies the existing Supabase Dev configuration through the normal settings loader, optionally with its path in `BYETERY_CONFIG_FILE`. The existing loader expects `BYETERY_ENV=DEV`, `BYETERY_MODE=TESTNET` and `BYETERY_TESTNET_DEPLOYMENT_ID=5c0cad2f-5f25-4216-8068-6cb9d2d26325`, along with the existing TLS and local API settings. The SQL adapter opens a pool with read-only transactions. Use a local terminal and the reviewed Stellar CLI 28.0.0 on PATH. The signer probe checks fixed Secure Store public identities. The wrapper reads the app role email after admission when the operator asks for that role and reads the password from the owner without echo or persistence.

The pre-admission gate checks the Git controls, sealed ledger, read-only SQL and public Testnet facts. SQL must show zero fresh RUN1 rows, leases, pending work and reconciliation locks. The ledger must still account for four historical successes and preserve the locked contingency slot. A live-state absence observation has the historical archival limit documented in the plan bundle. The CLI verifies the grant again and emits `RUN1_PRE_ADMISSION_READS=PASS` immediately before invoking the frozen launcher.

The frozen order is grant verification, runtime validation, exclusive admission marker, operator factory, then login. A startup Auth failure stops with zero business transactions and the admission marker retained. After an admission or uncertain start, stop for reconciliation and a new owner authorization. The CLI performs no automatic retry. One additional read-only recapture of the same identity remains the maximum. K6 review and publication confer no live execution authority.

## C1 and C2

The same operator handle owns all five steps and the final counting decision. Admission is exclusive and persists after a startup or step failure. A live launch stores the signed nonce in the fixed RUN1 marker in the Git common directory, shared by linked worktrees. This rejects the same grant and any replacement grant after the first admission. After a stop, preserve the marker and return to the owner and Council for review. The frozen operator retains its independent lock and exclusive journal. Synthetic replay uses an isolated marker. A failed frozen step is terminal for this run even if later reads recover its transaction.

After a step confirms, the launcher persists the original identity before starting capture in a separate process. The replay child inherits an empty environment. A pending capture allows one read-only recapture of the same identity while the handle stays open. A terminal mismatch, integrity failure, or inconclusive recapture stops advancement. The parent re-hashes the inventory files. The live capture child has an empty environment and receives only the operation identity. Its SQL requests are served by the ratified read-only receipt reader. The parent verifies the sealed inventory and corroborates the API outcome with SQL, RPC and public Horizon evidence before advancement. No capture observation creates an operation or changes the frozen step.

The read-preflight port invokes its source for each request and verifies a fresh request binding and timestamps. It retains only source, timestamp and ledger metadata. It rejects cached responses and stops on a read failure. The credential port resolves each allowed role once at runtime through the secure-store interface. The frozen operator consumes the resulting credentials. Errors at the credential boundary use fixed messages.

## Owner grant and session policy

The grant is an exact `{ grant, signature }` object. The signature is 64 bytes encoded as unpadded base64url. The pinned public key is unpadded base64url Ed25519 SPKI DER with its lowercase hex SHA-256 fingerprint. Production reads both pins from the versioned owner-key module.

Sign the UTF-8 bytes starting with `BYETERY-D3-RUN1-OWNER-GRANT-V1` and a single LF. Append one `field=value` line per field in this exact order, including an LF after the last field:

```text
schemaVersion
action
taskId
runId
businessSha
planHash
batteryId
recipient
jwtExpirySeconds
jwtObservedAt
compositionRootSha
nonce
issuedAt
expiresAt
```

Use schema version `1`, action `AUTHORIZE_D3_17_RUN1_EXECUTION`, lowercase hex commit hashes and a 32-byte nonce encoded as lowercase hex. Times are integer Unix milliseconds. The grant is issued only after Council ratifies the F1 commit and must bind the exact checkout SHA. The issue clock may be ahead by at most 30 seconds. Expiry is exclusive and at most two hours after issue. The owner-observed JWT timestamp must be at or before issue and must be no more than ten minutes old at live start. The live target is exactly 5,400 seconds.

The frozen operator obtains its role sessions after the recorded start boundary. F1 derives the conservative deadline from `operatorStart + 5400 - 120 seconds`, giving 5,280 seconds. The unchanged budget is 180 seconds for startup plus five steps of 780 seconds each, for 4,080 seconds. Admission requires strictly more time than the budget. The deadline is checked before each step and after capture or recapture. The live composition relies on the frozen operator's own authenticated role checks and has no session observer, token inspection, refresh or Supabase Management API dependency.

## Post-run Auth evidence

A successful future capture starts with `RUN_EVIDENCE_VALID = PENDING_OWNER_OBSERVATION`. The owner separately attests to the post-run policy and eventual restoration. The verifier checks the same pinned Ed25519 key over a distinct canonical header `BYETERY-D3-RUN1-POST-RUN-AUTH-V1` followed by LF and these ordered `field=value` lines:

```text
schemaVersion
compositionRootSha
grantNonce
jwtExpiryBefore
jwtObservedAtBefore
jwtExpiryAfter
jwtObservedAtAfter
changedDuringRun
jwtExpiryRestored
jwtObservedAtRestored
```

The before observation must equal the signed grant, and the after observation must be at or after recorded completion. Both must attest to 5,400 seconds. A changed value during the run or at the after observation yields `RUN_EVIDENCE_VALID = NO`. The owner must attest whether the value changed during the run, even if it was later restored. The restoration fields are both `null` while pending and later record 3,600 seconds and its observed time. The consistency check uses the trusted execution timestamps and the grant nonce. F1 does not modify Auth or attempt automatic recovery.

## Historical read boundary

The historical adapter pins the retired transaction, operation, battery, ledger, existing bundle and API admission record. The read-only adapter uses the ratified SQL receipt SELECT, a scoped projection and quiescence SELECT inside read-only transactions, and Horizon transaction/ledger GETs. The archived RPC receipt and snapshots retain their original observation provenance. The adapter reuses the unchanged ratified metadata comparator. Only `core_metrics / invoke_time_nsecs` is ignored under its existing strict shape guards.

The stored API HTTP 202 records admission. The separate sealed journal preserves the historical operator's confirmation and subsequent API state checks for that operation. These observations corroborate fresh SQL and Horizon reads. The archive-only replay remains partial because it has no fresh read. See [L1 and L2 evidence](L1-L2-REVIEW.md).

## Offline verification

From the repository root:

```powershell
node tools/d3-run1-launcher/replay.mjs --offline-replay
node --test tools/d3-run1-launcher/*.test.mjs
```

Synthetic output is written to fresh directories under ignored `.tools`. The historical verification function takes a trusted pool and paths at runtime. It has no command-line credentials or constructor for the frozen operator.
