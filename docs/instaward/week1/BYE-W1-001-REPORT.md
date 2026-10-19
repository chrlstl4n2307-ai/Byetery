# BYE-W1-001 — Testnet State Readiness

Date: **2026-10-19**, America/Santiago. Classification: **OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT**.
Result: **PARTIAL**, with **23/25 PASS, 2/25 PARTIAL, 0/25 BLOCKED**. No official acceptance criterion changed: D1 0/12, D2 0/6, D3 0/5, TOTAL 0/23.

## Result and precise limitation
Known Testnet state, integrity, TTL and five read calls pass. Only the registration business probe succeeds with a new ID. The four successor operations fail with **BatteryNotFound (#3)** because simulation does not persist the registration. This is a fixture/scope limitation, not evidence of a broken contract or an excessive fee. Their fees and success authorization lists are **unavailable**, not zero, not the old read fees and not inferred from earlier VOL work.
Two distinct SERVICE + COLLECTOR requirements are confirmed in frozen Rust lines283–284 and deployed ABI; a successful fresh RPC dual-auth result is **not demonstrated**. No independent human custody claim.

## Git boundary and protected local file
Branch: instaward/d1-testnet-integration. Starting HEAD: `349ee3fd78104f3c249b3052b1cca402c9d99ff3`.
Sprint-start tag: instaward-sprint-start-v1 → 349ee3fd78104f3c249b3052b1cca402c9d99ff3; object8d87621b3c24fefaab4ea44771445007ba46e9a1.
Historical pre-instaward-baseline-v1 → 450c21b151a0973064986327f09d55e4f36c43e0; objectde9c9c284427aa339cb775a56ee5c3a27cb324fe.
Neither tag moved. tools/sync_obsidian.py remains untracked, unmodified and excluded from commit; SHA256 `48404b9431a9d955fc4af0b2eeaf9a59bb2fb0e9457eed73b4f2f66132a5e2da`.
The evidence commit is identified by Git/Notion after creation; it is intentionally not embedded circularly in its own contents. Final source hashes are in the JSON.

## Current network observation
Network: Stellar Testnet. Passphrase: Test SDF Network ; September 2015.
RPC: https://soroban-testnet.stellar.org. Protocol: **29**. RPC version: `29.0.1-055dc9c7a9a9e038c6807a555c09bd94b85c9e2c`.
Initial latest ledger: **5280587**, closeTime1792426522 (2026-10-19T16:15:22.000Z); capture2026-10-19T16:15:38.709Z.
Inventory/accounts ledger5280590; closing unchanged-state ledger**5280591**. This is a short observation window, not one atomic multi-call snapshot.
Cadence: on-chain configSettingScpTiming / contractScpTiming ledger target **5000ms** (settings observed ledger5280590); not a measured long-run average.

## Deployment and inventory
Contract: `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`.
SAC: `CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G`.
Asset: GREENTEST / issuer`GCHROKHXHL4L635J6Y6DWFFD5DDHABOAF4BP5TEUZDZQMW4XYS6DIDL7`; SDK-derived SAC matches configured/deployed token. Both IDs unchanged.
Deployed code bytes SHA256: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`, matches expected frozen value. Instance executable points to that same code. No rebuild/redeploy.

| Entry | State | liveUntilLedger | Remaining at inventory read | Last modified | Value/code hash unchanged vs VOL-004 |
| --- | --- | --- | --- | --- | --- |
| byetery_instance | LIVE | 6703017 | 1422427 | 5147800 | YES |
| collector_role | LIVE | 6703017 | 1422427 | 5147800 | YES |
| recycler_role | LIVE | 6703017 | 1422427 | 5147800 | YES |
| historical_battery | LIVE | 6703017 | 1422427 | 5147800 | YES |
| historical_request | LIVE | 6703017 | 1422427 | 5147800 | YES |
| reward_sac_instance | LIVE | 6703017 | 1422427 | 5147800 | YES |
| reward_contract_balance | LIVE | 6703017 | 1422427 | 4882600 | YES |
| byetery_code | LIVE | 6703017 | 1422427 | 5147800 | YES |

Roles remain true; historical Battery=Recycled/reward=Sent; Request=Confirmed with original recipient. Exact ScVal/code fingerprints match VOL-004 before **and after** all preflights. Contract balance freshly read **900000000 base units = 90 GREENTEST**. No overwriting historical expectations.

## TTL sufficiency and maintenance decision
Owner deadline2026-11-13, America/Santiago. Buffer includes seven full days Nov14–20; required through **2026-11-21T00:00:00-03:00 exclusive** (Nov21 03:00UTC).
Using ledger5280587/closeTime1792426522 and on-chain target5seconds: required target ledger**5841283**. Earliest required liveUntilLedger**6703017**, remaining1422430 at initial ledger.
Estimated end at unchanged5second cadence: **2027-01-09T23:51:12.000Z**. Covers deadline+buffer comfortably. These are explicit estimates; changes in cadence/settings or Testnet resets can invalidate the projection. Inventory covers the eight known entries only, not future batteries/requests.
**Maintenance required now: NO. Maintenance transactions submitted: 0.** No new restore/extend quote is necessary; do not duplicate VOL-004 to generate funded transactions.

## Relevant accounts and source safety
All values are public and freshly read. Balances in XLM stroops, not GREENTEST:

| Purpose | Address | Current sequence | Native balance stroops | Observation ledger |
| --- | --- | --- | --- | --- |
| admin | GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F | 20970216477425669 | 99953154529 | 5280590 |
| service | GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX | 20970220772392963 | 99999783304 | 5280590 |
| collector | GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V | 20970225067360256 | 100000000000 | 5280590 |
| recycler | GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2 | 20970233657294849 | 99999960266 | 5280590 |
| recipient | GCOEEZR6CA4TU2WK7ZNAS6AJGHQH7NGYWKO7HZ3HQIF7EJATGLBNKOUZ | 20970242247229443 | 99017039163 | 5280590 |

Accounts are **not proved dedicated**; external/manual use remains UNCONFIRMED. Source assumptions: ADMIN for register, SERVICE for open/collect/reward, RECYCLER for recycling; COLLECTOR is the distinct address authorization in collection. The historical recipient was VOL-004 payer, not the configured app signer. Prefer a dedicated future source where practical.
A Byetery SQL lease cannot stop external/manual submissions. Reread authoritative sequence immediately before future broadcast; drift from persisted preparation means **NO BROADCAST, NO automatic reprepare, reviewed resolution**. This probe reserves no sequence, signs nothing and submits nothing.

## Five unsigned read simulations
authMode=record, 10000 classic fee assumed for construction; no envelope signatures. All five returned no restore preamble and an empty automatic restore list.

| Method | Simulation ledger | Current minResourceFee stroops | VOL-004 historical comparison | Restore preamble | Result |
| --- | --- | --- | --- | --- | --- |
| get_config | 5280590 | 7093 | 14247 | NO | SIMULATION_SUCCESS |
| get_battery | 5280590 | 8002 | 16078 | NO | SIMULATION_SUCCESS |
| get_request | 5280590 | 7169 | 14406 | NO | SIMULATION_SUCCESS |
| has_role | 5280590 | 6842 | 13749 | NO | SIMULATION_SUCCESS |
| balance | 5280590 | 6515 | 13048 | NO | SIMULATION_SUCCESS |

New fees differ from VOL-004; the recorded RPC version also changed (29.0.0 then vs29.0.1 now). No causal claim about exact fee difference is made without a fee-schedule analysis. These reads do not measure mutation fees.

## Five business probes, without signed envelopes or submission
Fresh battery`BYE-SPRINT-PREFLIGHT-932DE52771`; CSPRNG request`6bb8384a0e9b27180e07b7c267dc917c1f969604f1917f148647252864ede0b3` (32bytes). Never reused historical IDs. Exact typed arguments came from deployed-WASM ABI and frozen Rust. Argument XDR hashes, actor addresses, sources, resource footprint/instructions/IO and results are in JSON. No unsigned transaction XDR or auth XDR/signatures retained.

| Method | Simulation ledger | minResourceFee | +classic10000 | Auth entries | Result |
| --- | --- | --- | --- | --- | --- |
| register_battery | 5280590 | 410723 | 420723 | 1 | PASS |
| open_return | 5280590 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | PARTIAL: BatteryNotFound #3 |
| confirm_collection | 5280590 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | PARTIAL: BatteryNotFound #3 |
| confirm_recycling | 5280590 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | PARTIAL: BatteryNotFound #3 |
| pay_reward | 5280591 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | PARTIAL: BatteryNotFound #3 |

register_battery: ADMIN source, one source-account authorization entry, no restore list;819076instructions, diskReadBytes0, writeBytes428.
open_return: SERVICE and verified recipient argument, predecessor Registered required.
confirm_collection: SERVICE source + COLLECTOR address, matching open request and Returned battery required.
confirm_recycling: RECYCLER, matching Confirmed request and Collected battery required.
pay_reward: SERVICE, Recycled/Pending battery and confirmed request required.
The latter four stop at BatteryNotFound. Consequently **SERVICE + COLLECTOR successful RPC structure is PARTIAL/not observed**, not two observed auth entries. Existing native tests and VOL-002 offline signatures are supporting history only.

After successful register simulation, fresh battery/request lookup returned no entries at ledger5280591. This supports nonpersistence in this probe; generic missing responses must still never be treated as permission to reuse identifiers or issue rewards. All original known-state fingerprints remained unchanged.

## Signer cap decision
Current cap **50000000stroops**, unchanged. Highest successful application quote: register_battery **410723resource +10000classic =420723total**. This single observed operation is below cap. Four remaining normal-success fees are unavailable.
**All normal operations below cap: NOT ESTABLISHED.** Keep current setting unchanged; no basis to raise it or to assert full suitability. Full cap assessment/readiness remains PARTIAL.

## Focused checks and security
- BYE-W1-0017/7 + VOL-0015/5 + VOL-0044/4 = **16/16 focused guards PASS**.
- Existing signer native **18/18 PASS**. No actual signing/CLI identity/SecureStore access in this task; no replay of VOL-002 real offline signatures.
- Production, helper sources, Cargo.lock and contracts unchanged. Full expensive activation suites were already green earlier Oct19 and were not rerun; explicit task instruction requests focused validation for non-product evidence work.
- git diff --check and repository/history/staged secret audit PASS before commit/push (actual audit counts/results retained in ignored .tools/bye-w1-001 logs and Notion closure).
- Only public allowlisted network identifiers/timing, decoded state, typed ABI/resource data and sanitized errors are retained. Raw public ledger metadata was dropped offline because newer RPC responses include unrelated transactions; no required measured value was changed.

## Explicit 25-check checklist
| # | Check | Result |
| --- | --- | --- |
| 01 | Sprint branch verified | PASS |
| 02 | Sprint-start tag verified | PASS |
| 03 | Historical baseline untouched | PASS |
| 04 | No unexplained worktree changes | PASS |
| 05 | Correct Stellar Testnet verified | PASS |
| 06 | Latest ledger recorded | PASS |
| 07 | Contract code live | PASS |
| 08 | Contract instance live | PASS |
| 09 | Collector role live | PASS |
| 10 | Recycler role live | PASS |
| 11 | Historical battery readable/live | PASS |
| 12 | Historical request readable/live | PASS |
| 13 | Reward SAC readable/live | PASS |
| 14 | GREENTEST contract balance verified | PASS |
| 15 | TTL covers sprint deadline + buffer | PASS |
| 16 | WASM SHA256 matches | PASS |
| 17 | Business-state fingerprints unchanged | PASS |
| 18 | Relevant source account state recorded | PASS |
| 19 | get_config simulation PASS | PASS |
| 20 | get_battery simulation PASS | PASS |
| 21 | get_request simulation PASS | PASS |
| 22 | has_role simulation PASS | PASS |
| 23 | balance simulation PASS | PASS |
| 24 | Five mutation preflights assessed | PARTIAL |
| 25 | Signer-cap/readiness decision documented | PARTIAL |

Checks24/25 are PARTIAL because the successful stateful preflights/dual-auth and complete fee-cap conclusion remain unavailable. The decision itself and all limitations are documented. No checkbox was silently ticked.

## Remaining blocker and minimum proposed next scope
Fresh-ID successor states do not exist on-chain. Public simulateTransaction does not persist the previous simulation or document state-override input. Four methods return BatteryNotFound (#3); no success fee/dual-auth output. Owner-reviewed path for future authorized stateful fixtures required before claiming complete readiness.

No contract/cap change. In separately authorized BYE-W1-002 scope, define a fresh isolated fixture and obtain each predecessor state through explicitly approved lifecycle transactions, then simulate next operation and validate fees/auth before signing/sending. No such transaction is authorized or performed here. A local fork would need separate scope and cannot be labeled live-RPC readiness.

No contract modification is necessary or proposed for this limitation. No hidden state override, extra helper contract, historical ID reuse or unapproved transaction was attempted. The RPC reference lists transaction/resourceConfig/xdrFormat/authMode, not a state-override input.

## Attribution / acceptance / stop
VOL-001–004 remain VOLUNTARY PRE-SPRINT; in particular restore7/extend8 were already performed by VOL-004. This new funded evidence is current reads/simulations/reporting only. No prior implementation rebilled.
Official acceptance remains D1 0/12, D2 0/6, D3 0/5, TOTAL0/23. BYE-W1-001 is supporting readiness, not one of the23criteria. Notion task Status uses BLOCKED (its schema has no PARTIAL); its explicit readiness result is PARTIAL. No schema change or new top-level Notion page.
**STOP. Next proposed task: BYE-W1-002 — Real TestnetStellarService Integration, not started automatically.** Owner review must resolve the fresh-state preflight limitation before a full readiness PASS is claimed.

## Sources
- [Machine-readable current evidence](BYE-W1-001-results.json)
- [Historical VOL-004 comparison](../../voluntary/VOL-004-final-verification.json)
- [Read-only probe](../../../scripts/bye-w1-001-readiness.mts)
- [Focused tests](../../../scripts/bye-w1-001-readiness.test.mts)
- [Official simulateTransaction reference](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/simulateTransaction)
- [Automatic restoration, Raven stellarDocs consulted first](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival#contract-data-automatic-restoration)
- [Sprint-start boundary](https://github.com/chrlstl4n2307-ai/Byetery/tree/instaward-sprint-start-v1)
