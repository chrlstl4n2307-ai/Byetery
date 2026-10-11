# VOL-001 — Testnet archival / TTL assessment

Classification: VOLUNTARY PRE-SPRINT DEVELOPMENT; not funded Instaward work.
Date: 2026-10-11 / America/Santiago.
Captured UTC: 10/11/2026 21:56:21. Branch: pre-sprint/voluntary-d1.
Evaluated parent: 4a1e6fda03c6324094a91f3e2911de87518716b4, plus the then-uncommitted tool with SHA-256 729d024ccfc0b21c3ad1fe4cab6055754b6b118034b2d5affc9d62291a65ed3e.
Result: PASS as an assessment; operational readiness remains blocked by archival/fee policy.
Tests: 5/5 transport/classification/installed-SDK guard tests.

## Observed state
Protocol: 29. Initial latest ledger: 5146438. Inventory at ledger 5146438.

| Entry | Status | RPC liveUntilLedger |
| --- | --- | --- |
| byetery_instance | ARCHIVED | 0 |
| collector_role | ARCHIVED | 0 |
| recycler_role | ARCHIVED | 0 |
| historical_battery | ARCHIVED | 0 |
| historical_request | ARCHIVED | 0 |
| reward_sac_instance | ARCHIVED | 0 |
| reward_contract_balance | LIVE | 5400942 |
| byetery_code | ARCHIVED | 0 |

RPC liveUntilLedger=0 means not live; it does not recover the original expiry ledger. Known archived values remain inspectable. Unknown/not-returned entries must not be interpreted as nonexistent.
The live balance has 900000000 base units (90 GREENTEST), liveUntil 5400942 and 254504 remaining ledgers at observation. Historical battery is Recycled/Sent; request Confirmed; both role values true but archived. This is historical state, not new recycling or a new reward.
WASM read from Testnet: 19242 bytes; SHA-256 c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6, unchanged.

## Unsigned InvokeHostFunction read simulations
| Method | Observed ledger | minResourceFee (stroops) | Restore-list indices |
| --- | --- | --- | --- |
| get_config | 5146438 | 86537014 | 0, 1 |
| get_battery | 5146438 | 86966866 | 0, 1, 2 |
| get_request | 5146438 | 86754688 | 0, 1, 2 |
| has_role | 5146438 | 86660155 | 0, 1, 2 |
| balance | 5146438 | 722620 | 0 |

All five simulations succeeded and contain resourceExt restore lists. No restorePreamble was returned. Automatic Protocol-23+ restoration applies to these cases if that exact prepared restoration list is included. Simulation never makes entries live on the actual ledger.
Separate manual RestoreFootprintOp is not required by those representative simulations. The approved operational route remains NOT YET DETERMINED: Byetery read fees already exceed the unchanged 50000000-stroop signer cap; these read methods also are not signer-allowlisted mutation methods. Actual mutation fees require their own future preflight. No cap increase or policy widening was performed.
ExtendFootprintTTL does not itself restore archived entries. After approved restoration, sufficient live TTL may be extended; no sprint duration/start was invented, and the helper does not allow these administrative operations.

## SA2 comparison
Confirms SA2-02 archival/fee risk: its get_config observation was 88185189 stroops at ledger 5115641; this later observation is 86537014 at 5146438. Fees vary with time/state. The code hash/size match SA2. Update the earlier existence-only EV-012 wording as a dated observation, not retroactive proof of old archival state.

## Network boundary / sources
Only getNetwork, getLatestLedger, getVersionInfo, getLedgerEntries and simulateTransaction are allowed by this tool. Transactions submitted: 0. Restored entries: 0. TTL extensions: 0. Signatures created by VOL-001: 0. No Supabase or Mainnet access.
Inventory is limited to known contract/code/role/battery/request/SAC/balance keys, not all storage. Public ledger-key XDR is included in JSON evidence; no signed envelopes, private keys or credentials are included.

- [State archival / automatic restoration](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival#contract-data-automatic-restoration)
- [getLedgerEntries](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries)
- [simulateTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/simulateTransaction)

Reproduce: node --experimental-strip-types --test scripts/vol-001-readiness.test.mts; then node --experimental-strip-types scripts/vol-001-readiness.mts. Re-execution captures a new dated observation and may yield different fees/TTLs.
After this first package STOP before any broadcast. Instaward remains UNCONFIRMED / NOT STARTED, 0/23.
