> **Current Stage 1 recommendation — 2026-10-22 / BYE-W1-007: 12 ACCEPT / 0 HOLD; official PASS 0/12.** The original review below is historical and preserved verbatim; see the dated addendum at the end.

# BYETERY — D1 OWNER ACCEPTANCE REVIEW

**D1 OWNER ACCEPTANCE REVIEW — OWNER DECISION REQUIRED**

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. Owner Christian Medina. Review date 2026-10-22, America/Santiago. **Stage 1 only: 11/12 recommended ACCEPT; 1/12 recommended HOLD. Official D1 PASS remains 0/12; D2 0/6, D3 0/5, total 0/23.** Current readiness matrix remains 12 READY, never proof of acceptance.

Starting/reviewed evidence HEAD `0778ab75000ee1822465045f916eb3a4a0def3dc`; branch `instaward/d1-testnet-integration`. Review commit **NOT CREATED**: Stage 1 creates this packet locally; Stage 2 Git/Notion/official-status changes await explicit owner approval. No commit, push, Notion/vault update or matrix rewrite in this review. Source criterion wording below is copied verbatim from frozen [ACCEPTANCE-CRITERIA.md](../ACCEPTANCE-CRITERIA.md), SHA256 `8f426310c6336013d9c9683460ce5edc35c56f8bcb57f6eaafb563e96ff827c7`, equal to pre-sprint frozen Git blob.

## Decision summary

| Criterion | Recommendation | Evidence mode | Main reason |
| --- | --- | --- | --- |
| D1.1 | ACCEPT | REAL API + LIVE TESTNET | Las cinco operaciones tienen API, operación, hash, ledger y SUCCESS correlacionados. |
| D1.2 | HOLD | MIXED: LIVE POSITIVE + DETERMINISTIC / UNSIGNED NEGATIVES | Falta evidencia explícita del caso de actor incorrecto de open_return requerido por «each». |
| D1.3 | ACCEPT | MIXED: LIVE CONFIRMATIONS + CONTROLLED INTEGRATION | UNKNOWN y fallo no proyectan éxito; se confirma el hash original antes de proyectar. |
| D1.4 | ACCEPT | MIXED: PERSISTED SQL + LIVE TESTNET | Correlación completa de las seis operaciones D1 enviadas, con ledger y resultado. |
| D1.5 | ACCEPT | REAL API + LIVE TESTNET + SQL | A/B/C reales: mismo ID/hash en replay y409 por un único cambio, sin efectos adicionales. |
| D1.6 | ACCEPT | MIXED: REAL PAYMENT + DETERMINISTIC GUARDS + VERIFIED MANIFEST | Pago exacto0→10, contrato90→80, replay sin segundo efecto y manifiesto reproducible. |
| D1.7 | ACCEPT | CONTROLLED INTEGRATION — NOT LIVE SOROBAN | Identidad durable, interrupción antes del envío, dos DB reabiertas y primer efecto único revisado. |
| D1.8 | ACCEPT | CONTROLLED INTEGRATION + DETERMINISTIC TEST | Envío único con respuesta perdida, UNKNOWN y reconciliación del hash persistido. |
| D1.9 | ACCEPT | CONTROLLED INTEGRATION + DETERMINISTIC TEST | La caída conserva incertidumbre e identidad; la recuperación proyecta una vez sin otro envío. |
| D1.10 | ACCEPT | CONTROLLED ON-DISK RESTART + DETERMINISTIC TEST | DB close/reopen y worker nuevo retienen el mismo envelope/hash en UNKNOWN sin reenvío. |
| D1.11 | ACCEPT | CONTROLLED INTEGRATION + DETERMINISTIC TEST | NOT_FOUND conserva incertidumbre; cualquier retry revisado reutiliza exactamente los bytes/hash. |
| D1.12 | ACCEPT | DETERMINISTIC FROZEN CONTRACT + SNAPSHOT; UNSIGNED LIVE SUPPORT | Rol revocadofalse y rechazo; snapshot conserva Returned/Open/NotEligible sin atestaciones nuevas. |

Recommended ACCEPT: **11/12**. Recommended HOLD: **1/12**. Official PASS: **0/12**. Recommendation is not owner acceptance or organizers' acceptance/payment.

## Independent verification and evidence provenance

RPC observation `2026-10-22T03:37:43.300Z` UTC: all five primary hashes and006registration independently remain SUCCESS/txSuccess at their recorded ledgers. Observation ledgers5323333–5323334. Primary battery RECYCLED/SENT, requestCONFIRMED and recipient original USER-1;006 fixture REGISTERED/NOT_ELIGIBLE with no return or actor attestations. SAC balance USER-1 **100000000** and contract **800000000**; Horizon corroborates **10.0000000 GREENTEST** with the exact issuer and authorized trustline. These are read-only current observations, not a new payment or reconstruction of historical deltas.

Independent Supabase MCP SELECT: all six operations CONFIRMED/PROJECTED, one identity and dispatch each; total6/6/6, one confirmed request, one SUCCEEDED reward_attempt #1.006cache201 has original operation/hash/input hash. These current rows corroborate the sanitized contemporaneous exports. No Auth login/provisioning/session mutation; no private-key or Secure Store access, and no publication of signed material.

Public GitHub access without authentication verified the exact checkpoint and SHA256 of **29 evidence documents**, all equal to local committed bytes. Frozen criteria byte-identical to baseline. Source hashes in006manifest match tested implementation aa4f0af382d1b4da6a88403149efd76f791594b2, and production/test trees match reviewedHEAD. Local WASM SHA remains c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6. Inventory/source hashes, SQL/RPC allowlisted reads and per-case assertions are in the [machine packet](D1-OWNER-ACCEPTANCE-REVIEW.json).

Raven stellarDocs consulted first. [Official RPC configuration](https://developers.stellar.org/docs/data/apis/rpc/admin-guide/configuring) identifies configurable transaction/event history retention; current availability is separate from historical contemporaneous proof. All six receipts and requested states were readable today, so no TTL/reset/history gap was needed to excuse a missing result. No architectural incompatibility or code change was introduced.

### Primary lifecycle correlation

| API operation | Logical operation | Transaction | Confirmed ledger/result |
| --- | --- | --- | --- |
| register_battery | `6868cdd0-f4e5-483b-aa80-18e26026dd5a` | [ec0f231a61f2c0fa8b1092adae475f6da0f649a2085ee4783fe825ff65b01a27](https://stellar.expert/explorer/testnet/tx/ec0f231a61f2c0fa8b1092adae475f6da0f649a2085ee4783fe825ff65b01a27) | 5281390 / SUCCESS |
| open_return | `dd1408b0-7cd5-4332-bdb0-6f61ae00cf86` | [4d7aa3b0e656692d0c8467ff08cc5e2edf6d8563290171bc06e2c39e9c0452e2](https://stellar.expert/explorer/testnet/tx/4d7aa3b0e656692d0c8467ff08cc5e2edf6d8563290171bc06e2c39e9c0452e2) | 5299532 / SUCCESS |
| confirm_collection | `4fa3fbac-84e4-4845-8abd-fbdff757cbb4` | [e105a8dc4072bc601c65d53cf694ca834aa5ff7e4b6457ecb9cb4c980b0f6d22](https://stellar.expert/explorer/testnet/tx/e105a8dc4072bc601c65d53cf694ca834aa5ff7e4b6457ecb9cb4c980b0f6d22) | 5314096 / SUCCESS |
| confirm_recycling | `3ddd9ac8-cfdd-4129-8a4a-8c8f9015145c` | [9b1042a5b8f31509149f0b0d1effc7329132f1bfea4a3e7a8505df589ad024fb](https://stellar.expert/explorer/testnet/tx/9b1042a5b8f31509149f0b0d1effc7329132f1bfea4a3e7a8505df589ad024fb) | 5315874 / SUCCESS |
| pay_reward | `f90927f6-2a66-4bb9-ae3b-5b0565d1fb7c` | [d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02](https://stellar.expert/explorer/testnet/tx/d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02) | 5315915 / SUCCESS |

All rows use Testnet network ID cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472 and contract CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON. API input/output and intermediate states come from contemporaneous task JSON; current final state alone does not prove earlier API execution.006 fixture is D1.5-only, NOT D3, not a physical battery or environmental evidence.

## D1.1 — Five API operations

**Frozen requirement (verbatim):**

- Test: Execute all five named methods with fresh IDs.
- Expected result: Each succeeds with its authorized actor and confirmed Testnet result.
- Required evidence: API transcript; five operation/result links.

**Evidence reviewed:**

- [BYE-W1-002-results.json](BYE-W1-002-results.json)
- [BYE-W1-003B-results.json](BYE-W1-003B-results.json)
- [BYE-W1-003C-results.json](BYE-W1-003C-results.json)
- [BYE-W1-004-results.json](BYE-W1-004-results.json)
- [BYE-W1-004-traceability.json](BYE-W1-004-traceability.json)

**Evidence mode:** REAL API + LIVE TESTNET.

**Actual evidence / result:** Registro002, devolución003B, colección003C y reciclaje/pago004 ejecutados por la API autenticada. Los cinco hashes/ledgers coinciden con RPC actual SUCCESS/txSuccess y seis registros SQL (cinco del ciclo más fixture006), cada uno CONFIRMED/PROJECTED, identidad1 y dispatch1. Batería y request se crearon frescos para ese ciclo.

**Gap analysis:** Sin brecha identificada para los cinco métodos y sus resultados requeridos.

**Caveats:** Un único ciclo sintético demuestra los cinco métodos D1, no los tres ciclos D3 ni tratamiento físico.003 y003B conservan sus resultados históricos BLOCKED/PARTIAL.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** HIGH.

**Reason:** Las cinco operaciones tienen API, operación, hash, ledger y SUCCESS correlacionados.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.2 — Authorization

**Frozen requirement (verbatim):**

- Test: Attempt each restricted operation with an incorrect actor; test collection missing either required authorization.
- Expected result: All unauthorized attempts rejected; SERVICE + COLLECTOR succeeds.
- Required evidence: Negative-test report; positive collection hash and auth detail.

**Evidence reviewed:**

- [BYE-W1-003C-results.json#negativeAuth](BYE-W1-003C-results.json#negativeAuth)
- [BYE-W1-004-results.json#recycling.negatives](BYE-W1-004-results.json#recycling.negatives)
- [../ACCEPTANCE-CRITERIA.md](../ACCEPTANCE-CRITERIA.md)
- [../../../contracts/byetery-contract/src/test.rs](../../../contracts/byetery-contract/src/test.rs)
- [../../../backend/remote-tests/http.test.ts](../../../backend/remote-tests/http.test.ts)
- [../../../tools/stellar-secure-store-signer/tests/validation.rs](../../../tools/stellar-secure-store-signer/tests/validation.rs)

**Evidence mode:** MIXED: LIVE POSITIVE + DETERMINISTIC / UNSIGNED NEGATIVES.

**Actual evidence / result:** Positivos reales: ADMIN registro; SERVICE devolución; SERVICE+COLLECTOR simultáneos colección; RECYCLER reciclaje; SERVICE pago. Negativos: USER no ADMIN rechazado por HTTP; usuario no collector/recycler rechazado; wrong/missing collector y missing service en guards; no-role collector/recycler en simulación unsigned con RoleNotGranted9; wrong source en helper para pay_reward y falta SERVICE en Rust. Para open_return, user_actions_require_service_and_auth_is_bound_to_arguments prueba auth vacía y autorización de argumentos/recipient distintos, pero no presenta un actor incorrecto explícito.

**Gap analysis:** HOLD: la prueba congelada exige intentar cada operación restringida con actor incorrecto. No se localizó un caso explícito de open_return en el corpus revisado. Para cerrar: aportar una referencia existente verificable o autorizar por separado un caso determinista de ese método/actor, con rechazo y estado intacto. No se añade ni ejecuta aquí.

**Caveats:** No se exige ni se ejecutó un envío inválido firmado en Testnet. Ausencia de autorización y alteración de argumentos son controles útiles, pero no se renombran como el caso exacto de actor incorrecto por operación. Esto es una brecha de evidencia, no una vulnerabilidad demostrada.

**Acceptance recommendation:** **HOLD**. **Confidence:** HIGH.

**Reason:** Falta evidencia explícita del caso de actor incorrecto de open_return requerido por «each».

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.3 — Confirmation

**Frozen requirement (verbatim):**

- Test: Delay, lose or fail the RPC response before observing success.
- Expected result: Application remains unconfirmed until SUCCESS is verified; a failed transaction never appears confirmed.
- Required evidence: State assertions; RPC/result capture.

**Evidence reviewed:**

- [BYE-W1-002-results.json#initialApiResponse](BYE-W1-002-results.json#initialApiResponse)
- [BYE-W1-003C-results.json#initialApiResponse](BYE-W1-003C-results.json#initialApiResponse)
- [BYE-W1-006-results.json#trace.requestA](BYE-W1-006-results.json#trace.requestA)
- [../../../backend/tests/testnet-worker.test.ts](../../../backend/tests/testnet-worker.test.ts)
- [../../../backend/tests/sprint-recycling-reward.test.ts](../../../backend/tests/sprint-recycling-reward.test.ts)

**Evidence mode:** MIXED: LIVE CONFIRMATIONS + CONTROLLED INTEGRATION.

**Actual evidence / result:** Las respuestas iniciales pendientes002/003C/006 conservan el hash y el estado previo. SUCCESS/RPC precede la proyección real; SQL y cadena actuales coinciden. Los fixtures de respuesta perdida/NOT_FOUND/outage mantienen projectionCount0; restaurar SUCCESS produce una proyección. El fixture confirmed failure es terminal y projectionCount0; hash de confirmación incorrecto no proyecta ni reemplaza.

**Gap analysis:** La evidencia cubre demora, pérdida, fallo y confirmación posterior sin exigir una nueva transacción fallida live.

**Caveats:** Inyección de respuesta perdida/fallo/outage controlada, no fallo intencional del pago live. La revisión no reejecuta tests ni infiere confirmación a partir de HTTP202.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** HIGH.

**Reason:** UNKNOWN y fallo no proyectan éxito; se confirma el hash original antes de proyectar.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.4 — Traceability

**Frozen requirement (verbatim):**

- Test: Inspect every submitted operation.
- Expected result: Operation ID, network, contract and transaction hash correlate; confirmed records include ledger/result.
- Required evidence: Persisted operation export with sanitized fields.

**Evidence reviewed:**

- [BYE-W1-004-traceability.json](BYE-W1-004-traceability.json)
- [D1-IDEMPOTENCY-TRACE.json](D1-IDEMPOTENCY-TRACE.json)
- [BYE-W1-002-results.json](BYE-W1-002-results.json)
- [BYE-W1-003B-results.json](BYE-W1-003B-results.json)
- [BYE-W1-003C-results.json](BYE-W1-003C-results.json)
- [BYE-W1-004-results.json](BYE-W1-004-results.json)
- [BYE-W1-006-results.json](BYE-W1-006-results.json)

**Evidence mode:** MIXED: PERSISTED SQL + LIVE TESTNET.

**Actual evidence / result:** Export original y SELECT independiente actual: operation ID, network ID, contrato, source, sequence, transaction hash, ledger de confirmación, CONFIRMED/PROJECTED e identidad/dispatch correlacionan6/6. RPC confirma cada hash y ledger. El despliegue tiene exactamente6 operaciones/6 identidades/6 dispatches; no hay otras operaciones enviadas omitidas en este deployment.

**Gap analysis:** No falta un campo requerido de correlación ni se requiere publicar material firmado.

**Caveats:** Envelopes firmados, firmas y claves se omiten deliberadamente. La última confirmed_ledger de una fila de batería/request no sustituye al ledger original guardado por operación.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** HIGH.

**Reason:** Correlación completa de las seis operaciones D1 enviadas, con ledger y resultado.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.5 — Idempotency

**Frozen requirement (verbatim):**

- Test: Repeat an identical request; reuse its idempotency key with changed parameters.
- Expected result: Identical request returns the same logical operation; changed parameters rejected. One valid effect per intended transition.
- Required evidence: API/database assertions and chain-state reads.

**Evidence reviewed:**

- [BYE-W1-006-REPORT.md](BYE-W1-006-REPORT.md)
- [BYE-W1-006-results.json](BYE-W1-006-results.json)
- [D1-IDEMPOTENCY-TRACE.json](D1-IDEMPOTENCY-TRACE.json)
- [../../../backend/validation/registration-idempotency.ts](../../../backend/validation/registration-idempotency.ts)
- [../../../backend/tests/d1-registration-idempotency.test.ts](../../../backend/tests/d1-registration-idempotency.test.ts)

**Evidence mode:** REAL API + LIVE TESTNET + SQL.

**Actual evidence / result:** Fixture BYE-D1-IDEMP-F6C52ED496D5C6F41B. A:53db4b43-7654-479a-b4aa-00d6d47ad171, txc1e2db75ed536307c02a84315c343c2615984283adb155709cee98045ee0352b, SUCCESS5322924. B mismo principal/deployment/endpoint/key/body devuelve201 con mismo ID/hash; C cambia solo metadata.caseLabel y da409 IdempotencyConflict. CountsA=B=C:processor1/authorize1/envelope1/broadcast1. SQL después de cada llamada y lectura de cadena conservan una operación/identidad/dispatch/efecto, cero returns/rewards. Secuencia avanza solo1 en A y no cambia B/C; cache conserva input_hash original.

**Gap analysis:** La evidencia live006 cierra el hueco que005 documentó correctamente como BLOCKED; no se usa el test local como sustituto de A/B/C.

**Caveats:** A inicial202 y B final201 reflejan reconciliación del mismo hash, no otra operación. Authorize+envelope son dos fases de UNA identidad. Fixture exclusivamente D1.5, nunca D3; el principal histórico retirado no se reactivó.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** HIGH.

**Reason:** A/B/C reales: mismo ID/hash en replay y409 por un único cambio, sin efectos adicionales.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.6 — Reward guard and reproducibility

**Frozen requirement (verbatim):**

- Test: Request a second reward; rerun tests at the recorded commit.
- Expected result: No second successful payment or additional reward balance change. Exact commit and commands reproduce expected results.
- Required evidence: Reward result/balances; test manifest.

**Evidence reviewed:**

- [BYE-W1-004-results.json#reward](BYE-W1-004-results.json#reward)
- [BYE-W1-004-REPORT.md](BYE-W1-004-REPORT.md)
- [BYE-W1-006-results.json#verification](BYE-W1-006-results.json#verification)
- [../../../contracts/byetery-contract/src/test.rs](../../../contracts/byetery-contract/src/test.rs)
- [../../../backend/tests/testnet-reward-evidence.test.ts](../../../backend/tests/testnet-reward-evidence.test.ts)

**Evidence mode:** MIXED: REAL PAYMENT + DETERMINISTIC GUARDS + VERIFIED MANIFEST.

**Actual evidence / result:** Pago d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02 SUCCESS5315915: receipt/transfer/paid con recipient USER-1 y100000000 base units. Lecturas contemporáneas0→100000000 y900000000→800000000; replay misma key200 con0 nuevas identidades/envíos/cambios de saldo. Nueva solicitud de segunda recompensa se rechaza en Rust/mock/HTTP. Lectura actual RPC/Horizon confirma10 y contrato80; SQL un reward_attempt SUCCEEDED #1. Manifiesto006 identifica commit aa4f0af382d1b4da6a88403149efd76f791594b2, comandos y SHA de fuentes. Hashes de fuentes coinciden con ese Git commit y árbol productivo/tests es idéntico al checkpoint revisado.

**Gap analysis:** Guard contra segundo pago y reproducibilidad están soportados por evidencias diferenciadas, no por un nuevo reward ni una afirmación de ejecución actual.

**Caveats:** La lectura actual no reconstruye por sí sola el delta histórico: ese delta proviene de004. La regresión no se rerun durante Stage1; se revisan resultados ya ejecutados y su identidad de código. Algunas suites históricas usan Secure Store offline; repetirlas ahora violaría esta revisión sin firma. MOCK no ejecuta Soroban.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** HIGH.

**Reason:** Pago exacto0→10, contrato90→80, replay sin segundo efecto y manifiesto reproducible.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.7 — A - Before submit

**Frozen requirement (verbatim):**

- Test: Interrupt after transaction identity is durable but before broadcast. Restart and resume by logical operation ID.
- Expected result: No pre-submit chain effect; recovery retains one logical operation and at most one valid intended effect.
- Required evidence: Before/after durable record; submit trace; chain read.

**Evidence reviewed:**

- [BYE-W1-005-REPORT.md](BYE-W1-005-REPORT.md)
- [BYE-W1-005-results.json#D1.7](BYE-W1-005-results.json#D1.7)
- [D1-GAP-CLOSURE-TRACE.json](D1-GAP-CLOSURE-TRACE.json)
- [../../../backend/tests/d1-before-submit.test.ts](../../../backend/tests/d1-before-submit.test.ts)

**Evidence mode:** CONTROLLED INTEGRATION — NOT LIVE SOROBAN.

**Actual evidence / result:** Casos b2d7868a-f849-489f-9e8e-bb7b53c2d9eb y8ba73bf7-7612-42e7-983b-ee0013ad01c2: identidad COMMIT/readback en READY, dispatch0 y autoridad independiente efecto0 antes de la interrupción. Se cierran/reabren appDB y authorityDB en disco; nuevo Repository/pool/service/worker/transport. Snapshot antes=afterRestart: mismo ID/identity/hash/envelopeSHA. Reinicio con key solo pública, prepare/sign prohibidos. Resume por ID y decisión explícita retrySameHash; lookupNOT_FOUND antes del primer dispatch revisado1, efecto final1 y proyección SQL. Prepare/sign1 total; callbacks RPC real/Secure Store0.

**Gap analysis:** Cumple la secuencia exacta y el modelo de evidencia controlado expresamente permitido por el encargo; no se inventa requisito de fault injection live.

**Caveats:** Autoridad/transport controlados, PGlite en disco y source de fixture inyectada; no ejecuta Soroban, no verifica allí allowlists de producción ni mata el proceso OS. reviewedSameHashRetry=true se conserva aunque dispatch0→1 es el primer envío. Unreviewed READY sigue rechazado.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** HIGH.

**Reason:** Identidad durable, interrupción antes del envío, dos DB reabiertas y primer efecto único revisado.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.8 — B - Lost response

**Frozen requirement (verbatim):**

- Test: Broadcast, then suppress the submit response.
- Expected result: Mark unresolved; look up the persisted hash. Confirm if SUCCESS is found; no blind replacement transaction.
- Required evidence: Lost-response fixture; original hash/result; state transition log.

**Evidence reviewed:**

- [../../../backend/tests/sprint-recycling-reward.test.ts](../../../backend/tests/sprint-recycling-reward.test.ts)
- [../../../backend/tests/testnet-worker.test.ts](../../../backend/tests/testnet-worker.test.ts)
- [D1-GAP-CLOSURE-TRACE.json#cases[1]](D1-GAP-CLOSURE-TRACE.json#cases[1])
- [BYE-W1-004-results.json#verification](BYE-W1-004-results.json#verification)

**Evidence mode:** CONTROLLED INTEGRATION + DETERMINISTIC TEST.

**Actual evidence / result:** Fixture combinado: loseSubmit=true → SUBMITTED_OR_UNKNOWN; worker reconstruido conserva hash y no proyecta conNOT_FOUND. Tras outage/restauración y SUCCESS se proyecta una vez. Assertions prepare1/sign1/submitted1/dispatch1, bytes idénticos y todas las búsquedas por hash original.005 variante respuesta perdida aporta además efecto en autoridad persistente antes de perder respuesta y estado final único.

**Gap analysis:** Se demuestra uncertainty→lookup original→confirmación única sin reemplazo ciego.

**Caveats:** Se suprime respuesta en transporte controlado. No hubo nuevo broadcast, firma ni pérdida inducida en Testnet durante la revisión.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** HIGH.

**Reason:** Envío único con respuesta perdida, UNKNOWN y reconciliación del hash persistido.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.9 — C - RPC outage

**Frozen requirement (verbatim):**

- Test: Make RPC temporarily unavailable, then restore it.
- Expected result: Preserve operation and uncertainty; fail visibly without false confirmation. Resume reconciliation when reachable.
- Required evidence: Outage/recovery assertions; sanitized errors.

**Evidence reviewed:**

- [../../../backend/tests/sprint-recycling-reward.test.ts](../../../backend/tests/sprint-recycling-reward.test.ts)
- [../../../backend/tests/testnet-worker.test.ts](../../../backend/tests/testnet-worker.test.ts)
- [../../../backend/tests/testnet-application.test.ts](../../../backend/tests/testnet-application.test.ts)
- [BYE-W1-004-results.json#verification](BYE-W1-004-results.json#verification)

**Evidence mode:** CONTROLLED INTEGRATION + DETERMINISTIC TEST.

**Actual evidence / result:** Outage en observe conserva SUBMITTED_OR_UNKNOWN, proyección0 y los bytes/hash originales. Restablecer transporte con SUCCESS recupera PROJECTED, proyección1 y submitted1. Test HTTP local de TestnetStellarService frente a RPC unavailable preserva operación y sourceTESTNET, rechaza sin signer y sin fallbackMOCK. Errores RPC se sanitizan.

**Gap analysis:** Outage/recovery y error visible están cubiertos sin debilitar el criterio ni exigir fallos live adicionales.

**Caveats:** Indisponibilidad RPC simulada; la desconexión PostgreSQL003B es otro incidente y su causa de socket sigue no probada. No se exige ni afirma una caída live del RPC durante el pago.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** HIGH.

**Reason:** La caída conserva incertidumbre e identidad; la recuperación proyecta una vez sin otro envío.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.10 — D - Restart

**Frozen requirement (verbatim):**

- Test: Restart with durable SUBMITTED or UNKNOWN operation.
- Expected result: Recover the same operation and hash; reconcile without losing or duplicating its effect.
- Required evidence: Restart test and record comparison.

**Evidence reviewed:**

- [../../../backend/tests/testnet-restart.test.ts](../../../backend/tests/testnet-restart.test.ts)
- [../../../backend/tests/testnet-worker.test.ts](../../../backend/tests/testnet-worker.test.ts)
- [../../../backend/tests/d1-before-submit.test.ts](../../../backend/tests/d1-before-submit.test.ts)
- [BYE-W1-004-REPORT.md#regression-at-tested-implementation-commit](BYE-W1-004-REPORT.md#regression-at-tested-implementation-commit)

**Evidence mode:** CONTROLLED ON-DISK RESTART + DETERMINISTIC TEST.

**Actual evidence / result:** testnet-restart cierra realmente PGlite en disco tras loseSubmit y reabre otro objetoDB; nuevo TransportStore/worker concilia la identidad byte a byte original y llegaPROJECTED sin resubmit: prepare1/sign1/submitted1, todas las observaciones mismohash.005 añade reconstrucción completa Repository/service/worker/transport y ambas DB. El test de restart está incluido en backend143/146/148 registrados.

**Gap analysis:** El criterio no impone un kill de sistema operativo; el límite probado conserva estado e identidad durable.

**Caveats:** Reconstrucción y reapertura de recursos en un proceso de pruebas, no OS-process-kill, reinicio de Windows ni failover PostgreSQL multinodo. Ese límite no se transforma en una prueba inexistente.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** HIGH.

**Reason:** DB close/reopen y worker nuevo retienen el mismo envelope/hash en UNKNOWN sin reenvío.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.11 — E - Unresolved lookup

**Frozen requirement (verbatim):**

- Test: Return NOT_FOUND/unknown after an uncertain submission.
- Expected result: Remain unresolved; no automatic replacement envelope. Any permitted rebroadcast uses the same signed transaction identity and is recorded.
- Required evidence: Reconciliation trace; envelope/hash identity; state read.

**Evidence reviewed:**

- [../../../backend/tests/testnet-worker.test.ts](../../../backend/tests/testnet-worker.test.ts)
- [../../../backend/tests/testnet-real-boundaries.test.ts](../../../backend/tests/testnet-real-boundaries.test.ts)
- [../../../backend/src/testnet/worker.ts](../../../backend/src/testnet/worker.ts)
- [../../../backend/src/testnet/transport.ts](../../../backend/src/testnet/transport.ts)
- [BYE-W1-004-results.json#criteria](BYE-W1-004-results.json#criteria)

**Evidence mode:** CONTROLLED INTEGRATION + DETERMINISTIC TEST.

**Actual evidence / result:** Respuesta perdida + NOT_FOUND válido conservaUNKNOWN y sin nueva preparación/firma/envío automático. Fixtures expiry distinguen APPLIED/NOT_APPLIED/UNRESOLVED con lectura de estado, nunca conviertenNOT_FOUND solo en fracaso. retrySameHash exige decisionId/hash original, primero reconcilia y si se permite persiste otro intento con el mismo envelope byte a byte, límite acotado. Drift de source tras intent queda en reviewed hold y envío0; nueva recompensa no se permite por expiración.

**Gap analysis:** Identidad/trace/estado y límite de revisión están cubiertos; no se exige recuperar automáticamente casos cuyo resultado siga incierto.

**Caveats:** Reintentos revisados y expiración se probaron con transporte controlado. La revisión actual no reenvía nada. Estado/read-verified effect y receipt son tipos de evidencia distintos; pago requiere receipt y transferencia real.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** HIGH.

**Reason:** NOT_FOUND conserva incertidumbre; cualquier retry revisado reutiliza exactamente los bytes/hash.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## D1.12 — F - Revoked role

**Frozen requirement (verbatim):**

- Test: Disable an existing collector/recycler role in an isolated authorized test fixture, then attempt its restricted operation.
- Expected result: Revoked actor rejected; no lifecycle advancement or reward. Restore test configuration where applicable.
- Required evidence: Role-state fixture; rejection and unchanged-state assertions.

**Evidence reviewed:**

- [../../../contracts/byetery-contract/src/test.rs#revoked_collector_is_rejected_even_with_both_signatures](../../../contracts/byetery-contract/src/test.rs#revoked_collector_is_rejected_even_with_both_signatures)
- [../../../contracts/byetery-contract/test_snapshots/test/revoked_collector_is_rejected_even_with_both_signatures.1.json](../../../contracts/byetery-contract/test_snapshots/test/revoked_collector_is_rejected_even_with_both_signatures.1.json)
- [../../../backend/tests/mock.test.ts](../../../backend/tests/mock.test.ts)
- [BYE-W1-003C-results.json#negativeAuth](BYE-W1-003C-results.json#negativeAuth)
- [BYE-W1-004-results.json#recycling.negatives](BYE-W1-004-results.json#recycling.negatives)

**Evidence mode:** DETERMINISTIC FROZEN CONTRACT + SNAPSHOT; UNSIGNED LIVE SUPPORT.

**Actual evidence / result:** Fixture Rust concede Collector y lo desactiva antes de intentar confirm_collection con ambas autorizaciones; assert devuelve RoleNotGranted. El snapshot histórico congelado de ESE test tiene Role=false, Battery Returned/NotEligible, requestOpen y collector/collectionHash/recycler/recyclingHash nulos. Lectura/asserts de esos campos en esta revisión confirma ausencia de avance/reward. Test Rust recycler también revoca rol y rechaza; mock repite revocación/rechazo.003C/004 unsigned no-role probes apoyan semántica error9 y cadena intacta.

**Gap analysis:** Fixture de rol+rechazo y estado conservado son observables en artefactos originales; el gate permite fixture aislado y no exige revocación live.

**Caveats:** El unit de collector assert explícitamente el error; la comprobación de estado aquí proviene de su snapshot histórico emparejado, no de atribuirle asserts inexistentes. Probes sin rol no se renombran como revocación live. No se revocó/restauró ningún rol real; no set_role nuevo.

**Acceptance recommendation:** **ACCEPT**. **Confidence:** MEDIUM.

**Reason:** Rol revocadofalse y rechazo; snapshot conserva Returned/Open/NotEligible sin atestaciones nuevas.

**Owner decision:** PENDING; official status unchanged READY FOR VALIDATION.

## Chronology preserved

002 proves initial registration only;003 remains BLOCKED;003A records wallet prerequisite proof;003B remains PARTIAL with return success and unsigned collection interruption;003C adds reviewed successful recovery of the original collection;004 remains technical PASS with its then-existing D1.5/D1.7 gaps;005 remains PARTIAL (D1.5 blocked, D1.7 controlled proof);006 remains technical PASS closing D1.5 with a separately authorized new fixture. Later evidence does not rewrite any earlier task as historical PASS. D1.2 HOLD is this review's independent recommendation, not a silent edit to the earlier readiness index.

## Regression scope and safety

Reviewed existing006manifest: backend 148 including the original Foundation 50; focused 006: 2 and 005: 3; Rust: 20 native plus the same 20 repeated with wasm-tests; WASM: 1 plus release/fmt/Clippy; HTTP DEV: 45; SQL: 82 with rollback; frontend: 33 plus types/lint/build; helper: 22 and offline: 18 plus fmt/Clippy; SEP53_V2/PostgreSQL recovery/restart; Python: 4; and MOCK reward SENT: 10. No regression was newly executed in Stage 1. Those historical counts are supporting execution records, not independent proof of acceptance for every criterion. No helper/native/offline signer suite or historical live operator was invoked. The review only reads documents/source/public chain/SQL and verifies hashes/assertions over stored artifacts.

No production/Rust/WASM/schema/RLS/test changes, new live transaction/battery/lifecycle/reward/trustline/user/membership/role, signing, Secure Store access or broadcast. No Mainnet, main merge or tag movement. tools/sync_obsidian.py remains unmodified/untracked/uncommitted, SHA256 48404b9431a9d955fc4af0b2eeaf9a59bb2fb0e9457eed73b4f2f66132a5e2da. New packet files intentionally remain uncommitted for the owner's Stage 1 decision. Full secret audit and diff checks are performed after producing the packet; their result is returned with the handoff, not guessed here.

## OWNER DECISION REQUIRED — STOP

A) **APPROVE ALL RECOMMENDED ACCEPT** = approve the eleven ACCEPT recommendations; D1.2 remains HOLD. This does NOT approve all twelve.

B) **APPROVE: D1.1, D1.2, ... / HOLD: D1.X, ...**, explicitly listing the owner's decisions. No held criterion is silently converted to PASS. A requested decision differing from the evidence recommendation requires its own explicit review; the frozen criterion is not waived or rewritten by this packet.

Stage 2 is not authorized yet. Only after Christian's explicit response may approved decisions update official status, current matrix, existing Notion criteria and documentation Git checkpoint/push. No D2/D3 kickoff is authorized, even after D1 owner acceptance. Organizers' acceptance/payment is not asserted. **STOP.**

## ADDENDUM — 2026-10-22 — BYE-W1-007 — D1.2 EVIDENCE CLOSURE

The original Stage 1 review and its 11 ACCEPT / 1 HOLD recommendation above are preserved as historical findings. **D1.2 HOLD was correct at the time**: no explicit wrong-actor `open_return` case had been located. This addendum records new evidence, not a rewrite or waiver of the frozen criterion.

New source: [open_return_rejects_wrong_actor_and_accepts_service_with_identical_arguments](../../../contracts/byetery-contract/tests/open_return_auth.rs), tested implementation `686b792ec813ad13655a6ac7d2e1d7df38d592ac`; [BYE-W1-007 report](BYE-W1-007-REPORT.md) and [machine results](BYE-W1-007-results.json). Evidence mode: **DETERMINISTIC TEST / ISOLATED HOST, NATIVE + ACTUAL FROZEN WASM**. Config.service `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4` differs from generated wrong_actor `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOLZM`. With valid registered battery, fresh request and unchanged recipient/arguments, only wrong_actor authorizes and `try_open_return` rejects with `Err(Ok(Error(Context, InvalidAction)))`. Host authorization failure is narrowed by `try_call`; it is not RoleNotGranted. Battery remains REGISTERED/NOT_ELIGIBLE, request_id=None, request absent; full state/balances unchanged and zero successful return events. The exact same arguments authorized only by SERVICE succeed as RETURNED/OPEN, with the exact SERVICE auth tree and one ReturnOpened event.

Gap re-evaluated against unchanged D1.2: the new test objectively supplies the missing wrong-actor rejection and unchanged-state proof. Together with the earlier operation-specific negatives and positive SERVICE+COLLECTOR collection evidence, D1.2 recommendation changes **HOLD → ACCEPT**, confidence **HIGH**. Caveat: deterministic host/WASM evidence, not a live invalid signed transaction; no such broadcast is required or claimed. Focused original/new tests and final root regression pass; frozen production WASM and all original contract sources/tests remain unchanged.

| Current recommendation | Value |
| --- | --- |
| D1.1–D1.12 | ACCEPT for all twelve; D1.12 confidence remains MEDIUM as originally documented |
| Recommended ACCEPT | 12/12 |
| Recommended HOLD | 0/12 |
| Official D1 PASS | 0/12 |
| Official D2 / D3 PASS | 0/6 / 0/5 |
| Technical matrix | 12/12 READY FOR VALIDATION; unchanged |
| Owner decision | PENDING |

No Stage 2, official PASS/Notion/matrix mutation, production change, live transaction/signing/broadcast, main merge, tag movement or D2/D3 start. Documentation/test evidence commits are authorized specifically by BYE-W1-007; they are not owner acceptance Stage 2. The original review's no-commit status describes its original review execution. The machine packet's `currentStage1Review` and addendum provide the current recommendation while retaining original data.

**OWNER DECISION REQUIRED: APPROVE ALL 12 D1 ACCEPT RECOMMENDATIONS**, or explicitly list APPROVE/HOLD. Until then official PASS stays 0/12. **STOP.**
