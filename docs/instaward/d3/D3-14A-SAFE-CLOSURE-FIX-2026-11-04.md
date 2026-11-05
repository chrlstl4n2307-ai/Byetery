# D3-14A-SAFE-CLOSURE-FIX · 2026-11-04

**`D3_14A_SAFE_CLOSURE_READY_FOR_COUNCIL_REVIEW`**. Siguiente gate: revisión del Council.

## Baseline

- Rama `instaward/d2-web-mvp` y HEAD `da541d843632e3ba4bd811ddd13c85b2bea5ccb6`.
- Fingerprint histórico de D3-13 `d6dd1bc7c8a39472394028d595980f78951dd3210bde0693f78c1816c764a510`.
- Contrato `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON` y WASM byte-idéntico `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

## Identidad durable y cierre

El worker registra el hash de la fase y los campos públicos validados antes de cada una de las dos llamadas de firma. La primera firma adjunta autorizaciones Soroban y puede cambiar el hash del cuerpo, por lo que el checkpoint de la segunda fase registra el hash final. Ambas fases preservan fuente, secuencia y timebounds. La identidad definitiva incluye ID de operación, hash, cuenta, secuencia, `minTime`, `maxTime`, ledger de preparación y el XDR firmado en la tabla privada inmutable. Los tiempos definitivos salen del XDR. La verificación de hash, secuencia, fuente y timebounds se repite al leerlo para despacho o conciliación.

El builder fija el horizonte en **180 s** desde el cierre del ledger de preparación. El transporte exige al menos **90 s** para iniciar la autorización, **50 s** para iniciar la firma del sobre y el worker exige **15 s** antes del despacho. El estado y el contador de despacho se confirman en la misma transacción SQL que la observación inmutable `DISPATCH_INTENT`, que guarda el ledger observado antes del envío junto al hash, fuente, secuencia y maxTime. Ese ledger es un límite inferior conservador para la cobertura de retención. Se reutilizan campos existentes y no se requiere migración. Una intención anterior sin esta prueba de ledger queda abierta si no hay recibo.

El worker prioriza un recibo validado `SUCCESS` o `FAILED` del hash original. Para cerrar como `EXPIRED_NOT_INCLUDED` (transporte `EXPIRED_NOT_APPLIED`) se exige simultáneamente:

1. Identidad firmada y primera intención persistidas y concordantes.
2. Ledger observado con cierre estrictamente mayor a `maxTime + 10 s` y posterior al ledger de la intención.
3. Lectura posterior de `getTransaction(hash)` con `NOT_FOUND`, ledger y hora que cubran la observación anterior y `oldestLedger <= dispatchLedger`.
4. Hora de cierre de ambas lecturas dentro de 30 s de atraso respecto del reloj local y hasta 60 s de adelanto permitido.
5. Cuenta exacta leída en un ledger que cubra la consulta final. Su secuencia debe ser exactamente `seq_tx - 1`.

Si falta prueba, el resultado sigue abierto. Una brecha de retención o secuencia incompatible deja una marca de revisión. La reconciliación del worker puede recuperar después un recibo del mismo hash. El GET del operador toma una decisión de observación, nunca de finalidad. Conserva la puerta de 120 s para entrar a la observación extendida y usa 600 s como límite operativo. Agotarlo devuelve `UNCERTAIN_OPEN`. La conciliación durable continúa por el worker y no inicia otra operación. El guard previo a despacho y la ruta revisada de revocación anterior al despacho son distintos del cierre de un envío.

Referencias de protocolo: [time bounds](https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions#time-bounds), [hora de cierre del ledger](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers#close-time), [getTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction).

## Contraejemplo y reinicio

La prueba con reloj virtual prepara en **t=110**, usa cierre **t=140**, obtiene **maxTime=320** y presenta despacho desde **t=115**. En **t=300** la operación sigue abierta. Con inclusión en **t=305** recupera **SUCCESS** del mismo hash incluso con un worker reconstruido. La rama ausente solo cierra en **t=331**, al verificar la lectura posterior y las pruebas de retención y secuencia. También se probó el último ledger elegible en t=320.

Los caminos revisados fueron `submitAndObserveOperation` y `observeOperation` para el GET, `DurableTransactionWorker.execute/reconcile` para el reinicio, `TransportStore.identity/firstDispatchLedger/observed` para persistencia y `TestnetTransport.observe/validity/sourceSequenceForClosure` para las lecturas de Stellar. Tras 202 o pérdida del acuse, el operador solo lee por la clave existente y luego por el ID fijado. El worker reiniciado con despacho persistido no llega a prepare, signer ni submit. El punto separado de reenvío revisado deniega claves del operador D3. Los contadores offline verificaron un solo POST, preparación, firma de sobre y envío de origen, sin repeticiones ni reemplazos.

## Evidencia histórica

`BYE-D3-R1-20261104-AF7A44A515AC` sigue `PERMANENTLY_NON_COUNTING`, en el último estado conciliado `COLLECTED / NOT_ELIGIBLE`. El manifiesto V1 conservó sus bytes y su digest canónico. Se mantiene el bloqueo del operador. La comprobación server/API/UI queda para el preflight.

| Hash | Estado RPC | Ledger | CloseTime UNIX | Latest | Oldest |
|---|---|---:|---:|---:|---:|
| `5d7fff5457e19ad337e50398a07d403e68a054dbf58d8a5959c826c540b3d937` | SUCCESS | 5559684 | 1793822060 | 5562749 | 5441790 |
| `3e8a0482e3f32ea314c7df0da7ef6a8d3394b8aef354fa291fd7d6cd06007c15` | SUCCESS | 5559714 | 1793822210 | 5562749 | 5441790 |
| `32ba94f9da05b52f44813e26e576cc994fd694f1df9132dd14d67557aa0ddd06` | SUCCESS | 5559745 | 1793822365 | 5562749 | 5441790 |

El JSON conserva la hora UTC de lectura y los SHA-256 de los XDR de resultado y metadatos. La captura usó solo lecturas del RPC público.

## Regresión

| Verificación | Resultado |
|---|---|
| D3-14A matriz final | 25/25, incluye recibos tempranos y tardíos, último ledger válido, ausencia segura, desfase, RPC, retención, secuencia, reinicios y guards del XDR. |
| D3-13 y worker | 19/19 D3-13, 17/17 VOL-003 en corrida focalizada. Manifiesto posiciones 1–5, rechazo de duplicados, orden incorrecto, hash ausente y prefijo alterado. |
| Compatibilidad y cierre abierto | 2/2 comprobaciones independientes de V1 byte exacto y salida UNCERTAIN_OPEN al detectar hold. |
| Backend integral | 591/591, 0 fallos u omitidos. Aumento de 566 a 591 por las 25 pruebas nuevas. TypeScript final PASS. |
| Frontend integral | 323/323 en 22 suites. TypeScript, lint y build PASS. |
| PostgreSQL real | 48/48 D3-9B en repetición estable. Carreras D3 de cierre y carreras D2 de despacho incluidas. Cero bases de fixture restantes. |
| Root verify y WASM | PASS. rustfmt, Rust nativo, WASM, release, Clippy, Python 4/4 y demo MOCK. |
| Build frontend aislado | PASS. Build, TypeScript y auditorías de rutas y assets. |
| Auditoría de secretos y git diff --check | PASS. Sin coincidencias ni cambios en el índice. |

La corrida integral completó las suites y los builds. Su guard de hashes detectó dos ajustes de pruebas durante la ejecución, limitados a d3-safe-closure.test.ts y testnet-worker.test.ts. Las versiones finales pasaron en sus corridas focalizadas. La repetición de D3-9B pasó 48/48 con todos los hashes de SQL y pruebas idénticos antes y después y limpieza correcta.

## Archivos

- Modificados: `backend/src/application/operation-status.ts`, `backend/src/d3/live-operator.ts`, `backend/src/d3/manifest.ts`, `backend/src/d3/operation-polling.ts`, `backend/src/d3/operator-control.ts`, `backend/src/testnet/identity.ts`, `backend/src/testnet/rpc.ts`, `backend/src/testnet/store.ts`, `backend/src/testnet/transport.ts`, `backend/src/testnet/worker.ts`, `backend/tests/d2-dispatch-authority.test.ts`, `backend/tests/testnet-fixtures.ts`, `backend/tests/testnet-real-boundaries.test.ts`, `backend/tests/testnet-worker.test.ts`.
- Nuevos: `backend/tests/d3-observation-lineage.test.ts`, `backend/tests/d3-safe-closure.test.ts`, `docs/instaward/d3/D3-14A-SAFE-CLOSURE-FIX-2026-11-04.md`, `docs/instaward/d3/D3-14A-SAFE-CLOSURE-FIX-2026-11-04.json`.
- Eliminados: **0**.
- Diff rastreado: **+372/−132**. Los dos archivos de prueba nuevos añaden **351** líneas.
- `NEW_CANDIDATE_FINGERPRINT` **`7d9e6f48a5cccecd3f9de00f4d581955c2f0a962472659e5e531086ff98774eb`**. SHA-256 sobre la secuencia ordenada de ruta UTF-8, TAB, SHA-256 del archivo en minúsculas y LF. Incluye código y pruebas.

## Estado

Presupuesto **3/18 consumidas**, **15** disponibles y **0/3** ciclos frescos. Una corrida parcial exige STOP y nueva decisión del propietario. D1 **12/12**, D2 **6/6**, D3 **0/5**, total **18/23**.

Cero transacciones de negocio, firmas operativas, broadcasts, escrituras a Supabase, migraciones remotas, despliegues, commits o pushes. `TTL_OWNER_DECISION_PENDING = YES`. HEAD e índice Git verificados.

**STOP.**
