# Wallet gráfica y verificación SEP-53

La wallet gráfica demuestra control criptográfico de una dirección Stellar mediante firma. Las operaciones del ciclo de vida continúan ejecutándose mediante `MockStellarService` y no invocan todavía el contrato Soroban.

## Adaptador

`frontend/src/lib/wallet-adapter.ts` define `WalletAdapter`: `isAvailable()`, `connect()` y `signChallenge()`. `FreighterAdapter` carga bajo demanda el paquete oficial `@stellar/freighter-api` 6.0.1, Apache-2.0. Solo usa detección, acceso a dirección/configuración y firma de mensajes. No llama a Horizon, RPC, Soroban, firma de transacciones ni pagos.

La UI está en `GraphicalWallet`; el proveedor se inyecta únicamente en sus tests. La implementación normal siempre utiliza Freighter real. La extensión conserva las claves: Byetery no pide, guarda ni transmite semillas o claves privadas. El SDK Stellar criptográfico se utiliza en el backend; no se añade el SDK completo al frontend.

## Mensaje v2 exacto

Todos los challenges nuevos son `version: 2`, `signingScheme: SEP53_V2`. El servidor es el único emisor y selector del protocolo. No se acepta un campo de versión o algoritmo del cliente en ninguno de los dos endpoints.

El formateador puro compartido `backend/src/wallet-message.ts` produce exactamente estas líneas, en UTF-8, con separadores LF, sin BOM ni LF final. Los marcadores representan valores del servidor, no texto que introduzca el usuario:

```text
Byetery - Verify wallet control
Domain: byetery-dev
Purpose: LINK_WALLET
Version: 2
Signing scheme: SEP53_V2
Deployment: <deployment UUID>
Challenge: <challenge UUID>
User: <authenticated application user UUID>
Network: Testnet
Network ID: <network SHA-256 hex>
Address: <Stellar G address>
Nonce: <32 random bytes, lowercase hex>
Expires at: <ISO UTC with milliseconds>
This signature links your address to Byetery DEV. It does not authorize a transaction.
```

Los valores se validan como identificadores ASCII sin saltos de línea; su orden no depende del orden de propiedades de un objeto. El frontend comprueba la envoltura, los campos vinculados y la igualdad con el formateador compartido. No reserializa JSON ni modifica los bytes del mensaje emitido.

Sea `M` el texto anterior codificado en UTF-8. Freighter firma con Ed25519 el digest:

```text
SHA256(UTF8("Stellar Signed Message:\n") || M)
```

El `\n` representa un byte LF. La UI pasa a `signMessage` el texto M, nunca el Base64 ni un digest calculado previamente. El prefijo/hash lo aplica Freighter. `Keypair.verifyMessage` del SDK oficial reproduce SEP-53 en el servidor. Los transports antiguos Buffer y actuales Base64 del proveedor se normalizan a firma Base64 sin cambiar el algoritmo.

Fuentes: [API oficial de firma Freighter](https://docs.freighter.app/extension-freighter-api/signing), [SEP-53 y vectores](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md).

## Endpoints y almacenamiento

- `POST /api/wallet/challenge`, JSON `{address}`: requiere sesión validada e idempotencia. Devuelve `challengeId`, `address`, `version`, `signingScheme`, `network`, `purpose`, `messageBase64`, `expiresAt`, `source: MOCK`.
- `POST /api/wallet/verify`, JSON `{challengeId, signature}`: requiere propietario autenticado e idempotencia; el cliente no determina el esquema. Devuelve vínculo verificado únicamente tras comprobar la firma y consumir el nonce.

`api_private.wallet_challenges.signing_scheme` es inmutable. La migración marca filas existentes `RAW_ED25519_V1`, cambia el valor por defecto a `SEP53_V2` y un trigger rechaza cualquier nuevo INSERT legacy. No existe endpoint de emisión legacy. La migración adicional fija el `search_path` del trigger. No se cambian privilegios ni políticas RLS base-deny.

Un challenge legacy existente se verifica solo con Ed25519 directo sobre los bytes JSON guardados y solo mientras no haya caducado, sido consumido o agotado cinco intentos. No se recrea ni renueva. Las filas se conservan como historia. El verificador selecciona exclusivamente por el campo almacenado: esquema desconocido falla; no prueba otro algoritmo como fallback.

Se conservan nonce CSPRNG, dominio/purpose, usuario, dirección, red, expiración de diez minutos basada en reloj DB, bloqueo `FOR UPDATE` y consumo en la misma transacción que el vínculo. La serialización por deployment y los tests HTTP concurrentes comprueban una única aceptación. Una clave de idempotencia repetida puede devolver el resultado ya confirmado; eso no vuelve a consumir el nonce ni crea otro vínculo.

## Experiencia y errores

Dashboard: conectar, revisar texto legible, aprobar firma y confirmar mediante API. Se comprueban cuenta y red antes/después de la firma. Se solicita configuración Testnet solo como contexto de esta prueba de control, sin conectar a la red Stellar. Cuenta cambiada, rechazo de conexión/firma, proveedor ausente, dirección inválida, mensaje incompatible, expiración, reutilización y sesión terminada tienen mensajes propios o respuestas seguras de API.

Un timeout al verificar conserva firma e idempotencia en memoria; el reintento explícito consulta/envía la misma operación sin volver a firmar. No se marca como fallo ni VERIFIED por un timeout. La persistencia de esa clave del cliente tras cerrar la pestaña sigue fuera de esta fase; el backend mantiene su prevención de duplicados.

La dirección verificada se abrevia visualmente, con opciones para verla/copiarla completa. La alternativa de firma externa sigue disponible dentro de “Firma externa / demo técnica”, usando ahora SEP-53. Solo se muestra VERIFIED después de la confirmación del backend.

## Pruebas y límites

Se conservan los 50 tests Foundation. Los tests adicionales verifican los tres vectores públicos oficiales SEP-53 (ASCII, japonés y binario), esquema legacy, expiración, algoritmo desconocido, downgrade, firmas cruzadas y texto determinista. Solo se incluyen direcciones y firmas públicas de esos vectores: no sus semillas. Las claves aleatorias de tests existen únicamente en memoria.

Los tests HTTP usan Supabase DEV y prueban reutilización concurrente, propietario, intentos, idempotencia y rechazo de downgrade. Los mocks del proveedor se limitan a pruebas UI/adaptador; no sustituyen la verificación criptográfica del backend. La demo automatizada firma con una clave efímera del proceso Node, no con una extensión gráfica; la validación manual con Freighter es una comprobación independiente.

La prueba acredita control de una clave G. No demuestra existencia de la cuenta en red, saldo real ni autoridad completa de una cuenta multisig. No hay recompensas reales.
