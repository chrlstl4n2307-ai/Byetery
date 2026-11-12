# D3-24 — proposed signing contract, custody decision and session wiring

Classification: **LOCAL DEFENSIVE PREPARATION / OWNER DECISION PENDING**.

`SECURITY_STATUS = HOLD`
`EXTERNAL_MANIFEST_APPROVED = NO`
`PRE_LIVE_AUTHORITY = NO`
`LIVE_AUTHORITY = NO`

This specification defines the meaning and limits of existing candidate controls.
It does not expand timeouts, implement new operational controls, modify private-key
handling, approve a binary/manifest, or accept any deliverable. The original
server `725d252` and operator `4735b83a` and their isolated defensive candidates
remain preserved. The capture-only patch is prepared separately in `B24capture`.

## 1. Exact temporal vocabulary

Let `D` be the minimum effective key-use deadline derived from the signed
execution, four validated JWT expiries minus the session margin, applicable SQL
session expiries minus that margin, and the exact source lease. The parent
conservatively charges the complete SQL round trip against remaining validity.
The helper receives the bound `notAfter` and also tracks a monotonic budget.

Unchanged policy, in milliseconds:

| Control | Value |
|---|---:|
| Launch grant | 900000 |
| Maximum JWT observation age at launch | 600000 |
| Maximum signed execution window | 4500000 |
| Margin from shortest valid session | 120000 |

These are ceilings, not promises of runtime duration or authority to open Auth.
The 68-minute rehearsal is a simulation, not measured Stellar Testnet latency.

### Signature authorization point

The **signature initiation authorization point** is the final successful helper
deadline check after its SIGN permit and immediately before calling synchronous
Ed25519 on the validated payload. The authorized action is one such call for the
exact request and phase. It is not a renewable permission or a new transaction
identity. There is no credential I/O, IPC wait or asynchronous await between this
check and the call in the candidate implementation.

This is a software authorization linearization point, **not an atomic wall-clock
or PostgreSQL operation**. A process may be descheduled between instructions.
The definition does not assert that all CPU work finishes by D or that a remote
revocation is observable instantaneously after the last permit. Those would
require guarantees this OS/database design does not provide.

### Completion and result eligibility

The helper checks time again after cryptographic work. The parent rechecks the
effective deadline and SQL-connection health after the child closes, while it
still owns the transaction. A signature whose computation finishes after the
deadline is rejected, and a result arriving after the parent's fence is rejected.
This cannot undo computation already performed or erase an earlier signature
instantaneously from all memory.

Later SDK validation or audit I/O is processing, not an extension of signing
authority. A result object is never itself permission to submit. Each subsequent
privileged worker boundary must pass its existing current-state checks. The
contract does not promise that every signer Promise or audit write settles before
D. No change to that behavior is implemented here.

## 2. Trust model and evidence categories

| Category | Meaning in this candidate |
|---|---|
| `ASSUMED_TRUST_BOUNDARY` | Authorized parent and its pinned policy, pinned helper and code/dependencies, private child pipes, owner key custody, trusted local OS/user and clocks. The helper is not an independent verifier of the complete owner ceremony. |
| `GUARANTEED_BY_DESIGN` | Under those assumptions, strict v3 request/phase binding, LOAD then SIGN, helper initiation gate, post-computation and parent result gates, transaction/lease/context binding, no D3 downgrade, and no new dispatch permission from an uncertain result. This is a statement of the code's controls, not a hard real-time theorem. |
| `TESTED_LOCALLY` | Synthetic exact cutoff, delayed loading/response, expired lease, missing generation, preparation revocation, parent-custody loss, process timeout/close, SQL revocation/connection-loss cases, original-hash uncertainty handling, transactional PoP cutoff, and a 17-case cross-process session fixture. Earlier reports distinguish PGlite from actual PostgreSQL 17.6 and reused tests from new runs. |
| `RESIDUAL_RISK` | OS suspension/preemption, connection loss after final SIGN ACK, in-flight credential retrieval returning late, unobserved clock/OS compromise, forced termination preventing Drop, and SEP-5 intermediate copies not explicitly erased. Real custody interoperability and real latency are not demonstrated. |

The request hash binds XDR, phase and the operation/context/instance/generation/
deadline fields. Permits are exact private-channel stage messages bound to that
request hash. They are not separately owner-signed grants. A same-OS-user caller
already entitled to use CLI credentials is outside the remote-application threat
boundary. Do not advertise the helper as independently enforcing all D3 policy
against arbitrary privileged local invocation.

## 3. Revocation, failure and uncertainty

### SQL transaction remains valid

The parent holds the exact admission/session/membership/source-lease locks through
child termination. Conflicting revocation writers serialize behind those locks.
Revocation becomes effective in this model when its transaction commits, not when
someone first requests it. Expiring time limits are additionally enforced by the
local deadline gates; a row lock does not freeze time.

### SQL connection is lost

Before either permit, the same transaction connection must successfully respond
to the parent's health query and its deadline check. A detected failure prevents
the permit and terminates the child conservatively. A failed transaction or
post-child health check prevents accepting a successful fenced result.

If SQL is lost after the final SIGN ACK, the helper cannot atomically observe the
loss or a newly committed revocation. It still checks its own deadline. A
cryptographic action already authorized at the last gate may execute; the parent
must reject a result under lost custody and must not start a new send. This is
the explicit residual race, not a claim of instantaneous remote revocation.

### Process suspension or child failure

Resuming before the final helper check must still pass both clocks. A suspension
after that check may let computation occur later; post-sign/parent result checks
reject late output. No arbitrary scheduling delay bound is assumed. Credential
retrieval begun while valid may finish later; no signature is then authorized if
the deadline check fails. The existing timeout bounds the parent protocol, not
the execution time of every OS API. No OS credential-call cancellation is claimed.

Timeout, IPC failure, failed post-check or a started child without a trustworthy
outcome is **uncertain signing**, not proof that no signature existed. Preserve
identity, observations, budget and historical controls. The reviewed H2 unsigned
close requires its existing durable zero-dispatch/absent-envelope/absent-intent
proof. It cannot use a timeout as that proof. Parent timeout retains the locks
until process close, rather than releasing them while a child could keep signing.

## 4. First submission and reconciliation

A new first submission needs the existing durable identity and dispatch intent,
current source-sequence check, active authority/lease and final synchronous
before-fetch check. No await may grant a new first-send permission after that
check has expired. Network delivery or acknowledgement is not assumed to be
atomic with a local clock; the same scheduling qualification applies.

Once a first send may have started, a deadline or timeout does not mean failure
or zero dispatch. SUBMITTED/UNKNOWN is reconciled through the original transaction
hash and immutable envelope. There is no replacement preparation, post-admission
retry or automatic budget refund for D3. A later read-only SUCCESS may be recorded
after the execution window. Reconciliation is observation, not renewed signing or
submission authority. Quiescence, periodic scheduler try-lock and the ordinary
API's separate historical behavior are unchanged.

## 5. Custody alternatives and recommendation

No real Secure Store entry, seed, private key or credential was read or exercised.
No private-key code or dependency was changed by this phase.

| Dimension | A — existing private helper | B — policy-capable custody API |
|---|---|---|
| Exposure surface | Seed/key material enters the short-lived fixed-role helper process. No export/persistence/logging API is present. Trusts local OS and parent. | Application receives signatures only if a reviewed custody implementation contains key access and policy checking. A plain call to today's opaque CLI sign_data is insufficient for H1. |
| Erasure demonstrated | Explicit credential and byte buffers, Mnemonic fields and SigningKey have erasure support. Normalization String and intermediate SEP-5 KeyPair have no explicit wipe guarantee. Forced termination/OS internals remain outside Drop guarantees. | Can reduce application-owned copies. Complete erasure still depends on implementation and dependencies; an upstream/pinned adaptation must address the same SEP-5 intermediate copies. It is not automatically guaranteed by the word “audited”. |
| CLI / SEP-5 | Same fixed keyring mapping and default index-0/None derivation as the pinned CLI. Real public identity settings/interoperability and additional runtime vectors remain to verify under separate authority. | Must preserve entry names, optional derivation settings, expected public-key check, canonical V1/V2 payloads and Testnet/fee/role guards. No drop-in policy-hook API has been established in the installed public interface. |
| Dependencies | Four already-pinned transitive packages became direct. No version upgrade; local custody review burden remains. | New pinned upstream/fork/broker integration may add audit and maintenance burden. No dependency or service is selected or installed. |
| Auditability | Small local reader and explicit two-stage fence; residual memory and scheduling limitations must be stated. | A narrow upstream hook could keep custody in the CLI module. A broad fork or new broker can substantially increase the review surface. |
| SHA / binary work | Existing uncommitted defensive server/operator changes still need approved immutable commits. Helper binary hash, source/runtime pins, future plan and manifest must be reviewed/reissued separately. This document does not materialize them. | Further source and binary identities, dependency/source attestations, compatibility regressions, plan/composition pins and approval would additionally be required. |
| D3 schedule | Smallest remaining implementation delta: define/accept the bounded contract, close capture review, then perform separately authorized interoperability/operational validation. No completion-time promise. | Availability, implementation and review duration are unknown. Making it a prerequisite could block the current D3 schedule. |
| Missing evidence | Owner acceptance of the trust/time model and memory risk, independent final source review, approved production build, public identity-setting verification, allowed real integration and final operational ratification. | Demonstrated suitable API, reviewed source/custody/erasure guarantees, synthetic compatibility and timing tests, approved pinned build and all operational integration evidence. |

**Recommendation: A for this controlled Stellar Testnet D3 milestone, conditional
on explicit owner acceptance of this bounded model and the documented MEDIUM
memory-hygiene risk.** This recommendation does not itself accept either risk or
approve operations. It is inappropriate as a claim of full zeroization, hard
real-time revocation, Mainnet readiness, or a multi-tenant hosted signing service.

B is the preferred hardening direction when a narrowly auditable policy hook is
available. Simply wrapping the current CLI API with a check before the call would
restore the original H1 gap. Hardware custody improves non-exportability, but does
not automatically enforce app wall-clock deadlines or SQL revocation. Its actual
policy support is unverified. Choosing B requires a separate scope and schedule
decision, not an unreviewed substitution during the D3 run.

Official context was consulted through Stellar Raven: Stellar CLI
[key storage security](https://developers.stellar.org/docs/tools/cli/agent-cli/reference/authority-model#key-storage-security)
and [Secure Store identity mapping](https://developers.stellar.org/docs/tools/cli/agent-cli/quickstart#where-the-key-is-stored).
Those docs explain storage choices, not a zeroization or real-time certificate.
The specific compatibility comparison uses the pinned local CLI 28.0.0 and SEP-5
0.1.0 source inspected in the independent review.

## 6. Four-session wrapper connection — design only

Retain the candidate protocol already exercised by the 17/17 separate-process
test. No public endpoint or real session is created here.

1. The future approved wrapper checks exact composition/operator/source/binary
   pins, plan, capture profile, clean checkouts and read-only readiness. Loading a
   manifest or creating a server context grants no business authority. A new
   server instance/challenge can exist before admission.
2. Only under a later owner-authorized Auth ceremony, validate the required Auth
   setting/readback and observation time. Then create the four ordinary sessions
   once via no-echo credentials. Do not create long-lived sessions in an earlier
   3600-second preparation phase and pretend they support a 75-minute window.
   Signed execution is always clipped to the shortest actual session minus the
   margin; 75 minutes is a maximum, not an automatic grant.
3. `prepareLocalRoleSessions` keeps bearers in its private runtime map. Its trusted
   verification callback sends them only over the future reviewed private local
   control channel to server-owned `prepareD324Sessions`. That server uses the
   actual Auth validator and SQL membership/session/actor bindings. The callback
   must not let the operator certify identities unilaterally.
4. Keep the exact immutable server receipt in a private one-use registry. If a
   process boundary needs an opaque handle, scope it to that server instance,
   challenge and preparation; possession of it is not authorization. Never trust
   a deserialized receipt object. No such production bridge is implemented here.
5. Use the verified public session pins in the independently signed execution
   authorization, with the separate manifest, fresh grant, LIVE permission and
   runner PoP. All future signatures/approvals require separate owner authority.
   Refreshing sessions after signing changes the pinned identity and requires
   stopping, not automatic renewal or rebinding.
6. After separate LIVE authority, server admission consumes the original receipt,
   rechecks all four current bindings under SQL locks and atomically inserts its
   unique durable admission/budget context. Return a scoped admission observation,
   not a new bearer or an authority substitute. Observe failure as failure to
   admit; do not invent success from a handle or partial response.
7. Only after durable admission invoke the reviewed operator factory with the
   same `preparedSessions` object. The existing `d324Proofs.assertAdmission` checks
   the exact task/operator/plan/battery/recipient. It must not log in a second time
   or ask for admission before creating sessions. Calling the factory prematurely
   could create a journal and is prohibited by this proposed sequencing.
8. Worker key-use and dispatch boundaries still revalidate current authority.
   Preparation alone cannot queue a reserved battery, bypass a role or consume a
   business budget slot. Capture-only proof cannot stand in for admission.

Before admission, server restart loses its receipt and rotates instance/challenge.
Stop and obtain a separately authorized revalidation/ceremony; do not silently
reuse old controls. After admission, a restart preserves the durable SQL identity
and budget, but cannot turn that into automatic signing continuation. Preserve
journal, marker and original-hash reconciliation. Keep tokens only in process
memory, do not persist them to the journal, and close ordinary local sessions on
shutdown when possible. A failed logout is uncertain and must not fabricate a
confirmed closure.

Remaining tests for later implementation include real wrapper process ordering,
private control-channel authentication/bounds, process restart against separately
persistent SQL, receipt-handle substitution, post-sign session rotation rejection,
and shutdown cleanup. Reuse the existing synthetic 17-case integration as a
regression, not as evidence of a completed production bridge.

## 7. Capture closure and unchanged controls

The new capture-only profile lives outside the two frozen subtrees. It requires
the fixed owner key's canonical V3 manifest signature, fixed D3-24 identity and
profile hash, exact signed composition SHA/parent/tree, clean physical checkout,
literal receipt/evidence trees, file bytes and unchanged ledger. It supplies no
LIVE capability. Future V3 manifest validation must explicitly adopt the extra
`artifacts.captureProfileSha256` binding and pin this verifier's code. No real
manifest has been generated, signed or approved here.

The legacy F1 case passes in a clean `864dd0c` fixture and deliberately rejects
the later D3-24 evidence tree. Do not redefine that rejection as a general test
failure to be bypassed. Switching an operational caller to the new profile is
separate integration work and approval.

Unchanged budget: 5 historical confirmed, ordinary limit 19, RUN1 maximum 5,
contingency transaction #20 NOT AUTHORIZED. No historical entry, plan, journal,
marker, grant or evidence is rewritten. No key handling, server/operator logic,
contract, WASM, migration/RLS, Auth, source lease, quiescence or scheduler control
is modified by the capture-only patch and this proposed specification.

Owner decisions still required: accept or reject A and its explicit residual
risks; approve or revise the initiation/result/revocation semantics; review the
capture patch and proposed V3 profile binding; authorize any future commits,
composition/plan/binary ratification and wrapper implementation separately.
None implies PRE-LIVE or LIVE permission.

## 8. Owner selection — provisional OPTION_A

The owner selected `CUSTODY_DESIGN = OPTION_A` as the candidate architecture for
the controlled Stellar Testnet MVP. This supersedes the earlier unselected
recommendation only. It does **not** accept residual risk for real key use.

`CUSTODY_DESIGN_SELECTED = OPTION_A / PROVISIONAL`
`CUSTODY_RISK_ACCEPTED_FOR_LIVE = NO`
`EXTERNAL_MANIFEST_APPROVED = NO`
`PRE_LIVE_AUTHORITY = NO`
`LIVE_AUTHORITY = NO`

The parent/helper/private-IPC trust model, LOAD/SIGN gates, initiation/result
checks, valid-SQL revocation model, after-ACK risk, SEP-5 intermediate-copy gap,
suspension limits and original-identity reconciliation above remain unchanged.
No private-key implementation or time limit is modified by this selection.
Future ratification must explicitly accept or reject the precise initiation and
result contract, revocation behavior and residual custody risk before real use.

## 9. A24 contract and cross-version compatibility matrix

A24 calls the historical CLI `main()` rather than just an export comparator.
Before dispatching **any** CLI subcommand, `main()` calls
`assertBusinessFingerprint()`. The README and `spec.json` identify business SHA
`c6ba2e837ed0f7b81373655b8106b58ecb86a8cd` and fingerprint
`e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539`.
`business-files.json` fixes the individual bytes of 24 source/test files. The
contract is exact frozen source bytes, **not a test that accepts any historical
Git HEAD**. A24's positive expectation requires a source environment satisfying
that fingerprint; `84f1bdd` is one legitimate matching checkout.

The underlying execution-identity restriction remains necessary in D3-24. It is
not waived because A24 is historical. D3-24 has separately scoped plan/operator,
composition, query, journal and receipt controls; its actual export route uses
`verifyD324OwnerExport` / `verifyD324ExportRows`, not the legacy CLI `main()`.
Capture-profile approval is an additional check, not a substitute for those
execution-identity controls or authorization to use a different runtime.

Read-only comparison of all 24 pins: `c6ba2e837` and `84f1bdd` match 24/24;
`864dd0c` differs in coordinator/server; `725d252` differs in those and five
testnet transport-related modules. Thus F1's tree-only historical PASS does not
imply A24's separate business-fingerprint PASS.

| Verifier / property | Source checkout | Manifest state | Expected result and contract |
|---|---|---|---|
| Historical CLI / A24 | `84f1bdd`, 24/24 business bytes | Not required by this historical read-only CLI | PASS with correct historical export/bundle/query fixtures. It grants no execution authority. |
| Historical CLI / A24 | `864dd0c` or D3-24 composition | Any, including a new signed manifest | Reject `BLOCKED_FROZEN_SHA_DRIFT`. A manifest cannot amend this frozen CLI fingerprint. |
| Historical F1 capture-tree profile | `864dd0c` with original receipt and evidence trees | Not required for this tree check | PASS. This verifies tree identities, not the full business implementation. |
| Historical F1 capture-tree profile | D3-24 evidence tree `0d67dd...` | Any | Reject `RATIFIED_CAPTURE_REJECTED`. No legacy fallback or historical hash substitution. |
| D3-24 capture profile | Historical checkout with legacy evidence | Even a correctly signed D3-24 manifest | Reject ancestry/composition/tree mismatch. Historical evidence is not a new D3-24 run. |
| D3-24 capture profile | Clean exact approved D3-24 composition with fixed trees/bytes | Missing, malformed, wrong key/domain/profile or wrong identity | Reject. Correct source files alone do not establish owner ratification. |
| D3-24 capture profile | Same clean exact composition | Valid owner V3 signature, exact target and profile digest | Capture-data verification PASS only. Synthetic test signatures demonstrate the implementation; no real approval currently exists. |
| D3-24 capture profile | Dirty, byte-modified or different composition | Valid approval for a different or previous snapshot | Reject, including continuity rechecks. Do not derive a new pin from HEAD. |
| D3-24 operational execution | Any local test checkout | Capture-only proof, or no complete operational ratification | BLOCKED. Full operator/plan, sessions, grant/execution/LIVE/PoP, admission, worker and budget controls remain required. |

Classification: **A for the literal positive A24 test, under its frozen-byte
contract; B for the underlying requirement to verify the executing identity.**
The latter must hold under D3-24's approved version-specific controls. It is not
correct to run the old positive CLI test against a new runtime and call its
rejection a regression, nor to treat that rejection as permission to bypass
execution-identity verification. Do not delete A24, change its pins, or silently
redirect the D3-24 workflow through it. Production wrapper wiring remains pending.

## 10. Current local validation closure — 2026-11-12

The validation-only uncommitted checkout `B24validation` combines exact copies of
the 16 server, 2 operator and 4 capture/doc candidate paths. Original candidate
source bytes and historical commits remain unchanged. This local test overlay is
not ratified as an executable composition, and no new business SHA/planHash or
operational manifest was generated.

| Fresh check | Result / qualification |
|---|---|
| Capture profile final code | 29/29 PASS, including wrong hash, missing/invalid manifest, wrong domain/key, arbitrary-pin input, legacy downgrade, physical-byte drift and continuity rejection |
| Root `npm run verify` on combined source | Exit 0; backend 701/701 with 0 skipped; TypeScript PASS; Python 4/4; local MOCK demo complete |
| Frozen contract | Rust tests 21/21, release `wasm32v1-none` rebuild, WASM constructor test 1/1, rustfmt and Clippy PASS; unchanged source/lock and expected WASM SHA-256 |
| Helper | 8 fenced unit + 22 validation tests PASS; fmt and Clippy PASS; synthetic keys only; existing local LLVM/UCRT linker and stripped debug info for resource capacity, not operational binary approval |
| Real PostgreSQL | Local ephemeral 17.6 only; H1 delayed response/late result, H2 reviewed zero-dispatch closure, M1 commit-time PoP rollback, source/revocation races and scheduler/external-lock coordination PASS |
| Four sessions across separate processes | 17/17 PASS, synthetic Ed25519 JWTs and loopback Auth provider; production validator, server receipt and candidate operator; 0 real sessions/business operations/admissions |
| Historical launcher | 144/144 PASS in clean `864dd0c`; F1 pin stays unchanged |
| Historical export / A24 | 33/33 export tests PASS in clean `84f1bdd`, including A24; all 24 frozen business files match |
| Historical composition | 15/15 PASS in an isolated reconstruction of the 21 exact `ae50b483` file blobs over its required `864dd0c` base; original manifest SHA-256 `d77a5e9477723d09350d85ad19002ba1d44c0f40496fbeb238379439a2680250` preserved |
| Activation / operational identity | 10/10 synthetic activation PASS with installed PowerShell 7.6.9; historical operational identity 1/1 PASS in clean `B24run` |

The initial broad diagnostic across 188 tests on the dirty combined overlay had
175 PASS / 13 FAIL. Eight were missing the PowerShell fixture path; five were
positive tests against a deliberately incompatible checkout (F1 1, operational
identity 1, original composition 3). All affected cases passed on the reruns
above with their correct local fixtures and no code/pin relaxation. Preserve this
diagnostic result; do not describe the uncommitted overlay as a clean ratified
execution environment. The earlier 36/37 A24 report is likewise historical, not
an unresolved permission to bypass the fingerprint.

Integrated status: **PASS_LOCAL_CONTEXT_QUALIFIED**. Every requested local
verification category was executed. This is not a measured Testnet end-to-end
run or approval of real custody, actual Auth sessions or a production binary.
The 68-minute simulated timing remains a simulation. A 5400-second token can
provide at most 5280 seconds after the unchanged margin, and elapsed session age
reduces that window further; the signed 4500000-ms ceiling is clipped to the
shortest effective session/SQL/lease deadline. Latency may still force STOP.

Disk cleanup removed only ignored, reproducible compiler objects and incremental
caches (1,654,353,726 bytes), after resolved-path/reparse and inactive-compiler
checks. Existing link archives were hashed before/after and unchanged. No
historical evidence, journal, key, ledger, manifest, commit or final artifact was
deleted. Final free capacity was approximately 2.09 GB before writing this
report. PostgreSQL fixture cleanup completed.

Ready for **review** of capture/security patch commits: YES. No commit is
authorized by this result. No new high-severity implementation blocker was
identified within these local tests/review. Operational approval is still blocked
by explicit owner acceptance of residual custody/initiation/revocation risks,
final immutable composition/operator/plan identity and independent manifest
approval, and review of actual wrapper/four-session/real-custody integration.
No real credentials or private keys were used. No assurance of absolute
zeroization, instantaneous revocation or hard real-time execution is made.

Budget remains historical confirmed 5, ordinary limit 19, RUN1 max 5,
TX20_AUTHORIZED NO. External ledger and historical plan/evidence bytes are intact.
All PRE-LIVE/LIVE/manifest authority remains NO and SECURITY_STATUS remains HOLD.
