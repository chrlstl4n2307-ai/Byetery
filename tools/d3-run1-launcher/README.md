# D3-17-RUN1 review launcher

This package isolates RUN1 orchestration from the frozen operator. The only CLI is `replay.mjs --offline-replay`. The versioned F1 composition root is `launcher.mjs`, with `launchRun1` as its sole live entry. It imports the pinned Ed25519 verifier directly. The public-key and fingerprint slots in `owner-grant-key.mjs` are deliberately empty. This version refuses all live grants before reading runtime ports.

A future owner-reviewed local invocation must supply the exact signed grant and the existing trusted fresh-read, runtime credential, read-only SQL, and loopback API inputs. It must load the frozen operator from a separate clean linked worktree at the pinned business SHA in the same Git common directory. The two checkouts use the same local admission and frozen operator control directory. The composition checks its own current Git commit and execution-critical paths, verifies both ratified capture subtrees, and checks the frozen checkout again before admission and factory invocation. Runtime inputs cannot select a verifier, capture implementation, session observer, operator factory, or composition SHA. The library ships no unversioned runtime wrapper and no live CLI.

## C1 and C2

The same operator handle owns all five steps and the final counting decision. Admission is exclusive and persists after a startup or step failure. A live launch stores the signed nonce in the fixed RUN1 marker in the Git common directory, shared by linked worktrees. This rejects the same grant and any replacement grant after the first admission. After a stop, preserve the marker and return to the owner and Council for review. The frozen operator retains its independent lock and exclusive journal. Synthetic replay uses an isolated marker. A failed frozen step is terminal for this run even if later reads recover its transaction.

After a step confirms, the launcher persists the original identity before starting capture in a separate process. The replay child inherits an empty environment. A pending capture allows one read-only recapture of the same identity while the handle stays open. A terminal mismatch, integrity failure, or inconclusive recapture stops advancement. The parent re-hashes the inventory files. The live capture child has an empty environment and receives only the operation identity. Its SQL requests are served by the ratified read-only receipt reader. The parent verifies the sealed inventory and corroborates the API outcome with SQL, RPC and public Horizon evidence before advancement. No capture observation creates an operation or changes the frozen step.

The read-preflight port invokes its source for each request and verifies a fresh request binding and timestamps. It retains only source, timestamp and ledger metadata. It rejects cached responses and has no fallback on a read failure. A future runner must supply the approved source adapter that performs those reads. The credential port resolves each allowed role once at runtime through the secure-store interface. Only the frozen operator may consume the resulting credentials. Errors at the credential boundary use fixed messages.

## Owner grant and session policy

The grant is an exact `{ grant, signature }` object. The signature is 64 bytes encoded as unpadded base64url. The separately ratified public key will use unpadded base64url Ed25519 SPKI DER and its lowercase hex SHA-256 fingerprint. Production reads both pins from the versioned placeholder module. Public test vectors cannot substitute for those pins.

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