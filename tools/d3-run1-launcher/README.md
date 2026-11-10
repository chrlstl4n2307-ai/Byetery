# D3-22-RUN1 review launcher

This package isolates RUN1 orchestration from the frozen operator. `replay.mjs --offline-replay` is the synthetic CLI. `launch.ps1` is the reviewed entry point for `live.mjs` and the frozen operator. The Ed25519 owner key and fingerprint in `owner-grant-key.mjs` are pinned.

The CLI requires a fresh signed grant bound to the reviewed D3-22 checkout and separate owner authorization for `D3-22-RUN1`. The plan still uses `runId=RUN1`. It loads the frozen operator from a clean linked worktree at the pinned business SHA in the same Git common directory. The composition checks both checkouts and the ratified capture subtrees before admission and factory invocation. The CLI fixes the verifier, capture implementation and operator factory.

## Local CLI

After separate live authorization and ratification, use the reviewed PowerShell executable from the composition worktree:

```powershell
& $RatifiedPwshPath -NoProfile -File tools/d3-run1-launcher/launch.ps1 -SessionControl $SessionControlPath -SessionControlSha256 $RatifiedSessionControlSha256
```

Keep the separate UTF-8 session control outside the repository. Its exact fields are `schemaVersion` (2), `taskId` (`D3-22-RUN1`), `compositionRootSha` (the exact reviewed child of the published K7 TTY and Node pin checkpoint), `live`, `wrapper`, `pwsh` and `node`. Each artifact has an absolute physical `path` and lowercase `sha256`. Both executables also have a `version` (`7.6.9` for PowerShell and `v` followed by the exact Node version). Use `encodeSessionControl()` from `session-pins.mjs` to produce the manifest bytes. It emits compact JSON in fixed field order with a final LF and no BOM. Record the SHA-256 of those exact bytes separately for future K5 ratification. The wrapper verifies all four artifact hashes and launches the Node executable by its pinned path. The Node entry also checks its own physical executable and version, checks the actual parent executable, and revalidates the manifest and pins before admission. The manifest carries no credentials.

The owner envelope is a regular UTF-8 file of at most 4 KiB at `%LOCALAPPDATA%\OwnerKeyCustody\Byetery-D3-RUN1\live\D3-22-RUN1-owner-grant-envelope.json`. The CLI reads it after local, Git and pin checks. The grant must bind the reviewed composition SHA and use the exact 900-second grant lifetime. Grant data and credentials stay out of argv. Enter credentials only after the prompt is visible. Each prompt drains queued input for 80 ms before display and restores the prior terminal mode before returning.

The non-secret `BYETERY_K6_API_ORIGIN` selects the separately prepared numeric loopback HTTP API and port. `BYETERY_K6_FROZEN_ROOT` is the absolute path of the frozen linked worktree. The owner supplies the existing Supabase Dev configuration through the normal settings loader, optionally with its path in `BYETERY_CONFIG_FILE`. The existing loader expects `BYETERY_ENV=DEV`, `BYETERY_MODE=TESTNET` and `BYETERY_TESTNET_DEPLOYMENT_ID=5c0cad2f-5f25-4216-8068-6cb9d2d26325`, along with the existing TLS and local API settings. The SQL adapter opens a pool with read-only transactions. Use a local terminal and the reviewed Stellar CLI 28.0.0 on PATH. The signer probe checks fixed Secure Store public identities. The wrapper reads the app role email after admission when the operator asks for that role and reads the password from the owner without echo or persistence.

The pre-admission gate checks the Git controls, sealed ledger, read-only SQL, one eligible application identity per role, and public Testnet facts. ADMIN has no app actor address. The Stellar ADMIN is independently verified from contract configuration. SQL must show zero fresh RUN1 rows, leases, pending work and reconciliation locks. A coordinated snapshot acquires the shared deployment advisory transaction lock before reading. This serializes the snapshot against the API's exclusive lock. The observer's own granted shared lock is excluded, and every other matching holder or waiter still fails quiescence. A lock timeout stops the read. No backoff, resampling or retry is performed. The ledger must still account for four historical successes and preserve the locked contingency slot. A live-state absence observation has the historical archival limit documented in the plan bundle. The CLI verifies the grant again and emits `RUN1_PRE_ADMISSION_READS=PASS` immediately before invoking the frozen launcher.

The frozen order is grant verification, runtime validation, exclusive admission marker, operator factory, then login. The CLI retains the admission marker on a startup failure. After an admission or uncertain start, stop for reconciliation and a new owner authorization. The CLI performs no automatic retry. One additional read-only recapture of the same identity remains the maximum. Local preparation confers no live execution authority.

## C1 and C2

The same operator handle owns all five steps and the final counting decision. Admission is exclusive and persists after a startup or step failure. A live launch uses the marker derived from `D3-22-RUN1` in the Git common directory. This rejects the same grant and any replacement grant after the first admission. Historical `D3-17-RUN1`, `D3-18-RUN1`, `D3-20-RUN1` and `D3-21-RUN1` remain rejected and their controls stay in place. The frozen operator retains its independent lock and exclusive journal. Synthetic replay uses an isolated marker. A failed frozen step is terminal for this run even if later reads recover its transaction.

After a step confirms, the launcher persists the original identity before starting capture in a separate process. The replay child inherits an empty environment. A pending capture allows one read-only recapture of the same identity while the handle stays open. A terminal mismatch, integrity failure, or inconclusive recapture stops advancement. The parent re-hashes the inventory files. The live capture child has an empty environment and receives only the operation identity. Its SQL requests are served by the ratified read-only receipt reader. The parent verifies the sealed inventory and corroborates the API outcome with SQL, RPC and public Horizon evidence before advancement. No capture observation creates an operation or changes the frozen step.

The read-preflight port verifies a fresh request binding and timestamps on each call. The credential port resolves each allowed role once at runtime. On failure, the launcher writes a synced fatal JSON with allowlisted stage, role and timestamp evidence and reports its SHA-256. A failure hidden by the frozen operator is classified as `STARTUP_OPERATOR_INDETERMINATE` or `STEP_OPERATOR_INDETERMINATE`. The wrapper records `SESSION_PINS_REJECTED` if its prechecks fail before Node starts.

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
