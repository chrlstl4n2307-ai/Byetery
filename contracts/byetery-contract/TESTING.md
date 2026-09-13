# Verificación del contrato Byetery

Verificación local completada el 9 de septiembre de 2026 mediante
`scripts/verify.ps1`. No se realizó un despliegue en Testnet.

| Comprobación | Resultado |
|---|---|
| rustfmt | Correcto |
| Unit tests nativos | 20 aprobados, 0 fallidos |
| Compilación release WASM | Correcta |
| Mismos tests funcionales sobre WASM | 20 aprobados, 0 fallidos |
| Despliegue local WASM y autorización del constructor | 1 aprobado, 0 fallidos |
| Clippy en todos los targets y con wasm-tests | Correcto, warnings tratados como errores |

Son 21 casos distintos: 20 ejecutados en dos modalidades y uno específico de
despliegue. No se cuentan los grupos vacíos de doctests como pruebas adicionales.

## Cobertura de los cuatro ajustes

- **Administrador:** `wasm_constructor_requires_admin_not_deployment_source`
  usa una factoría distinta del administrador para desplegar el WASM mediante
  `deploy_v2`. Falla sin autorización del administrador y tiene éxito con ella.
  No usa `Env::register` como prueba de autorización del constructor.
- **Prefinanciación:** `prefunded_green_test_pays_exactly_once_to_locked_recipient`
  crea el SAC GREENTEST, emite unidades de prueba a la cuenta de fondeo, transfiere
  fondos al contrato y verifica su saldo antes de pagar. Verifica importe,
  receptor, saldo final y rechazo de un segundo pago aun quedando fondos.
- **Doble autorización temprana:**
  `collection_requires_both_authorizations_early_spike` prueba ninguna firma,
  solo collector, solo service y ambas. Revisa que los rechazos no cambien
  estado y que la llamada exitosa requiera las dos identidades.
- **Archivado/restauración:**
  `archived_battery_and_cancelled_request_are_restored_not_recreated` y
  `archived_paid_battery_and_confirmed_request_cannot_be_reused_or_repaid`
  avanzan el ledger más allá del TTL real de las entradas y verifican la
  restauración del host. Se conservan el registro de pila, las solicitudes
  canceladas/confirmadas, la wallet y Sent. No se reutilizan IDs ni se paga de
  nuevo, incluso con saldo suficiente. Los tests no borran storage para fingir
  un archivado ni equivalen a una prueba contra un archivo de red público.

## Otras garantías comprobadas

IDs y hashes inválidos; registro de pila duplicado; autorización del administrador
en roles/registro; revocación de collector y recycler; autorización del servicio
en solicitudes/cancelación; firmas vinculadas a argumentos; una solicitud activa;
cancelación que conserva el ID; solicitud cancelada no recolectable; evidencias
de otra pila/solicitud/tipo/versión; compromiso XDR verificado con SHA-256
independiente y separación por dominio, red y contrato; saltos y retrocesos
rechazados; pago temprano rechazado; fondos insuficientes y reintento; rechazo
real del SAC por receptor no autorizado que revierte Sent y no emite evento de
pago; eventos de negocio exactos para operaciones exitosas.

## Límites de la prueba

Las autorizaciones de negocio usan `MockAuth` con invocaciones y argumentos
concretos; se comprueban también los casos donde faltan autorizaciones. Esto
prueba la política del contrato, no una integración de firmas con una wallet.
Solo el bootstrap del emisor y el registro de fixtures simulan autorizaciones
globales; se desactivan antes de las operaciones bajo prueba. La autorización
del constructor se prueba por separado mediante despliegue local.

La generación CSPRNG, la validación de sesión Supabase, la propiedad de la
solicitud y la prueba mínima de wallet pertenecen al futuro servidor. No se
han implementado ni se declaran cubiertas por estos unit tests.

## Artefacto verificado

- Archivo: `target/wasm32v1-none/release/byetery_contract.wasm`
- SHA-256: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`
- Rust utilizado: 1.96.0, SDK Soroban: 27.0.6.
- Registro local completo de comandos: `.verify.log`.
