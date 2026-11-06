# TTL maintenance offline gate — 2026-11-06

**TTL_MAINTENANCE_OFFLINE_GATE_READY**

**READY_FOR_COUNCIL_OFFLINE_GATE_REVIEW = YES**. Offline design/validation only; executionAuthorized=false. No account was created and no live simulation/signature/transaction was performed.

## Owner numerical decisions

| Policy | Value |
|---|---|
| MAX_MAINTENANCE_EXTEND_TX | 3 |
| MAX_MAINTENANCE_SIMULATIONS | 3 |
| MAX_MAINTENANCE_FEE_PER_TX | 1 XLM |
| MAX_MAINTENANCE_FEE_STROOPS | 10000000 |
| RESTORE_FOOTPRINT_PREAUTHORIZED | NO |
| MAINTENANCE_ACCOUNT_CREATE_BEFORE_RUN1 | YES |
| TARGET_UTC | 2026-11-30T23:59:00Z |
| TARGET_RESERVE_LEDGERS | 17280 |
| EXTEND_TO_POLICY | RELATIVE_TO_SIMULATION_LEDGER |
| WHITELIST_SOURCE | REVIEWED_RUN_MANIFESTS_ONLY |

Account creation before RUN1 is a future prerequisite, not authorization to create it now. The normal expected path is one fresh simulation plus one extend; three is a worst-case total, one separately justified need per RUN.

## Ratified identities preserved

- businessSha: `c6ba2e837ed0f7b81373655b8106b58ecb86a8cd`
- businessFingerprint: `e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539`
- toolingPublicationSha: `c5b8435c9682cea35be418bff451a7fa4187c2a4`
- toolingRootTree: `c1b13280787cc2cc501588ead4ba9bc161d0d670`
- toolingSubtree: `cccda6b882bba85f848064ef70d086588c65608b`
- ownerExportQuerySha256: `d4e82f4221d187aecdee7440b8331ebbe54e96d0b7400d06bc1430b8d793c9f1`

Entry branch/HEAD matched before writing. The 34 freeze files, 24 business fingerprint files, 26 ratified evidence-tool files and frozen contract checkpoint remain byte-identical. Expected WASM SHA-256 was found unchanged: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

All additions are in the new auxiliary `tools/d3-ttl-maintenance-offline/` tree and these two reports. The c5b8435c ratified root is an immutable historical identity, not the new auxiliary root. Auxiliary sources require their own Council review/pin before future use.

## Account, custody and source safety

Future dedicated Testnet account distinct from ADMIN/SERVICE/COLLECTOR/RECYCLER/Wallet A/Wallet B. No app role, frontend identity, actor mapping, sponsorship or extra subentries.

Maintenance-only secure slot with actual restricted independent loader, or separate owner-controlled local secret store inaccessible to business signer; slot naming alone is insufficient.

Required written custody invariants: BUSINESS_SIGNER_CANNOT_LOAD_MAINTENANCE_KEY=YES and MAINTENANCE_SIGNER_CANNOT_LOAD_BUSINESS_KEYS=YES. These are **NOT OPERATIONALLY PROVEN** and no seed was provisioned.

Existing expected public key; one master signer weight1, thresholds 0/0/0, flags0/homeDomain empty/no sponsorship. Fresh account and final sequence reread; reject sequence drift. Balance never overrides fees.

Business worker quiet, no active business operation, pending signing, uncertain tx or concurrent lifecycle mutation; no external maintenance source use. Application lease does not protect from external submissions.

Future signing must re-read account/sequence immediately before signing and again before broadcast. Persist before send; external sequence drift requires reviewed resolution, never auto-reprepare. No signer/dispatch implementation was added.

## Separate business/maintenance caps

At entry: 3 business tx consumed; **15 BUSINESS TX remain**, total cap 18. NON_BUSINESS_TTL_MAINTENANCE consumes zero business allowance. Offline pure transitions preserve a legitimate later business snapshot, rather than incorrectly resetting the allowance after RUN1.

Maximum three simulations and three extends separately. One normal simulation/extend expected. Reserve before future effects, one fresh separately owner-reviewed lifecycle need per attempt. No retries/replacement/rebroadcast and no repeated RUN/scope/owner gate.

The pure transition API is not a durable global budget service. Future persistent atomic reservations and cross-process no-reset enforcement must be proven before live use.

## Exact whitelist and exclusions

Exact reviewed raw RUN manifest hashes, operation IDs, Battery/Request IDs and captured confirmed footprints. Canonical byte-sorted XDR deduplication. 30 is only a theoretical ceiling; ordinary one/three completed RUNs yield two/six unique keys.

Historical and fresh operations share deployment_id. Deployment rows, broad SQL lists and arbitrary discovery cannot select scope. Known retired identifiers rejected; future adapter must authenticate reviewed source bundles independently.

Excluded: SAC pool Balance, contract instance, contract code, role/config absent new owner reapproval, classic account/trustline, temporary auth nonce, TTL companion bookkeeping, retired lifecycle.

Known shared excluded keys may be recorded when they appear in captured business footprints. None can enter maintenance simulation/final RO. Unknown/unrelated keys STOP UNKNOWN_TTL_LEDGER_KEY. Role/config has no override in this version.

## Target, config, fees and transaction guard

1000-10000 contiguous fresh observed ledgers; sample ends at latest current ledger/close time; rational arithmetic, no fixed five seconds. Projection is not a future network guarantee.

```text
currentLedger + ceil((targetUtcSeconds-currentCloseTime)*sampleIntervals/sampleSpanSeconds) + 17280
extendTo = TARGET_ABSOLUTE_LEDGER - CURRENT_LEDGER_AT_SIMULATION; <=0 means no extension; >maxEntryTTL-1 STOP without clamping.
```

Fresh actual maxEntryTTL and footprint/read/write/key/transaction size/instruction/disk limits required. Missing/unknown/stale config STOP. Fixture limits are synthetic only.

margin=max(ceil(minResourceFee/5),100000); resourceFeeBudget=minResourceFee+margin; tx.fee=inclusionFee+sorobanData.resourceFee<=10000000. Integer stroops; no balance override or cap increase.

Unsigned normal v1; one ExtendFootprintTtlOp, plain source, ext v0, no operation source override, memo, fee-bump, extra signer/auth, invocation/payment/createAccount/manageData/restore. RO exact effective approved ordered subset; RW empty.

minTime in [signingTime-30,signingTime]; maxTime>signingTime and <=signingTime+120. No missing/V2/expired preconditions.

Simulation input/result must be captured before future signing, fresh within 15 seconds / two ledgers, no auth or restore preamble, exact canonical RO order/set and RW empty. Added/removed/reordered keys STOP SIMULATION_FOOTPRINT_MISMATCH. Resource data must remain identical; final envelope reserves size for one possible future signature but remains unsigned.

## Key recheck, restore and post-execution design

Fresh full key set with matching contract/key/durability entry-data XDR, persistent/TTL-eligible/PRESENT/readable liveUntil. Remove >=target as ALREADY_ABOVE_TARGET; zero remaining -> MAINTENANCE_NOT_REQUIRED, zero tx/simulation.

Not authorized; archived/expired required key STOP TTL_KEY_ARCHIVED_OWNER_DECISION_REQUIRED. Missing presence is not proof of nonexistence. No restore builder/path.

Original hash + SUCCESS receipt + ledger/header + independently verified existing master signature + fresh matching entries at/above target and observation at/after confirmation.

Same original hash only. FAILED/EXPIRED/UNCERTAIN STOP; no rebroadcast/rebuild/replacement. Later same-hash success does not clear owner-review stop automatically.

The post-check validates consistency of supplied independently verified evidence; it does not fetch or authenticate service labels. Offline supplied observations, booleans and review refs are not authenticated chain evidence. Live adapter/provenance validation, custody access-denial proof, persistent atomic global reservation journal, signing/sending/final sequence gate all require separate review and authorization. No live readiness claim.

## Manifest and implementation files

manifest.schema.json plus relational/XDR guards: classification, both ratified identities and auxiliary identity, source manifests/IDs, LedgerKey XDR/hash, exclusions, cadence/target, config/simulation, fees, unsigned/future signed hash, pre/post TTL and separate counters. Offline signedEnvelopeHash=null, tx hash explicitly unsigned/unsubmitted.

The schema is descriptive; JSON shape alone does not establish source authenticity, fee accounting, custody or authority. Guard modules enforce the offline relational/XDR rules.

| File | Purpose |
|---|---|
| tools/d3-ttl-maintenance-offline/policy.mjs | Owner constants, identities, source/custody/quiescence, target, config, integer fee and pure budget guards |
| tools/d3-ttl-maintenance-offline/scope.mjs | Reviewed manifest/confirmed footprint bindings, exact LedgerKeys and live subset |
| tools/d3-ttl-maintenance-offline/xdr.mjs | Simulation input/result shape and unsigned TTL XDR construction/inspection |
| tools/d3-ttl-maintenance-offline/gate.mjs | Offline orchestration, post-check consistency and evidence manifest |
| tools/d3-ttl-maintenance-offline/identity.mjs | Read-only Git + pinned query/business/evidence-tool verification |
| tools/d3-ttl-maintenance-offline/audit.mjs | No network/signer/store imports; pure-XDR dependency boundary |
| tools/d3-ttl-maintenance-offline/cli.mjs | Local-only inspection with optional new ignored output directory |
| tools/d3-ttl-maintenance-offline/fixtures.mjs | Synthetic public-only fixtures and captured public historical XDR templates |
| tools/d3-ttl-maintenance-offline/gate.test.mjs | Required 48 negative + six positive cases and 18 additional controls |
| tools/d3-ttl-maintenance-offline/spec.json | Machine-readable numerical policy/trust boundary |
| tools/d3-ttl-maintenance-offline/manifest.schema.json | Evidence manifest shape |
| tools/d3-ttl-maintenance-offline/README.md | Detailed design, commands, future prerequisites and sources |

## Verification

**163/163 PASS**: 91 preserved evidence-tool tests + 72 new maintenance tests. Zero failures/skips. All new MJS syntax checks PASS, import/dependency audit PASS; demo manifests cover all 39 required fields.

The required negative cases 1–48 fail closed; required positive cases A–F pass. Cases 49–66 add custody, resource, freshness, exact parent-key, post-confirmation and same-hash uncertainty checks. Full named results are in the JSON companion.

Root npm run verify was not executed because the newer owner authorization forbids new signatures and broad business tests generate dummy signatures. Relevant offline suites were run; all frozen runtime/contract/checkpoint bytes were verified instead.

Commands:

```text
node --test --test-concurrency=1 tools/d3-evidence-capture/tooling.test.mjs tools/d3-evidence-capture/owner-export.test.mjs tools/d3-evidence-capture/identity-preflight.test.mjs tools/d3-ttl-maintenance-offline/gate.test.mjs
node tools/d3-ttl-maintenance-offline/cli.mjs --local --fixture 1
node tools/d3-ttl-maintenance-offline/cli.mjs --local --fixture 3
node tools/d3-ttl-maintenance-offline/cli.mjs --local --fixture none
```

| Synthetic demo | Observed / effective keys | Result |
|---|---|
| one | 2 / 2 | OFFLINE_GATE_PASS_NO_EXECUTION_AUTHORITY |
| three | 6 / 6 | OFFLINE_GATE_PASS_NO_EXECUTION_AUTHORITY |
| none | 6 / 0 | MAINTENANCE_NOT_REQUIRED |

Synthetic example only: target 6440628, relative extendTo 440628, final fee 150100 stroops. These are not live Testnet observations, a quote or a frozen execution target. Raw manifests/unsigned drafts/logs stay in ignored .tools. No synthetic SUCCESS is D3 completion evidence.

## No-execution audit

| Effect | Count |
|---|---|
| newStellarAccounts | 0 |
| friendbotCalls | 0 |
| liveSimulations | 0 |
| signatures | 0 |
| broadcasts | 0 |
| maintenanceTransactions | 0 |
| businessTransactions | 0 |
| ttlChanges | 0 |
| restoreFootprint | 0 |
| supabaseWrites | 0 |
| remoteSql | 0 |
| secureStoreWrites | 0 |
| deployments | 0 |
| newOperationalRunIds | 0 |

No actual RUN IDs or global operational counters were created. Fixture RUN1/2/3 labels and counter transitions are synthetic local data only. Existing D1=12/12, D2=6/6, D3=0/5, total18/23 remain unchanged.

## Git disposition

At most **one local commit**: `chore(instaward): add D3 TTL maintenance offline gate`. Include only the new auxiliary folder and these two reports after secret/PII scan, git diff --check and allowed-path review. Final commit SHA is reported in the final response/ignored local receipt; it cannot be embedded in its own contents. **No push**. No main merge or tag changes. The nine earlier untracked artifacts remain intact and excluded.

## Sources and next gate

Stellar Raven stellarDocs was consulted first; installed official SDK17.0.1 pure-XDR definitions were inspected. Detailed state-archival semantics define relative extendTo and RO/RW behavior.

- [Official Stellar documentation](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
- [Official Stellar documentation](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction)
- [Official Stellar documentation](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering)
- [Official Stellar documentation](https://developers.stellar.org/docs/learn/fundamentals/transactions/signatures-multisig)

**Next gate: COUNCIL_TTL_MAINTENANCE_OFFLINE_GATE_REVIEW.**

**STOP.** No maintenance account/Friendbot/funding/live simulation/signing/broadcast/TTL change/restore/RUN1 is authorized or initiated. Digital/on-chain attestations do not independently prove physical recycling.
