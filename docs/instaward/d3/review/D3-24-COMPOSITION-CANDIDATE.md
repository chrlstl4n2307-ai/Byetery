# D3-24 — uncommitted definitive composition candidate

Classification: local preparation / offline validation only.
SECURITY_STATUS=HOLD. EXTERNAL_MANIFEST_APPROVED=NO.
PRE_LIVE_AUTHORITY=NO. LIVE_AUTHORITY=NO.
CUSTODY_DESIGN=OPTION_A_PROVISIONAL. CUSTODY_RISK_ACCEPTED_FOR_LIVE=NO.

## Provenance and proposed graph

```text
864dd0c... (expected remote integration checkpoint; not contacted in this offline task)
  ... local ancestor chain (six commits through21f5e3e in total) ...
  725d252...
    +-- 21f5e3e... server repair, 16 exact files
    |     +-- [future single-parent composition commit/tree: NOT MATERIALIZED]
    +-- 496f8914... capture, 4 exact copied blobs, separate provenance reference

c6ba2e837... -> c50e4eb1... -> 4735b83a... -> d85e54e0... independent operator
```

Actual worktree: `B24composition-21f5`, detached at
`21f5e3e7a27759d02a0477c374b7e37f35f96909`, unstaged local changes only.
No merge/cherry-pick commit, force/reset, integration-branch movement or push.
The copied capture files are not falsely declared descendants of the server.
Both source references and the independent operator must remain available for
review. A future integration push does not automatically publish the sibling
capture/operator histories. Publication of the full ancestor range requires
separate review/authority and re-reading the remote HEAD.

## New candidate identities

Operator: `d85e54e00e98c8d8bc6294c883708a701ce55440`.
Parent: `4735b83a47d29ab8608f4ed8a1237e1fbe9c8636`.
Tree: `e9f8887867b161e4e681f8533050735a928ca657`.
PlanHash: `0435d8436d13881ebbdf31e729cf36a80e538bc149300219353f68817b37d72d`.
Task/run: D3-24-RUN1 / RUN1.
Battery: BYE-D3-R1-20261111-DCDE088CA870.
Recipient: GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS.
Future composition SHA/tree: null, pending materialization; never invented.

The original plan and both historical ledgers are unchanged. The former ledger's
old candidate SHA/plan fields are explicitly historical, not rewritten as new
approval. Its policy still proves five historical confirmations,14 remaining up
to19, RUN1 cap5, and transaction20 locked. The new proposal remains REVIEW_ONLY.

## Bindings prepared

The candidate updates operator/plan/readiness/export references and the SELECT
query metadata. All sixteen security-server files and four capture files stay
byte-identical to their respective commits. No auth/signing/worker rule or remote
schema is changed. Capture trees remain0d67dd... (D3-24), cccda6... (legacy), and
366c0da... (receipt); RATIFIED_CAPTURE_REJECTED is unchanged.

New internal session control and wrapper connect phase A/B across two synthetic
processes. Production Auth validation, private core receipt and durable admission
are reused. Preparation never grants business authority. Real credentials,
actual-session integration and real-custody behavior are not claimed.

PowerShell/Node entry is review-only and explicitly rejects LIVE. The V3 adapter
does not mint owner approval, accepts no invented future commit and delegates
capture approval to the fixed-owner verifier after a clean checkout exists.
The helper was built offline/locked and its binary/source measured independently;
its hash equals the preceding candidate because the source bytes are unchanged.
This is not inheritance of prior custody approval or proof of a clean rebuild.

## Fresh verification

| Check | Result |
|---|---|
| Root npm run verify | Exit0; backend700/700, no skips; TypeScript; Python4/4; MOCK demo |
| Independent operator | 61/61 |
| Composition and V3 review guards | 13/13 |
| Wrapper/operator/server synthetic sessions | 21/21, two loopback processes; ACK digest compared with durable sessions |
| New-SHA/plan five-step application/worker fixtures | 8 scenarios, including all five expirations and reviewed no-dispatch closures |
| New identity readiness / capture / export | 12/12 |
| Preserved capture profile | 29/29 |
| Historical owner export including A24 | 33/33 in84f1bdd |
| Historical F1 | 1/1 in864dd0c |
| Real PostgreSQL quiescence/scheduler | 2/2; external lock rejects,90 periodic scans leave0 waiters |
| H1/H2/M1, ordinary API, idempotency/recovery | Included in the fresh full backend run with real local PostgreSQL cases |
| Helper Rust | Offline30/30, build and Clippy; rustfmt checked directly |
| Frozen Rust/WASM | Native21, feature run21+1WASM, release rebuild/fmt/Clippy; expected hash preserved |
| PowerShell/Node | Review PASS, default LIVE BLOCKED |

Backend700 is separate from operator61: the server deliberately retains its old
historical operator module, while the new operator is independently loaded by
SHA. This is not the previous temporary701-test overlay that copied both modules.
All these are local functional results, not a ratified operational deployment.

The helper's final scripted fmt permission review timed out; direct installed
rustfmt --check then passed without modifying code or protections. This was an
approval-review timeout, not a source/test failure. No action remains blocked by it.

## Shutdown anomaly

SHUTDOWN_560S_ROOT_CAUSE=NOT_PROVEN; NOT_REPRODUCED.
Three phase-instrumented executions passed in approximately4.74–4.82 seconds.
PGlite initialization/migrations took1.38–3.06s; fixture seeding19–305ms;
worker-to-fake-sign27–150ms; fenced settlement24–113ms; subsequent drain wait0ms;
PGlite close2–5ms. Event-loop stalls up to~2.3s occurred during initialization.
The fresh uninstrumented full suite's same test passed in~2.14s.

This specific test uses in-memory PGlite and FakeTransport. It has no real helper
process or PostgreSQL socket. No repeated lock-release or drain deadlock was
observed. Historic per-phase traces do not exist, so the560s cannot honestly be
attributed to helper, cleanup, scheduler, suspension or another process. Local
resource/scheduling pressure remains a hypothesis, not a proven root cause.
No security timeout was changed. No performance fix is justified by these data.
Future tests may add diagnostic bounds around fixture setup/sign-phase arrival,
but that would be a separate test-only proposal, not a runtime timing relaxation.

## Capacity and approval limits

Only the ignored reproducible integration-test executable
`validation-7b05053af79c1b0b.exe` was removed after its tests passed, exact path,
reparse/ignore/process checks and hash recording:871146496bytes, SHA-256
`a6ac2c133ac9ddefa2e4f2406457878bd07dfff40a0dc08f2a74e3d9cba14197`.
Signer executable, source, link archives, evidence, keys, journals and ledgers were
preserved. No ambiguous cleanup was performed. All PostgreSQL fixtures are local
and their cleanup is verified separately in the final evidence inventory.

Still required before any operational use: owner review/materialization of this
composition; publication authorization; immutable composition SHA/parent/tree;
independent V3 manifest approval and pinned executable closure; acceptance of
OPTION_A's trusted-parent, SEP-5 intermediate-copy, last-ACK revocation and OS
suspension risks; real-session/custody integration under separate authority;
fresh DB/chain/budget checks; separate PRE-LIVE and LIVE authorizations.

No real owner keys or Secure Store entry were accessed. Only synthetic fixture
signatures were generated. No remote migration/Auth change, real grant/admission,
PRE-LIVE/LIVE, Stellar transaction or RUN2/RUN3. Transaction20 remains unauthorized.
