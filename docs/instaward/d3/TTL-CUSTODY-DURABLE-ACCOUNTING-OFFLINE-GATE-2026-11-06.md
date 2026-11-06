# TTL custody and durable accounting offline gate — 2026-11-06

Task: TTL_CUSTODY_AND_DURABLE_ACCOUNTING_OFFLINE_GATE.

**TTL_CUSTODY_DURABLE_ACCOUNTING_OFFLINE_GATE_READY**. Execution authorized: **NO**. This is a separate control-tool candidate for Council review, not live authority.

## Current offline results

```text
CUSTODY_ISOLATION_DESIGNED = YES
BUSINESS_SIGNER_CANNOT_LOAD_MAINTENANCE_KEY = ENFORCED_OFFLINE
MAINTENANCE_SIGNER_CANNOT_LOAD_BUSINESS_KEYS = ENFORCED_OFFLINE
SEQUENCE_ANCHOR_MODEL = S0 + LIVE_SEQUENCE
APPEND_ONLY_ATTEMPT_LOG = READY_OFFLINE
COUNTERS_RECONSTRUCTED_FROM_HISTORY = YES
EXCLUSIVE_RESERVATION_LOCK = READY_OFFLINE
WHITELIST_ONCHAIN_PROVENANCE_MODEL = READY_OFFLINE
ACCOUNT_CREATION_AUTHORIZED = NO
LIVE_SIMULATION_AUTHORIZED = NO
SIGNING_AUTHORIZED = NO
READY_FOR_COUNCIL_REVIEW = YES
```

## Ratified identities preserved

- businessExecutionSha: `c6ba2e837ed0f7b81373655b8106b58ecb86a8cd`
- businessFingerprint: `e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539`
- evidenceToolingSha: `c5b8435c9682cea35be418bff451a7fa4187c2a4`
- evidenceToolingSubtree: `cccda6b882bba85f848064ef70d086588c65608b`
- ttlAuxToolingSha: `2d10ee2558b4dd0f7f2ff3a1732dbd1b03b1a0df`
- ttlAuxRootTree: `1b99ccc5c67c9af333d3708ee4632133b9535846`
- ttlAuxSubtree: `31b9651d2e6383b4c0d857a56ae7f90cc6300efa`
- ownerExportQuerySha256: `d4e82f4221d187aecdee7440b8331ebbe54e96d0b7400d06bc1430b8d793c9f1`
- wasmSha256: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`

Entry HEAD, both immutable trees, all installed ratified files, business fingerprint, 34 freeze files, 10 contract checkpoint files and WASM matched before changes. The earlier nine untracked artifacts remain unchanged/excluded. No ratified source needed modification.

## Custody and loader isolation

Owner-controlled local store outside every repo; separate provider ID/namespace/restricted OS principal from business. Configuration metadata only; no actual provider, principal, ACL or store provisioned.

Fixed BUSINESS and MAINTENANCE wrappers; WeakMap-branded synthetic scoped ports; opposite role/namespace and forged JSON denied. AST imports/re-exports/literal require/dynamic import traversal; cross-import/unrestricted accessor/helper/computed imports denied. Actual current business signer graph parsed read-only, not executed.

Never repo, Slack, Vercel, frontend env, Supabase, logs/reports or fixtures. Non-local providers, forbidden path components and existing .git ancestors rejected; only design metadata examined.

The concrete future model uses independent restricted process principals/providers and no generic cross-namespace secret broker. Config holds only location/access metadata; this task creates no store path, principal, ACL or key. Synthetic port factories only mint non-secret handles. Operational two-way denials must be demonstrated separately.

## Creation schema and S0

creation.schema.json / creationManifest: public maintenance key, network ID, creation ledger/hash/timestamp, observed S0, master/weight/thresholds/sponsorship, Friendbot source, owner reference, business/evidence/TTL identities. Synthetic reused public address; no real key generation.

Freeze independently observed initial post-creation sequence and creation-manifest hash. Do not infer attempt count from sequence alone.

The schema names fundingSource=Friendbot as future evidence metadata; Friendbot calls=0. No real public key/keypair was generated; fixtures reuse previously synthetic public bytes/address.

## Double anchor, journal and non-reset

0 <= seq_live-S0 <=3; equals all included maintenance SUCCESS+FAILED records. Exact contiguous sequence/hash/envelope/source/RO/RW correlation. Captured mode verifies existing master signature. No unrelated account activity, bumpSequence, payment, fee bump or extra op.

Future authenticated adapter must prove complete pagination from S0/creation, with the known creation/funding transaction separately verified as the base event. No other incoming/unrelated tx may be hidden. Offline completeSinceCreation labels are not network evidence.

record ID/previous hash/hash/index/time/action, RUN/scope/owner gate, simulation and extend reservation IDs, original hash/status, business remaining, all counters, sequence/S0/network/identities/creation hash/detail. Unknown release/retry/replacement/rebroadcast actions fail.

SHA256(UTF8(canonical(record without recordHash))); recursive sorted object keys, array order preserved, no LF in hash preimage. Every record binds previous hash and exact reconstructed counters.

Mandatory independently retained trusted checkpoint (count and tip hash), reconstructed transitions plus correlated sequence/history. Claims never seed counters; zero/reset/mismatch rejects. A bare hash chain cannot prove rollback resistance if an attacker can rewrite both log and trusted checkpoint.

Append one JSONL line and fsync while holding owned lock, then return checkpoint. Missing expected journal, torn writes, changed trusted tip or unacknowledged tail STOP. Not a WORM/power-loss or privileged-OS tamper-proof storage claim.

The trusted checkpoint must be external to resettable caller counters and independently retained. Rewriting both checkpoint and journal cannot be detected by a bare hash chain. This boundary remains a live-use blocker; the offline tests prove detection against the supplied trusted anchor, not protection from an administrator of the entire host.

At entry total18/consumed3/remaining15. Maintenance does not decrement business count. Optional separately reviewed business snapshot may decrease remaining with bundle hash/owner ref and total18, never increase/reset. Future authenticity adapter required.

## Lock and reservation semantics

OS exclusive create wx before any reservation, PID + random ownership token + timestamp; in-process capability/file-content match required. Two real child-process contention tests. Stale/corrupt/abandoned lock STOP, no silent break or retry command.

SIMULATION_RESERVED before simulation; SIMULATION_COMPLETED before EXTEND_RESERVED; extend reserved before signing. Aborted simulation/fee STOP consumes simulation; failed/uncertain/expired/rejected-after-signing consumes extend permanently. Maximum3 each, distinct RUN/scope/owner gate.

The two-process tests exercise actual exclusive files and journal writes for simulation and extend contention. No database or signer worker is used. Existing/corrupt/stale locks remain fail-closed; there is no automatic stale-lock recovery tool.

## Expired and uncertain accounting

EXPIRED_NOT_INCLUDED needs original hash NOT_FOUND within retention covering firstPossibleLedger to observation, closeTime>maxTime, sequence=seqNum-1 at/after expiry ledger and complete later non-inclusion. Otherwise EXPIRED_UNRESOLVED; all outcomes consume reserved slot and STOP.

Same original hash only; no rebroadcast/replacement. Eventual same-hash inclusion may update sequence but never clears owner-review STOP automatically.

A confirmed included failure counts in the sequence anchor even though TTL success is not obtained; invalid pre-inclusion rejection can leave sequence unchanged. This distinction follows the official transaction lifecycle and preserves all attempt slots.

## Whitelist provenance

Reviewed RUN/op IDs + exact battery/request + network-bound envelope hash + typed SUCCESS result + public signature/content verifier in captured mode + exact Battery/Request footprint + committed canonical bundle digest and immutable Git raw-file SHA256. SQL/deployment/manual key lists insufficient; historical/unrelated keys rejected.

Synthetic mode is unsigned and cannot pass captured-review signature checks. Captured verification reuses existing opaque ledger-header handling; no unsupported SDK-header decode or validator-grade inclusion claimed. Authenticated live capture/committed fresh RUN evidence still required.

Captured-review mode requires a reviewed immutable Git commit/path and raw-file SHA-256, decodes its exact JSON and compares the semantic bundle. Synthetic fixtures cannot substitute for those real provenance prerequisites. Header/content verification remains service-corroborated, not a validator-grade cryptographic inclusion proof.

## Separate future prerequisites

### Account creation

- choose custody location
- isolate maintenance loader
- prove actual business loader denial
- synthetic access-denials pass
- creation schema ready
- S0 recording ready
- append-only journal/checkpoint ready
- hash-chain validator ready
- exclusive lock ready

### Live simulation

- account matches frozen creation manifest
- S0 frozen
- current sequence/history correlate with journal
- no unrelated history
- journal/checkpoint integrity
- durably reserved simulation slot
- actual owned exclusive lock
- owner gate matches reservation
- authenticated reviewed whitelist

### Signing

- durable extend reservation
- exact freshly reread sequence/no drift
- operational signer isolation
- one master only
- unchanged thresholds/no sponsorship
- XDR matches reviewed simulation
- fee<=10000000 stroops
- maxTime<=signingTime+120s
- exact RO and empty RW
- quiet business worker

Separate future gate only: persist-before-send, final sequence check, original-hash reconciliation; changed sequence -> reviewed resolution, never auto-reprepare.

The prerequisite helpers validate the offline model and return liveAuthority=false. They are not account creation, simulation, signing or broadcast endpoints.

## Tests and reproduction

**240/240 PASS; zero failures and zero skips**. Preserved: 91 evidence-tool + 72 ratified TTL-aux tests. New control suite: 77 = 48 required negatives + nine positive cases + 20 additional controls.

The negative matrix covers loader crossings/generic access, unsafe storage/secret fixture rejection, missing creation/S0/hash, chain removal/tamper/reorder/IDs, counter resets, sequence/history/source/operation mismatches, reservation ordering, retained abort/uncertain/expired slots, retry/replacement/rebroadcast, real process races, stale lock, owner gate, provenance and all expiration evidence parts. The JSON companion lists every test name.

Positive cases A–I cover isolated handles, creation/S0 metadata, one simulation, exact included increment, expiration without sequence consumption, two/three extends with cap, fresh-process reconstruction and exact committed footprint bindings. Additional tests verify included failure, fee STOP, external tip rollback detection, unsigned/captured separation, held lock capability, schemas and reviewed business snapshots.

```text
node --test --test-concurrency=1 tools/d3-evidence-capture/tooling.test.mjs tools/d3-evidence-capture/owner-export.test.mjs tools/d3-evidence-capture/identity-preflight.test.mjs tools/d3-ttl-maintenance-offline/gate.test.mjs tools/d3-ttl-maintenance-control-offline/control.test.mjs
node tools/d3-ttl-maintenance-control-offline/cli.mjs --local
```

Syntax and installed import audit PASS. Reused installed TypeScript6.0.3 AST parser; no dependencies installed or updated. Root npm run verify was not run because broad business tests create dummy signatures, forbidden by this newer authorization. Frozen code/checkpoint hashes and relevant offline suites were verified.

## Files

All implementation, synthetic fixtures, schemas, tests, CLI and README are under `tools/d3-ttl-maintenance-control-offline/`. This report and its JSON companion are the only documentation additions. File hashes are in the JSON. No runtime, frontend, contract/WASM, migration, Supabase, old evidence tooling or old TTL tooling change.

## Known operational boundaries

- Operational provider/OS-principal/ACL two-way access denials are NOT proven or provisioned.
- Independently retained non-rollback checkpoint/append-only acknowledgement service must be selected and proven before live use; local fsync is not WORM.
- Future RPC/Horizon freshness, complete account history, creation/S0 and committed fresh RUN capture authenticity are not proven by supplied JSON labels.
- Real creation/funding, simulation, signing/final source sequence/broadcast remain separately authorized gates; no implementation or execution authority here.

## No-execution audit

| Effect | Actual count |
|---|---|
| newStellarAccounts | 0 |
| realKeypairsGenerated | 0 |
| realSeedsGenerated | 0 |
| realSeedsStored | 0 |
| friendbotCalls | 0 |
| funding | 0 |
| liveSimulations | 0 |
| signatures | 0 |
| broadcasts | 0 |
| maintenanceTransactions | 0 |
| businessTransactions | 0 |
| ttlMutations | 0 |
| restoreFootprint | 0 |
| supabaseWrites | 0 |
| remoteSql | 0 |
| secureStoreWrites | 0 |
| deployments | 0 |
| operationalRunIds | 0 |

Journal/lock files and fixture labels are local synthetic test artifacts; no operational RUN IDs or global live counters were created. Project acceptance remains D1=12/12, D2=6/6, D3=0/5, total18/23.

## Commit disposition

At most one local tooling/docs/tests commit after final secret/PII, whitespace, scoped-path and immutable-file checks: `chore(instaward): add D3 TTL custody and durable accounting gate`. No push, merge or tags. Actual commit SHA is reported in the final response and ignored local receipt; embedding the SHA into its own tracked report would be self-referential. The report captures pre-commit validation.

## Sources and next gate

Stellar Raven stellarDocs was consulted before protocol decisions. Application consumes sequence even if an operation fails; pre-inclusion rejection may not. RPC retention must be considered before interpreting NOT_FOUND.

- [Official Stellar documentation](https://developers.stellar.org/docs/learn/fundamentals/transactions/transaction-lifecycle)
- [Official Stellar documentation](https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions#sequence-number)
- [Official Stellar documentation](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction)

Next gate: **COUNCIL_TTL_CUSTODY_DURABLE_ACCOUNTING_OFFLINE_REVIEW**.

**STOP.** Account creation, real key generation/storage, funding/Friendbot, live simulation, signing/broadcast, TTL mutation/restore, RUNs, remote SQL/Supabase, Secure Store and deployments remain unauthorized.
