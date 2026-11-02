# D3 local operator — build boundary and future runbook

Classification: OFFLINE BUILD / NO LIVE EXECUTION AUTHORITY. D3-5-OPERATOR.
Internal acceptance remains D1 12/12, D2 6/6, D3 0/5, total 18/23.

## Existing binding, unchanged business rules

```text
local owner operator (ordinary password sessions, authenticated HTTP only)
  -> application/http.ts -> SupabaseAuth -> Coordinator / Repository
  -> TestnetStellarService (OperationProcessor)
  -> DurableTransactionWorker / TransportStore
  -> TestnetTransport.prepareAndSimulate
  -> validate persisted authority, evidence, identities, lifecycle and recipient
  -> LocalSecureStoreSigner.authorize (collection requires service + collector)
  -> finalize SDK hash -> LocalSecureStoreSigner.signEnvelope
  -> persist signed identity -> committed dispatch intent
  -> fresh source sequence comparison -> submit once
  -> original-hash observation/reconciliation -> confirmed SQL projection
```

`LIVE_BINDING_ALREADY_EXISTS = YES`. No replacement binding or live-adapter.
The thin operator imports no service, transport, signer, RPC, SQL or storage
implementation. It reuses the existing public D3 plan validator. That validator
already references public ABI/network constants and SDK public-key validation;
those imports are not transaction preparation or authority to use a signer.

Only `application/server.ts` receives a runtime integration change: the local
guard runs before settings/secrets loading, Repository construction, dynamic
signer imports or reconciliation. Signer and transport implementation stay frozen.
The hosted read-only review runtime and its configuration are not modified.

## No activation in this task

`live-operator.ts` is an importable local operator factory, **not an auto-running
CLI or a daemon**. Importing it does not perform I/O. A future owner-reviewed
local launcher can call `createLocalOperator` with public paths, API origin,
publishable key, a no-echo in-memory credential callback and a read-only preflight
reader. There is no secret argument, credential file or env activation switch.
This build does not call the factory with live authority or start the real API.
The original offline CLI `execute` refusal remains byte-identical and denied.
This operator is a separate authenticated application client, not a way to
activate the offline mock runner or construct a second chain binding.

The invoking process itself must have exactly:

```text
--live --task-id D3-9-RUN1 --expected-sha <future-frozen-40-character-SHA>
```

The supplied arguments must match the actual process argv. The exact task must
match the separately reviewed preflight task and run; a plan JSON cannot grant
authority. A later separately owner-authorized task may select RUN2/RUN3 using
the same frozen implementation and a matching `D3-<number>-RUN<1|2|3>` task.
One invocation covers one run; it never advances to another run automatically.
This is not present authorization for any of those task IDs.

The factory verifies the actual module worktree, HEAD and a completely clean
worktree, including untracked files. Another clean checkout cannot be passed as
the source of dirty operator code. The current uncommitted candidate cannot run.
The protected local untracked documents remain untouched; a future clean
execution worktree may be required. Do not weaken the clean check to hide them.

## Hosted hard block

Any presence (including empty/zero values) of `VERCEL*`, `NOW_*`, `AWS_*`,
`LAMBDA_*`, `CF_*`, `CLOUDFLARE_*`, `NETLIFY*`, `RENDER*`, `RAILWAY_*`, `FLY_*`,
`K_SERVICE*`, `WEBSITE_*`, `FUNCTIONS_*`, or `CI`, or `NODE_ENV=production`, denies
the local operator and local API server before signer loading/construction.
Only explicit numeric loopback HTTP API origins are allowed; no redirects,
URL credentials, query strings or hosted API origins. No Vercel protection or
Preview settings change. Tests cover a guarded factory plus a real subprocess
startup with Vercel markers and source-order verification before dynamic import.
This guard covers these entrypoints, not every historical maintenance script.
It is an operational safeguard, not a sandbox against a hostile local OS owner.

## Fresh public preflight observations

`Preflight` represents reviewed observations, not credentials or a signing
capability. Its local reader must be supplied during a separately authorized
preflight task. D3-5 implements/tests the checks; it does **not** invent RPC/SQL
readers, access Secure Store, or claim these observations were obtained live.

Checks run at startup and again before every action:

- Exact task/run, actual HEAD, clean module worktree and runtime SHA.
- Observations at most 60 seconds old; Testnet network ID, exact deployment,
  contract and frozen WASM, and application mode TESTNET.
- Zero unresolved work and pending/UNKNOWN dispatches; unique reviewed batteries.
- Exact four expected public signer identities and availability declarations.
- ADMIN, SERVICE and RECYCLER source identities, fresh reviewed sequence matches
  and sufficient declared fee readiness. The collector authorizes collection;
  the service is its transaction source.
- Exactly two distinct owner-approved public wallet mappings, authorized
  trustlines and aggregate headroom for each wallet's planned rewards. No USER2
  requirement, linking, account creation or Wallet B selection.
- Contract as SAC payer, at least 30 GREENTEST plus a positive reviewed margin;
  sufficient source XLM; reviewed TTL minimum and observed margin.
- Successful business cap at most 15; failed negative broadcasts, setup and
  maintenance all zero; simulation-before-send and reviewed fee conditions.
- Common-Git-directory lock, held through the session; no concurrent actions.

**Before starting the real server**, inspect existing unresolved work/leases.
Its existing startup and two-second interval reconcile queued work. Merely
starting that process can cause actions; starting it is not a read-only preflight.

The actual runtime independently enforces simulation, authority, fee limits,
durable identity and final source sequence before broadcast. The application
lease cannot protect manual/external transactions. Sequence drift requires
reviewed resolution; no automatic re-preparation is permitted.

## Normal sessions and supported application requests

The password grant matches the existing ordinary application flow. Only the
existing Supabase DEV Auth origin and publishable/anon key are accepted. No
admin generate_link, service_role login, injected user IDs or bypass cookies.
Passwords and bearer tokens stay in memory. Credential input objects are cleared
after login, sessions are validated by `/api/me`, and close requests local logout.
No tokens, cookies, passwords, Auth UUIDs or personal emails enter output.

| Operation | Role | Existing route | Body authority |
| --- | --- | --- | --- |
| register_battery | ADMIN | POST /api/batteries | Reviewed battery + fixture metadata |
| open_return | USER | POST /api/batteries/:id/returns | Existing verified walletLinkId |
| confirm_collection | COLLECTOR | POST /api/returns/:requestId/collection | Exact local evidence bytes |
| confirm_recycling | RECYCLER | POST /api/returns/:requestId/recycling | Exact local evidence bytes |
| pay_reward | USER | POST /api/batteries/:id/reward | Empty body; server fixes recipient |

WalletLinkId must resolve from the USER's normal `/api/me` to the approved run
recipient; no arbitrary recipient override. Server generates the request ID.
No new routes or contract rules. Reads use existing battery/history/profile APIs.
Lifecycle, transaction and reward remain separate; confirmed recycling requires
PENDING reward, payment requires separately verified SENT.

## Journal, serialization and budget

The fixed directory `<git-common-dir>/byetery-d3-operator` is local Git metadata,
outside the versioned tree. Worktrees of that repository share it. The lock is
exclusive-create (`wx`), fsynced and ownership checked, with no stale-lock stealing.
Independent repository clones do not share that OS lock: coordinate the one
operator operationally; the real runtime still checks shared source sequences.

Journals are named by exact task/SHA and exclusive-created. Existing journals
require review, even after a crash. Each battery receives an exclusive durable
consumed tombstone before its first request, including failed attempts.

Budget reservations are persisted and fsynced by plan hash across sessions.
Unknown/rejected reservations are not refunded. The maximum 15 is a proposed
build ceiling, **not execution approval**: 12 lifecycle + 3 rewards. Future owner
approval may lower it. There is no negative/setup/maintenance send surface.
The runtime fee ceiling is **50,000,000 stroops (5 XLM)** per transaction. The
operator's read-only reflection is tested against `SIGNER_FEE_CAP`; it is not a
new signing policy and does not pass a fee override to the API.

Only closed-schema sanitized fields reach JSONL: task/SHA/run/battery, role,
operation, phase, application operation/request IDs, HTTP status, confirmed
domain/reward state, returned transaction hash, reconciliation and timestamp.
Unknown response/error fields are dropped; raw responses, keys, XDR, envelopes,
authorization entries and Secure Store output are never serialized. Intent and
budget are persisted before POST. Stable idempotency identities derive from
task/SHA/plan/run/battery/operation; no fresh identity is generated after timeout.

## Uncertainty and evidence

No automatic POST retries. An unresolved response naming an operation, including
503, consults existing authenticated history for that **same** operation ID and
the original hash when available. History must be exact deployment/contract,
TESTNET, persisted CONFIRMED, independently VERIFIED/CONFIRMED and SUCCESS.
The existing server worker performs reconciliation; GET does not force dispatch.
If still unresolved, STOP. If a lost response provides no operation ID, STOP
with the persisted intent for reviewed resolution, never infer by battery or
issue another payment. Do not restart a session to bypass an existing journal.

Safe evidence retains original operation/hash, history ledger/time and resulting
states, plus exact submitted attestation bytes/base64 and their SHA-256. These are
inputs for the existing D3 manifest exporter, **not a complete live manifest**.
Receipt/events, independent before/after balances, actual signer and simulation
evidence still require separately approved authoritative collection. Do not fill
those gaps with true flags or fabricated transaction references.

Future contract-enforced negative evidence is explicitly:
API rejection + unchanged state/balance + contract simulateTransaction rejection,
with zero failed broadcasts. This build supplies only the observation interface;
it does not add a direct RPC or simulation endpoint to the operator.

## Run counting and next gate

RUN1 counts only with frozen SHA, full fresh preflight, same SHA/runtime for all
operations and correct completion without source changes. Otherwise it is
`FAILED_ATTEMPT / NON_COUNTING`; keep the consumed battery and failed evidence.
After any required source fix, all three counted runs must use the new SHA.

Needed before FREEZE: no additional architectural/source decision identified.
Owner still reviews this candidate and its exact fingerprint before freezing.

Needed before live preflight/execution, not decided here:

1. Final Wallet A and Wallet B, control proofs and application mappings.
2. Fresh GREENTEST payer balance, XLM fee readiness and trustline headroom.
3. TTL retention/maintenance decision under separate authority if needed.
4. Exact successful transaction cap and acceptance of the existing fee ceiling.
5. Which run receives the controlled uncertainty test and its evidence surface.
6. Final frozen SHA, exact task/run and explicit owner GO for RUN1.

Historical public recipient B is not USER2 and remains ownership-unconfirmed.
No USER2 release/use, wallet creation/linking, trustline change or live decision.
No D3 owner acceptance is implied by an offline test result.

## Sources checked for compatibility

Stellar Raven consulted first. Official [getTransaction reference](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction)
separates SUCCESS, FAILED and NOT_FOUND and documents bounded retained history.
Thus absent/uncertain evidence never authorizes replacement or proves failure.
The [Supabase password login reference](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
matches the application's existing ordinary login flow. No protocol, Auth
configuration, schema or frozen-contract incompatibility was found.
