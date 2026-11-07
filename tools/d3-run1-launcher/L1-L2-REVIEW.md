# L1 and L2 evidence for D3-17-RUN1

**Review scope** — orchestration and verification tooling. RUN1 stays sealed.

## L1

- Branch base `3c84c74c6e35762b99ea5e74b93bddb04b5ffdd5`.
- Frozen business SHA `c6ba2e837ed0f7b81373655b8106b58ecb86a8cd`.
- 37 launcher tests and 149 ratified capture and evidence tests passed.
- The root verification passed with 671 backend tests, four Python tests, the MOCK demo and the frozen WASM hash.
- Live execution remains disabled. Fresh preflight reads have no cache. Session refresh is absent.
- The owner observed the 3,600-second expiry in Supabase DEV Authentication → Sessions. The 120-second safety margin leaves 3,480 seconds. The conservative initial workload budget is 4,080 seconds, so the policy denies startup before any reservation or operator construction.

## L2

| Observation | Evidence |
| --- | --- |
| Historical operation | `2201faa3-980a-4250-8578-ec024272a022` |
| Historical transaction | `fb159fc9e1646f257414f30034220876f14033ce7b92109102cc9ca530da68c1` |
| Inclusion ledger | `5599273` |
| Fresh PostgreSQL and Horizon | Read-only SELECT and public GET, 2026-11-07 18:39 in Santiago. Confirmed and projected receipt. State `REGISTERED / NOT_ELIGIBLE`. |
| Preserved terminal API evidence | The sealed frozen-operator journal records confirmed history for the same operation and hash, followed by the same battery state and reward status. Journal SHA-256 `d0398192c9742589f0f8e4606998030c216891f659668e531088e969f08540f9`. |
| Preserved chain evidence | The sealed bundle verifies the signed envelope, result and header against the fresh Horizon transaction and ledger. The four preserved ledger-entry snapshots retain their original observation provenance. |
| Ratified normalization | `PASS` through `APPROVED_DIAGNOSTIC_VARIANCE`. The normalized metadata SHA-256 on both sides is `dce874928c00abe4f9b4f3100ae26f2ef8814fe108575d54ca2c099ea48e3607`. Raw XDR bytes were preserved. |
| Fresh receipt inventory | `ece3b823dcb1bb8cf8c44623a177aa9a19c326d15aa725931fded8740b5e2341` |

SQL, the historical API and the chain agree on their shared facts. The API evidence is the historical operator's sealed projection of two GET checks. This replay covers the projected API fields. The original raw API bodies and a new authenticated API GET are outside the evidence.

SQL reported zero leases, pending dispatches and new RUN1 operations. The RUN1 local lock, journal, budget and consumed marker were absent. Operator starts, role logins, business transactions, simulations, signatures, broadcasts, remote DB writes and reservations were all zero.