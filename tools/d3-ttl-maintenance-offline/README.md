# TTL maintenance — offline gate design

This is a separate auxiliary tool. It does not change the ratified evidence
tool subtree, business runtime, signer, contract, WASM or migrations. It has no
RPC/Horizon/HTTP client, account generator, funding operation, signing function,
Secure Store access or dispatch path. Every result has executionAuthorized=false.

## Owner decisions

| Decision | Hard policy |
|---|---|
| Classification | NON_BUSINESS_TTL_MAINTENANCE |
| Remaining business cap at entry | 15 business tx; 3 previously consumed, total cap 18 |
| Maintenance extends | At most 3 total, separately justified; no retries/replacements |
| Maintenance live simulations | At most 3 total; one per potential extend |
| Fee per maintenance transaction | At most 10,000,000 stroops = 1 XLM |
| RestoreFootprint | NOT preauthorized; no normal restore builder/path |
| Maintenance account before RUN1 | Required as a future prerequisite; NOT created here |
| Reviewer target | 2026-11-30T23:59:00Z |
| Reserve | 17,280 ledgers |
| Normal expected path | One fresh simulation plus one ExtendFootprintTtlOp |

Three extends are a worst-case ceiling, one independently reviewed lifecycle need
per RUN if necessary. They are not three retries. An aggregate extend covering
three RUNs uses one slot, then cannot reuse those RUNs under this allowance.

## Local use

Reuse existing locked Node/backend dependencies; no installation needed:

```text
node --test --test-concurrency=1 tools/d3-ttl-maintenance-offline/gate.test.mjs
node tools/d3-ttl-maintenance-offline/cli.mjs --local --fixture 1
node tools/d3-ttl-maintenance-offline/cli.mjs --local --fixture 3
node tools/d3-ttl-maintenance-offline/cli.mjs --local --fixture none
node tools/d3-ttl-maintenance-offline/cli.mjs --local --input .tools/reviewed-offline-observations.json --out .tools/ttl-maintenance-new-review
```

Fixtures use deterministic **public bytes only**, synthetic manifests, observations,
cadence, limits and unsigned XDR. No keypair/private key is generated, no Stellar
account exists because of a fixture, and no synthetic SUCCESS is real D3 evidence.
The example absolute ledger/fee is not a live Testnet target/quote. Outputs must
be a new ignored directory under .tools; they are never overwritten.

The CLI verifies the immutable ratified c5b8435c commit/root/subtree, its installed
26 evidence-tool files, frozen business fingerprint and pinned owner-export query.
This auxiliary tool has its own commit/tree/file identities and must be separately
reviewed before future use. It is not part of the earlier c5b8435c tooling tree.

## Dedicated account and custody separation

Future account must be Testnet-only, dedicated to TTL maintenance, distinct from
ADMIN/SERVICE/COLLECTOR/RECYCLER and Wallet A/B. No app role, frontend identity,
business actor mapping, sponsorship or unrelated subentries. Exactly one master
Ed25519 signer, weight 1, thresholds low/medium/high 0, no extra signer, flags or
home-domain mutation. Read existence, key, full signer/threshold/sponsorship state,
sequence and observational balance from authoritative account data. Balance is
recorded as evidence; it never overrides the fee cap.

Required written invariants:

```text
BUSINESS_SIGNER_CANNOT_LOAD_MAINTENANCE_KEY = YES (required by design)
MAINTENANCE_SIGNER_CANNOT_LOAD_BUSINESS_KEYS = YES (required by design)
```

No maintenance seed exists/is provisioned by this tool. The invariants are NOT
claimed as operationally proven here. Future custody may use a maintenance-only
secure slot or a separate owner-controlled local secret store, but must demonstrate
both access denials. Merely choosing another slot name is insufficient if the same
loader can enumerate/export/load all slots. Use independent restricted loaders,
allowlists and actual provider/OS access boundaries or an owner-controlled store
inaccessible to the business signer. No generic business-key reader in maintenance,
no maintenance-key reader in business, no seed export, logs, repo or frontend access.
Custody/access-denial tests and account creation need a later explicit owner gate.

Immediately before future signing, re-read sequence and account state; reject any
change. Never assume an application lease protects against external workflows.
Persist any later signed envelope before sending, and perform the final source
sequence check before broadcast; a changed sequence requires reviewed resolution,
not re-preparation. No implementation of signing/sending is supplied here.

## Reviewed scope and whitelist

deployment_id alone is **never** a fresh-run selector. Historical and fresh data
share it. Only exact owner-reviewed RUN manifests, their raw file hashes and
operation/Battery/Request IDs, matched against captured confirmed footprints, may
define scope. No DB listing, arbitrary operation discovery or SQL source mode.

deriveWhitelist checks the exact source bytes/hash, frozen business/network/contract,
complete five-operation order and IDs, exact capture identity/hash/ledger/context,
no unreviewed/duplicate operation, and distinct run/Battery/Request IDs. Known retired
lifecycle IDs and historical transaction hashes are quarantined. It extracts only
the expected persistent Battery(id)/Request(rid) parent LedgerKeys. It preserves
every observed binding, deduplicates exact XDR bytes, sorts them bytewise and hashes
the canonical ordered list. Maximum theoretical bound 30 is a ceiling, not a static
whitelist; ordinary completed one/three RUN fixtures yield two/six unique keys.

Known shared keys in business footprints are recorded as excluded: SAC Balance,
instance, code, role/config, classic accounts/trustlines, auth nonces and TTL
bookkeeping. Role/config need a separately reapproved policy to be eligible; this
tool offers no override. Unknown/unrelated keys STOP UNKNOWN_TTL_LEDGER_KEY.
No excluded key is allowed in the maintenance simulation or final readOnly set.

Live adapter must normalize only independently verified, committed capture bundles
and reviewed manifests. Source labels/JSON booleans alone do not prove chain truth.
The present gate validates offline consistency and exact scope; it does not fetch,
attest or approve real run evidence. Synthetic input is always explicitly labeled.

## Target, cadence and current network config

Use a fresh current ledger/close time and approximately the latest 1,000 contiguous
ledgers. This version requires at least 1,000 (at most 10,000); a shorter alternative
sample needs separate policy review. Check monotonic close times, contiguous ledger
numbers, and sample ending at the observed current ledger/close time. No fixed
five-second cadence. With rational arithmetic:

```text
intervals = sampleCount - 1
spanSeconds = lastCloseTime - firstCloseTime
futureLedgers = ceil((targetUtcSeconds - currentCloseTime) * intervals / spanSeconds)
TARGET_ABSOLUTE_LEDGER = currentLedger + futureLedgers + 17280
extendTo = TARGET_ABSOLUTE_LEDGER - CURRENT_LEDGER_AT_SIMULATION
```

The observed-cadence projection is not a guarantee of future network cadence.
Recalculate from fresh evidence before later signing. Reject invalid/past targets
and invalid samples. Relative extendTo <= 0 means no extension; if above
maxEntryTTL - 1, STOP without clamping. No future live absolute ledger is frozen
by the synthetic examples.

Future live adapter must capture actual current config XDR/values, ledger/time and
protocol version. Normalized mandatory fields: maxEntryTTL, maxFootprintEntries,
maxReadEntries, maxWriteEntries, maxTxBytes, maxKeyBytes, maxInstructions,
maxDiskReadBytes, maxWriteBytes. Missing/unknown/stale config fails closed. No default
network limits are used. Current SDK examples of source fields are
StateArchivalSettings.maxEntryTtl, ledger-cost limits and txMaxFootprintEntries,
bandwidth txMaxSizeBytes and compute/key-size limits; a protocol mapping change
needs review, not a silent fallback. The adapter must account for the applicable
disk-read/footprint limits conservatively. Fixture limits are not network facts.

## Pre-sign key recheck and simulation

Future getLedgerEntries must re-read every reviewed key immediately before signing.
This version requires snapshots within 15 seconds and at most two ledgers of the
current observation; stale latest close time also fails. Inputs must be persistent,
present/TTL-eligible, with readable liveUntil and entry-data XDR whose contract/key/
durability match the exact parent LedgerKey. Proven archival or expired liveUntil
STOP TTL_KEY_ARCHIVED_OWNER_DECISION_REQUIRED. Missing/unknown presence STOP; omission
is not proof of non-existence or authorization to restore.

Remove liveUntil >= target keys and record ALREADY_ABOVE_TARGET. If none remain,
return MAINTENANCE_NOT_REQUIRED: zero tx and no signing. The approved effective
readOnly set is this exact remaining subset; readWrite is empty. Capture simulation
input and result before any future signing. Verify the original unsigned input's
source/sequence/type/extendTo/timebounds/scope, returned Soroban data, minResourceFee,
no auth/restore preamble and exact ordered set. Any added/removed/reordered key,
resource change or excluded key STOP SIMULATION_FOOTPRINT_MISMATCH. If a recheck
changes the subset after simulation, STOP; do not silently rebuild/resimulate.

## Transaction/fees/timebounds

Only unsigned normal TransactionEnvelope v1, one ExtendFootprintTtlOp, plain source
account, no operation source override, memo, fee bump, extra signer/authorization,
invokeHostFunction, payment, createAccount, manageData or restore. Extension v0 and
empty readWrite; unknown resource/transaction extensions STOP. Relative extendTo
must match the simulation ledger and target exactly.

```text
margin = max(ceil(minResourceFee * 0.20), 100000)
resourceFeeBudget = minResourceFee + margin
tx.fee = explicit inclusionFee + sorobanData.resourceFee
sorobanData.resourceFee = resourceFeeBudget
tx.fee <= 10000000
```

Integer stroops only. Cap applies to the final total fee, not account balance or
resource fee alone. No automatic cap increase. Enforce current footprint/resource/
size limits, including the anticipated 72 encoded bytes for one future Ed25519
DecoratedSignature; actual signed size must be checked again by the future signer.

Explicit timebounds: minTime no more than 30 seconds behind signing time and not
in the future; maxTime after signing and no later than signing +120 seconds.
Missing/V2 preconditions, expiration, changed source sequence or account state STOP.

## Separate budget and uncertainty

Pure immutable budget transitions reserve a simulation before its future side
effect and an extend slot before future signing/dispatch. Used/reserved slots are
never automatically refunded after errors, cancellation or uncertainty. Validate
the initial 3 consumed /15 remaining business snapshot, or a later legitimate
snapshot summing to the same total cap 18; maintenance leaves it unchanged.

Each new maintenance attempt requires a distinct exact lifecycle scope, distinct
owner gate and previously unmaintained RUN(s). Both counters cap at 3. Repeated
scope/RUN/gate, retry, replacement or rebroadcast is refused. Any failed/expired/
uncertain result stops further attempts. Uncertainty can only be observed using
the original transaction hash; even later same-hash success does not automatically
clear the owner-review stop. No retry/second maintenance path is implemented.

These are offline transitions, NOT a durable global budget service. Before any
future live adapter is authorized, it must prove atomic, persistent counters/
reservations, no reset/replay across processes and source quiescence. This task
does not implement a network runner or persistent operational journal.

## Post-check and evidence manifest

Design: use the original hash, SUCCESS receipt, ledger/header corroboration and
independently verified existing master signature. Re-read all selected keys;
every key must be present and at/above the target, with a matching entry XDR and
observation ledger no earlier than confirmation. CONFIRMED_FAILED, expired or
unresolved uncertainty STOP; no re-broadcast. The helper checks supplied verified
proof consistency; it does not itself query services or authenticate those proof
labels. That live evidence adapter remains a future separately reviewed component.

manifest.schema.json and evidenceManifest cover classification, both identities
plus the auxiliary guard identity, maintenance public key, RUN/source manifests,
operation/Battery/Request IDs, exact baseline/effective LedgerKey XDR/hash, excluded/
already-sufficient entries, simulation input/result/config, cadence/target/relative
extendTo/maxEntryTTL, fee/margin/accounting, unsigned and future signed envelope
hashes, transaction hash, pre/post TTL, and separate cap counters. Offline outputs
leave signedEnvelopeHash null and label the tx hash as an unsigned/unsubmitted body.
Digital attestations do not independently prove physical recycling or acceptance.

## Sources and next gate

Stellar Raven stellarDocs was consulted first. The precise
[state-archival semantics](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
describe the relative TTL argument and footprint behavior. Fee accounting follows
[Stellar transaction resources](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction)
and [fees](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering).
Default signer/threshold policy follows [signatures and multisig](https://developers.stellar.org/docs/learn/fundamentals/transactions/signatures-multisig).
Installed official SDK 17.0.1 pure XDR definitions were inspected; no new package.

Next gate: **COUNCIL_TTL_MAINTENANCE_OFFLINE_GATE_REVIEW**. Provisioning/custody,
network reads/simulation, funding, signing, maintenance or RUN1 all require later
explicit owner authorization. This task authorizes none of those actions.
