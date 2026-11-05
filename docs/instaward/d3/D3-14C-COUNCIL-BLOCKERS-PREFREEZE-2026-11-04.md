# D3-14C — Council blockers prefreeze

**D3_14C_NEW_CANDIDATE_READY_FOR_COUNCIL_REVIEW**. **NO FREEZE / NO COMMIT / NO PUSH**.

Ejecución: **2026-11-05, America/Santiago**. Se conserva el nombre de archivo solicitado con 2026-11-04; no se retrodata la ejecución.

## Origen y candidato

Rama: instaward/d2-web-mvp. HEAD y HEAD remoto leído independientemente: da541d843632e3ba4bd811ddd13c85b2bea5ccb6. Sin fetch ni cambios de referencias. Índice vacío y git diff --check PASS.

Fingerprint D3-14B recalculado antes de editar, coincidencia exacta: f11840d3bf1a433fa1d3f44023da42ae1ec148c61b7287e090e5ea049922874c.

**CASE B — CANDIDATE CHANGED. NEW_CANDIDATE_FINGERPRINT = e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539**.

D3-13 d6dd1bc7c8a39472394028d595980f78951dd3210bde0693f78c1816c764a510 y D3-14A 7d9e6f48a5cccecd3f9de00f4d581955c2f0a962472659e5e531086ff98774eb siguen históricos/bloqueados. D3-14B deja de ser el candidato actual.

Fórmula: SHA-256 de rutas UTF-8 ordenadas, TAB, SHA-256 de bytes en minúsculas, LF. Los 24 archivos exactos y hashes quedan en el JSON. Reportes y .tools se excluyen.

## Gates

| Gate | Resultado |
|---|---|
| ATOMIC_RPC_CLOSURE_EVIDENCE | PASS |
| PRE_SIGN_VALIDITY_GUARD | PASS |
| RECONCILIATION_SIGNER_INDEPENDENT | PASS |
| RPC_NETWORK_BOUND | PASS |
| SOURCE_SEQUENCE_EXACT | PASS |
| DISPATCH_ANCHOR_BEFORE_SUBMIT | PASS |
| TERMINAL_OR_HOLD_NO_RETRY | PASS |
| HISTORICAL_PARTIAL_SERVER_BLOCK | PASS_IMPLEMENTED_OFFLINE |

## RPC coherente y network

La implementación previa ya proyectaba los cuatro campos de una sola llamada getTransaction. Se agregó binding efímero al objeto congelado de respuesta, al hash solicitado y a la instancia de cliente. TestnetTransport.observe exige ese contexto antes de interpretar NOT_FOUND. Una copia, mezcla o respuesta de otro cliente se rechaza. También se exigen campos numéricos completos, frescura y skew. No se rellenan datos con getHealth, getLatestLedger, Horizon u otro endpoint.

El RPC no expone una identidad física estable del nodo. **Se demuestra un único contexto de respuesta HTTP/JSON-RPC, no una atestación física del servidor**. La lectura adicional de latest en el worker es un gate independiente previo, nunca sustituye los campos de la última respuesta. Endpoint Testnet fijo, redirects prohibidos y getNetwork exige la passphrase Testnet antes de cada lookup.

Las pruebas inyectan respuestas offline. El caso coherente permite evaluar los demás gates; NOT_FOUND stale, retención prestada de otro cliente, contexto ausente, retención ausente y Mainnet/Futurenet impiden cierre. La incertidumbre queda en el JSON ya existente de RPC_OUTAGE como UNCERTAIN_OPEN_RPC; API/GET muestran UNCERTAIN_OPEN no terminal. Una lectura coherente posterior del hash original puede reconciliarla sin submit. SUCCESS y FAILED mantienen prioridad.

Fuente oficial consultada primero mediante Stellar Raven: [getTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction). Expone status, latestLedger, latestLedgerCloseTime y oldestLedger en la misma respuesta. No se consultó Testnet live.

## Guard antes de firmar

readSupportedEnvelope decodifica el XDR raw antes de la normalización del SDK. Solo permite ENVELOPE_TYPE_TX con precondTime. V0, fee-bump y cualquier Preconditions V2 se rechazan, incluidos ledgerBounds, minSeqNum, minSeqAge, minSeqLedgerGap y extraSigners. Las credenciales Soroban AddressV2 son distintas de esas Preconditions de transacción.

Orden: validar autoridad/red → leer ledger → decodificar tipo/preconditions → validar árbol Soroban → validar tiempo → llamar al puerto de firma. Las pruebas de rechazo comprueban cero authorize, cero firma final, cero submit y cero broadcast. La firma COLLECTOR Soroban sigue separada de la firma SERVICE del envelope final; no cambia el routing ni se agrega firmante.

Política real final: margen maxTime **10s**; stale RPC **30s**; future skew **60s**; horizonte **180s**; mínimo autorización **90s**; mínimo firma final **50s**; mínimo despacho **15s**. El cierre exige closeTime estrictamente mayor que maxTime + 10. Los límites inclusivos se prueban permanentemente.

## Restart sin signer ni Secure Store

Antes se instanciaba el signer durante startup. Solo se modifica composición de aplicación: deferredSigning recibe una fábrica, y el import dinámico/constructor existentes se ejecutan únicamente al autorizar o firmar después de los guards. No cambian local-secure-store-signer.ts, el helper, su protocolo ni el tratamiento de secretos.

Worker, identidad, transporte y reconciliación no importan el módulo operativo. Las pruebas bloquean su resolución de módulo y arman fábricas/accesores que fallarían al usarse. Los reinicios válidos e inválidos producen cero imports, constructores y accesos Secure Store. Ed25519 usa exclusivamente clave pública, passphrase Testnet, hash y XDR persistidos.

## Orden, secuencia y recuperación

Final signed envelope validado → SQL persist con digest completo → intent y ledger confirmados en SQL → chequeo final de source sequence → submit. Retención desde min(preparedLedger, firstDispatchLedger). Cierre solo con currentSourceSeq == tx.seq - 1: avanzada en uno/varios, inferior, ilegible o stale no prueba ausencia.

Se probaron reinicio antes de submit tras intent, respuesta perdida y reinicio durante reconciliación: misma operación/XDR/hash, cero reprepare/re-sign/resubmit/replacement. retrySameHash sigue prohibido para D3. FAILED, EXPIRED_NOT_INCLUDED y hold paran el operador. La queue rechaza reemplazos de lifecycle D3 detenido con nueva clave; una operación pendiente conserva exclusividad. La lectura de admisión incluye pendiente y terminal/hold D3 en el mismo snapshot, por lo que una transición entre lecturas no abre una ventana de reemplazo.

## Lifecycle histórico

BYE-D3-R1-20261104-AF7A44A515AC permanece clasificado **PERMANENTLY_NON_COUNTING**. El estado **COLLECTED / NOT_ELIGIBLE** corresponde al checkpoint aprobado y al fixture offline; no es una nueva lectura live. La protección faltaba en negocio y se implementó sin esquema: política para el deployment exacto, guard antes de caché y en queue, y guard prepare/process del servicio antes del worker.

Pruebas con servidor HTTP real, sesiones/roles ficticios y DB efímera: reciclaje, reward, devolución, recolección, registro y replay de caché rechazan. Una operación preexistente tampoco continúa. Cero simulate, carga de signer, submit y reward_attempts.

UI sin cambios: se comprobaron sus mismas rutas; ninguna acción puede completar una mutación rechazada por API. No se afirma que se oculten todos los botones. Esta restricción es de aplicación, no una nueva regla on-chain ni prueba del reciclaje físico.

V1 histórico: SHA-256 3d9aa4bd5e7fe76869dd69da25c3d3dfe01190488c1cb41b25f8516df8a1818e y digest canónico intactos. Tombstone confirmado presente por lectura independiente del Git común con permisos de proceso; sin escritura ni reutilización.

## Matriz de identidad

| Propiedad inválida | Prueba | Resultado |
|---|---|---|
| signature invalid | D3-14B changed signature, same body hash | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| missing signature | D3-14B missing signature | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| extra signature | D3-14B extra signature | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| wrong signer | D3-14B wrong signer with correct hint | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| wrong hint | D3-14B correct signature with changed hint | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| wrong network | D3-14B wrong signing passphrase / wrong network metadata | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| wrong source | D3-14B wrong source | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| wrong seq | D3-14B wrong sequence | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| wrong minTime | D3-14B wrong minTime | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| wrong maxTime | D3-14B wrong maxTime | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| wrong body hash | D3-14B wrong durable hash | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| wrong full-envelope digest | D3-14C full-envelope persist digest mismatch | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| wrong envelope type | D3-14C invalid persisted envelope type V0 / fee-bump | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| missing XDR | D3-14B missing XDR | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |
| unreadable XDR | D3-14B unreadable XDR | UNCERTAIN_OPEN; no cierre / re-sign / submit / POST / replacement |

El test de firma alterada conserva explícitamente el body hash; falla Ed25519. Ninguna identidad inválida permite EXPIRED_NOT_INCLUDED.

## Índice condición → prueba

Todos los nombres sin prefijo en este índice pertenecen a D3-14C. La tabla siguiente expande los nombres exactos completos.

| Condición Council | Test/familia |
|---|---|
| Una respuesta RPC; NOT_FOUND + ledger + closeTime + retención | atomic RPC closure coherent |
| Stale NOT_FOUND no toma ledger fresco prestado | atomic RPC closure stale-plus-fresh |
| Retención mezclada / sin contexto / sin retención | atomic RPC closure retention-mixed; context-unavailable; retention-unavailable |
| getNetwork obligatorio; Mainnet y Futurenet rechazados | atomic RPC closure wrong-network; futurenet |
| Margen maxTime 10s estricto | D3-14A within margin; at margin boundary; valid safe absence |
| Frescura 30s / futuro 60s | RPC freshness boundary 30; 31; -60; -61 |
| Retención desde preparación y primer despacho | D3-14B valid signature with gap before dispatch retention proof; complete retention proof |
| Secuencia exacta; avanzada, inferior, ilegible, stale | exact source proof 0; 1; 5; -1; unreadable; stale |
| Timebounds ausentes / maxTime0 / expirado / horizonte / poco tiempo | pre-sign missing timebounds; maxTime zero; maxTime expired; horizon too long; insufficient time |
| V0 / fee-bump antes de firma y al restart | pre-sign rejects V0; fee-bump; invalid persisted envelope type V0; fee-bump |
| ledgerBounds / minSeqNum / minSeqAge / minSeqLedgerGap / extraSigners | pre-sign V2 ledgerBounds; minSeqNum; minSeqAge; minSeqLedgerGap; extraSigners |
| Ed25519 offline; firma, firmante, hint, red | D3-14B restart with changed signature, same body hash; wrong signer with correct hint; correct signature with changed hint; wrong signing passphrase |
| Source, seq, minTime, maxTime, body hash | D3-14B restart with wrong source; wrong sequence; wrong minTime; wrong maxTime; wrong durable hash |
| Digest completo | full-envelope persist digest mismatch is an explicit durable hold |
| Signer no cargado / Secure Store no accedido | restart is independent of signer constructor and Secure Store false; true; composition imports signer only inside deferred signing callback |
| Soroban auth / final envelope | D3-14B distinct pre-auth and final Soroban bodies reject stale XDR; bind final XDR |
| Intent/ledger SQL antes de submit; tres reinicios | restart boundary before-submit; lost-response; during-reconciliation |
| Terminal/hold no retry y no replacement por API | no automatic lifecycle continuation FAILED; EXPIRED_NOT_INCLUDED; UNCERTAIN_OPEN; API rejects a new-key replacement FAILED; EXPIRED_NOT_INCLUDED; UNCERTAIN_OPEN |
| Histórico server/API/UI, también caché | historical lifecycle is blocked at real HTTP and service boundaries before all external effects |
| Incertidumbre RPC en GET autenticado | authenticated status reads durable RPC uncertainty and clears it on a coherent observation |

## Trazabilidad completa: 25 D3-14A + 27 D3-14B + 53 D3-14C

Nombres extraídos de la corrida integral final. Los parametrizados se identifican por su nombre runtime exacto.

| Council condition | Source function/file | Exact test | Result |
|---|---|---|---|
| counterexample early | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A counterexample early — backend/tests/d3-safe-closure.test.ts | PASS |
| counterexample after 120 s | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A counterexample after 120 s — backend/tests/d3-safe-closure.test.ts | PASS |
| counterexample after 300 s | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A counterexample after 300 s — backend/tests/d3-safe-closure.test.ts | PASS |
| counterexample last valid ledger | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A counterexample last valid ledger — backend/tests/d3-safe-closure.test.ts | PASS |
| counterexample absent | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A counterexample absent — backend/tests/d3-safe-closure.test.ts | PASS |
| before maxTime | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A before maxTime — backend/tests/d3-safe-closure.test.ts | PASS |
| at maxTime | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A at maxTime — backend/tests/d3-safe-closure.test.ts | PASS |
| within margin | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A within margin — backend/tests/d3-safe-closure.test.ts | PASS |
| at margin boundary | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A at margin boundary — backend/tests/d3-safe-closure.test.ts | PASS |
| stale ledger | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A stale ledger — backend/tests/d3-safe-closure.test.ts | PASS |
| RPC unavailable | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A RPC unavailable — backend/tests/d3-safe-closure.test.ts | PASS |
| retention gap | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A retention gap — backend/tests/d3-safe-closure.test.ts | PASS |
| advanced source sequence | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A advanced source sequence — backend/tests/d3-safe-closure.test.ts | PASS |
| uncovered source ledger | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A uncovered source ledger — backend/tests/d3-safe-closure.test.ts | PASS |
| uncovered final lookup | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A uncovered final lookup — backend/tests/d3-safe-closure.test.ts | PASS |
| valid safe absence | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A valid safe absence — backend/tests/d3-safe-closure.test.ts | PASS |
| FAILED on the final original-hash read wins over an earlier NOT_FOUND | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A FAILED on the final original-hash read wins over an earlier NOT_FOUND — backend/tests/d3-safe-closure.test.ts | PASS |
| lost HTTP POST response recovers by the original key then the pinned ID | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A lost HTTP POST response recovers by the original key then the pinned ID — backend/tests/d3-safe-closure.test.ts | PASS |
| dispatch guard expired | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A dispatch guard expired — backend/tests/d3-safe-closure.test.ts | PASS |
| dispatch guard too far | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A dispatch guard too far — backend/tests/d3-safe-closure.test.ts | PASS |
| dispatch guard too little left | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A dispatch guard too little left — backend/tests/d3-safe-closure.test.ts | PASS |
| rejects absent or zero maxTime null | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A rejects absent or zero maxTime null — backend/tests/d3-safe-closure.test.ts | PASS |
| rejects absent or zero maxTime 0 | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A rejects absent or zero maxTime 0 — backend/tests/d3-safe-closure.test.ts | PASS |
| rejects a persisted XDR metadata mismatch before any closure RPC | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A rejects a persisted XDR metadata mismatch before any closure RPC — backend/tests/d3-safe-closure.test.ts | PASS |
| signing checkpoints commit before both calls and a missing checkpoint prevents signing | backend/src/testnet/worker.ts: reconcile / dispatch; identity.ts: finalizedBody | D3-14A signing checkpoints commit before both calls and a missing checkpoint prevents signing — backend/tests/d3-safe-closure.test.ts | PASS |
| restart with missing identity stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with missing identity stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with missing XDR stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with missing XDR stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with truncated XDR stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with truncated XDR stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with unreadable XDR stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with unreadable XDR stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with changed signature, same body hash stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with changed signature, same body hash stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with missing signature stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with missing signature stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with wrong signer with correct hint stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with wrong signer with correct hint stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with correct signature with changed hint stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with correct signature with changed hint stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with extra signature stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with extra signature stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with wrong signing passphrase stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with wrong signing passphrase stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with wrong network metadata stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with wrong network metadata stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with wrong durable hash stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with wrong durable hash stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with wrong source stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with wrong source stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with wrong sequence stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with wrong sequence stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with wrong minTime stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with wrong minTime stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with wrong maxTime stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with wrong maxTime stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with unsupported Preconditions V2 stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with unsupported Preconditions V2 stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| restart with re-signed body and metadata disagree with immutable intent stays UNCERTAIN_OPEN | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B restart with re-signed body and metadata disagree with immutable intent stays UNCERTAIN_OPEN — backend/tests/d3-xdr-identity.test.ts | PASS |
| valid signature with complete retention proof | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B valid signature with complete retention proof — backend/tests/d3-xdr-identity.test.ts | PASS |
| valid signature with gap before dispatch retention proof | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B valid signature with gap before dispatch retention proof — backend/tests/d3-xdr-identity.test.ts | PASS |
| distinct pre-auth and final Soroban bodies bind final XDR | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B distinct pre-auth and final Soroban bodies bind final XDR — backend/tests/d3-xdr-identity.test.ts | PASS |
| distinct pre-auth and final Soroban bodies reject stale XDR | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B distinct pre-auth and final Soroban bodies reject stale XDR — backend/tests/d3-xdr-identity.test.ts | PASS |
| pre-sign guard rejects unsupported ledger and sequence preconditions | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B pre-sign guard rejects unsupported ledger and sequence preconditions — backend/tests/d3-xdr-identity.test.ts | PASS |
| actual authorized status GET surfaces durable hold without exposing XDR | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B actual authorized status GET surfaces durable hold without exposing XDR — backend/tests/d3-xdr-identity.test.ts | PASS |
| lost POST response and missing durable hash stop as UNCERTAIN_OPEN without replay | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B lost POST response and missing durable hash stop as UNCERTAIN_OPEN without replay — backend/tests/d3-xdr-identity.test.ts | PASS |
| real routing rejects a locally valid signature from an unexpected source | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B real routing rejects a locally valid signature from an unexpected source — backend/tests/d3-xdr-identity.test.ts | PASS |
| post-persist corruption before dispatch cannot create intent or send | backend/src/testnet/identity.ts: assertPersistedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14B post-persist corruption before dispatch cannot create intent or send — backend/tests/d3-xdr-identity.test.ts | PASS |
| pre-sign missing timebounds | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign missing timebounds — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign maxTime zero | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign maxTime zero — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign maxTime expired | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign maxTime expired — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign horizon too long | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign horizon too long — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign insufficient time | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign insufficient time — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign V2 ledgerBounds | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign V2 ledgerBounds — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign V2 minSeqNum | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign V2 minSeqNum — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign V2 minSeqAge | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign V2 minSeqAge — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign V2 minSeqLedgerGap | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign V2 minSeqLedgerGap — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign V2 extraSigners | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign V2 extraSigners — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign rejects V0 | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign rejects V0 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| pre-sign rejects fee-bump | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C pre-sign rejects fee-bump — backend/tests/d3-council-prefreeze.test.ts | PASS |
| numeric policy and exact signing boundaries | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C numeric policy and exact signing boundaries — backend/tests/d3-council-prefreeze.test.ts | PASS |
| authorization refuses 89 seconds without invoking signer | backend/src/testnet/transport.ts: signingRequest; identity.ts: readSupportedEnvelope / ENVELOPE_TIME_POLICY | D3-14C authorization refuses 89 seconds without invoking signer — backend/tests/d3-council-prefreeze.test.ts | PASS |
| dispatch remaining boundary 14 | backend/src/testnet/worker.ts: dispatch / execute / recoverDispatched; store.ts: dispatchIntent | D3-14C dispatch remaining boundary 14 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| dispatch remaining boundary 15 | backend/src/testnet/worker.ts: dispatch / execute / recoverDispatched; store.ts: dispatchIntent | D3-14C dispatch remaining boundary 15 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| dispatch remaining boundary 180 | backend/src/testnet/worker.ts: dispatch / execute / recoverDispatched; store.ts: dispatchIntent | D3-14C dispatch remaining boundary 180 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| dispatch remaining boundary 181 | backend/src/testnet/worker.ts: dispatch / execute / recoverDispatched; store.ts: dispatchIntent | D3-14C dispatch remaining boundary 181 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| RPC freshness boundary 30 | backend/src/testnet/worker.ts: reconcile / freshLedger | D3-14C RPC freshness boundary 30 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| RPC freshness boundary 31 | backend/src/testnet/worker.ts: reconcile / freshLedger | D3-14C RPC freshness boundary 31 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| RPC freshness boundary -60 | backend/src/testnet/worker.ts: reconcile / freshLedger | D3-14C RPC freshness boundary -60 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| RPC freshness boundary -61 | backend/src/testnet/worker.ts: reconcile / freshLedger | D3-14C RPC freshness boundary -61 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| atomic RPC closure coherent | backend/src/testnet/rpc.ts: transaction / assertTransactionResponse; transport.ts: observe; worker.ts: reconcile | D3-14C atomic RPC closure coherent — backend/tests/d3-council-prefreeze.test.ts | PASS |
| atomic RPC closure stale-plus-fresh | backend/src/testnet/rpc.ts: transaction / assertTransactionResponse; transport.ts: observe; worker.ts: reconcile | D3-14C atomic RPC closure stale-plus-fresh — backend/tests/d3-council-prefreeze.test.ts | PASS |
| atomic RPC closure retention-mixed | backend/src/testnet/rpc.ts: transaction / assertTransactionResponse; transport.ts: observe; worker.ts: reconcile | D3-14C atomic RPC closure retention-mixed — backend/tests/d3-council-prefreeze.test.ts | PASS |
| atomic RPC closure retention-unavailable | backend/src/testnet/rpc.ts: transaction / assertTransactionResponse; transport.ts: observe; worker.ts: reconcile | D3-14C atomic RPC closure retention-unavailable — backend/tests/d3-council-prefreeze.test.ts | PASS |
| atomic RPC closure context-unavailable | backend/src/testnet/rpc.ts: transaction / assertTransactionResponse; transport.ts: observe; worker.ts: reconcile | D3-14C atomic RPC closure context-unavailable — backend/tests/d3-council-prefreeze.test.ts | PASS |
| atomic RPC closure wrong-network | backend/src/testnet/rpc.ts: transaction / assertTransactionResponse; transport.ts: observe; worker.ts: reconcile | D3-14C atomic RPC closure wrong-network — backend/tests/d3-council-prefreeze.test.ts | PASS |
| atomic RPC closure futurenet | backend/src/testnet/rpc.ts: transaction / assertTransactionResponse; transport.ts: observe; worker.ts: reconcile | D3-14C atomic RPC closure futurenet — backend/tests/d3-council-prefreeze.test.ts | PASS |
| exact source proof 0 | backend/src/testnet/worker.ts: reconcile / freshLedger | D3-14C exact source proof 0 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| exact source proof 1 | backend/src/testnet/worker.ts: reconcile / freshLedger | D3-14C exact source proof 1 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| exact source proof 5 | backend/src/testnet/worker.ts: reconcile / freshLedger | D3-14C exact source proof 5 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| exact source proof -1 | backend/src/testnet/worker.ts: reconcile / freshLedger | D3-14C exact source proof -1 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| exact source proof unreadable | backend/src/testnet/worker.ts: reconcile / freshLedger | D3-14C exact source proof unreadable — backend/tests/d3-council-prefreeze.test.ts | PASS |
| exact source proof stale | backend/src/testnet/worker.ts: reconcile / freshLedger | D3-14C exact source proof stale — backend/tests/d3-council-prefreeze.test.ts | PASS |
| restart is independent of signer constructor and Secure Store false | backend/src/application/server.ts; application/deferred-signing.ts: deferredSigning; worker.ts: verifyOriginal / reconcile | D3-14C restart is independent of signer constructor and Secure Store false — backend/tests/d3-council-prefreeze.test.ts | PASS |
| restart is independent of signer constructor and Secure Store true | backend/src/application/server.ts; application/deferred-signing.ts: deferredSigning; worker.ts: verifyOriginal / reconcile | D3-14C restart is independent of signer constructor and Secure Store true — backend/tests/d3-council-prefreeze.test.ts | PASS |
| composition imports signer only inside deferred signing callback | backend/src/application/server.ts; application/deferred-signing.ts: deferredSigning; worker.ts: verifyOriginal / reconcile | D3-14C composition imports signer only inside deferred signing callback — backend/tests/d3-council-prefreeze.test.ts | PASS |
| authenticated status reads durable RPC uncertainty and clears it on a coherent observation | backend/src/application/operation-status.ts: operationStatus / operationPresentation; store.ts: hasRpcUncertainty | D3-14C authenticated status reads durable RPC uncertainty and clears it on a coherent observation — backend/tests/d3-council-prefreeze.test.ts | PASS |
| restart boundary before-submit | backend/src/testnet/worker.ts: dispatch / execute / recoverDispatched; store.ts: dispatchIntent | D3-14C restart boundary before-submit — backend/tests/d3-council-prefreeze.test.ts | PASS |
| restart boundary lost-response | backend/src/testnet/worker.ts: dispatch / execute / recoverDispatched; store.ts: dispatchIntent | D3-14C restart boundary lost-response — backend/tests/d3-council-prefreeze.test.ts | PASS |
| restart boundary during-reconciliation | backend/src/testnet/worker.ts: dispatch / execute / recoverDispatched; store.ts: dispatchIntent | D3-14C restart boundary during-reconciliation — backend/tests/d3-council-prefreeze.test.ts | PASS |
| invalid persisted envelope type V0 | backend/src/testnet/identity.ts: readSupportedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14C invalid persisted envelope type V0 — backend/tests/d3-council-prefreeze.test.ts | PASS |
| invalid persisted envelope type fee-bump | backend/src/testnet/identity.ts: readSupportedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14C invalid persisted envelope type fee-bump — backend/tests/d3-council-prefreeze.test.ts | PASS |
| full-envelope persist digest mismatch is an explicit durable hold | backend/src/testnet/identity.ts: readSupportedEnvelope; worker.ts: verifyOriginal; store.ts: assertPersistedEnvelopeAnchor | D3-14C full-envelope persist digest mismatch is an explicit durable hold — backend/tests/d3-council-prefreeze.test.ts | PASS |
| no automatic lifecycle continuation FAILED | backend/src/d3/live-operator.ts: submitAndObserveOperation / runLive; application/coordinator.ts: queue | D3-14C no automatic lifecycle continuation FAILED — backend/tests/d3-council-prefreeze.test.ts | PASS |
| no automatic lifecycle continuation EXPIRED_NOT_INCLUDED | backend/src/d3/live-operator.ts: submitAndObserveOperation / runLive; application/coordinator.ts: queue | D3-14C no automatic lifecycle continuation EXPIRED_NOT_INCLUDED — backend/tests/d3-council-prefreeze.test.ts | PASS |
| no automatic lifecycle continuation UNCERTAIN_OPEN | backend/src/d3/live-operator.ts: submitAndObserveOperation / runLive; application/coordinator.ts: queue | D3-14C no automatic lifecycle continuation UNCERTAIN_OPEN — backend/tests/d3-council-prefreeze.test.ts | PASS |
| API rejects a new-key replacement FAILED | backend/src/d3/live-operator.ts: submitAndObserveOperation / runLive; application/coordinator.ts: queue | D3-14C API rejects a new-key replacement FAILED — backend/tests/d3-council-prefreeze.test.ts | PASS |
| API rejects a new-key replacement EXPIRED_NOT_INCLUDED | backend/src/d3/live-operator.ts: submitAndObserveOperation / runLive; application/coordinator.ts: queue | D3-14C API rejects a new-key replacement EXPIRED_NOT_INCLUDED — backend/tests/d3-council-prefreeze.test.ts | PASS |
| API rejects a new-key replacement UNCERTAIN_OPEN | backend/src/d3/live-operator.ts: submitAndObserveOperation / runLive; application/coordinator.ts: queue | D3-14C API rejects a new-key replacement UNCERTAIN_OPEN — backend/tests/d3-council-prefreeze.test.ts | PASS |
| historical lifecycle is blocked at real HTTP and service boundaries before all external effects | backend/src/application/historical-lifecycle.ts: assertLifecycleWritable; coordinator.ts: acceptMutation / queue; testnet/service.ts: prepare / processReviewed | D3-14C historical lifecycle is blocked at real HTTP and service boundaries before all external effects — backend/tests/d3-council-prefreeze.test.ts | PASS |
| terminal transition between admission reads cannot admit a replacement | backend/src/d3/live-operator.ts: submitAndObserveOperation / runLive; application/coordinator.ts: queue | D3-14C terminal transition between admission reads cannot admit a replacement — backend/tests/d3-council-prefreeze.test.ts | PASS |

## Iteraciones previas y regresión final

La primera corrida integral encontró un fixture antiguo que sustituía transaction() por un objeto sin contexto. Se adaptó únicamente ese fixture para pasar por el cliente real y una respuesta HTTP offline, manteniendo sus comprobaciones SUCCESS/FAILED/NOT_FOUND. La revisión de admisión también añadió una prueba de transición entre lecturas. El resultado final corresponde a la corrida repetida después de estabilizar esos cambios.

## Regresión final

| Gate | Resultado |
|---|---|
| focused | 129/129 (subset integral final, incluido recovery PostgreSQL) |
| d3_14c | 53/53 |
| d3_14b | 27/27 |
| d3_14a | 25/25 |
| d3_13 | 19/19 |
| d3_9bPostgresql | 48/48 |
| backend | 671/671 |
| frontend | 323/323 |
| rootVerify | PASS |
| typescript | PASS |
| lint | PASS |
| isolatedFrontendBuild | PASS |
| isolatedBuildAudits | PASS |
| rustNative | 21/21 |
| cargoWithWasmTests | 22/22 |
| releaseWasm | PASS, identical SHA256 |
| rustfmt | PASS |
| clippy | PASS, -D warnings |
| python | 4/4 |
| mockDemo | REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT |
| secretAudit | PASS, no findings |
| diffCheck | PASS |
| sourceTestHashesStable | True |
| frontendFixtureCleanup | {'remaining_fixture_databases': 0, 'test_cluster_stopped_retained': True, 'legacy_cluster_restored_unmodified': True} |
| run | run-05d880d5a29442e2b1434062713a392b |
| frontendRun | run-dceb2ea3cf074fef879c4dd3fa2ec0c1 |
| frontendFirstAttempt | 322/323; build audit timed out at 5s after 5.914s; rerun all frontend gates with unchanged default timeout and unchanged candidate |

Root/backend: run-05d880d5a29442e2b1434062713a392b, suite exit code 0, 671/671 sin fallos ni skips. La primera pasada frontend de ese harness tuvo 322/323 por timeout de 5s en la auditoría (5.914s); no falló una assertion de integridad. Se repitió todo el gate frontend, manteniendo el timeout original, sin modificar fuente/tests: run-dceb2ea3cf074fef879c4dd3fa2ec0c1, exit code 0 y 323/323. La validación agregada usa estas dos corridas del mismo fingerprint. Fuente/tests registrados antes y sin cambios durante/después. El harness antiguo espera 547; se usa 671 en memoria sin editar su archivo. Cero bases efímeras restantes, cluster detenido y cluster anterior restaurado intacto. Build aislado sin .env real ni servicios remotos. Dependencias sin actualizar.

## Scope

| Componente | Cambio |
|---|---|
| builder | No new building behavior; shared parser validates raw type before model normalization. |
| signer | UNCHANGED |
| server | CHANGED: deferred composition |
| serviceBusiness | CHANGED: historical denial and uncertainty |
| worker | CHANGED: persist explicit RPC uncertainty |
| transport | CHANGED: raw guard and coherent NOT_FOUND validation |
| rpc | CHANGED: response context binding |
| store | CHANGED: existing observation JSON only |
| identity | CHANGED: raw type validation |
| sql | Schema and SQL files unchanged; application SELECT/JSON observation logic changed |
| migrations | UNCHANGED |
| rls | UNCHANGED |
| auth | UNCHANGED |
| frontend | UNCHANGED |
| vercel | UNCHANGED |
| contract | UNCHANGED |
| wasmBehavior | UNCHANGED |

Modificados respecto de HEAD:

- backend/src/application/coordinator.ts
- backend/src/application/operation-status.ts
- backend/src/application/server.ts
- backend/src/d3/live-operator.ts
- backend/src/d3/manifest.ts
- backend/src/d3/operation-polling.ts
- backend/src/d3/operator-control.ts
- backend/src/testnet/identity.ts
- backend/src/testnet/rpc.ts
- backend/src/testnet/service.ts
- backend/src/testnet/store.ts
- backend/src/testnet/transport.ts
- backend/src/testnet/worker.ts
- backend/tests/d2-authority-fixture.ts
- backend/tests/d2-dispatch-authority.test.ts
- backend/tests/testnet-fixtures.ts
- backend/tests/testnet-real-boundaries.test.ts
- backend/tests/testnet-worker.test.ts

Nuevos archivos de código/tests:

- backend/src/application/deferred-signing.ts
- backend/src/application/historical-lifecycle.ts
- backend/tests/d3-council-prefreeze.test.ts
- backend/tests/d3-observation-lineage.test.ts
- backend/tests/d3-safe-closure.test.ts
- backend/tests/d3-xdr-identity.test.ts

Nuevos reportes: docs/instaward/d3/D3-14C-COUNCIL-BLOCKERS-PREFREEZE-2026-11-04.md y .json. Reportes históricos intactos y sin stage. Eliminados: **0**. Diff rastreado **+559/−161**; archivos nuevos de fuente/tests: **998** líneas. El JSON identifica cambios desde D3-14B y el conjunto exacto del fingerprint.

Contrato esperado: CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON; sin consulta live ni modificación. WASM release reconstruido: c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6, idéntico. Sin cambios de signer, secretos, SQL, migraciones, RLS, Auth, frontend, Vercel ni comportamiento del contrato/WASM. Auditoría de secretos y git diff --check PASS; índice vacío. HEAD intacto.

## Estado y efectos

Cero business Testnet tx, firmas live, broadcasts, Supabase writes, migraciones nuevas/remotas, TTL extensions, deploys, commits y pushes. Las migraciones existentes se reproducen únicamente en las bases efímeras de la suite local. Solo documentación y lectura del HEAD Git remoto fuera de las pruebas locales.

Cap **18**, consumidas **3**, disponibles **15**, futuros requeridos **15**, margen **0**, ciclos frescos **0/3**. TTL_OWNER_DECISION_PENDING = YES.

D1 **12/12**, D2 **6/6**, D3 **0/5**, total **18/23**.

**Siguiente gate: Council review del fingerprint nuevo. NO FREEZE. STOP.**
