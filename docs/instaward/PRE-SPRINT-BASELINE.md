<!-- BYETERY-INSTAWARD-DOCUMENTATION -->
# Pre-Sprint Baseline — Byetery

**PRE-SPRINT BASELINE** · As of 2026-10-09 · Timezone: America/Santiago.

Inicio oficial del sprint no confirmado. No se asignan avances a Week 1–4 ni se afirma aprobación/pago del Instaward. La clasificación baseline es provisional hasta confirmar la fecha acordada.

## Reference

Repository: https://github.com/chrlstl4n2307-ai/Byetery · Visibilidad observada: PUBLIC. Branch inspeccionada: `codex/testnet-app-integration`. HEAD/base: `252fff88d4c4abbb6986460c12f1766b1ddfb574`. Tag: ninguno encontrado. El freeze formal identifica el contenido completo mediante el tag canónico indicado al final.

El commit del 26 de septiembre es una base reproducible publicada. El helper y wallet/QR son trabajo pre-sprint posterior al commit histórico. El freeze preserva el helper directamente y wallet/QR mediante snapshot reconstruible separado, sin declarar que estén completos.

## What already exists

- Contrato Soroban Rust congelado, roles, transiciones, evidencia y pago atómico prefinanciado.
- WASM SHA-256: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`; coincidente antes/rebuild/deployment histórico. La comprobación local del 9 de octubre registró el mismo hash.
- Backend Foundation, PostgreSQL privado/RLS, Supabase Auth DEV, API real, idempotencia, nonce de wallet y mock durable.
- Frontend Next con login, dashboard y cuatro vistas humanas; QR de lookup y estados/recompensa separados, conectado a DEV/MOCK.
- Pruebas, checkpoints y documentos históricos públicos.

## Actual architecture

```text
Frontend Next.js
  -> API / Supabase Auth DEV
  -> Coordinator / PostgreSQL / RLS
  -> StellarService -> MockStellarService [application currently uses MOCK]

Separate historical path:
Stellar CLI -> frozen Soroban contract -> Stellar Testnet [validated 2026-09-26]

Partial local work, not yet connected/validated:
StellarSigner -> LocalSecureStoreSigner -> Rust helper -> CLI Secure Store
TestnetStellarService [NOT IMPLEMENTED] -> RPC submit/confirm/reconciliation [PENDING]
```

La demo MOCK valida la aplicación y sus permisos, pero no ejecuta Soroban. La suite Rust y el flujo CLI Testnet son evidencia distinta. No existe todavía evidencia frontend -> API -> TestnetStellarService -> contrato.

## Stellar configuration and historical outcome

Contract: `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`. SAC: `CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G`. Asset: `GREENTEST:GCHROKHXHL4L635J6Y6DWFFD5DDHABOAF4BP5TEUZDZQMW4XYS6DIDL7`. Reward: 100000000 base units = 10 GREENTEST; display GREEN-TEST; sin valor monetario declarado.

Lifecycle: REGISTERED -> RETURNED -> COLLECTED -> RECYCLED. Request: OPEN / CANCELLED / CONFIRMED. Reward: NOT_ELIGIBLE -> PENDING -> SENT. FAILED permanece off-chain.

Register ADMIN; return/cancel/reward SERVICE; collection SERVICE + COLLECTOR; recycling RECYCLER. SERVICE representa acciones de usuarios autenticados off-chain. QR identifica, no concede autoridad.

Un run histórico: `BYE-TN-D7DB910EE8BA`, request `aac70a9546fb6197234bc65d467e19d24e008733ba785d111155af90c7cf9864`. Contrato 100 -> 90 GREENTEST; recipient 0 -> 10; segundo pago rechazado con balances iguales. Es prueba de contrato por CLI, no un run de aplicación ni de sprint.

## Validated historical metrics

| Metric | Recorded outcome | Evidence |
| --- | --- | --- |
| Rust native | 20/20 | [EV-005](https://github.com/chrlstl4n2307-ai/Byetery/blob/252fff88d4c4abbb6986460c12f1766b1ddfb574/docs/TESTNET-CONTRACT-VALIDATION.md) |
| Rust wasm-tests | 20 nativos repetidos + 1 constructor WASM; no sumar como 41 casos distintos | EV-005 |
| Foundation / TypeScript | 50/50; PASS | EV-005 |
| HTTP DEV / loopback API / MOCK | 43/43; PASS | EV-008 |
| Frontend / typecheck / lint / build | 33/33; PASS | EV-003/005 |
| SQL PGlite | 82/82; rollback | EV-005 |
| Python | 4/4 | EV-005 |
| MOCK demo | Complete simulated cycle and 10 GREEN-TEST | EV-005 |
| Direct Testnet lifecycle | One historical successful lifecycle; 12 confirmed setup/lifecycle txs | EV-006 |

## Partial work and issues

Wallet/QR branch has local SEP-53/Freighter/camera work and its own reports, uncommitted and not merged into this base. Manual real Freighter/camera E2E is not accredited by the checkpoint used here.

The helper spike cargo check passed after pinning spec-tools/typescript to 28.0.0. The adapter typechecks and its nine fake/process tests passed. Native executable/test validation encountered Windows GNU/LLVM C++ linking problems. A documented CXXSTDLIB adjustment was being rebuilt when the user requested pause. Cached C++ objects completed, but tests/signatures did not complete. Product development remains PAUSED. No confirmed helper signature, new application Testnet transaction or reward is claimed.

## Scope and next milestone

First validate the helper offline, including both collection authorizations. Then complete API adapter, persistence-before-broadcast, SUCCESS confirmation and recovery; connect UI and execute new runs. Resume product work only after the user's instruction.

D1–D3 budgets and 23 binary criteria are in ACCEPTANCE-CRITERIA.md. No criterion is marked PASS as new sprint completion. Operator interest, signing readiness and demo-review logistics remain open SOW gates. Physical recycling, Mainnet, production custody, oracles/hardware and new assets are outside the scope.

## Formal freeze reference

**HISTORICAL BASELINE:** `252fff88d4c4abbb6986460c12f1766b1ddfb574` — prior direct-contract/Testnet validation.

**FROZEN PRE-SPRINT BASELINE:** annotated tag `pre-instaward-baseline-v1`, created by this freeze procedure. Its commit SHA is resolved from the tag after creation, not guessed or embedded circularly.

Canonical source/index: https://github.com/chrlstl4n2307-ai/Byetery/tree/pre-instaward-baseline-v1

Incomplete helper work is PARTIAL / RESEARCH-SPIKE / NOT VALIDATED. Wallet/QR WIP is archived separately with its base, patch and hashes and is not merged. See FREEZE-CLASSIFICATION.md and BASELINE-MANIFEST.json. This snapshot preserves pre-sprint work; no D1/D2/D3 implementation or new product validation occurred in this freeze. Official sprint start: UNCONFIRMED.
