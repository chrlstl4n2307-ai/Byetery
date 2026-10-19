# BYE-W1-002 — Real Testnet application integration

Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. 2026-10-19.
This document describes implementation, not acceptance or proof of a live cycle.
The task report/results separately record which live actions actually occurred.

## Selection and boundary

`StellarService` retains its existing MOCK implementation. The real
`TestnetStellarService` also implements the server's operation processor. In
TESTNET, HTTP commands reuse the existing authenticated queue, permissions,
evidence manifests and immutable return snapshots; the durable worker prepares,
signs, persists, dispatches and reconciles. The MOCK transaction/snapshot path
is unchanged. TESTNET errors never cause a MOCK fallback.

The original interface's real `prepare` binds an already committed logical
operation; it cannot create an unauthenticated transaction. The durable worker
owns actual RPC preparation and signing. Real `submit` accepts no client auth
proofs: the approved server signer fulfills the exact Soroban requirements.
Read/result methods are deployment-scoped. HTTP clients cannot select actor,
source, RPC, mode or signing phases.

No frontend configuration or UI is switched to Testnet by this task. The default
remains DEV/MOCK. Browser possession of a battery QR conveys no permissions.

## Environment

Reuse the existing DEV variables documented in `.env.example`. Additionally:

| Variable | Purpose |
| --- | --- |
| BYETERY_MODE | Explicit MOCK (default example) or TESTNET server selection |
| BYETERY_TESTNET_DEPLOYMENT_ID | Separate immutable TESTNET deployment row |
| BYETERY_SIGNER_BINARY | Absolute server-local helper executable path |
| BYETERY_CONFIG_FILE | Optional existing ignored config path, server process only |

Relative certificate paths resolve beside the selected config file. TLS
certificate validation stays enabled. No credentials are copied to public files.
Neither configuration-file paths nor signing parameters are accepted over HTTP.
RPC, passphrase, contract, actors and cap are fixed/checked by code. The adapter
does not consume STELLAR_ADMIN_SECRET or STELLAR_SERVICE_SECRET; no key export.

This worktree's root `.env` contains no configuration keys. For the authorized
DEV checks, reuse the existing ignored original-project configuration through
BYETERY_CONFIG_FILE; never print its contents or put it in Git. This is a
per-process setting, not a global environment change.

## Existing endpoints

Unchanged routes: POST /api/batteries; GET /api/batteries/:batteryId;
POST /api/batteries/:batteryId/returns; POST /api/returns/:requestId/cancel;
POST /api/returns/:requestId/collection; POST /api/returns/:requestId/recycling;
POST /api/batteries/:batteryId/reward. Existing wallet/profile reads remain.

Each mutation requires a validated Supabase DEV session and Idempotency-Key.
Identity comes from the validated session; application roles and ownership are
server-side. The service identity represents those authenticated actions on-chain.
Collection needs SERVICE source authorization plus COLLECTOR address authorization;
these are two distinct Soroban requirements, not independent human custodians.

Real responses identify source TESTNET, logical operation ID, available original
transaction hash, confirmed physical/reward state, pending operation and transport
state. Until actual confirmation/projection, use 202; unresolved technical failure
uses a sanitized 503. A reviewed sequence hold is explicitly reported as
REVIEWED_RESOLUTION_REQUIRED. No envelope, auth signature, result/meta XDR or
signer internals are returned to the browser.

## Preparation, signing and durability

The narrowly scoped RPC transport uses the fixed official Testnet endpoint,
15-second request timeouts, 8-MiB response bounds, no redirects and sanitized
method-specific errors. SDK types, XDR and assembly implement ABI/fee handling.
Provider latest-ledger metadata/header XDR are deliberately discarded because
they can contain unrelated signed transactions.

Before signing: verify network, frozen WASM/code/instance TTL through the deadline
and buffer, live configuration, account/sequence/balance, exact ordered ABI args,
logical-context hash and registration/evidence bytes. Simulate; reject errors,
restore preamble/list, unexpected auth, invalid validity windows or total fee
above 50,000,000 stroops. Resource fee plus classic inclusion fee comes from actual
simulation/SDK assembly; simulation failure has no inferred fee.

The owner approved the minimum version-2 signer change after the review in
BYE-W1-002-SIGNER-REVIEW.md. Version 1 remains supported unchanged. Version 2:

1. Authorize only the required address invocation, returning an unsigned envelope.
2. Verify its exact body/auth and compute the SDK Testnet-bound transaction hash.
3. Ask the helper to sign only the source envelope, with the exact expected hash.
4. Verify source signature and byte-identical finalized body/hash.
5. Persist exact signed bytes, immutable identity/context, bounds, expiry and
   preparation ledger; COMMIT. Then commit dispatch intent.
6. Re-read authoritative source sequence immediately before sending the persisted
   bytes. Drift/check failure records a durable reviewed hold and prevents send.

No RPC/signing/send/poll occurs inside an application SQL lock. Source leases are
network+source-wide across deployments. They do not fence manual/external use.
The frozen admin mapping requires the existing ADMIN account for this task; treat
it as shared, not as an independently guaranteed dedicated source.

## Reconciliation and authoritative predicates

Reconcile the original SDK hash. A lost send response, outage or NOT_FOUND is
uncertainty, not a failed operation; no automatic new envelope or rebroadcast.
Restart loads the persisted identity first. Confirmed FAILED is distinct from
uncertainty. Projection failure retries SQL with retained evidence, never payment.
The reviewed bounded retry entrypoint uses only identical bytes/hash while valid.

After expiry, inspect contract state and TTL-aware entries. Exact registration
commitment proves registration. Matching retained request/battery/recipient proves
return; a retained cancelled request can still prove that return occurred.
Confirmed request, expected actor/commitment and a state at least collected or
recycled prove collection/recycling. Later states may prove earlier operations.
Missing/archived/ambiguous entries never prove non-application: remain UNRESOLVED.

For reward, SENT alone does not prove that this original transaction paid. A real
success requires its confirmed original transaction, on-chain recycled/SENT
battery, matching immutable request/recipient, returned reward receipt and actual
SAC transfer event matching token/from/to/amount. Amount derives from these facts
and live configuration, not a static 10-token response. If original transaction
evidence has aged out and payment facts are insufficient, retain UNRESOLVED; do
not release the unique reward slot or infer nonpayment.

Observed result/meta XDR, contract events, Soroban return value, actual confirmation
ledger (separate from observation/state-read ledger), timestamps/correlation and
validated projection facts are retained in private storage. Public evidence is
an explicit safe summary. Importing manual later lifecycle snapshots can still
require reviewed SQL projection ordering; Foundation transition guards are never
relaxed to force an import.

## Database

See BYE-W1-002-DATABASE-REVIEW.md for the pre-application review and rollback
expectations. The existing VOL-003 migration was applied additively to Supabase
DEV only. All four tables were checked remotely: RLS enabled/forced, restrictive
deny present and anon/authenticated table grants false. No SECURITY DEFINER.
The schema migration source itself is unchanged.

Supabase's security advisor also reported leaked-password protection disabled.
That Auth setting was not changed by this task. It is separate from the passing
private-table checks: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Bounded sprint validation command

`backend/src/testnet/sprint-validation.ts --plan` performs only reads and unsigned
simulation, producing a local safe gate summary. It must not access the signer.

`--execute-register` requires a clean implementation checkpoint, matching tested
source digest and helper binary hash, passing private-table gates and fresh chain
preflight. A durable local execution journal refuses a second automatic run. It
creates an explicitly named DEV Auth fixture and ADMIN membership, then calls the
real loopback HTTP API once for a fresh BYE-W1-002 battery. Recovery polls only its
original logical operation/hash. Fixture access is disabled/Auth user removed;
immutable namespaced application/transport records remain.

After confirmed register, no further business operation is submitted. The
open_return follow-up is UNSIGNED simulation only: fresh CSPRNG request probe,
public recipient, no wallet-ownership claim, no application return association,
no signer, no queue and no broadcast. Future live returns still require verified
wallet control and a persisted immutable recipient snapshot.

BYE-W1-001's historical report remains unchanged/PARTIAL. Registration and a return
simulation cannot establish the remaining successful collection/recycling/reward
preflights. No acceptance criterion becomes PASS without owner review.
