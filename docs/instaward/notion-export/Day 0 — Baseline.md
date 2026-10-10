# Byetery — Instaward Progress Report

# Day 0 — Pre-Sprint Baseline

**PRE-SPRINT BASELINE** · Report prepared 2026-10-09 · America/Santiago.

Inicio oficial del sprint no confirmado. No se asignan avances a Week 1–4 ni se afirma aprobación/pago del Instaward. La clasificación baseline es provisional hasta confirmar la fecha acordada.

## Starting point

Byetery already has a web MVP, authenticated API and a tested battery lifecycle. The web currently uses a blockchain mock. Separately, the same lifecycle contract was tested directly on Stellar Testnet. The remaining challenge is connecting those two paths safely.

## What already exists

Frozen contract, backend/data/auth/roles, connected MOCK web, QR lookup, evidence commitments, reward guards and recorded tests. Recent local helper code is pre-existing unfinished work and is not declared a new funded deliverable.

## Stellar components already present

- Soroban contract `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`; historical deployment confirmed.
- SAC `CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G`; GREENTEST (display GREEN-TEST), test-only reward 10.
- Public ADMIN/SERVICE/COLLECTOR/RECYCLER actors; collection requires both SERVICE and COLLECTOR.
- Physical states REGISTERED, RETURNED, COLLECTED, RECYCLED; reward NOT_ELIGIBLE, PENDING, SENT.
- Historical direct CLI cycle and balance 100->90 / 0->10, with duplicate reward rejected.

## What is incomplete

TestnetStellarService, durable real transaction references/recovery, web-to-Testnet connection, verifier UI, three new application runs/two recipients, final manifests/video and reviewer access. Native helper tests/actual signatures are pending; product is paused.

## Main technical challenge

Obtain validated Soroban authorizations from Secure Store without exporting keys, then persist transaction identity before submitting and confirm only SUCCESS. Timeouts/NOT_FOUND must remain unresolved and cannot trigger a new transaction blindly.

## Starting architecture

```text
Frontend -> Backend/API -> Coordinator -> StellarService
                                       -> MockStellarService [CONNECTED]
                                       -> TestnetStellarService [PENDING]
                                            -> Stellar RPC -> Soroban [future connection]
Historical separate proof: CLI -> Soroban -> Stellar Testnet [CONFIRMED]
Partial signer: StellarSigner -> local Rust helper -> Secure Store [NOT FULLY VALIDATED]
```

## Deliverables

D1 — Reliable Stellar Testnet Integration: USD 2,000. D2 — Connected Web MVP & Verification Interface: USD 1,600. D3 — E2E Lifecycle & Test Reward: USD 1,300. Total proposed USD 4,900; no award/payment assumed.

## Initial metrics

| Metric | Actual state |
| --- | --- |
| Public repository | YES — GitHub API observed 2026-10-09 |
| Soroban contract deployed | YES — historical 2026-09-26 |
| Historical Testnet validation | YES — one CLI run, not application E2E |
| TestnetStellarService | NOT IMPLEMENTED |
| Single-auth app/helper | UNVALIDATED — helper code exists; actual signature tests pending |
| SERVICE + COLLECTOR | PASS historical direct contract; NOT VALIDATED through helper/application |
| Connected web -> Testnet | NO |
| Complete application E2E | MOCK YES; Testnet NO |
| Reward E2E | Direct contract YES historical; application Testnet NO |
| MOCK regression | 50 Foundation and existing historical suites PASS; nine adapter tests PASS |
| Sprint acceptance criteria | 0/23 PASS; no new sprint completion established |
| Official sprint start | UNCONFIRMED |

## Known risks

Signing build/validation, network uncertainty and reconciliation, local custody/review availability, Testnet resets/archives and physical attestations. Operator interest and access logistics are unclosed SOW gates. Tests prove integrity/authorization; they do not prove real physical recycling.

## Next milestone

Complete the baseline index and confirm official start/access logistics. Resume product work only on user instruction; validate helper offline before adapter implementation.

## Baseline reference

Repository: https://github.com/chrlstl4n2307-ai/Byetery

Branch: `codex/testnet-app-integration`. Commit: [252fff88d4c4abbb6986460c12f1766b1ddfb574](https://github.com/chrlstl4n2307-ai/Byetery/commit/252fff88d4c4abbb6986460c12f1766b1ddfb574). Frozen tag: `pre-instaward-baseline-v1`. Historical commit above remains separate. Historical commit date: 2026-09-26. Baseline observation/report date: 2026-10-09. Current local WIP is inventoried separately and is not that committed source snapshot.

Evidence: [Historical contract report](https://github.com/chrlstl4n2307-ai/Byetery/blob/252fff88d4c4abbb6986460c12f1766b1ddfb574/docs/TESTNET-CONTRACT-VALIDATION.md), [Public result JSON](https://github.com/chrlstl4n2307-ai/Byetery/blob/252fff88d4c4abbb6986460c12f1766b1ddfb574/docs/testnet/validation-2026-09-26.json), EVIDENCE-INDEX.md and BASELINE-MANIFEST.json. Publication is verified after this tag is pushed; the canonical URLs use the frozen tag.

## Formal freeze reference

**HISTORICAL BASELINE:** `252fff88d4c4abbb6986460c12f1766b1ddfb574` — prior direct-contract/Testnet validation.

**FROZEN PRE-SPRINT BASELINE:** annotated tag `pre-instaward-baseline-v1`, created by this freeze procedure. Its commit SHA is resolved from the tag after creation, not guessed or embedded circularly.

Canonical source/index: https://github.com/chrlstl4n2307-ai/Byetery/tree/pre-instaward-baseline-v1

Incomplete helper work is PARTIAL / RESEARCH-SPIKE / NOT VALIDATED. Wallet/QR WIP is archived separately with its base, patch and hashes and is not merged. See FREEZE-CLASSIFICATION.md and BASELINE-MANIFEST.json. This snapshot preserves pre-sprint work; no D1/D2/D3 implementation or new product validation occurred in this freeze. Official sprint start: UNCONFIRMED.
