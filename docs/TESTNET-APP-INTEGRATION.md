# Integración de aplicación con Stellar Testnet

Fecha de inspección: 2026-09-27.
Estado: **inspección y diseño inicial; implementación y validación pendientes**.

Actualización 2026-10-09: helper de firma y abstracción StellarSigner implementados, todavía en validación. Spike de biblioteca oficial PASS; adaptador TypeScript 9/9 PASS; firma offline con las identidades reales pendiente de la compilación nativa. El flujo general de aplicación y TestnetStellarService siguen pendientes. Véase [LOCAL-SECURE-STORE-SIGNER.md](LOCAL-SECURE-STORE-SIGNER.md).

## Base y alcance

- Base: `252fff88d4c4abbb6986460c12f1766b1ddfb574`.
- Rama creada desde esa base: `codex/testnet-app-integration`.
- No se ha hecho merge, commit ni push de esta fase.
- `docs/instaward/` ya estaba sin versionar al comenzar y queda fuera del trabajo.
- No se modificaron contrato, deployment, SAC, reward, Supabase ni migraciones.

Deployment que debe reutilizarse:

- Contrato: `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`.
- SAC: `CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G`.
- Recompensa: 10 GREENTEST, 100000000 unidades base.
- RPC: `https://soroban-testnet.stellar.org`.
- Passphrase: `Test SDF Network ; September 2015`.
- SDK existente: `@stellar/stellar-sdk` 17.0.1; CLI instalado: 28.0.0.

## Arquitectura encontrada

`backend/src/stellar-service.ts` ya define una abstracción con lecturas `getConfig`, `getBattery`, `getReturnRequest`, `hasRole`, `getRewardBalance`, y operaciones `prepare`, `submit`, `getTransactionResult`.

`prepare(deploymentId, command)` devuelve deployment, preparation ID, command, signers requeridos y expiración. `submit(prepared, authorizations)` recibe pruebas con signer/proof y devuelve una referencia con source MOCK o TESTNET. `getTransactionResult` distingue PENDING/UNKNOWN, FAILED con error y SUCCESS con ledger/result. Los errores de dominio usan `DomainError.code`.

La interfaz anticipa Testnet, pero **no existe TestnetStellarService**. El coordinador instancia el mock a través del repositorio, emite pruebas exclusivas del mock, avanza explícitamente su ledger y persiste un snapshot. Los endpoints ya validan sesión, roles e idempotencia y derivan el destinatario de la wallet del usuario. Se conservará esta lógica.

`Repository.config` y `settings` aceptan únicamente MOCK. `Repository.project` está tipado contra MockStellarService, aunque utiliza las lecturas de la interfaz. Las respuestas y tipos del frontend también fijan source MOCK. Estas son las áreas de desacoplamiento; no hace falta una API paralela ni modificar Rust.

### Persistencia e incertidumbre

`app_private.stellar_operations` contiene identidad lógica, parámetros/hash, estado y error, pero no columnas de hash de transacción, ledger o timestamps de envío/confirmación. `api_private.operation_transport` conserva prepared/submission JSON de forma inmutable y tiene un CHECK exclusivo de MOCK. No debe introducirse TESTNET en esa tabla sin una migración explícita compatible.

El mock puede enviarse y guardarse junto con el snapshot dentro de una transacción SQL porque no tiene efectos remotos. Ese límite transaccional no sirve para RPC: un envío remoto puede confirmarse aunque la transacción SQL haga rollback. La integración deberá calcular y persistir la referencia/hash **antes** del envío y pasar a un estado duradero que bloquee otro envío. Una caída posterior debe recuperarse consultando ese mismo hash, nunca creando otra transacción automáticamente.

La ampliación de persistencia debe ser aditiva, probada y mantener RLS base-deny, inmutabilidad y aislamiento por deployment. Se evaluará reutilizar operation_transport y añadir metadata a stellar_operations antes de crear tablas. No se ha creado ni aplicado ninguna migración.

## Wallet/QR inspeccionado

`codex/wallet-qr` sigue apuntando a `0a572af`; el trabajo de SEP-53/Freighter/QR está en su directorio de trabajo, no en commits adicionales. Tiene 38 entradas modificadas/sin versionar.

Incluye wallet.ts, wallet-verifier.ts, wallet-message.ts, dos migraciones SEP-53/guard, adaptador Freighter, scanner QR, componentes, pruebas y documentación. `docs/verification/WALLET-QR.md` registra verificaciones automatizadas, pero declara pendiente la firma gráfica real y cámara física. No se presentan esos resultados como nuevas pruebas de esta rama.

No se hará merge ni copia de ese trabajo. La integración puede validar un recipient de pruebas y un vínculo de wallet existente sin incorporar la wallet gráfica. No debe afirmarse Freighter E2E. La base conserva emisión de challenges legacy; antes de emitir nuevos challenges habrá que resolver explícitamente su compatibilidad con la decisión previa de emisión exclusiva SEP-53, sin introducir un downgrade silencioso ni copiar cambios de la otra rama sin aprobación.

## Firma: corrección y bloqueo confirmado

La propuesta anterior de configurar claves privadas exportadas queda retirada. Las identidades existentes están en Stellar CLI Secure Store y no deben exportarse. No se requieren variables STELLAR_*_SECRET_KEY. No se ejecutó keys secret ni se crearon actores nuevos.

La inspección oficial de CLI v28.0.0 y la validación de public keys se detallan en [SECURE-STORE-SIGNING-REVIEW.md](SECURE-STORE-SIGNING-REVIEW.md). Las cuatro public keys coinciden exactamente con el deployment.

El CLI instalado no expone un comando que reciba XDR preparado, firme sus entradas Soroban adicionales con Secure Store y devuelva el XDR firmado sin enviar. Sus funciones de biblioteca sí tienen las primitivas necesarias. Tras la autorización posterior del usuario, se implementó un helper aislado reutilizando la biblioteca oficial. Su validación offline sigue en curso; no se considera resuelta la integración de aplicación hasta completarla.

Configuración no secreta prevista, pendiente de un proveedor de firma compatible:

```dotenv
STELLAR_ADMIN_SIGNER=byetery-tn20260926-admin
STELLAR_SERVICE_SIGNER=byetery-tn20260926-service
STELLAR_COLLECTOR_SIGNER=byetery-tn20260926-collector
STELLAR_RECYCLER_SIGNER=byetery-tn20260926-recycler
```

El SDK conservaría build/simulate/assemble/submit/getTransaction y la aplicación conservaría persistencia/reconciliación. El proveedor de firma solo recibiría XDR validado y devolvería firmas/XDR; no tendría envío ni acceso desde clientes a identidades arbitrarias. No se ha modificado .env.example para anunciar una configuración aún no implementada.

## Diseño pendiente de implementación

1. Factory central MOCK/TESTNET y proyección tipada contra StellarService.
2. Preparación SDK y firma desacoplada, validando red, contrato, actores, métodos, argumentos y fee antes de firmar.
3. Hash duradero antes de submit; SUCCESS verificado mediante getTransaction como única condición de confirmación. NOT_FOUND, timeout y errores de transporte permanecen UNKNOWN; no reenvío automático.
4. Consulta real de config/roles/batería/solicitud/balance. Comprobación explícita de discrepancias DB/chain y estado de reconciliación pendiente; no sobrescritura silenciosa.
5. Evidence reutilizado sin cambios de bytes, XDR ni domain separation. Ningún oracle ni dependencia de UI dentro de Evidence.
6. UI derivada de la configuración de backend, historial y hashes con enlaces exclusivamente Testnet. Pendientes y errores separados de estados confirmados.
7. Pruebas de RPC fake, suites existentes, flujo API y recorrido frontend con IDs nuevos `BYE-APP-TN-*`, balance antes/después y segundo reward rechazado.

## Fuentes consultadas

- Stellar Raven / stellarDocs, consultado el 2026-09-27: [simulación y autorización multiparte](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/transaction-simulation#example-2-multi-party-authentication).
- [Ensamblado y firma Soroban](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations).
- [Simulación y assembleTransaction](https://developers.stellar.org/docs/build/guides/transactions/simulateTransaction-Deep-Dive#assembling-a-transaction).
- [Confirmación con getTransaction](https://developers.stellar.org/docs/build/guides/transactions/install-deploy-contract-with-code#building-signing-and-sending-the-transaction). Se conserva el criterio más estricto de Byetery: una consulta incierta no implica FAILED ni permite reenvío.
- Código oficial fijado a v28.0.0: [tx/sign.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/commands/tx/sign.rs), [config/sign_with.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/config/sign_with.rs), [signer/mod.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/signer/mod.rs).

## Estado de validación de esta fase

No hay código de integración implementado, flujo Testnet nuevo, battery/request IDs, hashes ni balances nuevos que reportar. No se ejecutaron suites completas porque esta fase se detuvo ante la limitación comprobada del CLI, conforme a la condición de parada del usuario. Los resultados del checkpoint anterior permanecen en TESTNET-CONTRACT-VALIDATION.md y no prueban una integración de aplicación que todavía no existe.

Pendiente: decidir un proveedor seguro que firme auth sin enviar; luego implementación, pruebas, auditoría final, commit y push. No Mainnet, Vercel, nuevos assets, cambios de roles ni oracles.
