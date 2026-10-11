# VOL-003 — Minimal transaction-identity refactor plan

Classification: VOLUNTARY PRE-SPRINT DEVELOPMENT / PLAN ONLY.
Date: 2026-10-11, America/Santiago. Branch: `pre-sprint/voluntary-d1`.
Source inspected: frozen `450c21b151a0973064986327f09d55e4f36c43e0`.
Implementation: NOT STARTED; owner review required before a refactor.
Instaward start UNCONFIRMED; acceptance stays 0/23.

## Demonstrated mismatch, not a contract defect

`backend/src/stellar-service.ts:3` gives preparation only a mock preparation ID,
command and expiration; no signed-envelope/hash identity.
`backend/src/application/coordinator.ts:145` prepares and submits while inside
`Repository.transaction`. Transport is inserted at line 156, AFTER submit.
`repository.ts:19` holds a deployment advisory transaction lock for the whole
callback. `coordinator.ts:192` routes reconciliation back through processing.
`database/migrations/20260913140711_application_http.sql:39` requires immutable,
MOCK-only `submission` in `operation_transport`; this cannot record a signed
Testnet envelope before a submit response exists. Repository config and
projection also explicitly depend on MOCK. Keep this path intact.

These are incompatibilities with real network effects, not evidence to change
the frozen Rust contract. A successful mock transaction still commits its
snapshot atomically, which should remain the mock's fast regression path.

## Minimal proposed seams

1. Keep StellarService and its mock, but add a distinct real-transport seam for
   prepared unsigned transaction, signed envelope, hash, network/contract,
   source/sequence, validity bounds and operation parameters hash.
2. Reuse StellarSigner for signing only. Hash the final transaction AFTER its
   Soroban authorizations are attached. The SDK computes the network-bound
   transaction hash; do not hash JSON or blindly hash envelope base64.
3. Add an internal transport repository for Testnet durable envelopes and work
   claims. Do not weaken the existing immutable MOCK transport trigger/check.
4. Make confirmation return sanitized actual ledger/result/meta/events/business
   facts. Adapt projection from confirmed facts, not mock state or reward constants.

## Short SQL transactions; external work outside locks

| Stage | Work | Durability boundary |
| --- | --- | --- |
| Queue/claim | Validate session, roles, ownership, immutable recipient snapshot, evidence and idempotency; claim operation with bounded lease/generation | Short transaction commits logical operation/claim |
| Prepare | Read trusted Testnet network/ledger/source sequence, preflight TTL, simulate and check fees | No SQL advisory transaction held during RPC |
| Sign | Check frozen contract/method/source, parameters hash and recipient_snapshot; local Secure Store; never export keys | No SQL lock held during process/OS signing |
| Persist | Revalidate claim and immutable context; insert exact signed bytes + network-bound hash + validity metadata; mark READY | SQL COMMIT must finish BEFORE any broadcast |
| Dispatch | Record a durable dispatch intent; send only the persisted identity | Outside SQL lock; ambiguity survives crash/lost response |
| Confirm | getTransaction(original hash), inspect result; retain available meta/events and resolve business facts | Network outside lock; short idempotent SQL projection/evidence commit |
| Reconcile | Read existing envelope/hash FIRST; resolve original result/state | Never re-prepare because response was lost |

The worker must check for an existing durable envelope before doing ANY new
prepare/sign, irrespective of the operation's current coarse state. A crash
after durable dispatch intent but before its response is unknown, even if the
operation row still says READY. Recovery uses the original identity.

Preserve deployment_id throughout. Claim ownership/generation prevents two
workers preparing the same operation concurrently. Sequence handling also
needs a single-writer/lease per network+source account: per-battery locks alone
do not prevent competing transactions using the same Stellar account sequence.
Before the final persistence/broadcast gate recheck authorization/context;
on-chain role checks remain authoritative if roles were revoked meanwhile.

## Additive private storage proposal — no migration executed

Propose `api_private.testnet_envelopes`, unique per deployment/operation, with:
network ID, contract, source account, sequence, signed envelope bytes, tx hash,
parameter/context hash, time bounds/auth expiry, prepared ledger and creation
timestamp. Bind hash and bytes immutably at insertion. Store sensitive envelope
bytes privately; never publish them in logs, Notion or artifacts.

Separate claim/dispatch/observation metadata may progress without rewriting
that identity. Record lease owner/generation/expiry, dispatch intent/attempts,
RPC observations, ledger/status, result/resultMetaXdr/events/Soroban result when
available, correlation IDs and projection marker. Distinguish observation
ledger from the transaction's confirmation ledger and from later state reads.

Do not update immutable deployment mode: a real Testnet deployment/config is
a separate authorized row. Preserve Foundation FK/unique constraints, request
non-reuse, recipient immutability and one successful reward. Private schemas
stay unexposed, FORCE RLS/base-deny stays in place, browser cannot mutate roles,
envelopes, physical state or reward. No SECURITY DEFINER shortcut. The migration
is additive and must be reviewed/tested before Supabase changes.

## Retry and uncertainty rules

- Before any identity/dispatch exists, transient preparation failure may be
  retried under the same logical operation/context. Do not call it chain FAILED.
- Once signed identity is durable, retries do not invent a replacement envelope.
- A lost submit response, timeout, RPC outage or NOT_FOUND remains unresolved.
  Lookup original hash and relevant chain state; no new operation by inference.
- Any later permitted rebroadcast must be explicitly bounded, use exactly the
  same signed bytes/hash while valid and be recorded. No broadcast is authorized
  by this plan or first package.
- Expired/not-resolvable envelopes require an explicit reviewed resolution
  policy, including chain evidence, before another identity could be considered.
- Only confirmed SUCCESS advances attested physical/reward state. Confirmed
  FAILED and known pre-submit rejection are distinct from network uncertainty.
- A SQL failure after chain SUCCESS retries projection, not chain execution.
  Protect reward_attempts and cached responses from duplicate completion.

## VOL-001 operational prerequisite

Simulation supports automatic Protocol-23+ restoration lists, but observed
Byetery fees exceed the existing signer cap. Do not increase the cap or silently
restore/extend/redeploy. The owner must approve the exact operational route
before real dispatch. Read-only preflight repeats before later evidence runs.

## Proposed implementation slices, after review

1. Typed identity/confirmation objects and fake transport tests; preserve MOCK.
2. Additive storage/immutable identity/lease tests locally with RLS checks.
3. Worker split into queue/prepare/sign/persist/dispatch/observe/project.
4. Restart/lost response/NOT_FOUND/outage/expiry/concurrency tests for original
   hash and one logical effect; no network submission in local fixtures.
5. Integrate the real adapter only after signer and operational readiness,
   using separately approved Testnet execution. No UI/contract redesign.

Reviewer decisions needed: approve this seam/storage plan; source-sequence
coordination; precise expiry/no-result policy; restoration/fee-cap operational
route. Nothing here executes SQL or starts a funded sprint.
