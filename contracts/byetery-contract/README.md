# Byetery Soroban MVP

Contrato Rust para Stellar Testnet. No incluye frontend, backend, integración
Supabase ni despliegue en red. SDK fijado en `27.0.6`, Rust `1.96.0` y
dependencias transitivas fijadas en `Cargo.lock`.

## Reglas

- Pila: `Registered -> Returned -> Collected -> Recycled`.
- Único retroceso: `Returned -> Registered` al cancelar una solicitud abierta.
- Solicitud: `Open -> Cancelled | Confirmed`. ID y destinatario inmutables.
- Una solicitud activa por pila. IDs de pilas y solicitudes nunca se eliminan.
- Recepción requiere **collector + service** para los mismos argumentos.
- Constructor exige `admin.require_auth()`; el origen del despliegue no sustituye
  esa autorización. Solo acepta el identificador de red de Testnet.
- Recompensa on-chain: `NotEligible -> Pending -> Sent`.
- `FAILED` es el estado de un intento en la aplicación. Una transferencia
  fallida revierte la escritura on-chain; la pila sigue reciclada y el pago
  sigue pendiente. Un timeout no demuestra fracaso.
- Pago desde el saldo del contrato en el token configurado: destinatario e
  importe no son parámetros de pago. No hay `mark_reward_sent`.

## Confianza y privacidad

**El contrato confía explícitamente en `Config.service` para las acciones
derivadas de usuarios autenticados mediante Supabase.** El servicio valida la
sesión, la propiedad de la solicitud y la prueba de control de wallet fuera de
la cadena. La doble autorización de recepción incluye la declaración del
servicio sobre el usuario y la declaración del punto sobre la entrega física.
El contrato no valida JWT ni conoce `user_id`.

En la futura aplicación, `return_request_id` debe generarse en el servidor con
32 bytes CSPRNG y registrarse con restricción única. El contrato garantiza
no reutilización dentro de este despliegue, no que los bytes se generaron
correctamente. El QR solo identifica la pila. Prueba de wallet mínima:
desafío aleatorio, un solo uso, vencimiento corto y firma vinculada a usuario,
dirección, aplicación y Testnet; claves privadas nunca almacenadas por Byetery.

No hay datos personales, documentos ni URLs privadas on-chain. Las direcciones
y relaciones entre pila, solicitud y wallet sí son públicas. El contrato
confirma attestaciones de actores autorizados, no observa reciclaje físico.

## Compromiso de evidencia versión 1

`SHA256(XDR(ScVal(tuple(domain, network_id, contract_address, evidence))))`

- `domain`: String Soroban `BYETERY_EVIDENCE_V1`.
- `network_id`: `BytesN<32>` de Stellar.
- `contract_address`: `Address` de este contrato.
- `evidence`: estructura Soroban `Evidence`, codificada mediante `ToXdr`.
- Campos: versión, pila, solicitud, tipo `Collection | Recycling`, payload hash.

El contrato valida los campos de vinculación antes de calcular el compromiso.
La futura aplicación debe validar también que el registro original pertenece a
esa pila y solicitud. Un hash opaco no permite inspeccionar el documento.
No cambiar nombres/tipos/variantes de estas estructuras sin versionar el formato.

## Compilar y probar

Con Rust configurado normalmente:

```text
cargo test --locked
cargo rustc --locked --release --target wasm32v1-none --crate-type cdylib
cargo test --locked --features wasm-tests
cargo clippy --locked --all-targets --features wasm-tests -- -D warnings
```

En este equipo Windows las herramientas oficiales de Rust están aisladas en
`.tools`. El script solo modifica variables de su proceso:

```powershell
.\scripts\cargo-local.ps1 test --locked
.\scripts\cargo-local.ps1 rustc --locked --release --target wasm32v1-none --crate-type cdylib
.\scripts\cargo-local.ps1 test --locked --features wasm-tests
.\scripts\verify.ps1
```

El script utiliza `rust-lld` y las bibliotecas auto-contenidas de Rust GNU.
La carpeta `.tools` no forma parte del código y no debe subirse al repositorio.
La versión 1.96 incorpora la corrección del enlace de DLL con LLD en Windows.
El crate usa `rlib` para tests y `--crate-type cdylib` explícito para WASM,
evitando el límite de símbolos exportados de las DLL de Windows.
`wasm-tests` ejecuta el mismo conjunto funcional sobre el WASM y prueba además
el constructor mediante un despliegue local real del host, no `Env::register`.
Este último registra constructores con autorización simulada automáticamente.

## Antes de desplegar en Testnet

1. Pasar tests nativos, tests del artefacto WASM, formato y Clippy.
2. Verificar contrato SAC/activo exacto y sus decimales. `GREEN-TEST` es el
   nombre de presentación; el identificador on-chain es la dirección del token.
   El código alfanumérico usado por el SAC de prueba es `GREENTEST`, sin guion.
3. Definir direcciones de administrador y servicio; recoger autorización del
   administrador sobre el constructor, además de la autorización de despliegue.
4. Prefinanciar el contrato con el activo configurado. Para 7 decimales,
   10 unidades son `100_000_000` unidades mínimas.
5. Verificar saldo del contrato antes de `pay_reward` y saldo del destinatario
   después. El contrato vuelve a comprobar su saldo durante el pago.
6. Ensayar doble autorización del punto y servicio sobre la misma invocación.
7. Registrar evidencia y hashes de transacciones sin publicar información personal.

## Archivado

Config usa instance storage; roles, pilas y solicitudes usan persistent storage.
Las mutaciones extienden TTL hasta el menor de 120.000 ledgers y el máximo
admitido por la red, con umbral de la mitad. No hay borrado ni temporary storage.

Los tests de robustez vencen entradas persistentes y usan la restauración del
host Soroban para comprobar que no se convierten en ausencias. No equivalen a
una prueba de infraestructura RPC o del archivo histórico de una red pública.
El cliente de red deberá simular operaciones y preparar restauraciones cuando
corresponda. Un reset completo de Testnet es un nuevo entorno, no una restauración.

## Límites deliberados

Sin upgrade, cambio de configuración, cambio de destinatario, retiro de fondos,
panel de administración, registro de usuarios o historial creciente en storage.
Los eventos se indexarán off-chain. Perder una clave fija requiere un nuevo
despliegue de prueba. Un administrador puede gestionar roles, pero no saltarse
el ciclo de vida ni reasignar solicitudes.


