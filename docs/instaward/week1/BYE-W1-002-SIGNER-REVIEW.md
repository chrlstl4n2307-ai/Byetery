# BYE-W1-002 — Signing boundary review

Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.
Observed: 2026-10-19, America/Santiago.
Status: OWNER APPROVED — two-stage signer implementation in progress.
Starting HEAD: `869a43bda795a7c708ea8bc8b5991b217938906d`.
Branch: `instaward/d1-testnet-integration`.

## Finding

The validated helper is not shown to have a cryptographic defect. Its current
one-call interface cannot implement the approved two-stage application signing
order for `confirm_collection` without a substantive signer change.

Evidence in the starting commit:

- `tools/stellar-secure-store-signer/src/lib.rs:306`: `sign_request` first calls
  `sign_soroban_authorizations` (line 319), then `sign_tx` (line 343), and returns
  only the fully signed envelope. No intermediate authorized unsigned body is
  returned to the TypeScript caller.
- That helper accepts only request version 1 (line 112), rejects existing envelope
  signatures (line 144), and requires collection address credentials to have a
  Void signature and expiration zero (lines 238–241). Feeding an already
  authorized collection body into a second existing call is therefore rejected.
- `backend/src/local-secure-store-signer.ts:47–103` exposes only `sign`, requires
  one source signature on the returned envelope, verifies both signature domains,
  and returns the fully signed envelope. It has no auth-only operation.
- `backend/src/testnet/worker.ts:38–40` requires attach authorization, then
  `finalizedBody` (SDK hash), then `signEnvelope`. The worker remains intentionally
  restricted to LOCAL_FAKE; this review does not remove that restriction.
- `docs/voluntary/VOL-003-IMPLEMENTATION-PLAN.md:125–129` records the owner-required
  ordering, and line 162 says: "Keep VOL-002 helper unchanged; substantive signer
  changes require stopping/review."

Returning an envelope with its source signature stripped after a combined signing
call would not establish that the SDK hash was computed before source signing.
Calling the combined signer twice would not establish that ordering either.
Neither workaround is proposed.

For source-only authorization, including registration, there is no separate
address signature to attach. That does not resolve collection's two-stage seam
or satisfy this task's complete adapter/signing tests before its live gate.

## Official protocol reference, consulted through Stellar Raven first

Raven `stellarDocs.search_soroban_contract_docs`, observed
`2026-10-19T16:38:37.225Z`, returned the official
[Signing Soroban Invocations guide](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations).
Source-account authorization is implicit in the transaction signature. Address
authorization uses a separate invocation-tree signature with nonce and
ledger-based expiration. These are distinct signature domains.

The guide does not require a JavaScript SDK checkpoint between those signing
steps. The incompatibility is with Byetery's expressly approved orchestration
order, not a claim that Stellar prohibits the existing combined helper.

## Minimum change approved by owner

On 2026-10-19 the owner explicitly answered "Sí, aprobar esas dos fases" to the
versioned auth-only / envelope-signing proposal. The diagnostic stop is resolved;
implementation can resume within that exact scope. The remainder of this review
records the pre-implementation finding and proposed acceptance gates, not evidence
that the complete integration has passed.

Preserve the existing version-1 path and its tests. Add an explicit version-2
two-stage protocol to the existing helper and TypeScript signer boundary:

1. `authorize`: validate the original prepared body with the existing network,
   contract, method, actor, argument, fee, time and authorization guards. Sign
   only the expected Soroban address authorization, when present. Return the
   authorized body with zero source-envelope signatures. No RPC or submission.
2. The TypeScript adapter verifies the authorization, confirms exact invocation
   arguments and persisted recipient binding, then computes the final body hash
   using the official SDK with the Testnet passphrase.
3. `sign_envelope`: validate the authorized body again, verify its expected
   collection signature and expiration, and require its network-bound hash to
   equal the SDK-provided expected hash. Sign only the fixed source account.
   Preserve every byte of the authorized transaction body.
4. Verify returned source signature, identical transaction body and SDK hash;
   persist the immutable identity and COMMIT before any dispatch intent/send.

The second phase must not accept arbitrary pre-authorized invocations or skip
the existing guards. Share validation code where possible, keeping the explicit
unsigned-auth requirement for phase one and strict signed-auth verification for
phase two. No key export, new identity selection, new contract/method, cap
increase, contract modification or new remote dependency is proposed.

Required new tests after approval: phase-one output has no envelope signature;
SDK hash precedes phase-two invocation; wrong expected hash/body/contract/network/
actor/recipient/auth/expiration/fee rejected; phase-two preserves auth bytes;
collection requires SERVICE source plus COLLECTOR address authorization; each
signature domain verifies independently; version-1 tests remain unchanged.
Continue the adapter, database, API and deterministic recovery tests only after
review; all original live gates still apply.

## Verification performed at the initial review stop

- Expected starting HEAD and both immutable tag targets verified.
- Current local WASM SHA-256:
  `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6` — MATCH.
- Protected untracked `tools/sync_obsidian.py` SHA-256:
  `48404b9431a9d955fc4af0b2eeaf9a59bb2fb0e9457eed73b4f2f66132a5e2da` — unchanged.
- Existing TypeScript signer boundary and durable identity tests: 12/12 PASS.
- Existing native helper validation tests: 18/18 PASS.
- These are existing offline tests. No Secure Store identity was accessed, no
  actual account signature generated and no RPC transaction sent by this review.
- Full root verification, real-adapter integration suite, remote schema review/
  application and live readiness gates were not executed at this stop point.

## Delivery status at the initial review stop (historical)

TestnetStellarService, real RPC binding, signer integration, real persistence/
dispatch, sequence recheck, recipient binding, operation-specific resolution and
non-static reward proof: NOT IMPLEMENTED / NOT VALIDATED for BYE-W1-002.
Existing MOCK and frozen contract are unchanged. Existing VOL-003 fixture coverage
is not real Testnet application evidence. No schema, RLS or configuration change.

First application register: NOT EXECUTED. No battery/request IDs allocated, no
simulation fee/auth count/hash/confirmation ledger/API result to report.
Follow-up open_return simulation: NOT EXECUTED.
No live signing, broadcast, maintenance or reward operation.

BYE-W1-001 remains historical PARTIAL (23/25 PASS, 2/25 PARTIAL).
D1.1/D1.3/D1.4/D1.5/D1.7: NOT YET SATISFIED by new application evidence.
Acceptance remains D1 0/12, D2 0/6, D3 0/5; no criterion marked PASS.

Owner review was subsequently approved as recorded above. Resume BYE-W1-002;
BYE-W1-003 has not started. Final implementation evidence belongs in the task report.
