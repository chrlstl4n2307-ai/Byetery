# BYETERY BYE-W1-003B LIVE RETURN + DUAL-AUTH COLLECTION REPORT

**Overall: PARTIAL. open_return PASS; confirm_collection BLOCKED before signing/dispatch.**
Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. 2026-10-20, America/Santiago.

## Checkpoint and scope

Starting HEAD `c237da5278e7532612e13e81f0d9eba535f22b74`; tested implementation `04dd6dafecf337f9351c7708296266bd853e4fe2`.
Branch `instaward/d1-testnet-integration`. The final documentation checkpoint is identified in
Git history and the owner handoff; this report does not claim a successful collection.
Sprint-start349ee3fd78104f3c249b3052b1cca402c9d99ff3 and baseline450c21b151a0973064986327f09d55e4f36c43e0 tags unchanged.
Historical BYE-W1-003 BLOCKED and BYE-W1-003A PASS preserved byte-for-byte.
Protected tools/sync_obsidian.py remains untracked/unchanged, SHA-256
48404b9431a9d955fc4af0b2eeaf9a59bb2fb0e9457eed73b4f2f66132a5e2da.

Only the existing authenticated application/API paths were used. No CLI lifecycle bypass,
MOCK fallback, new battery, cancellation, recycling, reward, maintenance, redeploy, Mainnet,
frontend/D2, schema, RLS or grants change. Contract source and WASM unchanged:
c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6.

## Prerequisites and scoped owner decision

Battery `BYE-W1-002-64257020134D4A0F`; deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`.
USER-1 recipient `GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS`. Its existing deployment-scoped SEP53_V2 proof remains
verified, not revoked and consumed exactly once at2026-10-20T17:32:31.934Z. Auth user,
ACTIVE application principal and USER membership were independently read back.
Initial Testnet state REGISTERED/NOT_ELIGIBLE agreed with SQL. Network, fixed contract,
config, local/deployed WASM and TTL guards passed. Instance/code/SAC live-until6703017.

The initial collector gate failed: on-chain Collector role existed, application membership
did not. **Owner explicitly approved the minimum exception**: dedicated Auth fixture
BYETERY-INSTAWARD-COLLECTOR-1 and COLLECTOR membership in this deployment, mapped to
GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V. Existing Repository added
its ordinary base USER role. No ADMIN/RECYCLER grant, USER-1 elevation or on-chain role change.
Independent Supabase MCP verified the setup. The association is retained for reviewed recovery.

Fresh sessions for the known test principals used admin-generated one-time links consumed
by Auth /verify, then existing SupabaseAuth token validation. No email was sent, password
changed, duplicate USER-1 created or client identity injected. Credentials stayed in memory.
Wallet proof and application authentication remained separate. Operator details and official
references: [BYE-W1-003B-OPERATOR.md](BYE-W1-003B-OPERATOR.md).

Raven was consulted first. Official Stellar documentation confirms simulation-derived
authorization entries and the corresponding signer for each address, while source-account
credentials are authorized by the source envelope. This matches the existing model; no
contract incompatibility was found. Reference:
https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction#javascript-usage-1

## OPEN_RETURN — PASS

API initiated YES: POST /api/batteries/:batteryId/returns, authenticated USER-1.
Server-generated fresh CSPRNG32-byte request:
`5d48643a8915413ed889dd6aa3f8304d10a8c251e384f528ab5461d6e4c8d78c`. No historical/probe ID reuse. Recipient snapshot comes from the verified
wallet link; independent SQL confirms original user/link/recipient and request ownership.

| Field | Result |
| --- | --- |
| Logical operation | `dd1408b0-7cd5-4332-bdb0-6f61ae00cf86` |
| Simulation ledger | 5299525 |
| Simulated resource / total fee | 311513 / 321513 stroops |
| Source / required auth | SERVICE source-account credential |
| Source sequence before preparation | 20970220772392963 |
| Restore preamble | NONE |
| SDK hash/body validation / two-phase helper | PASS / PASS |
| Exact identity COMMIT before dispatch intent | PASS |
| Authoritative final source-sequence gate | PASS |
| Transaction | `4d7aa3b0e656692d0c8467ff08cc5e2edf6d8563290171bc06e2c39e9c0452e2` |
| Confirmation ledger | 5299532 |
| Actual charged fee | 267535 stroops |
| Result / battery / request | SUCCESS / RETURNED / OPEN |
| Recipient snapshot | MATCH |
| Identical API duplicate | PASS; no new request, identity or dispatch |

Detailed resources, sanitized auth roots, source/balance, exact durability timestamps,
decoded event/result and identical before/after duplicate counts are in the companion JSON.
Read-only independent RPC confirmed RETURNED/OPEN and the original transaction before
collection started. Independent Supabase MCP confirmed PROJECTED, one dispatch and the
recipient relationship. Full signed envelope remains private in transport storage.

## CONFIRM_COLLECTION — BLOCKED

API initiated YES using the dedicated authenticated collector and existing endpoint.
Original logical operation: `4fa3fbac-84e4-4845-8abd-fbdff757cbb4`.
Same battery/request; fresh synthetic collection Evidence V1 bytes were persisted immutably.
Manifest SHA-256 `ef61932cb180ffbafac39eddffaed46dccb6e42366c7999913116d9eb8f73766`.
BYETERY_EVIDENCE_V1 canonical XDR commitment `3bca64581d5aced4a8582f85fe5755b07104e1b7d7cf6201cde90c6ffce5b5ef`.
Exact synthetic UTF-8 manifest is in the companion JSON for independent recomputation.
It explicitly describes a Testnet test attestation, not proof of physical battery handling.

| Field | Result |
| --- | --- |
| Positive simulation ledger | 5299559 |
| Resource / total simulated fee | 992362 / 1002362 stroops; below 50M cap |
| Recorded required actors | SERVICE + COLLECTOR |
| SERVICE | GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX |
| COLLECTOR | GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V |
| Positive exact invocation/auth guard | Passed before durable simulation summary |
| Application / durable transport state | QUEUED / PREPARING |
| Missing SERVICE / missing COLLECTOR / wrong / no-role negatives for live attempt | NOT RUN; interrupted before completion of pre-sign gates |
| Live helper auth phase / source signing / SDK finalized hash | NOT REACHED / NOT REACHED / N/A |
| Persisted signed identity / dispatches | NONE / 0 |
| Transaction hash / confirmation ledger / actual fee | N/A / N/A / N/A |
| COLLECTED / CONFIRMED / commitment on-chain | NOT REACHED |
| Live collection duplicate | NOT RUN |

Exact runtime failure: **Unhandled PostgreSQL Client error: Connection terminated unexpectedly**.
The Node process exited1 while validating the collection pre-sign path. The durable positive
simulation summary was committed, but the write-before-helper journal gate was not reached.
No completed task-specific negative result or signed collection material is claimed.
Regression authorization tests passed separately; they are not this missing live evidence.

Immediately after interruption, independent Supabase MCP confirmed PREPARING, no envelope/hash,
zero dispatches, battery RETURNED and request OPEN. Final read-only RPC atledger5299600
confirmed the same state, no collector/collection hash and source sequence20970220772392964
(one increment from the successful return), balance99999515769 stroops. No application SQL
projection was forced to match an assumed collection.

## Safety stop and minimal proposed resolution

No API replay, new key, reprepare, replacement identity, cleanup of pending work or automatic
worker recovery was performed after the crash. The original collection operation and immutable
evidence are retained. The local journal remains COLLECTION_API_INTENT and rejects automatic
entry; do not delete/reset it. No new on-chain action is authorized by this report.

Before a reviewed resume: investigate the PostgreSQL disconnect and uncaught Client error;
add bounded connection-error handling that stops signing/dispatch safely, with a deterministic
fault-injection test for loss during PREPARING. Distinguish unsigned preparation from an
existing durable identity and never let a reconnect implicitly prepare or send a replacement.
Review the original operation/request/evidence, any source lease and fresh chain/SQL state.
Recovery of this original unsigned operation requires an explicit reviewed decision and fresh
validity checks; do not create a second logical collection. No backend transport fix was made
after the stop, and the frozen contract does not need modification based on current evidence.

SERVICE is treated as shared/manual usage UNCONFIRMED. Its lease does not fence external
transactions. The successful return's final source check and persisted-byte verification
remain intact; no security protection, cap, allowlist or invariant was weakened.
New wanted broadcasts1, unwanted broadcasts0; new logical operations2, signed identities1.

## Regression verification and honest limits

- Rust native20/20, same20 with wasm-tests, WASM1/1, release, fmt and Clippy PASS; hash unchanged.
- Backend132/132, original Foundation50 preserved, three operator tests; types PASS.
- Wallet/adaptor focused32/32 and operator3/3 overlap the backend suite.
- Helper native22/22 and Secure Store offline18/18 PASS; existing binary hash unchanged.
- Frontend33/33, typecheck/lint/build PASS; HTTP Supabase DEV45/45 with files serialized.
- SQL rollback82/82, local fixtures0; Python4/4; MOCK demo SENT10 GREEN-TEST.
- git diff --check and secret audit are verified before the documentation checkpoint/push.

Initial sandbox loopback EACCES/frontend ENOENT were resolved by unchanged execution outside
isolation. HTTP first hit an Auth connection timeout; concurrent execution then lost PostgreSQL
connection. The unchanged suite passed45/45 in series. The subsequent real collection crash
shows that connection handling remains an unresolved runtime robustness problem despite green
regressions. No assertions, schema, RLS, grants or Windows protections were weakened. Only
suite-owned cleanup was attempted; immutable namespaced Foundation fixtures are retained.
MOCK regression cycles and offline invalid signing fixtures are not extra Testnet cycles.

## D1 assessment and history

BYE-W1-001 remains PARTIAL, original report unchanged. Successful real application evidence
now covers registration and return; collection has positive simulation but no live execution.
Real confirmed API operation kinds: **2/5**, not3/5. Recycling/reward remain unexecuted.

| Criterion | Assessment |
| --- | --- |
| D1.1 | SUPPORTED; 2/5 confirmed operation kinds, NOT YET SATISFIED |
| D1.2 | NOT YET SATISFIED; live dual-auth and four live-attempt negatives pending |
| D1.3 / D1.4 / D1.7 | SUPPORTED by registration/return confirmations, correlation and durability |
| D1.5 | SUPPORTED by safe live return replay; collection replay missing |

Official criteria marked PASS: NONE. Acceptance remains **D1 0/12, D2 0/6, D3 0/5**.
Notion supporting task records the partial/blocking result without rewriting BYE-W1-003 or
BYE-W1-003A. Obsidian records actual RETURNED/OPEN, never COLLECTED.
No main merge or tag movement. **STOP. BYE-W1-004 NOT STARTED.**
