# RUN1 capture metadata normalization

Classification `FOR_COUNCIL_REVIEW_ONLY`

RUN1 remains stopped. The stopped bundle remains a non-counting attempt. This
candidate changes auxiliary evidence tooling only. TX2 is unauthorized.

| Pin | Value |
| --- | --- |
| Business execution SHA | `c6ba2e837ed0f7b81373655b8106b58ecb86a8cd` |
| Business fingerprint | `e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539` |
| Stopped bundle SHA-256 | `a926783d15bb509410ba00f8466ffc281e4104ace43d65bfed9e35e6695c83eb` |
| Battery | `BYE-D3-R1-20261106-9470F35DF6B1` |
| Application operation | `2201faa3-980a-4250-8578-ec024272a022` |
| Testnet TX1 hash | `fb159fc9e1646f257414f30034220876f14033ce7b92109102cc9ca530da68c1` |
| Testnet ledger and result | `5599273` · `SUCCESS` |

## Read-only TX1 validation

At `2026-11-07T04:17:29.875Z`, a fixed PostgreSQL SELECT and Testnet
`getTransaction` converged under the approved normalization in two pairs,
four reads and 7,547 ms. The first pair preserved an RPC timeout. The second
pair returned terminal receipts and exact canonical `resultXdr` equality.
The captured RPC envelope was verified against the Testnet network, original
source signature, contract call, battery, and transaction hash. Horizon
corroborated the signed envelope and result, and the Horizon and RPC headers
matched for the pinned ledger. Inclusion is service-corroborated.

| Evidence | SHA-256 |
| --- | --- |
| Raw SQL meta / fixture A | `4c2267f012556b11d3f222da6a39d9ee77e9b91a578a2cfb44f7a066adb60667` |
| Raw RPC meta / fixture B | `a4214427ec37de1a99caa8ed004cc2b922ed7814a49529a071d35c1f64dc4d24` |
| Normalized meta, both sources | `dce874928c00abe4f9b4f3100ae26f2ef8814fe108575d54ca2c099ea48e3607` |
| Canonical transaction result, both sources | `3e40c1aa95c493b1a0f0d41dea22d6bce64e944f54f73fe79d507f2d90a61bae` |
| Existing signed envelope XDR | `53d3cb536824c96bd3e64ad5ed96b0181e3bc3db4cd8d314c1ca9e78b1ce7421` |
| Ledger header | `5ad4656a5b7180b81328c69bc88a95cff56e790a6cc22a8dd3daef474d2ea067` |
| Local capture inventory | `8a3ad005a840d82779f9dd5e5e03a3fe5e38430398f3fedfefad27830072af2b` |

The raw SQL and RPC observations, original XDR text, canonical decoded raw
representation and hashes were preserved before the comparison. The 15
indexed files in the local diagnostic inventory were checked byte for byte.
The original stopped bundle passed portable verification and all 19 of its
file hashes matched the pre-change snapshot. The SQL projection and RPC
response from this diagnostic run are retained locally outside Git.

The decoded raw observations have one difference. The exact ordered symbols
`core_metrics/invoke_time_nsecs` identify a Core diagnostic timer whose value
was `413596` ns in SQL and `412826` ns in the current RPC observation. The
historical read-only RPC observations include both meta variants for this same
transaction. The observation is consistent with a Core-local invocation timer.
[Stellar diagnostic events](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/events)
· [Stellar Core timer reference](https://github.com/stellar/stellar-core/blob/master/docs/metrics.md)

For the observed variance, `ROOT_CAUSE_CLASSIFIED = NON_CONSENSUS_DIAGNOSTIC_METRIC_VARIANCE`.
The original failing comparison inputs were never captured. Its historical
classification remains `ROOT_CAUSE_NOT_PROVEN`. The observations establish
neither provider topology nor a general rule about other diagnostic metrics.

## Comparison and tests

Only the identified `u64` is set to zero in a separate v4 comparison copy.
Canonical binary XDR equality remains strict across all remaining fields.
The normalized digest is for comparison. Other metadata versions retain strict
raw-byte comparison. The ratified full evidence verifier and its owner-export
policy are unchanged.

- `NORMALIZED_DIAGNOSTIC_ALLOWLIST_SIZE = 1`
- `RAW_META_EQUAL = NO`
- `NORMALIZED_META_EQUAL = YES`
- `RESULT_XDR_EQUAL = YES`
- `TX1_NORMALIZED_RECEIPT = PASS` · `DURABLE_RECEIPT_CONVERGED_NORMALIZED`
- `149/149 PASS` · 34 capture tests, 24 normalization tests and 91 evidence tests
- Capture capability audit · zero mutation paths
- New business transactions, signatures and broadcasts · zero each

The fixture regression verifies both raw hashes and the normalized equality.
Negative cases stop on changes to transaction and operation fields, contract
events, diagnostics, event order, nearby metrics and partial topic matches.
