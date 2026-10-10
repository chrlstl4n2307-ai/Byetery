# Decisions / Risks / Issues

PRE-SPRINT BASELINE · Inicio oficial del sprint no confirmado. No se asignan avances a Week 1–4 ni se afirma aprobación/pago del Instaward. La clasificación baseline es provisional hasta confirmar la fecha acordada.

## DEC-001 — Separate lifecycle and reward

Date: 2026-09-12 (committed evidence)

Status: ACCEPTED

Context: A physical battery may be recycled before payment is completed.

Decision: Keep physical states and reward states separate; FAILED is off-chain.

Alternatives considered: One combined success state.

Reason: Preserve atomic reward and understandable state projections.

Impact: D1/D2/D3 must show RECYCLED/PENDING then SENT.

Evidence / references: EV-001/005; frozen domain/ABI.

## DEC-002 — QR identifies; server authorization governs

Date: 2026-09-13 (checkpoint evidence)

Status: ACCEPTED

Context: A public code can be copied.

Decision: QR identifies Battery ID; authenticated user and server/contract roles authorize actions.

Alternatives considered: Treating QR as a permission or reward-owner proof.

Reason: Prevent unauthorized collection/recycling or recipient changes.

Impact: D2.2 cannot be satisfied by lookup alone.

Evidence / references: EV-002/003.

## DEC-003 — Preserve contract and isolated worktrees

Date: 2026-09-26

Status: ACCEPTED

Context: Contract local checkpoint already passed; wallet/QR work remained separate.

Decision: Use clean isolated contract-validation branch; preserve frozen sources and original WIP.

Alternatives considered: Mixing/rebuilding functional rules in validation.

Reason: Keep exact proof and avoid accidental changes.

Impact: No silent redeployment/role changes; baseline source preserved.

Evidence / references: EV-005; Git worktrees/BASELINE-MANIFEST.json.

## DEC-004 — MOCK does not execute Soroban

Date: 2026-09-13 (checkpoint evidence)

Status: ACCEPTED

Context: Application simulation and deployed contract are separate implementations.

Decision: Keep mock for reproducible development and disclose its source.

Alternatives considered: Presenting MOCK as blockchain execution.

Reason: Correct evidence and reviewer claims.

Impact: Historical mock tests do not close Testnet acceptance.

Evidence / references: EV-004/005.

## DEC-005 — Keep keys in Secure Store; helper does not submit

Date: 2026-09-27 investigation; authorization confirmed 2026-10-09

Status: ACCEPTED; IMPLEMENTATION UNVALIDATED

Context: CLI stock separates envelope signing inadequately for app multi-auth return.

Decision: Reuse pinned official signer APIs in a restricted helper; SDK/backend own submit and reconciliation.

Alternatives considered: Secret export, two envelope signatures, direct CLI invoke replacing API.

Reason: Existing secure-store keys are non-exportable and auth entries are required.

Impact: D1 signing gate remains open until actual signatures/enforce outcome are evidenced.

Evidence / references: SECURE-STORE-SIGNING-REVIEW.md; LOCAL-SECURE-STORE-SIGNER.md; human authorization in this task.

## DEC-006 — Three deliverables; baseline is not funded output

Date: 2026-10-06

Status: PROPOSED SOW; NOT AWARD APPROVAL

Context: Existing MVP and contract validation precede agreed sprint.

Decision: D1/D2/D3 only, budgets 2000/1600/1300; 23 criteria and readiness gates.

Alternatives considered: Charging historical work as a new deliverable.

Reason: Make scope and evidence assessable.

Impact: Official start must be confirmed; no weeks invented.

Evidence / references: SOW V3.1 / ACCEPTANCE-CRITERIA.md source checksum.

## DEC-007 — No physical certification/oracles in this scope

Date: 2026-10-06

Status: PROPOSED SOW SCOPE

Context: Integrity and authorization do not establish physical truth.

Decision: Use labeled synthetic Testnet records and authorized attestations; oracles/hardware/industrial operation outside scope.

Alternatives considered: Claiming real recycling or environmental certification.

Reason: Avoid unsupported physical-world claims.

Impact: Out-of-scope future work is not an acceptance failure.

Evidence / references: SOW V3.1 sections 3, 8, 11.1; KNOWN-LIMITATIONS.md.

## DEC-008 — Pause product work and build documentation

Date: 2026-10-09

Status: ACTIVE USER INSTRUCTION

Context: Native helper validation was still running.

Decision: Stop own build processes, preserve caches; prepare documentation only.

Alternatives considered: Continuing compile/sign/API work during documentation.

Reason: User explicitly asked to pause until instructed to continue.

Impact: No new product/test/transaction output in this documentation task.

Evidence / references: Current conversation instruction; saved build log and manifest.

## Active issues

| ID | Issue | State | Required evidence / resolution |
| --- | --- | --- | --- |
| ISS-001 | Native helper linking/build and real signatures | PAUSED / UNVALIDATED | Finish supported C++ runtime build, native tests, offline source/collector signatures; no key export. |
| ISS-002 | App Testnet adapter, durability and recovery | NOT IMPLEMENTED | D1.1–D1.12 through application. |
| ISS-003 | Official sprint start / source freeze | UNCONFIRMED | Agreed date and review of local WIP inventory. |
| ISS-004 | Operator interest | OPEN SOW G3 | Attributable consent/interest; do not invent operator participation. |
| ISS-005 | Review access / URL and windows | OPEN SOW G4 | Four-role instructions and actual access test; credentials private. |
| ISS-006 | Coin Conut / EcoTracer references | UNVERIFIED SOW G5 | Reviewer canonical links; no invented comparison. |
| ISS-007 | Notion callable tools | UNAVAILABLE THIS SESSION | Reconnect/reload tools or import prepared Markdown/CSV. Plugin is installed, not proof of write capability. |

## Formal freeze reference

**HISTORICAL BASELINE:** `252fff88d4c4abbb6986460c12f1766b1ddfb574` — prior direct-contract/Testnet validation.

**FROZEN PRE-SPRINT BASELINE:** annotated tag `pre-instaward-baseline-v1`, created by this freeze procedure. Its commit SHA is resolved from the tag after creation, not guessed or embedded circularly.

Canonical source/index: https://github.com/chrlstl4n2307-ai/Byetery/tree/pre-instaward-baseline-v1

Incomplete helper work is PARTIAL / RESEARCH-SPIKE / NOT VALIDATED. Wallet/QR WIP is archived separately with its base, patch and hashes and is not merged. See FREEZE-CLASSIFICATION.md and BASELINE-MANIFEST.json. This snapshot preserves pre-sprint work; no D1/D2/D3 implementation or new product validation occurred in this freeze. Official sprint start: UNCONFIRMED.
