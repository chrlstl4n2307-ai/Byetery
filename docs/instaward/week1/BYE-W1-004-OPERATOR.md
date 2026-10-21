# BYE-W1-004 — bounded recycling and reward operator

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. The separate report/results determine
what actually executed. Source implementation alone is not live or acceptance evidence.
Historical BYE-W1-003/003A/003B/003C artifacts are preserved unchanged.

`backend/src/testnet/sprint-recycling-reward.ts` uses the existing authenticated
loopback HTTP API, Coordinator, TestnetStellarService, durable worker/transport and
approved two-phase Secure Store helper. It does not implement another lifecycle.
The only allowed battery is BYE-W1-002-64257020134D4A0F, request
5d48643a8915413ed889dd6aa3f8304d10a8c251e384f528ab5461d6e4c8d78c,
deployment5c0cad2f-5f25-4216-8068-6cb9d2d26325. No registration/return/collection/role
operation is exposed by this operator.

## Invocation and gates

From repository root, select the existing ignored DEV server configuration without
printing it. The operator fixes its own mode to TESTNET and the deployment above.

```text
node --experimental-strip-types backend/src/testnet/sprint-recycling-reward.ts --inspect
node --experimental-strip-types backend/src/testnet/sprint-recycling-reward.ts --assets
node --experimental-strip-types backend/src/testnet/sprint-recycling-reward.ts --recycling
node --experimental-strip-types backend/src/testnet/sprint-recycling-reward.ts --reward
```

Inspect/assets cannot sign/send. Inspect checks the original COLLECTED pre-state;
assets is an independent read suitable before and after owner Freighter action.
Execution requires a clean tested implementation checkpoint and matching ignored
verification record. Each business action exclusively creates its own local journal
before the API attempt. Never reset/delete a journal, change keys or call a business
action again after an uncertain result. Reconciliation uses the original hash only.

All original network/contract/WASM/TTL/recipient/collection facts and SQL projection
must match. Recycler requires an active, Auth-backed RECYCLER membership scoped to
this deployment and mapped to the existing approved on-chain actor. The dedicated
BYETERY-INSTAWARD-RECYCLER-1 account was separately authorized by the owner; its only
memberships are RECYCLER and the application's ordinary USER base. Provisioning does
not modify on-chain roles. The journal and private Auth session material stay ignored.

Recycling creates one synthetic Evidence V1 manifest, explicitly disclaiming physical
recycling, custody, environmental benefit, compliance and material recovery. The API
persists its exact bytes/hash/canonical commitment; the operator verifies readback
before helper access. No PII is placed on-chain.

Before signing, a wrong application principal is rejected by the real HTTP API;
deterministic guards check missing/wrong recycler authorization on fresh simulation
entries. An unsigned no-role RPC probe must fail with the frozen RoleNotGranted#9
error, never merely an arbitrary provider/resource error. Invalid probes never send.

Reward requires the confirmed recycling journal, RECYCLED/PENDING chain and SQL facts,
unchanged verified USER-1 recipient and fixed100000000base units. GREENTEST's SAC is
derived from its exact code/issuer and checked against the frozen token address.
getLedgerEntries distinguishes a missing trustline from a transport failure. Existing
trustline must be authorized and have capacity after balance/buying liabilities.
SAC balances are checked before preparation; missing acceptance stops before pay_reward.
Only the owner may approve USER-1's trustline in Freighter; no user keys are accessed.

Every send follows helper phase1 → final SDK network-bound hash → source signature →
immutable identity COMMIT/readback → dispatch intent → last authoritative source
sequence check → exact persisted bytes. Fee cap remains50000000stroops. A source is
treated as shared/external use unconfirmed; a lease cannot fence manual transactions.
Database connection epochs retain the003C fail-closed behavior. No automatic replacement.

Only confirmed SUCCESS projects RECYCLED/PENDING or rewardSENT. Reward also requires
the existing receipt/transfer-event proof and exact recipient+100000000/contract−100000000
balance deltas. Same-context API replay must add no operation/identity/dispatch/send;
reward replay must add no tokens. Timeout/UNKNOWN/NOT_FOUND never becomes a fabricated
failure or a second identity. No contract/helper/security policy changes are introduced.

## Local verification and limits

New tests cover immutable negative auth checks, trustline authorization/capacity and
combined lost response/NOT_FOUND/RPC outage/worker reconstruction with the same durable
SQL identity. Existing contract, backend/Foundation50, wallet SEP53_V2, PostgreSQL
recovery, HTTP DEV, SQL rollback, helper/offline, frontend, Python and MOCK suites remain.
Local fault injection is clearly distinguished from real Testnet execution. Official
D1 criteria require their own owner review; do not mark PASS from this operator's output.

STOP after the current task. No D2/D3, extra lifecycle, new asset, Mainnet or main merge.
