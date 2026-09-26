# Byetery: validación del contrato en Stellar Testnet

Fecha: 2026-09-26. Red exclusiva: **Stellar Testnet**, protocolo 28.

## Resultado y alcance

Contrato desplegado y ciclo real verificado: REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT.
El destinatario recibió 10 GREENTEST. El segundo pago falló y ambos balances permanecieron iguales.
La aplicación sigue en DEV/MOCK. No se implementó TestnetStellarService ni se modificó el contrato Rust. La suite HTTP utilizó únicamente fixtures autorizados en Supabase DEV, sin cambiar esquema, migraciones, RLS ni configuración. No se desplegó Vercel.

Trabajo aislado autorizado en `codex/testnet-contract-validation`, desde el checkpoint limpio `0a572af29b6d4df6c16feb0329ecc225948824f6`. Los cambios pendientes de wallet/QR del proyecto original permanecen allí y no forman parte de esta rama.

**Validación HTTP completada:** 43/43 tests existentes pasaron el 2026-09-26, sin fallos ni omisiones, contra Supabase DEV y la API HTTP local con MockStellarService. El usuario autorizó expresamente estos fixtures. Esta validación no ejecutó un segundo flujo Testnet.

## Herramientas y red

- Stellar CLI 28.0.0, revisión 300aaf69ab100536678bdb641428b06f06b318ea.
- rustc 1.96.0 (ac68faa20 2026-05-25), host x86_64-pc-windows-gnu.
- soroban-sdk Rust 27.0.6, soroban-env-host 27.0.1; @stellar/stellar-sdk JavaScript 17.0.1.
- RPC: https://soroban-testnet.stellar.org
- Passphrase: `Test SDF Network ; September 2015`.
- Network ID: `cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472`.
- Friendbot oficial de Testnet. Se comprueba getNetwork antes de cada operación crítica. El script elimina STELLAR_* heredadas y fija URL/passphrase explícitas.

## Identificadores públicos

Contract ID: `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`.
[Contrato en Stellar Lab](https://lab.stellar.org/r/testnet/contract/CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON).

SAC: `CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G`.
Asset: `GREENTEST:GCHROKHXHL4L635J6Y6DWFFD5DDHABOAF4BP5TEUZDZQMW4XYS6DIDL7`. Etiqueta de demostración GREEN-TEST, código clásico GREENTEST, 7 decimales y sin valor monetario.
Recompensa configurada: 100000000 unidades base = 10 GREENTEST. Fondeo: 1000000000 unidades base = 100 GREENTEST.
El issuer del SAC emitió el fondeo al contrato. No se añadió mint ni una facultad de retiro a Byetery, ni se necesitó distribuidor/custodia adicional.
El recipient creó su trustline; Byetery, como dirección C, mantiene su balance en el SAC.

| Actor | Dirección pública Testnet |
| --- | --- |
| ADMIN | `GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F` |
| SERVICE | `GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX` |
| COLLECTOR | `GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V` |
| RECYCLER | `GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2` |
| RECIPIENT | `GCOEEZR6CA4TU2WK7ZNAS6AJGHQH7NGYWKO7HZ3HQIF7EJATGLBNKOUZ` |
| ISSUER | `GCHROKHXHL4L635J6Y6DWFFD5DDHABOAF4BP5TEUZDZQMW4XYS6DIDL7` |

Identidades CLI nuevas con nombres `byetery-tn20260926-<actor>`, almacenadas mediante `keys generate --secure-store` en Windows. Los scripts no leen, imprimen ni exportan claves secretas o frases semilla.

## WASM congelado

SHA-256 antes, después de recompilar y del WASM descargado desde el contrato desplegado:

```text
c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6
```

Los tres hashes coinciden. La carga usó `--optimize=false`; el despliegue utilizó el hash ya cargado. El contrato, Cargo.lock y tests congelados no cambiaron.

## ABI y autorizaciones

La especificación se extrajo del WASM: [contract-spec.json](testnet/contract-spec.json).

| Operación | Parámetros después de Env | Autorización |
| --- | --- | --- |
| __constructor | admin: Address, service: Address, reward_token: Address, reward_amount: i128 | admin.require_auth() |
| set_role | actor: Address, actor_role: ActorRole, enabled: bool | Config.admin |
| register_battery | battery_id: String, registration_hash: BytesN<32> | Config.admin |
| open_return | battery_id: String, request_id: BytesN<32>, recipient: Address | Config.service |
| cancel_return | battery_id: String, request_id: BytesN<32> | Config.service |
| confirm_collection | battery_id: String, request_id: BytesN<32>, collector: Address, evidence: Evidence | Collector habilitado + Config.service |
| confirm_recycling | battery_id: String, request_id: BytesN<32>, recycler: Address, evidence: Evidence | Recycler habilitado |
| pay_reward | battery_id: String | Config.service |
| get_config | ninguno | Lectura |
| has_role | actor: Address, actor_role: ActorRole | Lectura |
| get_battery | battery_id: String | Lectura |
| get_request | request_id: BytesN<32> | Lectura |

Config contiene schema_version=1, admin, service, reward_token y reward_amount. ActorRole solo incluye Collector y Recycler. ADMIN y SERVICE se fijan en Config. El contrato confía en SERVICE para las acciones derivadas de usuarios autenticados off-chain; esta prueba directa utiliza identidades de test y no simula un login Supabase.

Estados físicos: Registered, Returned, Collected, Recycled. Solicitud: Open, Cancelled, Confirmed. Recompensa: NotEligible, Pending, Sent. FAILED sigue siendo off-chain.
La cancelación implementada permite Returned → Registered mientras la solicitud permanezca Open. Su caso positivo permanece cubierto por los tests locales, no se afirma haberlo ejecutado en esta corrida Testnet.

Errores del ABI: 1 InvalidBatteryId; 2 BatteryAlreadyExists; 3 BatteryNotFound; 4 RequestIdAlreadyUsed; 5 RequestNotFound; 6 RequestNotOpen; 7 RequestMismatch; 8 InvalidState; 9 RoleNotGranted; 10 InvalidEvidence; 11 EvidenceBatteryMismatch; 12 EvidenceRequestMismatch; 13 RewardNotEligible; 14 RewardAlreadySent; 15 InvalidConfiguration; 16 InvalidRecipient; 17 InsufficientRewardBalance.

## Flujo y balances

Battery ID: `BYE-TN-D7DB910EE8BA`.
Request ID: `aac70a9546fb6197234bc65d467e19d24e008733ba785d111155af90c7cf9864`, 32 bytes CSPRNG, hexadecimal.

| Etapa | Estado físico | Reward | Solicitud |
| --- | --- | --- | --- |
| register_battery | Registered | NotEligible | Ausente |
| open_return | Returned | NotEligible | Open |
| confirm_collection | Collected | NotEligible | Confirmed |
| confirm_recycling | Recycled | Pending | Confirmed |
| pay_reward | Recycled | Sent | Confirmed |

Después de cada etapa se consultaron get_battery y, cuando existía, get_request. get_config y has_role confirmaron la configuración y los dos operadores.

| Cuenta | Antes del pago | Después del pago | Después del segundo intento |
| --- | --- | --- | --- |
| Byetery | 100 GREENTEST | 90 GREENTEST | 90 GREENTEST |
| Recipient | 0 GREENTEST | 10 GREENTEST | 10 GREENTEST |

pay_reward ejecutó transferencia y estado Sent atómicamente desde el balance prefinanciado del contrato.

## Evidencias

Se reutilizó `backend/src/evidence.ts`, contrastado por la suite existente con el vector Rust.
Compromiso = SHA-256 del XDR de (String BYETERY_EVIDENCE_V1, network_id, contract_address, Evidence).
Evidence contiene version=1, battery_id, request_id, kind y payload_hash. ScMap con claves ordenadas lexicográficamente.

Los bytes de los payloads de prueba se conservan sin normalización posterior en [collection-payload.txt](testnet/collection-payload.txt) y [recycling-payload.txt](testnet/recycling-payload.txt). UTF-8, LF, incluye LF final.

- Collection commitment: `bd6f42412b5e1197096b5ec7e5426fee455db2ef8cedfd5ae6553ad66bb21da3`.
- Recycling commitment: `b857824e8dc74f3bfdb3b0eaf5193366474fe22f93b26f1d923822976f3f8906`.

Ambos coincidieron con los hashes almacenados on-chain. El rechazo de evidencia incorrecta comprueba una batería distinta. El contrato valida el contexto y un payload_hash no nulo, no puede comprobar por sí mismo el contenido físico del reciclaje ni distinguir un hash no nulo de un manifiesto falso.

## Transacciones confirmadas

Hashes obtenidos del CLI y corroborados con getTransaction=SUCCESS. Horas UTC.

| Operación | Transaction hash | Ledger | Timestamp |
| --- | --- | --- | --- |
| deploy-sac | [`bc8a2c4c71b1cbc4219b1025c22b2031b1cde381172cdc5e931f5105e9b7cb54`](https://stellar.expert/explorer/testnet/tx/bc8a2c4c71b1cbc4219b1025c22b2031b1cde381172cdc5e931f5105e9b7cb54) | 4882530 | 2026-09-26T15:23:57.000Z |
| recipient-trustline | [`7d23d1f53d64d197d524b976c26e587bcd46212e8df11972d0a4e8eb854f2b67`](https://stellar.expert/explorer/testnet/tx/7d23d1f53d64d197d524b976c26e587bcd46212e8df11972d0a4e8eb854f2b67) | 4882532 | 2026-09-26T15:24:07.000Z |
| upload-wasm | [`5bce8726a301dfde9f3d2a70b417f1faf17829dd60fda01385f0083b1b40a399`](https://stellar.expert/explorer/testnet/tx/5bce8726a301dfde9f3d2a70b417f1faf17829dd60fda01385f0083b1b40a399) | 4882534 | 2026-09-26T15:24:17.000Z |
| deploy-byetery | [`e97f13bd21513428849a9743a83ffb7b141082c6e286ced19b730243a4585933`](https://stellar.expert/explorer/testnet/tx/e97f13bd21513428849a9743a83ffb7b141082c6e286ced19b730243a4585933) | 4882536 | 2026-09-26T15:24:27.000Z |
| role-collector | [`8cb7b74d0e3829ba31dfc0277f9a308d3677c0bcfd3ff0a166698e076bb5e4c9`](https://stellar.expert/explorer/testnet/tx/8cb7b74d0e3829ba31dfc0277f9a308d3677c0bcfd3ff0a166698e076bb5e4c9) | 4882538 | 2026-09-26T15:24:37.000Z |
| role-recycler | [`52e381d08baddf43d1a5d7a8cbbc3b5c4cb6285b3c627f02b5f16aea5e38a747`](https://stellar.expert/explorer/testnet/tx/52e381d08baddf43d1a5d7a8cbbc3b5c4cb6285b3c627f02b5f16aea5e38a747) | 4882540 | 2026-09-26T15:24:47.000Z |
| prefund-contract | [`0cf13e4c8eba927fb637d30200f9cd5e4459a02c996be8920b1ec6eea03c11f6`](https://stellar.expert/explorer/testnet/tx/0cf13e4c8eba927fb637d30200f9cd5e4459a02c996be8920b1ec6eea03c11f6) | 4882542 | 2026-09-26T15:24:57.000Z |
| register-battery | [`34b20bf6ad291bc49cacac60a5638b51cec9e54eb76b2cfe963a6cab3d94fef6`](https://stellar.expert/explorer/testnet/tx/34b20bf6ad291bc49cacac60a5638b51cec9e54eb76b2cfe963a6cab3d94fef6) | 4882554 | 2026-09-26T15:25:57.000Z |
| open-return | [`99423a60f9c0313e5eba69f6c54324519304813035b0bfc46d32ac14ce3643d3`](https://stellar.expert/explorer/testnet/tx/99423a60f9c0313e5eba69f6c54324519304813035b0bfc46d32ac14ce3643d3) | 4882557 | 2026-09-26T15:26:12.000Z |
| confirm-collection | [`a57dafee61605c54aa136dd9a5359616ea0d274dc7355ddac292ab7ae94ad64d`](https://stellar.expert/explorer/testnet/tx/a57dafee61605c54aa136dd9a5359616ea0d274dc7355ddac292ab7ae94ad64d) | 4882596 | 2026-09-26T15:29:27.000Z |
| confirm-recycling | [`125a122cbf4663921308e92a97e2b5f721a4e66fa616ba39e4c74e716cd36153`](https://stellar.expert/explorer/testnet/tx/125a122cbf4663921308e92a97e2b5f721a4e66fa616ba39e4c74e716cd36153) | 4882598 | 2026-09-26T15:29:37.000Z |
| pay-reward | [`9053c28bc5d711e6cce7e186b0213b14a3cdf03733fc8652e189eb7ca1aee241`](https://stellar.expert/explorer/testnet/tx/9053c28bc5d711e6cce7e186b0213b14a3cdf03733fc8652e189eb7ca1aee241) | 4882600 | 2026-09-26T15:29:47.000Z |

El fondeo inicial de XLM se solicitó a Friendbot. No se inventan hashes de esos pedidos cuando el CLI no los expone.

## Pruebas negativas

| Prueba | Resultado | Transacción |
| --- | --- | --- |
| duplicate battery | simulation rejected | No enviada, sin hash |
| early reward | simulation rejected | No enviada, sin hash |
| wrong evidence battery | simulation rejected | No enviada, sin hash |
| unauthorized collector role | simulation rejected | No enviada, sin hash |
| recycling before collection | simulation rejected | No enviada, sin hash |
| missing service authorization | authorization rejected (enforcing RPC simulation) | No enviada, sin hash |
| missing collector authorization | authorization rejected (enforcing RPC simulation) | No enviada, sin hash |
| cancel after collection | simulation rejected | No enviada, sin hash |
| duplicate reward | simulation rejected | No enviada, sin hash |
| constructor reinvocation | simulation rejected | No enviada, sin hash |
| backward collection after recycled | simulation rejected | No enviada, sin hash |

La prueba de doble autorización primero registra las dos entradas requeridas, conserva únicamente la autorización del source y elimina la del otro actor. La simulación enforce rechaza cada omisión por separado. El caso válido usó SERVICE como source y la identidad CLI COLLECTOR en el argumento collector, para firmar su entrada de autorización adicional.
La reinvocación directa de __constructor se rechazó por el host. No se modificó Config.

## Eventos

Consultados mediante getEvents filtrado por Contract ID, desde el ledger de deployment. Datos completos decodificados en el JSON de resultados.

| Topics | Ledger | Transaction hash |
| --- | --- | --- |
| ["config"] | 4882536 | `e97f13bd21513428849a9743a83ffb7b141082c6e286ced19b730243a4585933` |
| ["role","GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V"] | 4882538 | `8cb7b74d0e3829ba31dfc0277f9a308d3677c0bcfd3ff0a166698e076bb5e4c9` |
| ["role","GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2"] | 4882540 | `52e381d08baddf43d1a5d7a8cbbc3b5c4cb6285b3c627f02b5f16aea5e38a747` |
| ["register","BYE-TN-D7DB910EE8BA"] | 4882554 | `34b20bf6ad291bc49cacac60a5638b51cec9e54eb76b2cfe963a6cab3d94fef6` |
| ["opened","BYE-TN-D7DB910EE8BA"] | 4882557 | `99423a60f9c0313e5eba69f6c54324519304813035b0bfc46d32ac14ce3643d3` |
| ["collected","BYE-TN-D7DB910EE8BA"] | 4882596 | `a57dafee61605c54aa136dd9a5359616ea0d274dc7355ddac292ab7ae94ad64d` |
| ["recycled","BYE-TN-D7DB910EE8BA"] | 4882598 | `125a122cbf4663921308e92a97e2b5f721a4e66fa616ba39e4c74e716cd36153` |
| ["paid","BYE-TN-D7DB910EE8BA"] | 4882600 | `9053c28bc5d711e6cce7e186b0213b14a3cdf03733fc8652e189eb7ca1aee241` |

Config publica la configuración; role indica actor, rol y habilitación. register/opened/collected/recycled/paid vinculan batería y solicitud, incluyen los compromisos, actores y el importe/destinatario según corresponde. No se añadieron eventos al contrato.

## Suites existentes

| Suite | Resultado |
| --- | --- |
| Rust native cargo test --locked | 20/20 |
| Rust con wasm-tests | 20/20 nativos + 1/1 WASM |
| WASM release wasm32v1-none | PASS, SHA idéntico |
| cargo fmt --all --check | PASS |
| cargo clippy --locked --all-targets --features wasm-tests -- -D warnings | PASS |
| Backend Foundation | 50/50 |
| Backend TypeScript | PASS |
| Frontend tests del checkpoint | 33/33 |
| Frontend TypeScript, lint, production build | PASS |
| Python | 4/4 |
| SQL PGlite | 82/82, ROLLBACK, 0 fixtures restantes |
| Demo MOCK | PASS, flujo completo y 10 GREEN-TEST simulados |
| HTTP contra Supabase DEV | 43/43, 0 fallos, 0 omitidos; 271,427 segundos |
| git diff --check | PASS |

Los 67/78 tests de wallet/QR mencionados en otra rama no pertenecen al checkpoint aislado autorizado. Esta fase conserva los 50 tests originales.

### Fixtures HTTP y cleanup

Se ejecutaron sin modificaciones los archivos `backend/remote-tests/frontend-reads.test.ts` y `backend/remote-tests/http.test.ts`, mediante el runner Node existente y configuración DEV/MOCK suministrada en memoria desde el entorno local. Un observador local registró exclusivamente IDs de fixtures para verificar después su cleanup mediante consultas de lectura limitadas a esos IDs. Credenciales y tokens no se guardaron en el informe ni en logs.

| Ejecución | Namespaces deployment_id | Resultado |
| --- | --- | --- |
| Primer intento, observador defectuoso | `5fcee8e3-14e5-415d-b480-58c785c4f59e`, `02f93873-3a3b-42a2-8cbb-336f0ca9a555` | El observador accedió a rows[0] de un INSERT sin RETURNING y causó errores. Se corrigió únicamente ese helper local; no se cambió la suite ni el backend. |
| Ejecución completa | `cd1fba3e-ab18-4a89-9843-947addafe5b1`, `d5d2d54a-7e23-4965-a177-359e6c1f673c` | 43/43 PASS, código de salida 0 |

Cada intento creó 12 usuarios de Auth con correo `byetery-dev-<UUID>@example.com`. Las comprobaciones posteriores de ambos intentos confirmaron 0 usuarios de Auth restantes, 0 usuarios de negocio activos, 0 memberships activas y 0 wallets activas en sus namespaces. El cleanup de la suite revocó sesiones/accesos y eliminó exclusivamente sus propios usuarios de Auth; no se eliminaron datos ajenos.

Foundation conserva sus registros inmutables. El primer intento no creó baterías ni solicitudes. La ejecución completa conserva `BYE-8E91248668524106` en `cd1fba3e-ab18-4a89-9843-947addafe5b1` y `BYE-FFC45B04C06A4E75` en `d5d2d54a-7e23-4965-a177-359e6c1f673c`, además de 3 solicitudes y sus registros asociados. No se debilitaron constraints para eliminarlos. Recibos y logs locales sanitizados: `.tools/verification/http-final.log`, `http-cleanup.json` y `http-observer-cleanup.json`, excluidos de Git.

## Reproducción en Windows

Prerrequisitos: Node 24, Stellar CLI 28, Rust GNU 1.96 con target wasm32v1-none y componentes fmt/clippy, dependencias de los lockfiles (`npm ci --prefix backend`, `npm ci --prefix frontend`). El layout local del launcher Rust requiere `contracts/byetery-contract/.tools/cargo` y `rustup` existentes. En esta máquina se reutilizó la toolchain ya instalada mediante una junction, sin instalación global.

```powershell
pwsh -NoProfile -File scripts/verify-testnet-prerequisites.ps1
$env:BYETERY_STELLAR_CLI = 'C:\Program Files (x86)\Stellar CLI\stellar.exe'
node --experimental-strip-types scripts/testnet-contract.mts setup nuevo-run-unico
node --experimental-strip-types scripts/testnet-contract.mts deploy nuevo-run-unico
node --experimental-strip-types scripts/testnet-contract.mts flow nuevo-run-unico
node --experimental-strip-types scripts/testnet-contract.mts checks nuevo-run-unico
node scripts/audit-testnet.mjs
git diff --check
```

El primer setup crea identidades nuevas y pide Friendbot. No sobrescribe identidades existentes. Resultados locales en `.tools/testnet/<run>/public-results.json`; el directorio está ignorado. Solo se versionan pruebas públicas seleccionadas. Tras un reset utilizar un nuevo run: recrea cuentas, asset, SAC, contrato, roles y fondeo; no depende de IDs permanentes.

Los pasos confirmados se conservan. Un paso UNKNOWN bloquea la repetición: consultar sus hashes con getTransaction y revisar el log antes de cualquier reconciliación manual. Nunca tratar timeout como rechazo. Un run completo no vuelve a ejecutar el flujo.

## Incidencias y límites

1. El cross-build limpio no encontraba bibliotecas MinGW de los build scripts nativos. El wrapper de verificación añade las opciones de linker autocontenido solo a invocaciones Windows. No altera argumentos WASM. No se cambió ninguna protección de Windows.
2. Se corrigió en el script nuevo el acceso a credentials como propiedad del SDK 17.0.1. No hubo cambio de dependencia ni del contrato.
3. Un intento de collection no se envió porque faltaba una identidad de firma para CLI. Se verificó el error previo al envío y se utilizó SERVICE como source y COLLECTOR como alias de argumento. No tiene hash on-chain ni se cuenta como transacción fallida del contrato.
4. El test de archivado/restauración sigue en la suite Rust. No se esperó la expiración real en Testnet. Persistent/instance TTL se extiende hasta min(max_ttl,120000); código/instancia/datos necesitan mantenimiento si se pretende conservar este despliegue. La restauración no habilita reutilización de IDs. Los resets eliminan la red de pruebas.
5. No se verificó control gráfico con Freighter en esta fase: recipient es una cuenta real de Testnet creada para pruebas, bajo identidad CLI.
6. La suite HTTP quedó validada bajo autorización específica de fixtures DEV. El fallo inicial del observador local y el cleanup de ambos intentos se documentan arriba; no exigieron cambios funcionales.

## Fuentes consultadas primero mediante Stellar Raven

Consultas a stellarDocs.search_docs/search_sdk_cli_tools_docs durante 2026-09-25 y 2026-09-26, contrastadas con la ayuda del CLI instalado y los tipos de su SDK.

- [Redes, passphrase, Friendbot y resets](https://developers.stellar.org/docs/networks).
- [Referencia Stellar CLI](https://developers.stellar.org/docs/tools/cli/stellar-cli).
- [Deploy SAC](https://developers.stellar.org/docs/tools/cli/cookbook/deploy-stellar-asset-contract).
- [Autorización del contrato](https://developers.stellar.org/docs/build/smart-contracts/example-contracts/auth).
- [Firmar invocaciones y modo enforce](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations).
- [Storage y restauración automática](https://developers.stellar.org/docs/build/guides/storage/storage-strategies).
- [Especificaciones y lectura de eventos](https://developers.stellar.org/docs/build/guides/dapps/working-with-contract-specs).
- [Upload/deploy y confirmación de transacciones](https://developers.stellar.org/docs/build/guides/transactions/install-deploy-contract-with-code).
- [Interfaz y eventos del SAC](https://developers.stellar.org/docs/tokens/token-interface).

Se conservaron las invariantes actuales en lugar de copiar arquitecturas de ejemplo. Ninguna incompatibilidad del contrato exigió cambios Rust.

## Archivos y seguridad

Nuevos scripts: testnet-contract.mts, verify-testnet-prerequisites.ps1 y audit-testnet.mjs. Nuevos documentos: este informe, contract-spec.json, validation-2026-09-26.json y los dos payloads.
La auditoría recorre archivos versionados/no ignorados, staging, historial Git y logs/resultados locales de esta fase. Compara patrones de claves Stellar, tokens, private keys y frases semilla etiquetadas, y puede comparar valores secretos locales sin mostrarlos: `node scripts/audit-testnet.mjs <ruta-env-local>`.
Resultado de la auditoría de cierre: 0 hallazgos en archivos, staging, historial y logs locales examinados. El recibo con los conteos está en .tools/verification/secret-audit.json. Las identidades privadas permanecen en el almacén seguro del sistema; no forman parte del repositorio.

Checkpoint de cierre en `codex/testnet-contract-validation`: 8 archivos nuevos, sin cambios a archivos preexistentes. Mensaje del commit: `chore: validate Byetery contract on Stellar Testnet`. El hash final y el resultado del push se entregan junto con el estado Git después de ejecutar ambas operaciones. La rama original codex/wallet-qr conserva sus cambios previos.

[Resultados públicos detallados](testnet/validation-2026-09-26.json).
