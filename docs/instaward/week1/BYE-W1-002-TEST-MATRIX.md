# BYE-W1-002 — Deterministic boundary coverage

Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. 2026-10-19.
Existing tests remain; the integration adds 19 default backend tests and nine
opt-in Secure Store offline cases, plus four native helper validation cases.

| Required boundary | Evidence |
| --- | --- |
| Wrong network / contract | testnet-real-boundaries; testnet-rpc; original native signer guards |
| Simulation failure; no inferred fee | testnet-real-boundaries |
| Fee above cap; exact resource+classic fee | testnet-real-boundaries; native helper excessive_fee |
| Restore preamble / automatic restoration list | testnet-real-boundaries |
| Persisted recipient mismatch / immutable logical context | testnet-application, using real SQL guard |
| Wrong signer / actor | testnet-real-boundaries; native helper wrong_source/wrong_auth_signer |
| Final source sequence drift | testnet-real-boundaries, durable reviewed hold and zero sends |
| Persistence/COMMIT failure prevents broadcast | new boundary test; original testnet-worker test |
| Lost send response; original hash only | original testnet-worker and testnet-restart |
| NOT_FOUND is uncertainty | real observation test; original worker expiry/uncertainty cases |
| SUCCESS and actual confirmation ledger | real observation test; original projection/restart cases |
| Confirmed FAILED distinct from timeout | real observation test; original terminal failure test |
| RPC outage / no MOCK fallback | real HTTP local fixture and RPC adapter error tests |
| Restart recovery from disk | original testnet-restart; original READY/dispatch intent cases |
| Projection failure after SUCCESS | original worker test: retry SQL without new chain submission |
| Same-hash reconciliation / bounded reviewed retry | original worker tests |
| Duplicate reward | original SQL/mock/worker unique reward tests |
| SERVICE + COLLECTOR auth structure | new real simulation boundary test; original missing-auth guards |
| Actual cryptographic two-phase signing | opt-in signing-tests/offline.test.ts; source/Address/AddressV2 |
| Reward proof independent of static 10 | testnet-reward-evidence uses 123456789 base units |
| SENT without receipt/transfer/recipient/amount proof | testnet-reward-evidence rejection cases |
| Bounded RPC / sanitized errors / provider metadata omitted | testnet-rpc |
| Forced RLS, restrictive denial, grants, immutable history, source fencing | original testnet-storage; remote DEV verification |

The initial remote HTTP run discovered the old five-table inventory assertion
after VOL-003 added four tables. It was changed to require the exact nine table
names, preserving every existing grant/RLS check and every functional case. This
is a fixture/schema inventory update, not relaxed security or skipped coverage.
The complete rerun outcome belongs in BYE-W1-002-REPORT.md.

Local HTTP tests use a test-only pg/PGlite binary-parameter conversion for custom
bytea domains. That conversion is not part of production storage or hashing.
No real adapter test needs a private key embedded in source. The opt-in signer
suite accesses only the four already approved Secure Store identities, with
sequence 1 / authorization expiry 100 fixtures that cannot execute on current
Testnet. No offline test submits transactions.

The original Foundation 50 cases and frozen Rust tests are retained. Default
backend verification now has 106 tests. Contract verification repeats the same
20 native tests under wasm-tests and separately runs one WASM integration case;
do not count that as 41 distinct contract tests.

Passing this matrix is implementation evidence, not owner acceptance, a live
collection/recycling/reward cycle, graphical-wallet validation or D2/D3 delivery.
