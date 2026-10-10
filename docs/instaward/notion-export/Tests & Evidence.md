# Evidence Index

PRE-SPRINT BASELINE · 2026-10-09

Inicio oficial del sprint no confirmado. No se asignan avances a Week 1–4 ni se afirma aprobación/pago del Instaward. La clasificación baseline es provisional hasta confirmar la fecha acordada.

| ID | Date | Artifact / claim | Result / scope | Commit | Public evidence | Limits |
| --- | --- | --- | --- | --- | --- | --- |
| EV-001 | 2026-09-12 | Consolidación y suites Windows | PASS histórico | 767e8f45dd13a3bfb9b041ed2fd00a1b8d3381df | [Source](https://github.com/chrlstl4n2307-ai/Byetery/blob/767e8f45dd13a3bfb9b041ed2fd00a1b8d3381df/docs/verification/WINDOWS-CHECKPOINT.md) | 20 nativos, 20 repetidos con feature WASM + 1 constructor; Foundation 50; Python 4; demo MOCK. |
| EV-002 | 2026-09-13 | API real + Supabase DEV + MOCK | PASS histórico | 90b7e23081107fcadec0e415da6476b62a4cd41e | [Source](https://github.com/chrlstl4n2307-ai/Byetery/blob/90b7e23081107fcadec0e415da6476b62a4cd41e/docs/verification/HTTP-API-VALIDATION.md) | 35 pruebas Node en ese checkpoint; no ejecuta Soroban. |
| EV-003 | 2026-09-13 | Frontend MVP y lecturas autenticadas | PASS histórico | f48759361d89e10bc433a2b6eab5051bf7fe57c2 | [Source](https://github.com/chrlstl4n2307-ai/Byetery/blob/f48759361d89e10bc433a2b6eab5051bf7fe57c2/docs/verification/FRONTEND-MVP.md) | 33 frontend; HTTP 43; demo visual MOCK. Cámara/Freighter no acreditados. |
| EV-004 | 2026-09-13 | Ajustes visuales y alcance MOCK | PASS histórico | 0a572af29b6d4df6c16feb0329ecc225948824f6 | [Source](https://github.com/chrlstl4n2307-ai/Byetery/blob/0a572af29b6d4df6c16feb0329ecc225948824f6/docs/verification/VISUAL-POLISH.md) | 33 frontend; textos/recompensa; sin cambio de reglas. |
| EV-005 | 2026-09-26 | Contrato real Testnet y recompensa | PASS histórico | 252fff88d4c4abbb6986460c12f1766b1ddfb574 | [Source](https://github.com/chrlstl4n2307-ai/Byetery/blob/252fff88d4c4abbb6986460c12f1766b1ddfb574/docs/TESTNET-CONTRACT-VALIDATION.md) | CLI directo; un lifecycle; 10 GREENTEST; doble reward rechazado; no app Testnet. |
| EV-006 | 2026-09-26 | Resultados públicos estructurados | PASS histórico | 252fff88d4c4abbb6986460c12f1766b1ddfb574 | [Source](https://github.com/chrlstl4n2307-ai/Byetery/blob/252fff88d4c4abbb6986460c12f1766b1ddfb574/docs/testnet/validation-2026-09-26.json) | 12 transacciones confirmadas; config, snapshots, balances, evidencia y rechazos. |
| EV-007 | 2026-09-26 | ABI y payloads | CONSERVADO | 252fff88d4c4abbb6986460c12f1766b1ddfb574 | [Source](https://github.com/chrlstl4n2307-ai/Byetery/blob/252fff88d4c4abbb6986460c12f1766b1ddfb574/docs/testnet/contract-spec.json) | Complementos: collection-payload.txt y recycling-payload.txt; bytes versionados. |
| EV-008 | 2026-09-26 | HTTP Supabase DEV del checkpoint Testnet | PASS histórico | 252fff88d4c4abbb6986460c12f1766b1ddfb574 | [Source](https://github.com/chrlstl4n2307-ai/Byetery/blob/252fff88d4c4abbb6986460c12f1766b1ddfb574/docs/TESTNET-CONTRACT-VALIDATION.md) | 43/43; cleanup acotado, Foundation inmutable retenida. |
| EV-009 | 2026-10-06 | SOW V3.1 y sus 23 criterios | DRAFT | Sin commit fuente | Preserved by frozen tag; check corresponding snapshot/source report | Fuente local revisada; matrices exactas archivadas en ACCEPTANCE-CRITERIA.md; no aprobación de financiación. |
| EV-010 | 2026-10-09 | Helper y adaptador en trabajo local | IN PROGRESS / PAUSED | WIP sobre 252fff88d4c4abbb6986460c12f1766b1ddfb574 | Preserved by frozen tag; check corresponding snapshot/source report | Spike cargo check PASS; TypeScript PASS; 9 adapter tests reportados; sin firma offline completa ni nuevo hash Testnet. |
| EV-011 | 2026-10-09 | Baseline Foundation repetido | PASS reportado; WIP | 252fff88d4c4abbb6986460c12f1766b1ddfb574 (base, no snapshot exacto) | Preserved by frozen tag; check corresponding snapshot/source report | Log guardado: 50/50 y typecheck; no acredita todo el WIP actual. |
| EV-012 | 2026-10-09 | Lectura pública de prerrequisitos Testnet | OBSERVACIÓN; no ejecución | 252fff88d4c4abbb6986460c12f1766b1ddfb574 (base) | Preserved by frozen tag; check corresponding snapshot/source report | Lectura registrada: protocolo 29, ledger 5109472, una instancia de contrato y cuenta SERVICE existente; no nuevo deployment. |
| EV-013 | 2026-10-09 | Inventario de dos worktrees y Git | SNAPSHOT documental | 252fff88d4c4abbb6986460c12f1766b1ddfb574 | Preserved by frozen tag; check corresponding snapshot/source report | BASELINE-MANIFEST.json contiene paths relativos, hashes y estados; no incluye env, claves ni builds. |
| EV-014 | 2026-10-09 | Detección Notion | NO CALLABLE TOOL | No aplica | Preserved by frozen tag; check corresponding snapshot/source report | Plugin instalado según catálogo; no herramientas search/create/update en esta sesión; export local preparado. |

## Publication rules

Use immutable GitHub commit links and exact artifacts, not the repository homepage as acceptance proof. Entries without a public URL remain explicitly unpublished. Do not create a GitHub link for an uncommitted file and imply it is accessible. Local paths, credentials and signer XDR are excluded from Notion exports.

For sprint evidence append criterion ID, expected/actual result, exact source commit, fixture version, execution date/timezone, mode/network, public artifact URL and transaction reference when submitted. NOT_FOUND/timeouts do not prove failure; rejected-before-submit cases have no invented hash/ledger.

## Final package checklist — INSTAWARD SPRINT (not completed)

- [ ] Official start date and frozen pre-sprint inventory.
- [ ] D1.1–D1.12 PASS with adapter/recovery/authorization reports.
- [ ] D2.1–D2.6 PASS with four-role access, timeline, verifier and review instructions.
- [ ] D3.1–D3.5 PASS: three new runs, two recipients, six negative cases, balances/manifests.
- [ ] Final exact commit, accessible artifacts, video and reproduction commands.
- [ ] Secret audit and approval for public sharing of any operator material.

No final delivery or funding completion is asserted. The Markdown/CSV export is documentation infrastructure, not product acceptance evidence.

## Formal freeze reference

**HISTORICAL BASELINE:** `252fff88d4c4abbb6986460c12f1766b1ddfb574` — prior direct-contract/Testnet validation.

**FROZEN PRE-SPRINT BASELINE:** annotated tag `pre-instaward-baseline-v1`, created by this freeze procedure. Its commit SHA is resolved from the tag after creation, not guessed or embedded circularly.

Canonical source/index: https://github.com/chrlstl4n2307-ai/Byetery/tree/pre-instaward-baseline-v1

Incomplete helper work is PARTIAL / RESEARCH-SPIKE / NOT VALIDATED. Wallet/QR WIP is archived separately with its base, patch and hashes and is not merged. See FREEZE-CLASSIFICATION.md and BASELINE-MANIFEST.json. This snapshot preserves pre-sprint work; no D1/D2/D3 implementation or new product validation occurred in this freeze. Official sprint start: UNCONFIRMED.

Public baseline index at frozen tag: https://github.com/chrlstl4n2307-ai/Byetery/blob/pre-instaward-baseline-v1/docs/instaward/EVIDENCE-INDEX.md
