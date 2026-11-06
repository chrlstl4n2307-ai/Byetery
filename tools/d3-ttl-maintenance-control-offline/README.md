# TTL custody and durable accounting — offline control gate

Task: `TTL_CUSTODY_AND_DURABLE_ACCOUNTING_OFFLINE_GATE`.

This auxiliary model cannot create accounts, generate/store real keys, simulate,
sign, send, restore or extend TTL. No real secret-store adapter is supplied.
Every readiness/demo/provenance result has `executionAuthorized=false`.
The existing business code and both ratified auxiliary trees are unchanged.

## Reproduce locally

Use installed Node and the existing TypeScript 6.0.3 parser; no package changes:

```text
node --test --test-concurrency=1 tools/d3-ttl-maintenance-control-offline/control.test.mjs
node tools/d3-ttl-maintenance-control-offline/cli.mjs --local
```

The demo uses SYNTHETIC_OFFLINE fixtures, existing public XDR templates and
unsigned modified envelopes. No Ed25519 keypair or new signature is generated.
Synthetic SUCCESS/included counts do not represent actual maintenance or D3 RUNs.
Tests create metadata-only journals under ignored `.tools/ttl-control-offline-*`.
The lock child is solely a process-contention fixture, not a network worker.

## Ratified inputs

- Business SHA: c6ba2e837ed0f7b81373655b8106b58ecb86a8cd.
- Business fingerprint: e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539.
- Evidence tooling: c5b8435c9682cea35be418bff451a7fa4187c2a4;
  subtree cccda6b882bba85f848064ef70d086588c65608b.
- TTL auxiliary: 2d10ee2558b4dd0f7f2ff3a1732dbd1b03b1a0df;
  root 1b99ccc5c67c9af333d3708ee4632133b9535846;
  subtree 31b9651d2e6383b4c0d857a56ae7f90cc6300efa.

`assertFreeze` checks immutable objects and installed bytes, including the old
query pin, before the CLI runs. This new control tree is a separate candidate;
it does not inherit live authorization from either earlier ratification.

## Concrete future custody model

Use an owner-controlled local maintenance store outside every repository, with
its own provider ID, fixed maintenance-only namespace and a separate restricted
OS principal from the business signer. A concrete Windows implementation may use
user-scoped OS protection under separate non-administrator principals, plus ACLs
that deny the opposite process identity. Business retains its existing store;
neither process receives an unrestricted cross-namespace broker or enumerator.
This task does not create principals, change ACLs or touch Secure Store.

Configuration contains only provider ID, owner role, namespace, location kind/path,
OS-principal identifier, network, access role and no-export/no-enumeration policy.
The synthetic example path is design metadata; it is never created or opened.
No material may enter Git/repo, Slack, Vercel, frontend env, Supabase, reports,
logs or fixtures. Repository ancestors, remote location kinds and forbidden
locations are rejected. Merely assigning separate slot names is insufficient.

`BUSINESS_SIGNER_CANNOT_LOAD_MAINTENANCE_KEY = ENFORCED_OFFLINE`

`MAINTENANCE_SIGNER_CANNOT_LOAD_BUSINESS_KEYS = ENFORCED_OFFLINE`

These statements refer to tested role-scoped synthetic handles and dependency
guards. **Operational OS/provider isolation is not proven or provisioned here.**
Owner/admin control of the whole computer is outside this offline threat model.
Actual two-way access-denial tests under the eventual process principals remain
mandatory before account/key provisioning or live use can be approved.

The two loader wrappers have fixed roles. Opaque ports are branded in a WeakMap;
JSON cannot forge a port, change its namespace or use it through the other role.
The common helper requires an explicit bound scope and never exposes a seed.
The fixture issuer only mints synthetic handles, not real store capabilities.

## Dependency/import audit

The installed public TypeScript AST parser handles static imports, re-exports,
literal require/import calls. Computed imports, unresolved edges, cross-role
reachability, unrestricted common helpers/getters and generic enumerators fail
closed. This is a narrow dependency/capability-contract audit, not a proof about
arbitrary adversarial JavaScript. Reviewed hashes and OS boundaries remain needed.

`auditInstalledBoundaries` scans the actual new modules for forbidden network,
signing/store/runtime imports and walks the current business signer dependencies
read-only. Business modules are parsed, never imported or executed. The future
maintenance implementation must pass the same graph contract before deployment.

## Account-creation manifest / S0

`creation.schema.json` and `creationManifest` define public metadata: account key,
Testnet ID, creation ledger/hash/timestamp, **observed initial sequence S0 after
creation**, master signer/weight, thresholds 0/0/0, no sponsorship, Friendbot
funding source, owner approval and all ratified identities. Friendbot is a future
manifest value; no call is made. Fixtures reuse an existing synthetic public
address; no real new public key is generated. Freeze S0 and the manifest hash in
reviewed external evidence. Missing S0/creation proof/identity is a hard STOP.

## Two anchors and non-reset contract

Layer A is `seq_live - S0`, bounded 0..3 and equal to the complete list of included
maintenance transactions. Each increment must match a reserved original hash,
the exact plain-source one-op ExtendFootprintTtl envelope, the expected sequence,
empty RW/exact reviewed RO and an included success/failure record. No unrelated
transaction, payment, bumpSequence, fee bump, alternate source or extra operation.
Captured-history mode additionally verifies an existing public master signature.

An applied failed transaction can consume sequence. A pre-inclusion rejection or
expiration may not. Included count is not successful-TTL count, and sequence is
never used as an attempt/simulation counter. History pagination/completeness,
authoritative freshness and account identity must be authenticated by a future
read adapter; `completeSinceCreation=true` alone is not external evidence.

Layer B is the append-only JSONL journal with its independently retained trusted
checkpoint. Counters are reconstructed from transitions, never accepted from a
caller. Caller reset/mismatch claims fail. The journal includes record ID, previous
hash/hash, index/time/action, RUN scope/owner gate, simulation/extend reservation,
original tx hash/status, business snapshot, counters, observed sequence, S0,
network, creation-manifest hash and tooling identities.

```text
recordHash = SHA256(UTF8(canonical(record without recordHash)))
```

Canonical JSON sorts object keys recursively, preserves array order, has no
trailing newline in the hash preimage. Records on disk each end in one newline.
The checked hash is independent of JSONL formatting. IDs/indices/context/time,
previous hash and reconstructed counter snapshots must all agree.

An independently reviewed checkpoint contains recordCount and lastRecordHash.
It is mandatory and is NOT read from an untrusted resettable counter file next
to the log. Removing a middle/tail record, reordering or modifying records is
detected against this checkpoint. A bare hash chain cannot detect rolling back
both the entire log and its checkpoint. Future live use therefore requires a
non-rollback, independently retained owner checkpoint / append-only evidence sink
with monotonic CAS acknowledgements and account-sequence/history corroboration.
This is an explicit operational prerequisite, not a solved remote storage service.
No SQL/Supabase journal or global durable service is created in this task.

## Reservations, persistence and locking

Normal transitions:

```text
SIMULATION_RESERVED -> SIMULATION_COMPLETED -> EXTEND_RESERVED
-> optional SIGNING_OBSERVED -> CONFIRMED_SUCCESS / CONFIRMED_FAILED
```

Reserve a simulation before its future side effect and an extend before signing.
Reserved simulation aborted later still consumes one slot. Fee-cap STOP consumes
its simulation reservation. UNCERTAIN, EXPIRED_NOT_INCLUDED, EXPIRED_UNRESOLVED,
REJECTED_AFTER_SIGNING and included failures never refund an extend slot. No
release, replacement, retry or rebroadcast action exists. Three of each is the
hard total. A successful later attempt needs a new reviewed RUN/scope/owner gate.

Every append requires an owned exclusive lock and the expected checkpoint. The
lock uses OS exclusive create (`wx`), process ID, random ownership token and time.
Only the same in-process capability with the same file contents can release it.
Two-process simulation and extend races prove only one writer can reserve.
An old (>120s), corrupt, abandoned or conflicting lock is never auto-broken.
Recovery requires owner review of lock/process, journal and original hashes;
the tool provides no stale-lock break/retry command or automatic takeover.

Append writes one complete line and fsyncs the journal while holding the lock.
Only then is a new checkpoint returned. A crash/torn line or unacknowledged tail
requires reviewed recovery, never silent truncation or zero initialization.
This proves local filesystem behavior; it does not claim WORM/power-loss guarantees
or prevent a privileged OS user rewriting both the journal and external anchor.

Initial business remaining is 15 (total18, previously consumed3). Maintenance does
not decrement it. A later separately reviewed business snapshot may decrease it,
with a committed bundle reference and total18; it can never reset/increase it.
Authentication of that future observation is the adapter/owner-review boundary.

## Expiration and uncertainty

EXPIRED_NOT_INCLUDED requires original hash NOT_FOUND within a retention window
covering its first possible ledger through the checked observation; closeTime
strictly greater than maxTime; sequence still seqNum-1 at/after the expiry ledger;
complete later-history non-inclusion. Otherwise EXPIRED_UNRESOLVED / STOP.
The slot remains consumed even when non-inclusion is proven.

Uncertainty resolves by the original hash only. Same-hash eventual success can add
the included sequence record but does not clear the owner-review STOP. No automatic
second attempt follows. RPC NOT_FOUND alone or outside retained history is not
proof of non-inclusion. No live queries are made by these helpers.

## Whitelist provenance

`whitelistProvenance` binds reviewed RUN/operation/Battery/Request IDs, raw envelope
network hash, typed SUCCESS result, exact footprint membership and captured header
bytes/hash to a committed canonical bundle digest. Only that RUN's Battery/Request
keys are eligible. Known retired keys and unrelated keys are rejected. SQL rows,
deployment IDs, typed key lists and manifest-only claims are insufficient.

Captured-review mode reuses the ratified signature/content verifier, requires
matching RPC/Horizon captures and a local immutable Git bundle reference/raw-file
SHA-256. It validates the exact committed JSON bytes and semantic bundle binding.
Header verification preserves the existing opaque-header strategy for protocol
extensions unsupported by the installed SDK; it does not claim validator-grade
inclusion/Merkle proof. No earlier ratified verifier is changed.

Synthetic mode deliberately uses unsigned altered public templates. Its result is
always labeled synthetic, never accepted as an existing-signature result in
captured-review mode, and never authorizes simulation/signing. Future authenticated
capture provenance and reviewed committed fresh RUN evidence remain mandatory.

## Separate future gates

`prerequisites.mjs` enumerates all creation/simulation/signing requirements. Even
passing the offline model returns liveAuthority=false. Before later authorization:

1. Creation: choose custody location, prove both real loader denials, validate
   creation schema/S0 capture, initialize append-only history/checkpoint and lock.
2. Simulation: prove account/S0/history, no unrelated transaction, journal integrity,
   durable simulation reservation, owned lock, reviewed owner gate and authenticated
   whitelist. An unreserved request cannot simulate.
3. Signing: prove durable extend reservation, exact fresh sequence, unchanged master/
   thresholds/sponsorship, custody, reviewed XDR, fee<=1XLM, <=120s timebounds,
   exact whitelist and quiet business worker. Reuse the ratified TTL XDR inspector.
4. Broadcast remains separately authorized: persist-before-send, final sequence
   recheck and original-hash reconciliation; no replacement on drift or uncertainty.

## Sources and next gate

Stellar Raven stellarDocs was consulted first:

- [Transaction lifecycle](https://developers.stellar.org/docs/learn/fundamentals/transactions/transaction-lifecycle)
  distinguishes rejection from application and sequence consumption on application.
- [Sequence preconditions](https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions#sequence-number)
  underpin the dedicated-account no-bump policy.
- [getTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction)
  documents bounded retention; absence outside that window is insufficient.

Next gate: `COUNCIL_TTL_CUSTODY_DURABLE_ACCOUNTING_OFFLINE_REVIEW`.
No account creation, key provisioning, live simulation, signing, broadcast, TTL
maintenance or RUN is authorized. No push is authorized in this task.
