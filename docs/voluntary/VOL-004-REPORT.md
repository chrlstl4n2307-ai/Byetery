# VOL-004 — Testnet State Readiness

Classification: **VOLUNTARY PRE-SPRINT DEVELOPMENT**, not funded Instaward work.
Maintenance date: 2026-10-11; closure date: 2026-10-12, America/Santiago.
Branch: `pre-sprint/voluntary-d1`.
Starting HEAD: `ed0b773c4a6fb190ec8e6c0bf92e84863a03c04c`.
The request attachment quoted an older HEAD/plan-only VOL-003 state; work continued
from the actual validated VOL-003 implementation, preserving all prior VOL history.
Frozen baseline/tag remain `450c21b151a0973064986327f09d55e4f36c43e0` /
`pre-instaward-baseline-v1`. Official sprint NOT STARTED / UNCONFIRMED; **0/23**.

## Initial state and supported plan

Initial latest ledger: **5147708**; account/config/inventory reads observed **5147709**.
Protocol: **29**. Seven known entries archived: Byetery code/instance, Collector and
Recycler roles, historical Battery and Request, reward SAC instance. Contract balance
entry was live through 5400942, containing 900000000 base units = **90 GREENTEST**.
TTL 0 is the RPC indicator for an archived entry, not its historical expiration ledger.
No missing/unknown entry was treated as nonexistent.

Raven stellarDocs was consulted first. Protocol 23+ automatically restores entries in
an InvokeHostFunction restore list, but VOL-004 authorizes maintenance only, not a
business invocation. Pure RestoreFootprint is the supported separate payer/maintenance
route here. ExtendFootprintTTL requires live entries, its read-only footprint and an
empty read-write footprint. Each operation is alone in its transaction.

Minimal plan: (1) restore the seven archived entries; (2) extend all eight known entries
using ExtendFootprintTTL. No register/open/cancel/collect/recycle/reward, role mutation,
GREENTEST transfer, contract deployment or Mainnet transaction was submitted.

Network settings read at ledger 5147709: maxEntryTtl **3110400**, minPersistentTtl
**120960**, ledgerTargetCloseTimeMilliseconds **5000**. The selected target is
**1555200 ledgers**, approximately **90 days** at that cadence, below the approximately
180-day maximum. Initial projected target from ledger 5147708 was 6702908; actual TTL
was anchored to the extension's application ledger, not the earlier planning ledger.

Initial restore quote: **87939712 resource stroops**. A second unsigned extension
preflight at 5147739 quoted **1043025805 resource stroops**, plus its separate restore
preamble quote **87898278**. RPC provides aggregate minResourceFee/resourceFee (rent
and resources), not a separately itemized rent-only amount; no invented rent split is
reported. Quotes are predictions and differ from charged fees after refunds.
The maintenance controller bounds each fresh quote to the approved estimate +5% and
10000 classic fee stroops; it does not change an application signing limit.

## Exact source account and sequence safety

Source/signing identity for both transactions:

`GCOEEZR6CA4TU2WK7ZNAS6AJGHQH7NGYWKO7HZ3HQIF7EJATGLBNKOUZ`

Existing Secure Store identity: `byetery-tn20260926-recipient`. This is the historical
reward recipient, with one trustline, not the admin/service/collector/recycler signer.
Known prior usage: recipient trustline setup and reward receipt in the September 26
CLI validation. Repository application signer configuration does not use it as a
source. External/manual use cannot be ruled out; the account is **not claimed dedicated**.
No application lease was assumed to fence external activity.

| Read / operation | Account sequence | Ledger | Native balance, stroops |
| --- | --- | --- | --- |
| Initial source observation | 20970242247229441 | 5147709 | 99999999900 |
| Restore preparation | 20970242247229441 | 5147799 | 99999999900 |
| Restore pre-broadcast reread | 20970242247229441 | 5147799 | 99999999900 |
| After restore | 20970242247229442 | 5147800 | 99923593439 |
| Extend preparation | 20970242247229442 | 5147816 | 99923593439 |
| Extend pre-broadcast reread | 20970242247229442 | 5147816 | 99923593439 |
| After extend | 20970242247229443 | 5147817 | 99017039163 |

Actual envelope sequences were preparation sequence +1. The account sequence was
obtained immediately before each preparation and reread immediately before dispatch;
both checks matched. A mismatch would retain the original envelope/hash, mark
REVIEWED_RESOLUTION_REQUIRED and stop without broadcast or automatic re-preparation.
This still cannot eliminate an external race after the final read; a protocol rejection
must be reconciled using the original identity, not retried with new bytes.

Future MVP application design decision is recorded in VOL-003-IMPLEMENTATION-PLAN.md:
prefer a dedicated Testnet source where practical; shared sources must receive the
same final authoritative sequence check. The comparison is account sequence versus
envelope sequence minus one. No production application adapter was implemented.

## Confirmed maintenance transactions

| Operation | Hash | Ledger | Result | Charged fee, stroops | Charged XLM Testnet |
| --- | --- | --- | --- | --- | --- |
| RestoreFootprint, seven archived entries | b9813b68aeb1d64b1b15fbc5809cd886af6c626dbc2dd61746cc5c4fa17cc1e0 | 5147800 | SUCCESS | 76406461 | 7.6406461 |
| ExtendFootprintTTL, eight live entries | ca59f3b6309c7a032b49531198840581f5840f8f879391751f17d94278ffabd7 | 5147817 | SUCCESS | 906554276 | 90.6554276 |

Total actual fee: **982960737 stroops = 98.2960737 XLM Testnet**. This matches the
observed source balance reduction; its sequence advanced exactly twice.

- [Restore explorer](https://stellar.expert/explorer/testnet/tx/b9813b68aeb1d64b1b15fbc5809cd886af6c626dbc2dd61746cc5c4fa17cc1e0)
- [Extension explorer](https://stellar.expert/explorer/testnet/tx/ca59f3b6309c7a032b49531198840581f5840f8f879391751f17d94278ffabd7)

Only the official installed Stellar CLI signed these maintenance envelopes through
Secure Store; no key was exported. The separate application helper only allowlists
business InvokeHostFunction operations and was left intact. Its **50000000-stroop
fee cap remains unchanged**; maintenance costs do not authorize increasing that cap
or routing application calls through this maintenance controller.

Exact signed envelope/hash were persisted privately with fsync + atomic rename before
the durable dispatch intent and single broadcast. Network-bound hashes were computed
using the SDK before envelope signing, then the source signature/body/hash were
verified. On any timeout/error, only getTransaction(original hash) reconciliation is
possible; execute refuses to construct another identity for an existing step. No
transaction failed or required a second broadcast.

## Before and after TTL

| Entry | Initial liveUntilLedger | After restore | After extension |
| --- | --- | --- | --- |
| Byetery instance | 0 / archived | 5268759 | 6703017 |
| Collector role | 0 / archived | 5268759 | 6703017 |
| Recycler role | 0 / archived | 5268759 | 6703017 |
| Historical Battery | 0 / archived | 5268759 | 6703017 |
| Historical Request | 0 / archived | 5268759 | 6703017 |
| Reward SAC instance | 0 / archived | 5268759 | 6703017 |
| Contract GREENTEST balance | 5400942 / live | 5400942 | 6703017 |
| Byetery code | 0 / archived | 5268759 | 6703017 |

All eight known entries are live. Final observation latest ledger: **5147817**.
LiveUntil equals extension confirmation ledger 5147817 + target 1555200.
TTL duration is approximate; ledger cadence and Testnet resets can invalidate a
calendar-duration expectation. This is a scoped inventory, not an exhaustive scan.

Closure recheck on 2026-10-12 at ledger **5160119** reconfirmed eight live entries
through 6703017, identical code/business hashes and the same five fee values below.
Source account still had sequence 20970242247229443 and balance 99017039163 stroops;
no additional source-sequence consumption was observed. The closure performed only
reads/simulations, with **0 additional transactions submitted**.

## Unchanged business state and contract

Exact ScVal hashes (instances, roles, historical battery/request, token balance) and
WASM byte hash matched before and after both transactions. Physical/reward state
remains Recycled/Sent; request remains Confirmed with the original recipient; both
role values remain true. Contract GREENTEST amount remains **90**, authorized true,
clawback false. No new battery/request/reward exists from this maintenance task.

Contract ID: `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`.
SAC ID: `CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G`.
Asset: `GREENTEST:GCHROKHXHL4L635J6Y6DWFFD5DDHABOAF4BP5TEUZDZQMW4XYS6DIDL7`.
Frozen code SHA remains
`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.
Contract source diff is empty; no redeployment, ID/asset or helper change occurred.

## Five unsigned simulations — fee comparison in stroops

| Method | Original VOL-001 | Fresh VOL-004 before | After restoration | After TTL extension |
| --- | --- | --- | --- | --- |
| get_config | 86537014 | 86700470 | 14247 | 14247 |
| get_battery | 86966866 | 87131115 | 16078 | 16078 |
| get_request | 86754688 | 86918540 | 14406 | 14406 |
| has_role | 86660155 | 86823830 | 13749 | 13749 |
| balance | 722620 | 725616 | 364995 | 13048 |

All five simulations succeeded, final restore lists are empty and each minResourceFee
is below **50000000**. Keep the existing application signer cap. These are exactly
five read-only calls, not validation of mutation fees, multi-auth app dispatch,
reward payment or an HTTP/frontend Testnet lifecycle. Source account for simulations
is the historical service account; it did not sign or submit any transaction here.

## Evidence, tests and stop boundary

Public scoped evidence: VOL-004-before.json, VOL-004-extension-plan.json,
VOL-004-restore-receipt.json, VOL-004-extend-receipt.json and the fresh closure
VOL-004-final-verification.json. They contain public
keys/state commitments, hashes, fees, TTLs and sanitized results, not signed envelopes,
signatures, keys or credentials. Full signed identity/RPC receipt stays in ignored
`.tools/vol004-maintenance/state.json`; never publish or print it.

Controller guards are tested locally for account/envelope sequence comparison,
exact restore/extend footprints, fee bound and rejecting business invocations/wrong
TTL: **4/4 PASS**, without network access. Root `npm run verify` completed PASS:
contract native **20/20**, repeated native **20/20** with wasm-tests plus constructor
**1/1**, release WASM/fmt/Clippy PASS; backend TypeScript and **87/87** tests (original
Foundation 50 preserved); Python **4/4**; existing MOCK demo reached SENT/10 GREEN-TEST.
The repeated native cases are not 40 distinct cases. `git diff --check` and secret
audit PASS. Application/helper source diffs are empty; frozen WASM hash unchanged.
Frontend and remote HTTP suites were not rerun for this maintenance-only change.
No remote
Supabase migration, schema/RLS/auth change, new frontend feature or VOL-005 work.

Existing Notion Project Plan, Development Log, Changelog, Tests & Evidence, Stellar
Transactions and Decisions & Risks are the record locations. VOL-004 is a voluntary
task, Criterion empty, not funded acceptance. No new top-level page or criterion
PASS is authorized. Official acceptance stays **0/23**. Small local evidence commit;
no automatic push, squash, reset or merge. Final test/Notion/Git status is reported
in the closure.

Primary protocol reference (Raven stellarDocs):
https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival

**STOP after VOL-004. Do not start VOL-005 or real application dispatch.**
