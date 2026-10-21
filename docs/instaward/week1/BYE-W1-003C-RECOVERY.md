# BYE-W1-003C — PostgreSQL failure boundary and reviewed recovery

Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT, 2026-10-20.
This describes the bounded change. The separate report/results determine live success.
Historical BYE-W1-003B remains PARTIAL and is not rewritten.

## Forensic result before code changes

At 2026-10-20T18:54:01.784610Z the original operation
`4fa3fbac-84e4-4845-8abd-fbdff757cbb4` was QUEUED/PREPARING, created at
2026-10-20T18:36:01.914038Z; transport row created at18:36:07.580997Z.
It had zero envelopes/identities, no transaction hash, zero dispatches and one
committed positive SIMULATION observation (ledger5299559, resource992362,
total1002362stroops). Its SERVICE source sequence observation was20970220772392964.
The source lease belonged to that operation, generation3, and expired at18:39:09.566019Z.
No `updated_at` column exists; observation timestamps are reported instead of inventing one.

Battery remained RETURNED/NOT_ELIGIBLE, request OPEN, recipient USER-1. One immutable
collection evidence revision existed,339bytes. Both stored and independently recomputed
SHA-256 were ef61932cb180ffbafac39eddffaed46dccb6e42366c7999913116d9eb8f73766;
commitment3bca64581d5aced4a8582f85fe5755b07104e1b7d7cf6201cde90c6ffce5b5ef.
This supports UNSIGNED_PREPARATION_INTERRUPTED, not an ambiguous submitted transaction.

## Narrowest defensible root cause

The crash stack in BYE-W1-003B identifies pg8.23.0 Client's connection-end handler
and `_handleErrorEvent`. On unexpected socket end, pg rejects active queries and also
emits a Client `error` event. In the installed pg-pool implementation, `_acquireClient`
removes the pool's idle error listener while the client is checked out. Neither
Repository.transaction nor PgTransportDatabase.transaction installed a Client error
listener. Their Promise catch/rollback could not catch an independent unhandled
EventEmitter error. Repository also lacked a pool background-error listener.

The operational path was API collection replay context → durable worker PREPARING →
committed positive simulation → pre-sign database validation. The write-before-helper
journal gate was not reached; authoritative SQL had no signed identity/dispatch.
The source of the network/socket termination itself is **unproven**: no retained
server-side diagnostic establishes failover, a pooler timeout, concurrent tests,
client reuse or a specific infrastructure fault. Do not label any as the root trigger.

Official behavior references:
- https://node-postgres.com/apis/client#events
- https://node-postgres.com/apis/pool#events

## Bounded fix

`application/database.ts` registers redacted pool and lifetime Client error handlers.
A per-pool connection epoch invalidates a preparation even when a later query can
reconnect. Raw error objects are never logged or retained in public evidence.
Shared bounded transaction handling rejects connection loss, destroys broken clients
on release, keeps rollback/commit errors distinct from success and performs no retries.
Repository and PgTransportDatabase reuse it; transaction locks still contain SQL only.
No dependency, connection target, TLS policy, remote setting, migration or RLS change.

Worker checks the attempt's connection epoch before each signing boundary and dispatch.
The real transport checks it again after its asynchronous context/network gates and
immediately before each helper phase. The operator has the same guard around additional
negative checks and its write-before-helper gate. A pre-helper loss cannot reach signing.
If a signed identity might have committed despite an error, no send occurs. A READY
identity discovered at worker entry cannot be dispatched automatically after reconnect.

Existing persistent states remain unchanged. Recovery classification is derived:

| Durable facts | Classification / behavior |
| --- | --- |
| PREPARING, no identity, zero dispatches | UNSIGNED_PREPARATION_INTERRUPTED; normal run rejects explicit resume required |
| Identity exists, zero dispatches | SIGNED_IDENTITY_EXISTS; cannot enter unsigned recovery; interrupted READY first dispatch needs review |
| Identity and dispatch intent exist | SUBMITTED_OR_UNKNOWN; reconcile original hash, never prepare replacement |
| Dispatch without identity | Inconsistent; STOP |

When possible, the worker records an interrupted-preparation diagnostic in the existing
STATE_READ observations. If the database is still down, PREPARING itself blocks automatic
resume and the bounded source lease expires; diagnostics are not required for safety.
The original immutable operation/evidence remain. No new schema state enum is added.

## Explicit same-operation recovery

`worker.resumeUnsigned` requires operation ID, matching immutable context hash and a
nonempty server-held review decision. It takes the normal fenced source lease and
rechecks zero identity/dispatch under that claim before recording REVIEWED_UNSIGNED_RESUME.
The owner explicitly authorized this for the one original collection operation.
Fresh simulation/signing is its first durable Stellar identity, not a replacement.

`TestnetStellarService.resumeUnsigned` is server-only; no HTTP body/header can select it.
The bounded operator verifies the original collector, wallet, membership, chain/SQL state,
WASM/TTL, request, stored bytes/hashes/commitment and exact ABI arguments. It logs in the
existing COLLECTOR-1 Auth fixture, then replays the **original HTTP body and idempotency key**.
An injected server-side processor permits the reviewed path exactly once for that ID.
Coordinator resolves the existing logical operation instead of queueing a second one.
Future polling is same-hash reconciliation; API duplicate after projection uses its cache.

Commands from repository root, existing ignored DEV config selected server-side:

```text
node --experimental-strip-types backend/src/testnet/sprint-collection-recovery.ts --inspect
node --experimental-strip-types backend/src/testnet/sprint-collection-recovery.ts --execute-reviewed
```

Execution requires a clean tested implementation commit and matching ignored verification
record. A new task journal is exclusively created before the attempt; never reset/delete it
to retry. BYE-W1-003B's journal and reports are not modified. No new evidence or account/role
is generated. Exactly one collection send is allowed; no recycling or reward entrypoint.

The existing two-phase Secure Store helper, Testnet-only allowlists, fixed ABI,50M fee cap,
SDK body/hash checks, private immutable envelope COMMIT/readback and final authoritative
source-sequence gate remain in force. No key export. Treat SERVICE as shared/manual usage
unconfirmed; the application lease cannot fence external transactions.

## Deterministic coverage

EventEmitter-compatible pg client/pool fixtures backed by real ephemeral SQL inject the
disconnect during collection PREPARING, before the helper. Tests require unchanged original
operation/evidence, RETURNED/OPEN, zero signatures/identities/hashes/dispatches/sends, destroyed
broken client, successful subsequent reads and no automatic signing after reconnect.
Reviewed recovery then uses that same operation and evidence, creates one identity/send,
projects COLLECTED/CONFIRMED, and duplicate processing adds none.

Additional tests cover real transport gates after async connection loss, all three recovery
classifications, wrong-context recovery, signed identity exclusion and a COMMIT whose reply
is lost after the identity was actually stored. That case retains one identity, performs
zero sends, and reconnect cannot dispatch/reprepare it. Existing lost-response, source-drift,
persistence, authorization and idempotency suites remain. An old VOL-003 test was strengthened
to require explicit review after unsigned COMMIT failure; Foundation50 is untouched.

Raven's official documentation was consulted before Stellar decisions; simulation-derived
auth and source/address credential handling agree with the existing architecture:
https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction#javascript-usage-1
