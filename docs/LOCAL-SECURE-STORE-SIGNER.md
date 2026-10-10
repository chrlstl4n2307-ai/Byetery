# Firmante local de desarrollo/Testnet

Estado al 2026-10-09: spike de biblioteca compilado; helper implementado; pruebas nativas y firma offline pendientes de terminar. No se presenta como integración Testnet validada.

## Arquitectura y custodia

El helper es un crate Rust independiente en `tools/stellar-secure-store-signer/`. Reutiliza `soroban-cli = 28.0.0` directamente, sin copiar funciones ni cambiar el CLI global. Las dependencias soroban-spec-tools y soroban-spec-typescript se fijan en 28.0.0 para coincidir con el lockfile oficial; resolverlas en 28.1 provocaba E0308 por el cambio de tipo DecodeError de stellar-strkey.

La biblioteca CLI expone APIs públicas de implementación, no un API de firma con promesa de estabilidad separada. Este acoplamiento se limita a la versión exacta y queda documentado. La feature oficial additional-libs incluye también wasm-opt y stellar-ledger; el lockfile inicial resolvió 649 paquetes. Es un coste significativo de compilación. Se usa una tarea Cargo y se omiten símbolos de depuración de stellar-xdr para el equipo actual de 8 GB.

El helper construye exclusivamente SignerKind::SecureStore con el nombre de entrada fijo utilizado por CLI v28. Lee la public key mediante SecureStoreEntry.get_public_key, exige coincidencia literal con la esperada y conserva esa clave para que la API oficial verifique criptográficamente cada firma. Nunca llama a private_key, keys secret, keyring directamente ni serializa Secret o seed phrases.

Se utiliza sign_soroban_authorizations para entradas y Signer.sign_tx para el sobre. La implementación del helper no contiene llamadas de simulación, RPC, envío ni Supabase. La biblioteca incluye esas capacidades para otros usos; este programa no las invoca. La autorización humana directa para esta capacidad se recibió el 2026-10-09 después del rechazo inicial de revisión automática.

Este helper es infraestructura local de desarrollo/Testnet. No representa el modelo final de custodia o firma para producción/Mainnet.

## Entrada y salida

Entrada: un único JSON en stdin, máximo 131072 bytes. No hay argumentos CLI, nombres de identidades ni claves en la entrada. Campos desconocidos se rechazan.

```json
{
  "version": 1,
  "network_passphrase": "Test SDF Network ; September 2015",
  "transaction_xdr": "<base64 XDR preparado>",
  "current_ledger": 1,
  "signature_expiration_ledger": 100
}
```

Ledger 1 y expiración 100 son ejemplos offline, no valores para una operación real. El backend debe suministrar contexto reciente de RPC; el helper deliberadamente no consulta la red. La expiración debe estar entre current_ledger+1 y current_ledger+120.

Salida de éxito: status signed, signed_xdr, signers (public keys) y method. No se guardan firmas/XDR en logs. Error: solo status error y un código estable, salida de proceso 1. La salida de dependencias no se propaga en errores. El hook de pánico no imprime diagnósticos internos.

## Política fija

Contrato exclusivo: `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`. Red exclusiva: Stellar Testnet.

| Método | Source y firma de sobre | Auth adicional |
| --- | --- | --- |
| register_battery | ADMIN | Ninguna |
| open_return | SERVICE | Ninguna |
| cancel_return | SERVICE | Ninguna |
| confirm_collection | SERVICE | COLLECTOR |
| confirm_recycling | RECYCLER | Ninguna |
| pay_reward | SERVICE | Ninguna |

Identidades: byetery-tn20260926-admin/service/collector/recycler, con las cuatro public keys verificadas en SECURE-STORE-SIGNING-REVIEW.md. No se aceptan otros signers, actores ni métodos. set_role y constructor no están soportados.

Antes de acceder a Secure Store se validan: envelope V1 sin firmas previas, XDR canónico y acotado, source fijo, memo vacío, secuencia positiva, timebounds vigentes de hasta cinco minutos, una sola operación InvokeHostFunction, contrato y método permitidos, número/tipos de argumentos, hashes no nulos de 32 bytes y Battery ID válido. Fee máximo: 50000000 stroops. Requiere datos Soroban preparados.

Collection/recycling validan actor fijo y Evidence V1, batería/request coincidentes, kind correcto y mapa con las cinco claves canónicas. Auth deben tener exactamente las entradas requeridas, ser de source o COLLECTOR según corresponda, coincidir con la invocación completa y no contener subinvocaciones adicionales. Se soportan Address V1 y AddressV2 preservando su variante; se rechazan delegated credentials.

Estos controles restringen qué puede firmar el proceso. La autorización del usuario autenticado, roles y ownership de la solicitud siguen siendo responsabilidad del backend antes de invocarlo. El acceso al ejecutable y al usuario Windows con Secure Store es parte del límite de confianza local; no debe exponerse como servicio genérico accesible al navegador.

## Adaptador TypeScript

`StellarSigner` separa firma de transporte. `LocalSecureStoreSigner` recibe un proceso inyectado y valida formato de salida, signers, firma del sobre y firma de autorización COLLECTOR, con los preimages XDR V1/V2 oficiales. Exige que todos los demás bytes/campos de la transacción se conserven.

`signerProcess` usa spawn con shell:false, arrays de argumentos vacíos, stdin y streams acotados, timeout y salida de proceso. Solo pasa variables Windows necesarias; excluye credenciales de Supabase y otras variables del backend. No imprime stdout/stderr y devuelve errores estables.

SDK 17.0.1 usa propiedades inmutables y discriminantes type en XDR. El adaptador se ajustó a esos tipos instalados; no se actualizaron dependencias del backend ni frontend.

## Pruebas y reproducción

```powershell
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action test
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action build
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action fmt
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action clippy
node --experimental-strip-types --test backend/signing-tests/offline.test.ts
```

La suite offline de Secure Store es explícita y no forma parte de npm test: usa las identidades aprobadas para firmar fixtures con sequence=1 y expiración de auth=100, imposibles de enviar a la Testnet actual. No consulta RPC ni envía. Prueba cinco operaciones de firma simple y collection V1/V2 con ambas autorizaciones verificadas criptográficamente.

Resultados ya observados: spike cargo check PASS; TypeScript PASS; adaptador con fakes/procesos 9/9 PASS; baseline Backend Foundation 50/50 PASS. Las pruebas nativas, firmas reales offline y Clippy todavía no se han terminado; no se inventan resultados.

Lectura RPC de prerrequisitos el 2026-10-09: passphrase Testnet correcta, protocolo 29, ledger 5109472, instancia del contrato existente encontrada y SERVICE existente. Esta lectura no ejecutó el contrato ni modifica el deployment. La validación histórica fue en protocolo 28.

No se ha implementado aún TestnetStellarService ni modificado el flujo general de aplicación. La siguiente fase depende de aprobar las pruebas offline del helper. No hay nuevos hashes de transacciones, rewards ni datos Supabase de esta fase que reportar.
