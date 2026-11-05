# D3-14B-XDR-IDENTITY-HARDENING · 2026-11-04

**`D3_14B_XDR_HARDENING_READY_FOR_COUNCIL_REVIEW`**. Siguiente gate: revisión del Council.

## Baseline

Rama `instaward/d2-web-mvp`. HEAD y referencia remota almacenada localmente `da541d843632e3ba4bd811ddd13c85b2bea5ccb6`. Fingerprint histórico bloqueado `7d9e6f48a5cccecd3f9de00f4d581955c2f0a962472659e5e531086ff98774eb`. Contrato `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON` y WASM `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

El freeze previo cambió únicamente la firma dentro del XDR. El hash del cuerpo coincidió y el SDK rechazó la firma, pero el worker permitió cerrar como `EXPIRED_NOT_INCLUDED`. El control permanente conserva el mismo cuerpo y reproduce esa alteración. Ahora el worker deja el estado público en `UNCERTAIN_OPEN` y se detiene antes de consultar el cierre.

## Modelo de firma

| Operación | Firma del sobre | Autorización Soroban adicional |
|---|---|---|
| Registro | ADMIN | — |
| Apertura y cancelación | SERVICE | — |
| Recolección | SERVICE | COLLECTOR |
| Reciclaje | RECYCLER | — |
| Recompensa | SERVICE | — |

El origen se obtiene del routing inmutable de la operación y se vuelve a contrastar con `invocation` para el transporte TESTNET. El modelo admite exactamente **una** firma decorada de origen. El hint debe corresponder a esa cuenta, y Ed25519 debe verificar la firma sobre el hash calculado con la passphrase Testnet. El runtime actual no admite multifirma, firmas extra, fee-bump ni Preconditions V2 de transacción. El guard de tiempo simple se aplica antes de firmar y al leer el sobre persistido.

COLLECTOR firma una autorización Soroban de dirección durante la primera fase. El signer vigente verifica esa autorización con material público y la incorpora al cuerpo antes de que SERVICE firme el sobre. Esa firma de SERVICE cubre el cuerpo final, incluidas las entradas Soroban. La prueba offline genera dos cuerpos distintos y verifica que solo el artefacto final pasa el binding durable. Las credenciales Soroban `AddressV2` que usa esta autorización no son las `PreconditionsV2` de transacción que el guard rechaza. El cambio no toca el signer ni sus secretos. [Passphrases](https://developers.stellar.org/docs/networks#network-passphrases) · [Firmas Soroban](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations#auth-entry-structure)

## Verificación al reiniciar y orden durable

1. El sobre final y su firma se validan. El worker persiste el XDR, el hash del cuerpo, la cuenta, secuencia y timebounds. En la misma transacción registra un SHA-256 de **todo** el XDR en el checkpoint inmutable.
2. Antes de enviar, el worker recarga el XDR y verifica la firma y el checkpoint. La intención se confirma antes del submit y guarda el mismo digest con los campos públicos y el ledger de despacho.
3. Tras un reinicio, el worker carga el XDR y lo decodifica como `envelopeTypeTx` con timebounds simples. Vuelve a comprobar invocación, contexto, cuenta, secuencia, minTime/maxTime, hash Testnet y firma del origen, y compara los digests disponibles con el XDR exacto.
4. Si falta el XDR o falla una comprobación, persiste un bloqueo bajo el fence de la operación y el GET autenticado muestra `UNCERTAIN_OPEN`, no terminal y con revisión requerida. El reinicio siguiente conserva el bloqueo. La verificación no utiliza claves privadas ni llama al signer.

Los recibos históricos ya confirmados se conservan. Con identidad válida, SUCCESS y FAILED del hash original mantienen prioridad. El cierre por ausencia conserva el margen de 10 s, la lectura final de NOT_FOUND con datos de ledger y retención del RPC, la frescura, Testnet y la secuencia `seq_tx - 1`. Se usa la referencia de retención más antigua entre preparación y despacho. Un intento histórico sin ancla completa de despacho puede recuperar su recibo validado, pero queda abierto si falta el recibo. La secuencia t=110/140/320/305 conserva el mismo hash y las ramas de éxito y ausencia pasan la matriz de D3-14A.

Si el proceso perdió la confirmación del COMMIT, un sobre READY válido conserva el rechazo explícito `SignedIdentityRequiresReviewedDispatch` al reconectar, sin preparar, firmar ni enviar de nuevo. El operador no reconstruye el paso después de un hold. La pérdida de respuesta del POST usa la clave original y GET, y el worker con intento durable solo puede recorrer la rama de recuperación. Los tests contaron una sola preparación, firma y envío del fixture original, sin replay ni reemplazo. Para el caso de corrupción antes de persistir la intención se probó cero envíos.

## Regresión

| Verificación | Resultado |
|---|---|
| D3-14B: firma, identidad, reinicio y estado público | 27/27 PASS |
| D3-14A: cierre seguro, precedencia y contraejemplo t=110/140/320/305 | 25/25 PASS |
| D3-13: polling, no replay y manifiestos | 19/19 PASS |
| D3-9B: PostgreSQL 17.6 local | 48/48 PASS |
| Regresión focalizada final, incluido COMMIT perdido | 57/57 PASS |
| Backend completo y TypeScript | 618/618 PASS, 0 omitidas |
| Frontend completo, TypeScript, lint y build | 323/323 PASS |
| Build aislado y sus dos auditorías | PASS |
| Verificación desde la raíz | PASS |
| Rust native con cargo test --locked | 21/21 PASS |
| Cargo con feature wasm-tests | 22/22 PASS, incluye prueba del WASM |
| rustfmt, build WASM release y Clippy con -D warnings | PASS |
| Python y demo MOCK | 4/4 PASS; REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT |
| SQL y tests durante la corrida | Sin cambios; 0 bases de fixture restantes |
| git diff --check, índice vacío y auditoría de secretos | PASS; sin hallazgos |

La primera corrida integral detectó que el worker ocultaba el rechazo explícito tras la pérdida de confirmación del COMMIT. Se restauró ese rechazo sin eliminar la verificación del XDR y se repitió toda la regresión sobre el fingerprint nuevo.

La matriz cubre XDR válido, ausente, truncado o ilegible, firma alterada o ausente, firmante incorrecto con hint correcto, hint alterado, firma extra, passphrase incorrecta, diferencias de hash/cuenta/secuencia/timebounds, V2 no soportado, XDR pre-auth, sobre final válido, alteración coherente del cuerpo y metadatos, retención incompleta o completa, la lectura pública y reinicio sin replay.

El RUN1 histórico `BYE-D3-R1-20261104-AF7A44A515AC` sigue `PERMANENTLY_NON_COUNTING`. Se comprobó el digest de bytes y el digest canónico del V1, además del tombstone. Su revisión server/API/UI sigue pendiente para preflight.

## Archivos y fingerprint

- Modificados: `backend/src/application/operation-status.ts`, `backend/src/d3/live-operator.ts`, `backend/src/d3/manifest.ts`, `backend/src/d3/operation-polling.ts`, `backend/src/d3/operator-control.ts`, `backend/src/testnet/identity.ts`, `backend/src/testnet/rpc.ts`, `backend/src/testnet/service.ts`, `backend/src/testnet/store.ts`, `backend/src/testnet/transport.ts`, `backend/src/testnet/worker.ts`, `backend/tests/d2-dispatch-authority.test.ts`, `backend/tests/testnet-fixtures.ts`, `backend/tests/testnet-real-boundaries.test.ts`, `backend/tests/testnet-worker.test.ts`.
- Nuevos: `backend/tests/d3-observation-lineage.test.ts`, `backend/tests/d3-safe-closure.test.ts`, `backend/tests/d3-xdr-identity.test.ts`, `docs/instaward/d3/D3-14B-XDR-IDENTITY-HARDENING-2026-11-04.md`, `docs/instaward/d3/D3-14B-XDR-IDENTITY-HARDENING-2026-11-04.json`.
- Eliminados: 0. Diff rastreado **+479/−145**. Las tres pruebas nuevas aportan **594** líneas.
- **NEW_CANDIDATE_FINGERPRINT** `f11840d3bf1a433fa1d3f44023da42ae1ec148c61b7287e090e5ea049922874c`. SHA-256 de las rutas UTF-8 ordenadas, TAB, SHA-256 del archivo en minúsculas y LF. El conjunto exacto de código y pruebas queda en el JSON, sin reportes.

## Estado

**3/18** transacciones consumidas, **15** disponibles y **0/3** ciclos frescos. D1 **12/12**, D2 **6/6**, D3 **0/5**, total **18/23**. `TTL_OWNER_DECISION_PENDING = YES`.

Cero transacciones Testnet de negocio, firmas live, broadcasts, escrituras a Supabase, migraciones remotas, extensiones de TTL, despliegues, commits o pushes. Índice Git vacío.

**STOP.**
