# D2-002 — Separate lifecycle, transaction and reward lanes

2026-10-22 · OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.

Branch `instaward/d2-web-mvp`. D2 starts at `3c7d373ec893a2e66101c4bcfbee354b3a53e434`; D2-001 prerequisite checkpoint: `6e5ee6adbf573cb2d792242bd275644b2be2ed36`. Frozen pre-sprint comparison remains `450c21b`. D1 evidence and branch are preserved.

## Result

**IMPLEMENTED / TESTED locally.** No hosted or authenticated live browser/API integration is claimed. Vercel remains gated separately. This is a presentation change, not a new state machine or an acceptance decision.

The battery view exposes three named, independently testable regions:

1. **Estado de ciclo / atestación** displays only the confirmed battery state and its timeline. RECYCLED is an authorized lifecycle attestation, not independent physical/environmental certification.
2. **Estado de transacción Stellar** displays the API's pending operation, its raw state, command and operation ID. UNKNOWN maps to UNCERTAIN; SUBMITTED/READY/AWAITING_AUTH map to PENDING. Unknown vocabulary fails closed to UNCERTAIN. No pending operation displays NO_PENDING_OPERATION, never an inferred confirmation.
3. **Estado de recompensa** displays the confirmed reward state independently and identifies the last attempt separately. RECYCLED with reward PENDING does not display a paid/completed claim. A failed attempt does not rewrite the confirmed reward or battery state.

The dashboard also separates transaction presentation from battery and reward state. Existing MOCK actions and the read-only TESTNET restrictions introduced by D2-001 remain intact. No endpoint, contract rule, reward eligibility rule or coordinator was changed.

## Read-model limit

The existing response has no latest terminal transaction receipt/hash/ledger. The UI therefore cannot reconstruct a confirmed transaction from lastAttempt=SUCCEEDED, battery=RECYCLED, reward=SENT or the absence of pendingOperation. It explicitly explains this limitation. The CONFIRMED display vocabulary is used only if the operation itself explicitly supplies that state; no success is invented. Full receipt presentation and public lifecycle operation are outside this task.

## Validation

| Check | Result |
| --- | --- |
| Frontend tests | 102/102 PASS, 8 files; existing tests retained |
| Added D2-002 tests | 20 PASS: mapping, uncertainty, no terminal-receipt inference, independent reward/attempt state |
| Frontend TypeScript | PASS |
| ESLint | PASS |
| Local Next production build | PASS |
| Client bundle / frontend env allowlist audit | PASS; 17 artifacts, no privileged secrets |
| Root npm run verify | PASS: Rust native/WASM, release build, fmt/Clippy, backend 148/148 and TypeScript, Python 4/4, MOCK demo |
| Authenticated deployed browser/API read | NOT RUN; no reachable reviewed HTTPS API |

Controlled component tests include RECYCLED + PENDING reward under QUEUED/PENDING/UNKNOWN/FAILED transactions; a failed reward attempt while the confirmed reward remains PENDING; and a previously confirmed SENT reward while another operation is uncertain. No test removes uncertainty by equating timeout with failure or success. Exact origin, Secure cookie, source mismatch and server-side mutation rejection regressions from D2-001 also pass.

## Scope and evidence

Changed presentation files: battery, dashboard and CSS. New files: transaction-lane component, state-lanes display helper and its tests. The enclosing task commit records these changes without fabricating a self-referential public URL. See [the evidence index](EVIDENCE-INDEX.md) and [D2-001](D2-001-REPORT.md).

No new Stellar transaction, operational signature, broadcast, lifecycle, reward or Testnet worker. No backend, database, RLS, role, principal/Auth, contract, WASM, dependency or lockfile change. No Vercel deployment, main merge, tag move, Notion write or Obsidian sync. Local custody audit and sync tool remain untracked and outside commits.

Owner acceptance remains **D1 12/12; D2 0/6; D3 0/5; total 12/23**. No Stellar/SDF/Instawards approval or payment is asserted. STOP before D2-003, D2-007, A2 or D3.
